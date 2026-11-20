# CARRY — Local Database Schema

**Database:** IndexedDB  
**Wrapper:** Dexie (recommended)  
**No server database:** PostgreSQL, Supabase, Firebase, or other hosted database is not part of the MVP.

## 1. Principles

- The device is the source of truth for its local community and packet state.
- Persist encrypted packet envelopes, not plaintext message bodies.
- Persist `CryptoKey` objects in IndexedDB where browser structured cloning supports them.
- Store group key bytes only after wrapping them with a non-extractable device vault key.
- Use unique IDs and transactional writes for deduplication and transfer assembly.
- Never silently delete cryptographic keys during schema migration.

## 2. Object stores / Dexie tables

### `communities`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Random 128-bit community ID, primary key |
| `name` | string | Community display name, max 40 chars |
| `role` | `ADMIN \| MEMBER` | Local device role |
| `keyEpoch` | number | Starts at 1; future key rotation version |
| `adminSigningPublicJwk` | JsonWebKey | Pinned administrator verification key |
| `createdAt` | number | Unix epoch milliseconds |
| `status` | `ACTIVE \| ARCHIVED` | Local lifecycle |

### `localIdentity`

One record per installed device. The long-lived device identity is used for ECDSA packet signing; ECDH keys used for key delivery are ephemeral per invitation/join request.

| Field | Type | Notes |
|---|---|---|
| `id` | literal `local` | Primary key |
| `memberId` | string | Random device/member ID |
| `displayName` | string | Local display name |
| `signingPrivateKey` | CryptoKey | Non-extractable ECDSA P-256 private key |
| `signingPublicJwk` | JsonWebKey | Public verification key |
| `createdAt` | number | Timestamp |

### `deviceVault`

| Field | Type | Notes |
|---|---|---|
| `id` | literal `default` | Primary key |
| `vaultKey` | CryptoKey | AES-GCM-256, non-extractable local wrapping key |
| `createdAt` | number | Timestamp |

### `communityKeys`

| Field | Type | Notes |
|---|---|---|
| `id` | string | `${communityId}:${keyEpoch}`, primary key |
| `communityId` | string | Community foreign key |
| `keyEpoch` | number | Group key epoch |
| `wrappedKey` | ArrayBuffer | Group key encrypted under `deviceVault.vaultKey` |
| `wrapNonce` | ArrayBuffer | 96-bit local vault nonce |
| `createdAt` | number | Timestamp |

### `memberships`

| Field | Type | Notes |
|---|---|---|
| `id` | string | `${communityId}:${memberId}`, primary key |
| `communityId` | string | Community ID |
| `memberId` | string | Member ID |
| `displayName` | string | Approved member name |
| `role` | `ADMIN \| MEMBER` | Role |
| `signingPublicJwk` | JsonWebKey | Member verification key |
| `certificateBody` | object | Canonical certificate fields |
| `adminSignature` | string | Base64URL ECDSA signature |
| `joinedAt` | number | Timestamp |
| `status` | `ACTIVE \| REVOKED_LOCAL` | Local record; revocation is not globally instant while offline |

### `invites`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Invite ID, primary key |
| `communityId` | string | Community ID |
| `secretHash` | string | SHA-256 of random invitation secret; never store the QR secret in plaintext |
| `adminEphemeralEcdhPrivateKey` | CryptoKey | Non-extractable per-invite ECDH P-256 private key; delete after use/expiry |
| `adminEphemeralEcdhPublicJwk` | JsonWebKey | Public key included in invite QR |
| `expiresAt` | number | Timestamp |
| `maxUses` | number | MVP default 1 |
| `uses` | number | Locally accepted uses |
| `createdAt` | number | Timestamp |
| `status` | `ACTIVE \| CONSUMED \| EXPIRED \| REVOKED` | Local state |

### `joinRequests`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Request ID, primary key |
| `communityId` | string | Community ID |
| `inviteId` | string | Invite ID |
| `memberId` | string | Proposed member ID |
| `displayName` | string | Requested display name |
| `signingPublicJwk` | JsonWebKey | Member signing public key |
| `memberEphemeralEcdhPublicJwk` | JsonWebKey | Public key sent in join request |
| `requestNonce` | string | Random request nonce |
| `requestedAt` | number | Timestamp |
| `status` | `PENDING \| APPROVED \| REJECTED \| EXPIRED` | Local state |

The admin device stores only sanitized request metadata and public keys after validating the invitation secret. Never store the invitation secret or any member private key in this table.

### `pendingJoinRequests`

