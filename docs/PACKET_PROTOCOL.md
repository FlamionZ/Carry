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

The author creates the packet with `relay: { "hopCount": 0 }` and no `entries` field. Relays add relay entries to `relay` (§11A).

The encrypted plaintext is a small JSON body:

```json
{
  "text": "Meet at the north entrance.",
  "replyTo": null,
  "kind": "CHANGE"
}
```

The display name and sender public key are included in the signed member certificate. Do not trust a display name until the certificate and packet signature have been verified.

### Message kind

- `kind` is optional. Allowed values: `"ANNOUNCEMENT"`, `"CHANGE"`, `"REQUEST"` (shown as Announcement, Change and Request).
- A missing `kind` means `"ANNOUNCEMENT"`. Writers may omit it for Announcement; this build always writes it.
- Any other value fails the body schema and the packet is rejected with `PACKET_SCHEMA_INVALID`, like any other invalid body. A new kind needs a protocol update first.
- `kind` lives only in the encrypted body. It is never placed in the cleartext header or in `relay`, so relays and non-members cannot see it.
- Older builds strip the unknown field when they parse the body and show the message as plain text. The ciphertext is unchanged when they relay it.

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

### Acknowledgement journey

The encrypted ACK body may carry an optional copy of the acknowledged message's relay section, so the author can see how the message reached the acknowledging member:

```json
{
  "originalPacketId": "<message-packet-id>",
  "ackStatus": "RECEIVED",
  "messageRelay": {
    "hopCount": 1,
    "entries": [
      { "memberId": "<relay-member-id>", "hop": 1, "at": 1790000300000, "sig": "<base64url-ecdsa-signature>" }
    ]
  }
}
```

- `messageRelay` has exactly the shape of the envelope's `relay` object (§11A): the message's `hopCount` and `entries` exactly as the acknowledging device stored them on import. `entries` is absent when the message arrived with an unrecorded journey.
- This build always writes `messageRelay` when it creates an ACK, unless the encoded ACK would then exceed the 2,880-character payload limit; in that case it omits `messageRelay` (see §11A, size).
- `messageRelay` is inside the ciphertext, so relays of the ACK cannot read or change it.
- Only the author re-verifies the copy: the device whose own outbound MESSAGE the ACK references. After decrypting the ACK, it runs the §11A verification rules on `messageRelay`, using the original message's `packetId` and `senderSignature` from its own stored packet, and its own membership records to decide which members are known. Clock flags use the original message's `createdAt` and the time this device scanned the ACK.
- If the copy fails any rule, the ACK is rejected with `RELAY_ENTRY_INVALID`, is not stored, and does not mark the message `ACKNOWLEDGED`.
- An ACK without `messageRelay` (from an older build, or omitted for size) is accepted. The author shows the outbound journey as not reported.
- Devices other than the author do not check `messageRelay`.
- The ACK packet has its own `relay.entries` for the way back, added and verified like any other packet's (§11A), with the ACK's own `packetId` and `senderSignature`.
- Older builds strip the unknown `messageRelay` field when they parse the ACK body.

## 11. Relay metadata

`relay.hopCount` is mutable and is not part of the sender signature because it must increase during forwarding. A receiving device increments it before displaying the relay packet. `maxHops` is part of the immutable signed header. Receivers reject if `hopCount >= maxHops` or the packet has expired.

Important limitation: because hopCount is mutable and a fully offline relay has no global authority, a malicious member could reset it. It is a loop-reduction hint, not a cryptographic security boundary. Duplicate detection by packet ID is the primary local loop guard.

## 11A. Relay entries

A relay entry is a relay's signed statement that this member carried the packet one hop. Entries live in the mutable `relay` section next to `hopCount`. The immutable header, nonce, ciphertext, member certificate and sender signature are unchanged; relays still never decrypt or re-encrypt.

### Shape

