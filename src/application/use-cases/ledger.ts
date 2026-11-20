import type { StatusLabel } from "../../domain/packet/rules";
import type { MessageKind } from "../../domain/packet/schemas";
import type { Device } from "../device";
import { requireIdentity } from "./identity";
import { readPacket, type ReturnedAcknowledgement, type TimelineEvent } from "./packets";

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
 * the stored packet and acknowledgement tables, so it works offline.
 */
export async function readLedger(device: Device, communityId: string): Promise<LedgerItem[]> {
  const identity = await requireIdentity(device);
  const own = (await device.db.packets.where("communityId").equals(communityId).toArray())
    .filter((p) => p.packetType === "MESSAGE" && p.direction === "OUTBOUND" && p.senderId === identity.memberId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const items: LedgerItem[] = [];
  for (const record of own) {
    const view = await readPacket(device, record.id);
    const acknowledgements = view.acknowledgements ?? [];
    items.push({
      recordId: record.id,
      packetId: record.packetId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      text: view.text ?? "",
      messageKind: view.messageKind ?? "ANNOUNCEMENT",
      statusLabel: view.statusLabel,
      acknowledgementCount: new Set(acknowledgements.map((a) => a.acknowledgedBy)).size,
      acknowledgements,
      timeline: view.timeline ?? [],
    });
  }
  return items;
}
