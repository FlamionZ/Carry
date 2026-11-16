import { approvalSigningString, joinWrapContext } from "../../domain/canonical";
import { b64uToBytes, bytesToB64u, randomBytes, randomId, utf8Encode } from "../../domain/encoding";
import { CarryError, isCarryError } from "../../domain/errors";
import { DURATIONS } from "../../domain/limits";
import type {
  CertificateBody,
  InvitePayload,
  JoinApprovalPayload,
  JoinRequestPayload,
} from "../../domain/packet/schemas";
import type {
  CommunityRecord,
  InviteRecord,
  JoinRequestRecord,
  MembershipRecord,
  PendingJoinRequestRecord,
} from "../../infrastructure/db/db";
import {
  aesDecrypt,
  aesEncrypt,
  deriveWrappingKey,
  fingerprint,
  generateEcdhKeyPair,
  newNonce,
  sameJwk,
  sha256B64u,
  sign,
  verify,
} from "../../infrastructure/crypto/webcrypto";
import { auditEvent } from "../audit";
import { encodePayload } from "../codec";
import type { Device } from "../device";
import { assertCertificate, certificateHash, signCertificate } from "./certificates";
import { normalizeName, requireIdentity } from "./identity";
import { unwrapGroupKeyBytes, wrapGroupKey } from "./keys";

export function joinRequestId(inviteId: string, memberId: string): string {
  return `${inviteId}:${memberId}`;
}

async function requireAdminCommunity(device: Device, communityId: string): Promise<CommunityRecord> {
  const community = await device.db.communities.get(communityId);
  if (!community) throw new CarryError("UNKNOWN_COMMUNITY");
  if (community.role !== "ADMIN") throw new CarryError("NOT_ADMIN");
  return community;
}

// ── Admin: CreateInvite ───────────────────────────────────────────────────

export interface CreatedInvite {
  invite: InviteRecord;
  payload: InvitePayload;
  encoded: string;
}

/**
 * Creates a single-use invitation. The QR carries the invite secret; this
 * device stores only SHA-256(secret). The invite never contains the group key.
 */
export async function createInvite(device: Device, communityId: string): Promise<CreatedInvite> {
  const community = await requireAdminCommunity(device, communityId);
  const now = device.now();
  const ecdh = await generateEcdhKeyPair();
  const inviteId = randomId(16);
  const inviteSecret = randomId(16);

  const invite: InviteRecord = {
    id: inviteId,
    communityId,
    secretHash: await sha256B64u(inviteSecret),
    adminEphemeralEcdhPrivateKey: ecdh.privateKey,
    adminEphemeralEcdhPublicJwk: ecdh.publicJwk,
    expiresAt: now + DURATIONS.inviteTtl,
    maxUses: 1,
    uses: 0,
    createdAt: now,
    status: "ACTIVE",
  };
  const payload: InvitePayload = {
    v: 1,
    type: "INVITE",
    communityId,
    communityName: community.name,
    inviteId,
    inviteSecret,
    expiresAt: invite.expiresAt,
    adminSigningPublicJwk: community.adminSigningPublicJwk,
    adminEphemeralEcdhPublicJwk: ecdh.publicJwk,
    adminFingerprint: await fingerprint(community.adminSigningPublicJwk),
  };
  const encoded = encodePayload(payload);

  const { db } = device;
  await db.transaction("rw", db.invites, db.auditEvents, async () => {
    await db.invites.add(invite);
    await auditEvent(device, "INVITE_CREATED", inviteId, communityId);
  });
  return { invite, payload, encoded };
}

export async function revokeInvite(device: Device, inviteId: string): Promise<void> {
  await device.db.invites.update(inviteId, { status: "REVOKED", adminEphemeralEcdhPrivateKey: undefined });
}

// ── Member: CreateJoinRequest ─────────────────────────────────────────────

/** Validates a scanned invitation before the user decides to join. */
export async function inspectInvite(device: Device, invite: InvitePayload): Promise<{ fingerprint: string }> {
  if (invite.expiresAt <= device.now()) throw new CarryError("INVITE_EXPIRED");
  const computed = await fingerprint(invite.adminSigningPublicJwk);
  if (computed !== invite.adminFingerprint) {
    throw new CarryError("JOIN_REQUEST_INVALID", "The invitation's admin fingerprint does not match its key.");
  }
  if (await device.db.communities.get(invite.communityId)) throw new CarryError("ALREADY_MEMBER");
  return { fingerprint: computed };
}

