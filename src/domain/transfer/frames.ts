import { BASE64URL_RE, b64uLength } from "../encoding";
import { CarryError } from "../errors";
import { LIMITS } from "../limits";

/**
 * QR frame format (PACKET_PROTOCOL.md §3):
 *   C1:<transferId>:<index>:<total>:<digest>:<chunk>
 */
export const FRAME_PREFIX = "C1";

const TRANSFER_ID_LEN = b64uLength(12); // 16
const DIGEST_LEN = b64uLength(32); // 43

export interface QrFrame {
  transferId: string;
  index: number;
  total: number;
  digest: string;
  chunk: string;
}

export function formatFrame(f: QrFrame): string {
  return [FRAME_PREFIX, f.transferId, f.index, f.total, f.digest, f.chunk].join(":");
}

const INT_RE = /^(0|[1-9][0-9]{0,2})$/;

export function parseFrame(text: string): QrFrame {
  const invalid = () => new CarryError("FRAME_INVALID");
  if (typeof text !== "string" || text.length > LIMITS.maxFrameText) throw invalid();
  const parts = text.split(":");
  if (parts.length !== 6) throw invalid();
  const [prefix, transferId, indexText, totalText, digest, chunk] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (prefix !== FRAME_PREFIX) throw invalid();
  if (transferId.length !== TRANSFER_ID_LEN || !BASE64URL_RE.test(transferId)) throw invalid();
  if (digest.length !== DIGEST_LEN || !BASE64URL_RE.test(digest)) throw invalid();
  if (!INT_RE.test(indexText) || !INT_RE.test(totalText)) throw invalid();
  const index = Number(indexText);
  const total = Number(totalText);
  if (total < 1 || total > LIMITS.maxFrames) throw invalid();
  if (index < 0 || index > total - 1) throw invalid();
  if (chunk.length < 1 || chunk.length > LIMITS.maxChunk || !BASE64URL_RE.test(chunk)) throw invalid();
  return { transferId, index, total, digest, chunk };
}

/** Split a Base64URL payload into bounded contiguous chunks. */
export function splitPayload(payload: string, chunkSize: number = LIMITS.maxChunk): string[] {
  const size = Math.max(LIMITS.minChunk, Math.min(LIMITS.maxChunk, Math.floor(chunkSize)));
  if (payload.length === 0) throw new CarryError("PAYLOAD_TOO_LARGE", "Empty payload");
  if (payload.length > LIMITS.maxPayload || !BASE64URL_RE.test(payload)) {
    throw new CarryError("PAYLOAD_TOO_LARGE");
  }
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += size) chunks.push(payload.slice(i, i + size));
  if (chunks.length > LIMITS.maxFrames) throw new CarryError("PAYLOAD_TOO_LARGE");
  return chunks;
}

export function buildFrames(payload: string, transferId: string, digest: string, chunkSize?: number): string[] {
  const chunks = splitPayload(payload, chunkSize);
  return chunks.map((chunk, index) =>
    formatFrame({ transferId, index, total: chunks.length, digest, chunk }),
  );
}

export type TransferStatus = "PARTIAL" | "COMPLETE" | "INVALID" | "EXPIRED";

export interface TransferState {
  id: string;
  digest: string;
  frameCount: number;
  chunks: Record<number, string>;
  receivedCount: number;
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
}

export type FrameOutcome = "NEW" | "DUPLICATE";

/**
 * Apply a parsed frame to a (possibly absent) transfer state. Pure: returns a
 * new state. Throws FRAME_CONFLICT on mismatched digest/total/chunk.
 */
export function applyFrame(
  existing: TransferState | undefined,
  frame: QrFrame,
  now: number,
): { state: TransferState; outcome: FrameOutcome } {
  if (!existing) {
    return {
      outcome: "NEW",
      state: {
        id: frame.transferId,
        digest: frame.digest,
        frameCount: frame.total,
        chunks: { [frame.index]: frame.chunk },
        receivedCount: 1,
        status: frame.total === 1 ? "COMPLETE" : "PARTIAL",
        createdAt: now,
        updatedAt: now,
      },
    };
  }
  if (existing.status === "INVALID") throw new CarryError("TRANSFER_DIGEST_MISMATCH");
  if (existing.digest !== frame.digest || existing.frameCount !== frame.total) {
    throw new CarryError("FRAME_CONFLICT");
  }
  const prior = existing.chunks[frame.index];
  if (prior !== undefined) {
    if (prior !== frame.chunk) throw new CarryError("FRAME_CONFLICT");
    return { state: existing, outcome: "DUPLICATE" };
  }
  const chunks = { ...existing.chunks, [frame.index]: frame.chunk };
  const receivedCount = Object.keys(chunks).length;
  return {
    outcome: "NEW",
    state: {
      ...existing,
      chunks,
      receivedCount,
      status: receivedCount === existing.frameCount ? "COMPLETE" : "PARTIAL",
      updatedAt: now,
    },
  };
}

export function receivedIndexes(state: TransferState): number[] {
  return Object.keys(state.chunks)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Concatenate chunks in ascending index order. Requires all frames. */
export function assemblePayload(state: TransferState): string {
  let payload = "";
  for (let i = 0; i < state.frameCount; i++) {
    const chunk = state.chunks[i];
    if (chunk === undefined) throw new CarryError("TRANSFER_INCOMPLETE");
    payload += chunk;
  }
  return payload;
}
