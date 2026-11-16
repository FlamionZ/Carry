import { randomId } from "../../domain/encoding";
import type { CertificateBody } from "../../domain/packet/schemas";
import type { CommunityRecord, MembershipRecord } from "../../infrastructure/db/db";
import { generateGroupKeyBytes } from "../../infrastructure/crypto/webcrypto";
import { auditEvent } from "../audit";
import type { Device } from "../device";
import { signCertificate } from "./certificates";
import { normalizeName, requireIdentity } from "./identity";
import { wrapGroupKey } from "./keys";

/** CreateCommunity: this device becomes administrator and holds key epoch 1. */
export async function createCommunity(device: Device, rawName: string): Promise<CommunityRecord> {
  const name = normalizeName(rawName);
  const identity = await requireIdentity(device);
  const now = device.now();
  const communityId = randomId(16);
  const keyEpoch = 1;

  const groupKey = generateGroupKeyBytes();
  const keyRecord = await wrapGroupKey(device, communityId, keyEpoch, groupKey);
  groupKey.fill(0);

  const body: CertificateBody = {
    v: 1,
    communityId,
    memberId: identity.memberId,
    displayName: identity.displayName,
    role: "ADMIN",
    keyEpoch,
    signingPublicJwk: identity.signingPublicJwk,
    issuedAt: now,
  };
  const cert = await signCertificate(identity.signingPrivateKey, body);

  const community: CommunityRecord = {
    id: communityId,
    name,
    role: "ADMIN",
    keyEpoch,
    adminSigningPublicJwk: identity.signingPublicJwk,
    createdAt: now,
    status: "ACTIVE",
  };
  const membership: MembershipRecord = {
    id: `${communityId}:${identity.memberId}`,
    communityId,
    memberId: identity.memberId,
    displayName: identity.displayName,
    role: "ADMIN",
    signingPublicJwk: identity.signingPublicJwk,
    certificateBody: body,
    adminSignature: cert.adminSignature,
    joinedAt: now,
    status: "ACTIVE",
  };

  const { db } = device;
  await db.transaction("rw", [db.communities, db.communityKeys, db.memberships, db.auditEvents], async () => {
    await db.communities.add(community);
    await db.communityKeys.add(keyRecord);
    await db.memberships.add(membership);
    await auditEvent(device, "COMMUNITY_CREATED", communityId, communityId);
  });
  return community;
}

export async function getOwnMembership(device: Device, communityId: string): Promise<MembershipRecord | undefined> {
  const identity = await requireIdentity(device);
  return device.db.memberships.get(`${communityId}:${identity.memberId}`);
}