export async function createJoinRequest(
  device: Device,
  invite: InvitePayload,
  rawDisplayName: string,
): Promise<PendingJoinRequestRecord> {
  await inspectInvite(device, invite);
  const identity = await requireIdentity(device);
  const displayName = normalizeName(rawDisplayName);
  const id = joinRequestId(invite.inviteId, identity.memberId);

  const existing = await device.db.pendingJoinRequests.get(id);
  if (existing && existing.status === "WAITING_FOR_APPROVAL" && existing.expiresAt > device.now()) {
    return existing;
  }

  const now = device.now();
  const ecdh = await generateEcdhKeyPair();
  const requestNonce = randomId(16);
  const payload: JoinRequestPayload = {
    v: 1,
    type: "JOIN_REQUEST",
    communityId: invite.communityId,
    inviteId: invite.inviteId,
    inviteSecret: invite.inviteSecret,
    memberId: identity.memberId,
    displayName,
    memberSigningPublicJwk: identity.signingPublicJwk,
    memberEphemeralEcdhPublicJwk: ecdh.publicJwk,
    requestNonce,
    requestedAt: now,
  };
  const record: PendingJoinRequestRecord = {
    id,
    communityId: invite.communityId,
    communityName: invite.communityName,
    inviteId: invite.inviteId,
    memberId: identity.memberId,
    memberEphemeralEcdhPrivateKey: ecdh.privateKey,
    memberEphemeralEcdhPublicJwk: ecdh.publicJwk,
    adminEphemeralEcdhPublicJwk: invite.adminEphemeralEcdhPublicJwk,
    adminSigningPublicJwk: invite.adminSigningPublicJwk,
    adminFingerprint: invite.adminFingerprint,
    requestNonce,
    requestedAt: now,
    expiresAt: now + DURATIONS.joinRequestTtl,
    status: "WAITING_FOR_APPROVAL",
    requestPayload: encodePayload(payload),
  };
  const { db } = device;
  await db.transaction("rw", db.pendingJoinRequests, db.auditEvents, async () => {
    await db.pendingJoinRequests.put(record);
    await auditEvent(device, "JOIN_REQUEST_CREATED", id, invite.communityId);
  });
  return record;
}

// ── Admin: receive + approve ──────────────────────────────────────────────

/** Validates the invite capability and stores sanitized request metadata (no secret). */
export async function receiveJoinRequest(device: Device, req: JoinRequestPayload): Promise<JoinRequestRecord> {
  await requireAdminCommunity(device, req.communityId);
  const id = joinRequestId(req.inviteId, req.memberId);
  const existing = await device.db.joinRequests.get(id);
  if (existing) return existing;

  const invite = await device.db.invites.get(req.inviteId);
  if (!invite || invite.communityId !== req.communityId) throw new CarryError("JOIN_REQUEST_INVALID");
  if ((await sha256B64u(req.inviteSecret)) !== invite.secretHash) throw new CarryError("JOIN_REQUEST_INVALID");
  if (invite.status === "CONSUMED" || invite.uses >= invite.maxUses) throw new CarryError("INVITE_ALREADY_USED");
  if (invite.status !== "ACTIVE" || invite.expiresAt <= device.now()) throw new CarryError("INVITE_EXPIRED");

  const identity = await requireIdentity(device);
  if (req.memberId === identity.memberId) throw new CarryError("ALREADY_MEMBER");

  const record: JoinRequestRecord = {
    id,
    communityId: req.communityId,
    inviteId: req.inviteId,
    memberId: req.memberId,
    displayName: req.displayName,
    signingPublicJwk: req.memberSigningPublicJwk,
    memberEphemeralEcdhPublicJwk: req.memberEphemeralEcdhPublicJwk,
    requestNonce: req.requestNonce,
    requestedAt: req.requestedAt,
    receivedAt: device.now(),
    status: "PENDING",
  };
  const { db } = device;
  await db.transaction("rw", db.joinRequests, db.auditEvents, async () => {
    await db.joinRequests.add(record);
    await auditEvent(device, "JOIN_REQUEST_RECEIVED", id, req.communityId);
  });
  return record;
}

/**
 * ApproveJoinRequest: signs a membership certificate and delivers the group
 * key encrypted under ECDH(per-invite admin key, per-request member key) → HKDF.
 * All crypto happens before the transaction; the invite is consumed only if
 * the approval package was built successfully.
 */
