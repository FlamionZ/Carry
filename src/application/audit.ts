import type { Device } from "./device";
import type { AuditEventRecord } from "../infrastructure/db/db";

/**
 * Append a local audit event. Details must be non-sensitive metadata only:
 * never message bodies, group keys, invite secrets, or private keys.
 */
export function auditEvent(
  device: Device,
  eventType: string,
  entityId: string,
  communityId: string | null,
  details: AuditEventRecord["details"] = {},
): Promise<number> {
  return device.db.auditEvents.add({ communityId, eventType, entityId, timestamp: device.now(), details });
}