```json
"relay": {
  "hopCount": 2,
  "entries": [
    { "memberId": "<member-B-id>", "hop": 1, "at": 1790000300000, "sig": "<base64url-ecdsa-signature>" },
    { "memberId": "<member-C-id>", "hop": 2, "at": 1790000900000, "sig": "<base64url-ecdsa-signature>" }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `entries` | array, optional, 0–16 items (`maxHopsLimit`) | Relay entries in hop order. Absent on a packet the author has not relayed. |
| `memberId` | `memberId` (16 bytes, Base64URL) | The relay's member ID in this community. |
| `hop` | integer, 1–255 | The `hopCount` this relay set when it showed the packet. |
| `at` | timestamp (ms) | The relay's local clock when it showed the packet. Reported, not trusted. |
| `sig` | 64-byte IEEE-P1363 ECDSA P-256 signature, Base64URL (86 chars) | The relay's signature over the signing string below. |

Each field is validated by the envelope schema (§4 step 9); a malformed entry is `PACKET_SCHEMA_INVALID`. The relay's certificate is not included, which keeps entries small. An entry carries no previous-entry hash; verifiers recompute it (below).

### Signing string

```text
CARRY|1|RELAY|<packetId>|<hop>|<memberId>|<at>|<prevHash>
```

- `packetId` is the envelope's `packetId`. `hop` and `at` are written as decimal integers, as in the AAD (§6).
- The signature is ECDSA P-256 with SHA-256 over the UTF-8 bytes of that exact string, made with the relay's member signing key (the key in its membership certificate).
- The string is built only by the canonical serialization module (`src/domain/canonical.ts`).

### Hash chain

`prevHash` links each entry to the one before it:

- For the entry with `hop` 1: `prevHash = Base64URL(SHA-256(UTF8(senderSignature)))`, where `senderSignature` is the envelope's Base64URL string as it appears in the packet. The first entry chains from the author signature.
- For the entry with `hop` k > 1: `prevHash = Base64URL(SHA-256(UTF8(<signing string of entry k-1> + "|" + <sig of entry k-1>)))`.

The hash of a previous entry therefore covers all of its fields, its signature and, through its own `prevHash`, every earlier entry back to the author signature. `prevHash` is 43 Base64URL characters (32 bytes, no padding).

### Appending an entry (relay)

When a device shows a received packet for relay, in one operation it:

1. Checks expiry and the hop limit as today (`hopCount + 1 < maxHops`, §11).
2. If the stored packet's journey is recorded (entries absent with `hopCount` 0, or entries present), it computes `prevHash` from the last stored entry (or from `senderSignature` when there are none), signs an entry with `memberId` = its own member ID, `hop` = `hopCount + 1` and `at` = its current clock, and appends it.
3. Sets `hopCount` to `hopCount + 1`.

If the stored packet has an unrecorded journey (`hopCount` > 0 and no entries), the relay adds no entry and only increments `hopCount`, so the packet stays consistent with rule 1 below.

The entry is made from the stored packet each time the relay QR is shown. Showing again produces a fresh entry with a new `at` and signature; it does not stack a second entry. The author never adds an entry when showing its own packet.

### Verification on import

Relay entries are checked after the expiry and hop-limit checks (§11, §12) and the sender signature (§7), and before decryption. Content is never shown and the packet is never stored when a check fails. Let `n = hopCount` and `entries` be the list (absent or empty both mean no entries).

1. **Count.** If there are entries, their number must equal `n`. If there are none, the packet is accepted with an unrecorded journey when `n` > 0. Otherwise reject.
2. **Order.** The entry at position i (1-based) must have `hop` = i, so hops run 1…n. Otherwise reject.
3. **Chain.** Recompute `prevHash` for every entry from the author signature onward, as above. Every entry's signing string uses the recomputed value. A broken link shows up as a signature that does not verify under rule 4.
4. **Known members.** An entry's member is known when this device has a membership record with a signing key for `(communityId, memberId)`, or when `memberId` is the packet's `senderId` (its certificate was just verified). Each known member's `sig` must verify. Otherwise reject.
5. **Unknown members.** An entry whose member is not known is kept unchanged and shown as an unknown member. Its signature cannot be checked, but its fields still feed the chain, so a later known member's signature still covers it.
6. **Clock flags.** An entry's `at` is flagged, not rejected, when it is more than the tolerance before the packet's `createdAt` (flag `BEFORE_CREATION`) or more than the tolerance after the time this device scanned the packet (flag `IN_FUTURE`). The tolerance is **5 minutes** (300,000 ms) on both sides. Entries whose times are out of order among themselves are not flagged; different phones' clocks are compared only against the packet's creation and this device's scan time.

Rules 1–4 reject with `RELAY_ENTRY_INVALID`. The packet is stored with its entries exactly as received, so the next relay chains from them and an ACK can copy them (§10).

### Size

An entry is about 160 JSON characters including key names and its separating comma, which is about 215 characters of the Base64URL packet payload per hop. A relay that cannot append its entry within the 2,880-character payload limit (§3) refuses to show the packet with `RELAY_LIMIT_REACHED`. In practice a short message has room for several hops below the default `maxHops` of 6; a message near the 280-character text limit has fewer. A copied `messageRelay` inside an ACK costs more, because it is encrypted and then Base64URL-encoded twice (about 285 payload characters per copied entry).

### Compatibility

- `entries` and `messageRelay` are additive within protocol v1. The signed header, AAD (§6) and sender signature input (§7) are unchanged, so the v1 golden vectors (`src/test/vectors/carry-v1.json`) stay valid and are never edited. Relay entry cases live in a separate vector file.
- Older builds strip `entries` when they parse a packet. When they relay it, it leaves without entries, and the next device sees an unrecorded journey; the earlier entries are lost. This is why rule 1 allows no entries but never fewer entries than `hopCount`.

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
- `RELAY_ENTRY_INVALID`: relay entries fail §11A rules 1–4 (count mismatch, hops out of order, broken chain, or a known member's signature does not verify), or an ACK's copied `messageRelay` fails them on the author's device (§10).

## 14. Protocol compatibility and future versions

- Unknown major versions must be rejected, not guessed.
- Minor additive fields may be ignored only if the schema marks them optional and canonical signed fields remain unchanged.
- The message `kind` (§5), relay `entries` (§11A) and ACK `messageRelay` (§10) are such additive v1 fields. The v1 golden vectors stay unchanged and must keep verifying.
- Never mutate an existing packet to fit a new version.
- Keep golden test vectors for invite, join request, approval, message, ACK, QR frame, and invalid packets.