This table exists on the joining device only, so the per-request ephemeral ECDH private key never leaves that device.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Request ID, primary key |
| `communityId` | string | Community ID from invite |
| `inviteId` | string | Invite ID |
| `memberId` | string | Local member ID |
| `memberEphemeralEcdhPrivateKey` | CryptoKey | Non-extractable per-request ECDH private key; delete after approval or expiry |
| `memberEphemeralEcdhPublicJwk` | JsonWebKey | Public key sent in JOIN_REQUEST |
| `adminEphemeralEcdhPublicJwk` | JsonWebKey | Pinned public key from invite |
| `requestNonce` | string | Random request nonce |
| `requestedAt` | number | Timestamp |
| `expiresAt` | number | Request expiry |
| `status` | `WAITING_FOR_APPROVAL \| ACCEPTED \| EXPIRED` | Local state |

### `packets`

| Field | Type | Notes |
|---|---|---|
| `id` | string | `${communityId}:${packetId}`, primary key |
| `communityId` | string | Community ID |
| `packetId` | string | Random 128-bit packet ID |
| `packetType` | `MESSAGE \| ACK` | MVP packet type |
| `encodedEnvelope` | string | Base64URL of canonical UTF-8 JSON envelope; encrypted content only |
| `direction` | `OUTBOUND \| INBOUND` | Local perspective |
| `status` | `READY \| IMPORTED \| RELAYED \| ACKNOWLEDGED \| EXPIRED` | Local status. Packets that fail verification are rejected at scan time and never stored, so there is no rejected status |
| `hopCount` | number | Mutable relay hint |
| `createdAt` | number | Signed timestamp |
| `expiresAt` | number | Signed expiry |
| `firstSeenAt` | number | First local import time |
| `lastActionAt` | number | Last local status update |

### `transfers`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Transfer ID, primary key |
| `digest` | string | SHA-256 Base64URL digest of complete encoded payload |
| `frameCount` | number | Expected frame count, max 8 |
| `chunks` | object | Map of frame index to chunk string |
| `receivedCount` | number | Number of unique frames received |
| `status` | `PARTIAL \| COMPLETE \| INVALID \| EXPIRED` | Transfer state |
| `createdAt` | number | Timestamp |
| `updatedAt` | number | Timestamp |

### `acknowledgements`

| Field | Type | Notes |
|---|---|---|
| `id` | string | ACK packet ID, primary key |
| `communityId` | string | Community ID |
| `originalPacketId` | string | Message being acknowledged |
| `ackPacketId` | string | ACK packet ID |
| `acknowledgedBy` | string | Member ID |
| `createdAt` | number | Timestamp |
| `receivedAt` | number | Null until origin device imports ACK |

### `auditEvents`

| Field | Type | Notes |
|---|---|---|
| `id` | number | Auto-increment key |
| `communityId` | string | Nullable for device events |
| `eventType` | string | e.g. COMMUNITY_CREATED, INVITE_APPROVED, PACKET_IMPORTED |
| `entityId` | string | Related entity ID |
| `timestamp` | number | Timestamp |
| `details` | object | Non-sensitive metadata only; never message bodies, group keys, invite secrets, or private keys |

## 3. Suggested Dexie schema

```ts
communities: "&id, name, role, status, createdAt"
localIdentity: "&id, memberId"
deviceVault: "&id"
communityKeys: "&id, communityId, keyEpoch"
memberships: "&id, communityId, memberId, status"
invites: "&id, communityId, status, expiresAt"
joinRequests: "&id, communityId, inviteId, memberId, status, requestedAt"
pendingJoinRequests: "&id, communityId, inviteId, memberId, status, requestedAt"
packets: "&id, communityId, packetId, packetType, direction, status, createdAt, expiresAt"
transfers: "&id, status, updatedAt"
acknowledgements: "&id, communityId, originalPacketId, ackPacketId, receivedAt"
auditEvents: "++id, communityId, eventType, entityId, timestamp"
```

Confirm and implement actual index syntax against the installed Dexie version. Add compound indexes only when a query requires them.

## 4. Transaction boundaries

- **Approve join:** validate invite + consume invite + persist membership certificate + create approval event in one transaction. Key generation/encryption occurs before committing; do not mark invite consumed if approval construction fails.
- **Accept frame:** validate frame header + transactionally store chunk + update received count.
- **Complete transfer:** reassemble and verify digest outside the transaction; then validate packet; commit packet + completed transfer status + audit event atomically.
- **Deduplicate packet:** unique packet primary key prevents duplicate inbox rows. On duplicate import, update last-seen metadata only.
- **Accept ACK:** verify ACK first, then transactionally update original packet status and create ACK record.

## 5. Data retention

- Keep encrypted packets until expiry plus a 30-day duplicate tombstone window.
- Keep transfer chunks until complete or 24 hours after last update.
- Delete expired invite secrets/hashes after 30 days.
- Do not persist plaintext body by default.
- No background cleanup is required for MVP; run cleanup when app starts or community opens.
- Provide a visible “Clear local data” action with a strong warning that local communities and keys will be lost.

## 6. Storage and migration warnings

IndexedDB is browser-managed storage and can be cleared by users or evicted by the browser. CARRY has no cloud recovery. P1 should add an encrypted export/import backup. Migrations must preserve CryptoKey objects and must never reset the key store automatically after an exception.
