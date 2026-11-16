import { randomId } from "../../domain/encoding";
import { CarryError, isCarryError } from "../../domain/errors";
import { LIMITS } from "../../domain/limits";
import {
  applyFrame,
  assemblePayload,
  buildFrames,
  type FrameOutcome,
  parseFrame,
  receivedIndexes,
  type TransferState,
} from "../../domain/transfer/frames";
import { sha256B64u } from "../../infrastructure/crypto/webcrypto";
import { auditEvent } from "../audit";
import type { Device } from "../device";

/** BuildQrTransfer: payload → ordered C1 frame strings. */
export async function buildQrTransfer(payload: string, chunkSize: number = LIMITS.maxChunk): Promise<string[]> {
  const digest = await sha256B64u(payload);
  return buildFrames(payload, randomId(12), digest, chunkSize);
}

export type FrameResult =
  | { status: "PARTIAL"; transferId: string; received: number[]; total: number; duplicateFrame: boolean }
  | { status: "COMPLETE"; transferId: string; payload: string; total: number; startedAt: number };

/**
 * Chunks are kept only while a transfer is partial. Once handled, the record
 * is deleted (it may contain an invite secret); corrupt transfers keep only
 * their metadata with status INVALID so later frames for them are refused.
 */
async function invalidateTransfer(device: Device, transferId: string, code: string, frames: number): Promise<void> {
  await device.db.transfers.update(transferId, { status: "INVALID", chunks: {}, updatedAt: device.now() });
  await auditEvent(device, "TRANSFER_REJECTED", transferId, null, { code, frames });
}

/**
 * AcceptQrFrame: validates a frame, stores its chunk transactionally, and when
 * every frame is present reassembles and verifies the SHA-256 digest (outside
 * the transaction). Returns the verified payload, still untrusted as a packet.
 */
export async function acceptQrFrame(device: Device, text: string): Promise<FrameResult> {
  const frame = parseFrame(text.trim());
  const { db } = device;

  let state: TransferState | undefined;
  // Assigned inside the transaction callback; `as` keeps TypeScript from narrowing to the initial value.
  let outcome = "NEW" as FrameOutcome | "CONFLICT";
  await db.transaction("rw", db.transfers, db.auditEvents, async () => {
    const now = device.now();
    const existing = await db.transfers.get(frame.transferId);
    if (existing?.status === "INVALID") {
      throw new CarryError("FRAME_CONFLICT", "This transfer was already rejected on this device as invalid.");
    }
    try {
      const applied = applyFrame(existing, frame, now);
      state = applied.state;
      outcome = applied.outcome;
    } catch (err) {
      // A different digest, total or chunk for a known transfer: discard it.
      if (existing && isCarryError(err, "FRAME_CONFLICT")) {
        await db.transfers.update(existing.id, { status: "INVALID", chunks: {}, updatedAt: now });
        await auditEvent(device, "TRANSFER_REJECTED", existing.id, null, {
          code: "FRAME_CONFLICT",
          frames: existing.frameCount,
        });
        outcome = "CONFLICT";
        return;
      }
      throw err;
    }
    if (outcome === "NEW") {
      if (!existing) {
        // Bound the number of partial transfers kept on the device.
        const partials = await db.transfers.where("status").equals("PARTIAL").sortBy("updatedAt");
        const excess = partials.length - (LIMITS.maxPartialTransfers - 1);
        if (excess > 0) await db.transfers.bulkDelete(partials.slice(0, excess).map((t) => t.id));
      }
      // Stored as PARTIAL until the reassembled payload has been verified and handled.
      await db.transfers.put({ ...state!, status: "PARTIAL" });
    }
  });
  if (outcome === "CONFLICT") throw new CarryError("FRAME_CONFLICT");

  const s = state!;
  if (s.receivedCount < s.frameCount) {
    return {
      status: "PARTIAL",
      transferId: s.id,
      received: receivedIndexes(s),
      total: s.frameCount,
      duplicateFrame: outcome === "DUPLICATE",
    };
  }

  const payload = assemblePayload(s);
  if ((await sha256B64u(payload)) !== s.digest) {
    await invalidateTransfer(device, s.id, "TRANSFER_DIGEST_MISMATCH", s.frameCount);
    throw new CarryError("TRANSFER_DIGEST_MISMATCH");
  }
  return { status: "COMPLETE", transferId: s.id, payload, total: s.frameCount, startedAt: s.createdAt };
}

/** User discards an unfinished transfer (e.g. the sender closed that QR display). */
export async function discardTransfer(device: Device, transferId: string): Promise<void> {
  await device.db.transaction("rw", device.db.transfers, async () => {
    const t = await device.db.transfers.get(transferId);
    if (t?.status === "PARTIAL") await device.db.transfers.delete(transferId);
  });
}

/** The verified payload was handled; its chunks are no longer needed. */
export async function finishTransfer(device: Device, transferId: string): Promise<void> {
  await device.db.transfers.delete(transferId);
}

/** Failures that mean the data itself is corrupt or tampered. */
const TAMPER_CODES = new Set([
  "PACKET_SCHEMA_INVALID",
  "UNSUPPORTED_VERSION",
  "SIGNATURE_INVALID",
  "CERTIFICATE_INVALID",
  "DECRYPTION_FAILED",
]);

/**
 * After a complete payload fails validation: tampered/corrupt transfers are
 * marked INVALID; every other failure (duplicate, unknown community, expired
 * invite, …) deletes the transfer so a later re-scan is evaluated again.
 */
export async function rejectTransfer(device: Device, transferId: string, err: unknown, frames: number): Promise<void> {
  const code = err instanceof CarryError ? err.code : "UNEXPECTED";
  if (TAMPER_CODES.has(code)) {
    await invalidateTransfer(device, transferId, code, frames);
    return;
  }
  await device.db.transfers.delete(transferId);
  await auditEvent(device, "TRANSFER_REJECTED", transferId, null, { code, frames });
}

/**
 * Integrity test fixture: valid frames for `payload`, except one character of
 * the first chunk is changed. The digest no longer matches, so a receiver
 * must reject the transfer with TRANSFER_DIGEST_MISMATCH.
 */
export async function buildCorruptedFixture(payload: string, chunkSize?: number): Promise<string[]> {
  const frames = await buildQrTransfer(payload, chunkSize);
  const parts = frames[0]!.split(":");
  const chunk = parts[5]!;
  const pos = Math.floor(chunk.length / 2);
  parts[5] = chunk.slice(0, pos) + (chunk[pos] === "A" ? "B" : "A") + chunk.slice(pos + 1);
  frames[0] = parts.join(":");
  return frames;
}
