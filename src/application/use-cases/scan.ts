import { CarryError } from "../../domain/errors";
import type { InvitePayload } from "../../domain/packet/schemas";
import { auditEvent } from "../audit";
import { decodePayload } from "../codec";
import type { Device } from "../device";
import { acceptJoinApproval, inspectInvite, receiveJoinRequest } from "./membership";
import { importPacket } from "./packets";
import { acceptQrFrame, finishTransfer, rejectTransfer } from "./transfer";

export type ScanOutcome =
  | { kind: "PARTIAL"; transferId: string; received: number[]; total: number; duplicateFrame: boolean }
  | { kind: "INVITE"; invite: InvitePayload; fingerprint: string }
  | { kind: "JOIN_REQUEST"; requestId: string; displayName: string }
  | { kind: "JOIN_APPROVAL"; communityId: string; communityName: string }
  | { kind: "MESSAGE"; recordId: string; hopCount: number }
  | { kind: "ACK"; recordId: string; hopCount: number; acknowledgedOwn: boolean; originalRecordId?: string };

type Completed = Exclude<ScanOutcome, { kind: "PARTIAL" }>;

async function routePayload(device: Device, payloadText: string, transferId: string): Promise<Completed> {
  const payload = decodePayload(payloadText);
  switch (payload.type) {
    case "INVITE": {
      const { fingerprint } = await inspectInvite(device, payload);
      return { kind: "INVITE", invite: payload, fingerprint };
    }
    case "JOIN_REQUEST": {
      const request = await receiveJoinRequest(device, payload);
      return { kind: "JOIN_REQUEST", requestId: request.id, displayName: request.displayName };
    }
    case "JOIN_APPROVAL": {
      const community = await acceptJoinApproval(device, payload);
      return { kind: "JOIN_APPROVAL", communityId: community.id, communityName: community.name };
    }
    case "MESSAGE":
    case "ACK": {
      const result = await importPacket(device, payload, transferId);
      const hopCount = payload.relay.hopCount;
      if (payload.type === "MESSAGE") return { kind: "MESSAGE", recordId: result.record.id, hopCount };
      return {
        kind: "ACK",
        recordId: result.record.id,
        hopCount,
        acknowledgedOwn: result.acknowledgedOwn,
        originalRecordId: result.originalRecordId,
      };
    }
    default:
      throw new CarryError("PACKET_SCHEMA_INVALID");
  }
}

/**
 * Entry point for every scanned QR string. Frames are stored until the
 * transfer is complete; then the verified payload is routed by type.
 * Nothing partial or unverified is ever returned as content.
 */
export async function handleScannedText(device: Device, text: string): Promise<ScanOutcome> {
  const frame = await acceptQrFrame(device, text);
  if (frame.status === "PARTIAL") {
    return {
      kind: "PARTIAL",
      transferId: frame.transferId,
      received: frame.received,
      total: frame.total,
      duplicateFrame: frame.duplicateFrame,
    };
  }

  let outcome: Completed;
  try {
    outcome = await routePayload(device, frame.payload, frame.transferId);
  } catch (err) {
    await rejectTransfer(device, frame.transferId, err, frame.total);
    throw err;
  }
  await finishTransfer(device, frame.transferId);
  // Non-sensitive rehearsal metrics (DEMO_PLAN.md §8).
  await auditEvent(device, "TRANSFER_COMPLETED", frame.transferId, null, {
    payloadType: outcome.kind,
    frames: frame.total,
    durationMs: Math.max(0, device.now() - frame.startedAt),
    hopCount: outcome.kind === "MESSAGE" || outcome.kind === "ACK" ? outcome.hopCount : null,
    ackReturned: outcome.kind === "ACK" ? outcome.acknowledgedOwn : null,
  });
  return outcome;
}
