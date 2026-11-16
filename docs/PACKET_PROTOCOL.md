# CARRY — Packet Protocol v1

**Protocol identifier:** `CARRY/1`  
**Transport:** QR frames, manually displayed and scanned  
**Encoding:** UTF-8 JSON envelope → Base64URL → chunked QR frames  
**Cryptography:** AES-256-GCM + ECDSA P-256 + ECDH P-256/HKDF-SHA-256

This document is the protocol source of truth for the MVP. Any format change must update this document and the conformance tests before implementation changes.

## 1. Design goals

- Work without a server or direct device-to-device network connection.
- Carry packets through QR frames with a bounded size.
- Detect incomplete, corrupted, duplicate, expired, wrong-community, and tampered data.
- Keep the group key out of invitation QR codes.
- Require admin approval before key delivery.
- Authenticate the issuing administrator and the sending member.
- Preserve the original encrypted packet when relaying; relays must not decrypt/re-encrypt messages.

## 2. Identifiers and encodings

- `communityId`: 16 random bytes, Base64URL without padding.
- `inviteId`: 16 random bytes, Base64URL without padding.
- `memberId`: 16 random bytes, Base64URL without padding.
- `packetId`: 16 random bytes, Base64URL without padding.
- `transferId`: 12 random bytes, Base64URL without padding.
- `nonce`: 12 random bytes for AES-GCM.
- `salt`: 16 random bytes for HKDF.
- Base64URL uses RFC 4648 URL-safe alphabet without `=` padding.
- Timestamps are Unix epoch milliseconds (integer).
- Public EC keys use JWK in QR control messages and canonical JSON when included in a certificate.

## 3. QR frame format

A QR frame contains one ASCII string:

```text
C1:<transferId>:<index>:<total>:<digest>:<chunk>
```

Where:
- `C1` is the CARRY frame version marker.
- `transferId` is a random 96-bit ID encoded as Base64URL.
- `index` is zero-based.
- `total` is the number of frames, 1–8.
- `digest` is Base64URL SHA-256 of the complete Base64URL packet payload.
- `chunk` is one contiguous slice of the Base64URL packet payload.

### MVP limits

- Maximum QR frame text: 480 ASCII characters.
- Maximum chunk: 360 Base64URL characters.
- Maximum frames per transfer: 8.
- Maximum encoded packet payload: 2,880 Base64URL characters.
- Generate at QR error correction level M by default.
- Do not assume the QR specification maximum is a practical phone-camera payload limit. Test with actual devices and reduce chunk size if scan reliability is poor.

### Frame validation

Reject a frame if:
- Prefix is unknown.
- Transfer ID or digest is malformed.
- Index is not in `[0, total-1]`.
- Total is outside 1–8.
- Frame text exceeds the configured limit.
- Chunk contains characters outside Base64URL.
- Existing transfer has a different digest or total.
- Same index is received with different chunk content.

If the same index and same chunk are scanned again, treat it as an idempotent duplicate.

## 4. Reassembly

1. Parse the frame.
2. Create or load a partial transfer record keyed by `transferId`.
3. Confirm that `digest` and `total` match the existing transfer record.
4. Store the chunk by index in IndexedDB.
5. When all indexes are present, concatenate chunks in ascending order.
6. Compute SHA-256 over the complete Base64URL string encoded as UTF-8; compare with `digest`.
7. Base64URL-decode the payload into bytes.
8. Decode UTF-8 and parse JSON.
9. Validate against the packet type schema with Zod.
10. Perform packet-specific signature, community, expiry, and cryptographic checks.
11. Only then persist as accepted packet.

Never show partial or unverified message content. Never forward incomplete transfers.

## 5. Packet envelope — MESSAGE

Illustrative envelope (values are placeholders):

```json
{
  "v": 1,
  "type": "MESSAGE",
  "communityId": "<base64url-16-bytes>",
  "packetId": "<base64url-16-bytes>",
  "keyEpoch": 1,
  "senderId": "<base64url-16-bytes>",
  "createdAt": 1790000000000,
  "expiresAt": 1790086400000,
  "maxHops": 6,
  "nonce": "<base64url-12-bytes>",
  "ciphertext": "<base64url-aes-gcm-output>",
  "memberCertificate": {
    "body": {
      "v": 1,
      "communityId": "<community-id>",
      "memberId": "<sender-id>",
      "displayName": "Alex",
      "role": "MEMBER",
      "keyEpoch": 1,
      "signingPublicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
      "issuedAt": 1790000000000
    },
    "adminSignature": "<base64url-ecdsa-signature>"
  },
  "senderSignature": "<base64url-ecdsa-signature>",
  "relay": { "hopCount": 0 }
}
```

