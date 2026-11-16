import { DURATIONS } from "../../domain/limits";
import type { Device } from "../device";

/**
 * Local retention rules (DATABASE_SCHEMA.md §5). Runs when the app starts.
 * Never deletes communities, identity, vault or group keys.
 */
export async function runCleanup(device: Device): Promise<void> {
  const { db } = device;
  const now = device.now();

  await db.transaction(
    "rw",
    [db.transfers, db.invites, db.pendingJoinRequests, db.joinRequests, db.packets],
    async () => {
      // Transfers: drop chunks 24 h after the last update.
      await db.transfers.where("updatedAt").below(now - DURATIONS.transferRetention).delete();

      // Invites: expire and delete per-invite ECDH private keys; drop hashes after 30 days.
      const invites = await db.invites.toArray();
      for (const invite of invites) {
        if (invite.status === "ACTIVE" && invite.expiresAt <= now) {
          await db.invites.update(invite.id, { status: "EXPIRED", adminEphemeralEcdhPrivateKey: undefined });
        } else if (invite.status !== "ACTIVE" && invite.adminEphemeralEcdhPrivateKey) {
          await db.invites.update(invite.id, { adminEphemeralEcdhPrivateKey: undefined });
        }
        if (invite.expiresAt + DURATIONS.inviteRetention <= now) await db.invites.delete(invite.id);
      }

      // Pending join requests on the joining device: delete the ECDH private key on expiry.
      const pending = await db.pendingJoinRequests.where("status").equals("WAITING_FOR_APPROVAL").toArray();
      for (const p of pending) {
        if (p.expiresAt <= now) {
          await db.pendingJoinRequests.update(p.id, {
            status: "EXPIRED",
            memberEphemeralEcdhPrivateKey: undefined,
            requestPayload: undefined,
          });
        }
      }

      // Admin-side join requests that were never approved.
      const requests = await db.joinRequests.where("status").equals("PENDING").toArray();
      for (const r of requests) {
        if (r.receivedAt + DURATIONS.joinRequestTtl <= now) await db.joinRequests.update(r.id, { status: "EXPIRED" });
      }

      // Packets: mark expired; keep envelopes as duplicate tombstones for 30 days after expiry.
      const packets = await db.packets.where("expiresAt").below(now).toArray();
      for (const p of packets) {
        if (p.expiresAt + DURATIONS.tombstoneWindow <= now) {
          await db.packets.delete(p.id);
        } else if (p.status === "READY" || p.status === "IMPORTED" || p.status === "RELAYED") {
          await db.packets.update(p.id, { status: "EXPIRED" });
        }
      }
    },
  );
}

/** Deletes every local table, including keys. Irreversible. */
export async function clearLocalData(device: Device): Promise<void> {
  const { db } = device;
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