export async function approveJoinRequest(device: Device, requestId: string): Promise<string> {
  const { db } = device;
  const request = await db.joinRequests.get(requestId);
  if (!request) throw new CarryError("NOT_FOUND");
  if (request.status === "APPROVED" && request.approvalPayload) return request.approvalPayload;
  if (request.status !== "PENDING") throw new CarryError("JOIN_REQUEST_INVALID");

  const community = await requireAdminCommunity(device, request.communityId);
  const invite = await db.invites.get(request.inviteId);
  if (!invite) throw new CarryError("JOIN_REQUEST_INVALID");
  if (invite.status === "CONSUMED" || invite.uses >= invite.maxUses) throw new CarryError("INVITE_ALREADY_USED");
  if (invite.status !== "ACTIVE" || invite.expiresAt <= device.now() || !invite.adminEphemeralEcdhPrivateKey) {
    throw new CarryError("INVITE_EXPIRED");
  }

  const admin = await requireIdentity(device);
  const now = device.now();
  const keyEpoch = community.keyEpoch;
  const body: CertificateBody = {
    v: 1,
    communityId: community.id,
    memberId: request.memberId,
    displayName: request.displayName,
    role: "MEMBER",
    keyEpoch,
    signingPublicJwk: request.signingPublicJwk,
    issuedAt: now,
  };
  const cert = await signCertificate(admin.signingPrivateKey, body);
  const certHash = bytesToB64u(await certificateHash(cert));

  const context = joinWrapContext({
    communityId: community.id,
    inviteId: invite.id,
    memberId: request.memberId,
    keyEpoch,
  });
  const salt = randomBytes(16);
  const wrapNonce = newNonce();
  const wrappingKey = await deriveWrappingKey(
    invite.adminEphemeralEcdhPrivateKey,
    request.memberEphemeralEcdhPublicJwk,
    salt,
    context,
  );
  const groupKey = await unwrapGroupKeyBytes(device, community.id, keyEpoch);
  let wrapped: Uint8Array;
  try {
    wrapped = await aesEncrypt(wrappingKey, wrapNonce, groupKey, utf8Encode(context));
  } finally {
    groupKey.fill(0);
  }

  const unsigned = {
    communityId: community.id,
    inviteId: invite.id,
    memberId: request.memberId,
    keyEpoch,
    certificateHash: certHash,
    hkdfSalt: bytesToB64u(salt),
    wrapNonce: bytesToB64u(wrapNonce),
    wrappedGroupKey: bytesToB64u(wrapped),
  };
  const approvalSignature = await sign(admin.signingPrivateKey, utf8Encode(approvalSigningString(unsigned)));
  const payload: JoinApprovalPayload = {
    v: 1,
    type: "JOIN_APPROVAL",
    communityId: unsigned.communityId,
    inviteId: unsigned.inviteId,
    memberId: unsigned.memberId,
    keyEpoch,
    certificateBody: body,
    certificateSignature: cert.adminSignature,
    hkdfSalt: unsigned.hkdfSalt,
    wrapNonce: unsigned.wrapNonce,
    wrappedGroupKey: unsigned.wrappedGroupKey,
    approvalSignature,
  };
  const encoded = encodePayload(payload);

  const membership: MembershipRecord = {
    id: `${community.id}:${request.memberId}`,
    communityId: community.id,
    memberId: request.memberId,
    displayName: request.displayName,
    role: "MEMBER",
    signingPublicJwk: request.signingPublicJwk,
    certificateBody: body,
    adminSignature: cert.adminSignature,
    joinedAt: now,
    status: "ACTIVE",
  };

  await db.transaction("rw", [db.invites, db.joinRequests, db.memberships, db.auditEvents], async () => {
    const current = await db.invites.get(invite.id);
    if (!current || current.status !== "ACTIVE" || current.uses >= current.maxUses) {
      throw new CarryError("INVITE_ALREADY_USED");
    }
    const uses = current.uses + 1;
    const consumed = uses >= current.maxUses;
    await db.invites.update(invite.id, {
      uses,
      status: consumed ? "CONSUMED" : "ACTIVE",
      // Delete the per-invite ECDH private key once the invite is used up.
      ...(consumed ? { adminEphemeralEcdhPrivateKey: undefined } : {}),
    });
    await db.memberships.put(membership);
    await db.joinRequests.update(request.id, { status: "APPROVED", approvalPayload: encoded });
    await auditEvent(device, "INVITE_APPROVED", request.id, community.id, { memberId: request.memberId });
  });
  return encoded;
}

export async function rejectJoinRequest(device: Device, requestId: string): Promise<void> {
  const { db } = device;
  await db.transaction("rw", db.joinRequests, db.auditEvents, async () => {
    const request = await db.joinRequests.get(requestId);
    if (!request || request.status !== "PENDING") return;
    await db.joinRequests.update(requestId, { status: "REJECTED" });
    await auditEvent(device, "JOIN_REQUEST_REJECTED", requestId, request.communityId);
  });
}

// ── Member: AcceptJoinApproval ────────────────────────────────────────────

