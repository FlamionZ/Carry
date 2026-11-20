import { type StatusLabel, statusLabel } from "../../domain/packet/rules";
import { type MessageBody, type MessageKind, messageKindOf } from "../../domain/packet/schemas";
import type { AcknowledgementRecord } from "../../infrastructure/db/db";
import type { Device } from "../device";
import { requireIdentity } from "./identity";
import {
  describeOwnMessage,
  openEnvelope,
  type ReturnedAcknowledgement,
  storedEnvelope,
  type TimelineEvent,
} from "./packets";

/** One of this device's own messages, as the Ledger shows it (GLOSSARY.md, "Ledger"). */
export interface LedgerItem {
  recordId: string;
  packetId: string;
  createdAt: number;
  expiresAt: number;
  text: string;
  messageKind: MessageKind;
  statusLabel: StatusLabel;
  /** Distinct members whose acknowledgement was scanned on this device. */
  acknowledgementCount: number;
  /** Each acknowledgement scanned on this device, oldest first, with both journeys. */
  acknowledgements: ReturnedAcknowledgement[];
  /** Created, Shown, each acknowledgement scanned, Expired. */
  timeline: TimelineEvent[];
}

/**
 * This device's own messages in one community, newest first. Built only from
 * the stored packet and acknowledgement tables, so it works offline. Each
 * message and each returned acknowledgement is verified and decrypted once.
 */
export async function readLedger(device: Device, communityId: string): Promise<LedgerItem[]> {
  const identity = await requireIdentity(device);
  const { db } = device;
  const [packets, acks] = await Promise.all([
    db.packets.where("communityId").equals(communityId).toArray(),
    db.acknowledgements.where("communityId").equals(communityId).toArray(),
  ]);
  const own = packets
    .filter((p) => p.packetType === "MESSAGE" && p.direction === "OUTBOUND" && p.senderId === identity.memberId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const acksByMessage = new Map<string, AcknowledgementRecord[]>();
  for (const a of acks) acksByMessage.set(a.originalPacketId, [...(acksByMessage.get(a.originalPacketId) ?? []), a]);

  const now = device.now();
  const items: LedgerItem[] = [];
  for (const record of own) {
    const envelope = storedEnvelope(record);
    const body = (await openEnvelope(device, envelope)).body as MessageBody;
    const { acknowledgements, acknowledgementCount, timeline } = await describeOwnMessage(
      device,
      record,
      envelope,
      acksByMessage.get(record.packetId) ?? [],
    );
    items.push({
      recordId: record.id,
      packetId: record.packetId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      text: body.text,
      messageKind: messageKindOf(body),
      statusLabel: statusLabel(record, now),
      acknowledgementCount,
      acknowledgements,
      timeline,
    });
  }
  return items;
}