The encrypted plaintext is a small JSON body:

```json
{
  "text": "Meet at the north entrance.",
  "replyTo": null
}
```

The display name and sender public key are included in the signed member certificate. Do not trust a display name until the certificate and packet signature have been verified.

## 6. Canonical header and AES-GCM AAD

The implementation must use one canonical serialization helper. Do not rely on arbitrary object property order from user-controlled JSON.

Canonical AAD field order:

```text
CARRY|1|<type>|<communityId>|<packetId>|<keyEpoch>|<senderId>|<createdAt>|<expiresAt>|<maxHops>
```

The AAD is UTF-8 bytes of that exact string. Encrypt the message JSON with AES-256-GCM using a fresh 96-bit nonce. The returned ciphertext includes the GCM authentication tag.

The receiver reconstructs exactly the same AAD and calls AES-GCM decrypt. Any change to bound fields or ciphertext must cause verification/decryption to fail.

## 7. ECDSA packet signature

- Algorithm: ECDSA on P-256 with SHA-256.
- The administrator signs a canonical membership certificate body.
- A member signs the immutable packet bytes.
- The packet signature input is:

```text
UTF8(AAD) || nonceBytes || ciphertextBytes || SHA256(canonicalCertificateBody || adminSignature)
```

- Receiver first verifies the admin signature on the membership certificate using the pinned administrator public key.
- Receiver then verifies the sender signature using the member public key in the certificate.
- Receiver checks `communityId`, `senderId`, and `keyEpoch` consistency before decrypting.

The Web Crypto ECDSA signature representation must be encoded consistently by the implementation. Add round-trip tests in the supported browser runtime; do not hand-roll elliptic-curve arithmetic.

## 8. Private community invitation and approval

### INVITE QR

Contains:
- protocol version and type `INVITE`;
- community ID and display name;
- invite ID and random invite secret;
- expiry timestamp;
- administrator signing public JWK;
- per-invite administrator ephemeral ECDH P-256 public JWK;
- short fingerprint of administrator signing public key.

The invite does **not** contain the group key.

The administrator stores only SHA-256(inviteSecret), expiry, allowed use count, invite state, and the per-invite ephemeral ECDH private CryptoKey locally. Delete that private key after approval or expiry.

### JOIN_REQUEST QR

Contains:
- type `JOIN_REQUEST`;
- community ID, invite ID, invite secret;
- requested display name and random member ID;
- member ECDSA P-256 public JWK;
- member per-request ephemeral ECDH P-256 public JWK;
- request nonce and creation time.

The join request contains no private key and no group key.

### JOIN_APPROVAL QR

Administrator validates the invite, asks for explicit approval, and creates a signed membership certificate. It derives a shared secret using the per-invite administrator ephemeral ECDH private key + the member per-request ephemeral ECDH public key; derives a one-time AES wrapping key using HKDF-SHA-256; encrypts the 32-byte group key using AES-256-GCM; and signs the approval metadata.

The approval contains:
- type `JOIN_APPROVAL`;
- community, invite, and member IDs;
- key epoch;
- membership certificate and admin certificate signature;
- HKDF salt;
- AES-GCM wrapping nonce and ciphertext;
- admin signature over canonical approval metadata.

The joining device uses its per-request ECDH private key and pinned per-invite admin ECDH public key to derive the same wrapping key, verifies the admin approval signature, decrypts the group key, wraps it under its local vault key, stores the membership certificate, and deletes the ephemeral ECDH private key. The admin deletes the per-invite ECDH private key after approval or expiry.

## 8A. Control-message examples

The following examples show required field shapes, not real keys or values. All control QR payloads use the same C1 frame transport when they exceed one frame.

### INVITE

```json
{
  "v": 1,
  "type": "INVITE",
  "communityId": "<id>",
  "communityName": "Campus Volunteers",
  "inviteId": "<id>",
  "inviteSecret": "<random-secret>",
  "expiresAt": 1790000000000,
  "adminSigningPublicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "adminEphemeralEcdhPublicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "adminFingerprint": "<short-sha256-fingerprint>"
}
```

### JOIN_REQUEST

