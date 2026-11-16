import Dexie, { type Table } from "dexie";
import type { PacketDirection, PacketStatus } from "../../domain/packet/rules";
import type { CertificateBody, PublicJwk, Role } from "../../domain/packet/schemas";
import type { TransferStatus } from "../../domain/transfer/frames";

export interface CommunityRecord {
  id: string;
  name: string;
  role: Role;
  keyEpoch: number;
  adminSigningPublicJwk: PublicJwk;
  createdAt: number;
  status: "ACTIVE" | "ARCHIVED";
}

export interface LocalIdentityRecord {
  id: "local";
  memberId: string;
  displayName: string;
  signingPrivateKey: CryptoKey;
  signingPublicJwk: PublicJwk;
  createdAt: number;
}

export interface DeviceVaultRecord {
  id: "default";
  vaultKey: CryptoKey;
  createdAt: number;
}

export interface CommunityKeyRecord {
  id: string;
  communityId: string;
  keyEpoch: number;
  wrappedKey: ArrayBuffer;
  wrapNonce: ArrayBuffer;
  createdAt: number;
}

export interface MembershipRecord {
  id: string;
  communityId: string;
  memberId: string;
  displayName: string;
  role: Role;
  signingPublicJwk: PublicJwk;
  certificateBody: CertificateBody;
  adminSignature: string;
  joinedAt: number;
  status: "ACTIVE" | "REVOKED_LOCAL";
}

export interface InviteRecord {
  id: string;
  communityId: string;
  secretHash: string;
  adminEphemeralEcdhPrivateKey?: CryptoKey;
  adminEphemeralEcdhPublicJwk: PublicJwk;
  expiresAt: number;
  maxUses: number;
  uses: number;
  createdAt: number;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "REVOKED";
}

export interface JoinRequestRecord {
  id: string;
  communityId: string;
  inviteId: string;
  memberId: string;
  displayName: string;
  signingPublicJwk: PublicJwk;
  memberEphemeralEcdhPublicJwk: PublicJwk;
  requestNonce: string;
  requestedAt: number;
  receivedAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  /** Encoded JOIN_APPROVAL payload so the admin can re-display it. The group key inside is encrypted for the member only. */
  approvalPayload?: string;
}

export interface PendingJoinRequestRecord {
  id: string;
  communityId: string;
  communityName: string;
  inviteId: string;
  memberId: string;
  memberEphemeralEcdhPrivateKey?: CryptoKey;
  memberEphemeralEcdhPublicJwk: PublicJwk;
  adminEphemeralEcdhPublicJwk: PublicJwk;
  adminSigningPublicJwk: PublicJwk;
  adminFingerprint: string;
  requestNonce: string;
  requestedAt: number;
  expiresAt: number;
  status: "WAITING_FOR_APPROVAL" | "ACCEPTED" | "EXPIRED";
  /** Encoded JOIN_REQUEST payload, kept until accepted/expired so it can be shown again. */
  requestPayload?: string;
}

export interface PacketRecord {
  id: string;
  communityId: string;
  packetId: string;
  packetType: "MESSAGE" | "ACK";
  encodedEnvelope: string;
  direction: PacketDirection;
  status: PacketStatus;
  hopCount: number;
  senderId: string;
  createdAt: number;
  expiresAt: number;
  firstSeenAt: number;
  lastActionAt: number;
  /** For ACK packets: the message being acknowledged (from the decrypted body). */
  originalPacketId?: string;
}

export interface TransferRecord {
  id: string;
  digest: string;
  frameCount: number;
  chunks: Record<number, string>;
  receivedCount: number;
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AcknowledgementRecord {
  id: string;
  communityId: string;
  originalPacketId: string;
  ackPacketId: string;
  acknowledgedBy: string;
  acknowledgedByName: string;
  createdAt: number;
  receivedAt: number | null;
}

export interface AuditEventRecord {
  id?: number;
  communityId: string | null;
  eventType: string;
  entityId: string;
  timestamp: number;
  details: Record<string, string | number | boolean | null>;
}

export class CarryDb extends Dexie {
  communities!: Table<CommunityRecord, string>;
  localIdentity!: Table<LocalIdentityRecord, string>;
  deviceVault!: Table<DeviceVaultRecord, string>;
  communityKeys!: Table<CommunityKeyRecord, string>;
  memberships!: Table<MembershipRecord, string>;
  invites!: Table<InviteRecord, string>;
  joinRequests!: Table<JoinRequestRecord, string>;
  pendingJoinRequests!: Table<PendingJoinRequestRecord, string>;
  packets!: Table<PacketRecord, string>;
  transfers!: Table<TransferRecord, string>;
  acknowledgements!: Table<AcknowledgementRecord, string>;
  auditEvents!: Table<AuditEventRecord, number>;

  constructor(name = "carry") {
    super(name);
    // Schema v1. Future versions must add `.version(n).stores(...)` with an
    // upgrade that preserves CryptoKey objects; never delete key tables.
    this.version(1).stores({
      communities: "&id, name, role, status, createdAt",
      localIdentity: "&id, memberId",
      deviceVault: "&id",
      communityKeys: "&id, communityId, keyEpoch",
      memberships: "&id, communityId, memberId, status",
      invites: "&id, communityId, status, expiresAt",
      joinRequests: "&id, communityId, inviteId, memberId, status, requestedAt",
      pendingJoinRequests: "&id, communityId, inviteId, memberId, status, requestedAt",
      packets: "&id, communityId, packetId, packetType, direction, status, createdAt, expiresAt, originalPacketId",
      transfers: "&id, status, updatedAt",
      acknowledgements: "&id, communityId, originalPacketId, ackPacketId, receivedAt",
      auditEvents: "++id, communityId, eventType, entityId, timestamp",
    });
  }
}