export async function acceptJoinApproval(device: Device, approval: JoinApprovalPayload): Promise<CommunityRecord> {
  const { db } = device;
  const id = joinRequestId(approval.inviteId, approval.memberId);
  const pending = await db.pendingJoinRequests.get(id);
  if (pending?.status === "ACCEPTED") throw new CarryError("ALREADY_MEMBER");
  if (!pending || pending.status !== "WAITING_FOR_APPROVAL" || !pending.memberEphemeralEcdhPrivateKey) {
    throw new CarryError("JOIN_APPROVAL_INVALID");
  }
  if (pending.expiresAt <= device.now()) {
    throw new CarryError("JOIN_APPROVAL_INVALID", "This join request has expired. Scan a new invitation.");
  }
  if (approval.communityId !== pending.communityId) throw new CarryError("JOIN_APPROVAL_INVALID");

  const identity = await requireIdentity(device);
  if (approval.memberId !== identity.memberId) throw new CarryError("JOIN_APPROVAL_INVALID");

  const cert = { body: approval.certificateBody, adminSignature: approval.certificateSignature };
  try {
    await assertCertificate(cert, pending.adminSigningPublicJwk, {
      communityId: pending.communityId,
      keyEpoch: approval.keyEpoch,
      memberId: identity.memberId,
    });
  } catch {
    throw new CarryError("JOIN_APPROVAL_INVALID");
  }
  if (cert.body.role !== "MEMBER" || !sameJwk(cert.body.signingPublicJwk, identity.signingPublicJwk)) {
    throw new CarryError("JOIN_APPROVAL_INVALID");
  }

  const signed = approvalSigningString({
    communityId: approval.communityId,
    inviteId: approval.inviteId,
    memberId: approval.memberId,
    keyEpoch: approval.keyEpoch,
    certificateHash: bytesToB64u(await certificateHash(cert)),
    hkdfSalt: approval.hkdfSalt,
    wrapNonce: approval.wrapNonce,
    wrappedGroupKey: approval.wrappedGroupKey,
  });
  if (!(await verify(pending.adminSigningPublicJwk, approval.approvalSignature, utf8Encode(signed)))) {
    throw new CarryError("JOIN_APPROVAL_INVALID");
  }

  const context = joinWrapContext({
    communityId: approval.communityId,
    inviteId: approval.inviteId,
    memberId: approval.memberId,
    keyEpoch: approval.keyEpoch,
  });
  const wrappingKey = await deriveWrappingKey(
    pending.memberEphemeralEcdhPrivateKey,
    pending.adminEphemeralEcdhPublicJwk,
    b64uToBytes(approval.hkdfSalt),
    context,
  );
  let groupKey: Uint8Array<ArrayBuffer>;
  try {
    groupKey = await aesDecrypt(
      wrappingKey,
      b64uToBytes(approval.wrapNonce),
      b64uToBytes(approval.wrappedGroupKey),
      utf8Encode(context),
    );
  } catch (err) {
    if (isCarryError(err, "DECRYPTION_FAILED")) throw new CarryError("JOIN_APPROVAL_INVALID");
    throw err;
  }
  if (groupKey.length !== 32) throw new CarryError("JOIN_APPROVAL_INVALID");
  const keyRecord = await wrapGroupKey(device, approval.communityId, approval.keyEpoch, groupKey);
  groupKey.fill(0);

  const now = device.now();
  const community: CommunityRecord = {
    id: approval.communityId,
    name: pending.communityName,
    role: "MEMBER",
    keyEpoch: approval.keyEpoch,
    adminSigningPublicJwk: pending.adminSigningPublicJwk,
    createdAt: now,
    status: "ACTIVE",
  };
  const membership: MembershipRecord = {
    id: `${community.id}:${identity.memberId}`,
    communityId: community.id,
    memberId: identity.memberId,
    displayName: cert.body.displayName,
    role: "MEMBER",
    signingPublicJwk: identity.signingPublicJwk,
    certificateBody: cert.body,
    adminSignature: cert.adminSignature,
    joinedAt: now,
    status: "ACTIVE",
  };

  await db.transaction(
    "rw",
    [db.communities, db.communityKeys, db.memberships, db.pendingJoinRequests, db.auditEvents],
    async () => {
      if (await db.communities.get(community.id)) throw new CarryError("ALREADY_MEMBER");
      await db.communities.add(community);
      await db.communityKeys.put(keyRecord);
      await db.memberships.put(membership);
      // Delete the per-request ECDH private key and the stored request payload.
      await db.pendingJoinRequests.update(id, {
        status: "ACCEPTED",
        memberEphemeralEcdhPrivateKey: undefined,
        requestPayload: undefined,
      });
      await auditEvent(device, "JOIN_APPROVAL_ACCEPTED", id, community.id);
    },
  );
  return community;
}