```json
{
  "v": 1,
  "type": "JOIN_REQUEST",
  "communityId": "<id>",
  "inviteId": "<id>",
  "inviteSecret": "<secret-from-invite>",
  "memberId": "<id>",
  "displayName": "Sam",
  "memberSigningPublicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "memberEphemeralEcdhPublicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "requestNonce": "<random-nonce>",
  "requestedAt": 1790000000000
}
```

The joining device keeps its per-request ECDH private key locally; it is never included in the QR and is deleted after the approval package is accepted or expires.

### JOIN_APPROVAL

```json
{
  "v": 1,
  "type": "JOIN_APPROVAL",
  "communityId": "<id>",
  "inviteId": "<id>",
  "memberId": "<id>",
  "keyEpoch": 1,
  "certificateBody": { "...": "..." },
  "certificateSignature": "<admin-ecdsa-signature>",
  "hkdfSalt": "<base64url-16-bytes>",
  "wrapNonce": "<base64url-12-bytes>",
  "wrappedGroupKey": "<base64url-aes-gcm-output>",
  "approvalSignature": "<admin-ecdsa-signature>"
}
```

The approval signature covers canonical approval fields including the certificate hash, HKDF salt, wrap nonce, wrapped key, IDs, and key epoch. The group key must not appear in plaintext in this payload.

## 9. ECDH + HKDF key wrapping

- Curve: P-256.
- Each invitation has a unique administrator ephemeral ECDH P-256 key pair; each join request has a unique member ephemeral ECDH P-256 key pair.
- Derive ECDH shared bits from per-invite admin private + per-request member public; the member derives the same bits from per-request member private + per-invite admin public.
- Import shared bits as HKDF input key material.
- Derive AES-GCM-256 wrapping key with SHA-256, fresh 16-byte salt, and context info:

```text
CARRY|1|JOIN_APPROVAL|<communityId>|<inviteId>|<memberId>|<keyEpoch>
```

- Use a fresh 96-bit nonce for the wrapping AES-GCM operation.
- Bind the same context string as AES-GCM AAD.
- Do not reuse a wrapping nonce with the same derived key.

## 10. ACK envelope

ACK is a regular encrypted and signed packet with `type: "ACK"`. Its encrypted body contains:

```json
{
  "originalPacketId": "<message-packet-id>",
  "ackStatus": "RECEIVED"
}
```

The ACK must be signed by the acknowledging member and encrypted with the current group key. The original sender marks its packet `ACKNOWLEDGED` only after importing, verifying, and decrypting an ACK whose `originalPacketId` references its packet.

## 11. Relay metadata

`relay.hopCount` is mutable and is not part of the sender signature because it must increase during forwarding. A receiving device increments it before displaying the relay packet. `maxHops` is part of the immutable signed header. Receivers reject if `hopCount >= maxHops` or the packet has expired.

Important limitation: because hopCount is mutable and a fully offline relay has no global authority, a malicious member could reset it. It is a loop-reduction hint, not a cryptographic security boundary. Duplicate detection by packet ID is the primary local loop guard.

## 12. Expiry and deduplication

- Expiry is part of the immutable signed header and AES-GCM AAD.
- Use an injectable local clock and reject packets after `expiresAt`.
- Deduplicate by `communityId + packetId`.
- Store a tombstone for at least 30 days after expiry to avoid re-import loops.
- Never accept an expired ACK to change a message status.

## 13. Protocol error codes

- `FRAME_INVALID`
- `FRAME_CONFLICT`
- `TRANSFER_INCOMPLETE`
- `TRANSFER_DIGEST_MISMATCH`
- `PACKET_SCHEMA_INVALID`
- `UNSUPPORTED_VERSION`
- `UNKNOWN_COMMUNITY`
- `INVITE_EXPIRED`
- `INVITE_ALREADY_USED`
- `JOIN_APPROVAL_INVALID`
- `CERTIFICATE_INVALID`
- `SIGNATURE_INVALID`
- `KEY_EPOCH_MISMATCH`
- `DECRYPTION_FAILED`
- `PACKET_EXPIRED`
- `PACKET_DUPLICATE`
- `RELAY_LIMIT_REACHED`

## 14. Protocol compatibility and future versions

- Unknown major versions must be rejected, not guessed.
- Minor additive fields may be ignored only if the schema marks them optional and canonical signed fields remain unchanged.
- Never mutate an existing packet to fit a new version.
- Keep golden test vectors for invite, join request, approval, message, ACK, QR frame, and invalid packets.
