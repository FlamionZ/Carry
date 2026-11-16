# CARRY — Security Model and Privacy Boundaries

## 1. Security objectives

- Keep community message contents private from people who do not possess the community key.
- Ensure only an administrator-approved joining device receives the group key.
- Detect modification of encrypted message packets.
- Verify that a message was signed by a device whose membership certificate was issued by the pinned community administrator.
- Avoid sending community data to a central server.
- Make failures visible instead of silently accepting malformed packets.

## 2. Assets

- Community group key.
- Administrator ECDSA signing private key.
- Per-invite administrator ephemeral ECDH private key.
- Member ECDSA signing private key.
- Per-request member ephemeral ECDH private key until join approval is accepted.
- Encrypted packets and private message content.
- Invitation secrets and membership certificates.
- Local device vault key.

## 3. Trust boundaries

- **Physical invitation handoff:** user should receive the invitation QR from a trusted organizer and compare the displayed admin fingerprint when feasible.
- **QR scanner input:** every scanned frame and packet is untrusted until schema, digest, community, signature, expiry, and cryptographic checks pass.
- **Local browser storage:** data is stored on the device. Device compromise, malicious extensions, browser-profile access, XSS, or user-cleared storage can expose or destroy data.
- **Group membership:** approved members share the ability to decrypt community messages. Any authorized member can potentially copy plaintext or take screenshots.
- **Relay device:** a relay can observe packet metadata (community ID, packet type, timestamps, sender ID, expiry, size) even though message body is encrypted.

## 4. Key lifecycle

### Device vault key

- Generate AES-GCM-256 key with `extractable: false`.
- Store the CryptoKey object in IndexedDB.
- Use it to wrap locally stored group key bytes.
- If the vault key is lost, locally wrapped group keys cannot be recovered.

### Community group key

- Generate 32 random bytes with `crypto.getRandomValues`.
- Wrap for local storage using the device vault key and a fresh nonce.
- Import as AES-GCM-256 for message encryption/decryption.
- Do not store raw group key bytes in localStorage, URLs, logs, analytics, or plain IndexedDB fields.
- Deliver to new members only through a member-specific ECDH/HKDF/AES-GCM approval package.

### Administrator keys

- ECDSA P-256 key pair signs membership certificates and join approval metadata.
- A unique ephemeral ECDH P-256 key pair is generated for each invitation. Its private key is stored in the invite record only until approval or expiry.
- The joining device generates a unique per-request ECDH P-256 pair; its private key remains local until approval is accepted.
- Public ephemeral ECDH keys are included in the invitation and join request QR payloads.
- Both ephemeral private keys are deleted after approval/expiry. The admin ECDSA public key is pinned to the community record and included in the invitation QR.

### Member keys

- ECDSA P-256 key pair signs outgoing message and ACK packets.
- An ephemeral ECDH P-256 key pair is generated for the join handshake. Its private key is deleted after the approval package is accepted or expires.
- The long-lived ECDSA private key remains on the member device.
- The admin-signed membership certificate binds the member ID and public signing key to a community.

## 5. Threats and mitigations

| Threat | Mitigation | Residual limitation |
|---|---|---|
| Someone photographs an invitation QR | Invite secret expires, is single-use locally, and requires admin approval | Anyone with the invite can submit a join request; admin must verify in person |
| Someone alters QR frame data | Whole-transfer SHA-256 plus packet signature and AES-GCM authentication | A corrupted frame can cause denial of service, not silent acceptance |
| Someone replays a valid packet | packet ID deduplication, expiry, tombstones | Replaying before local receipt on a different device may still be processed once there |
| Someone changes message content | AES-GCM auth tag and sender ECDSA signature | A compromised authorized member can create valid messages |
| Someone impersonates a member | Admin-signed membership certificate plus sender signature | Admin private-key compromise undermines member issuance trust |
| Someone tries another community's packet | Strict community ID and key epoch checks | Packet metadata may reveal community ID |
| QR relay loops | packet ID deduplication, hop count hint, expiry | Mutable hop count can be reset by a malicious relay |
| Lost phone | No central data store; future encrypted backup | Local keys/data can be lost or exposed if device is compromised |
| Member is removed while offline | P1 key rotation/re-enrollment | MVP has no instant distributed revocation; old member may retain old key |
| XSS or malicious dependency | CSP, pinned dependencies, no CDN, dependency review, minimal scripts | Active same-origin script can potentially invoke local CryptoKeys while app is running |

## 6. Explicit MVP limitations

- A private group is private to approved key-holding members, not anonymous.
- Group members can read messages for the key epoch they possess.
- A device that has been approved may copy plaintext outside CARRY.
- Member removal cannot be instant in an offline system. To exclude a member, the community must rotate the group key and distribute the new epoch only to remaining members; this is P1. A simpler MVP recovery is to create a new community and re-enroll trusted members.
- CARRY does not guarantee packet delivery. Acknowledgement must travel back physically.
- CARRY is not suitable as the sole channel for life-critical emergency communications.
- The protocol has not been independently audited. The UI and documentation must not claim “unhackable” or “military-grade.”

## 7. Secure implementation rules

- Use Web Crypto API; do not implement AES, ECDSA, ECDH, or HKDF manually.
- Require a fresh 96-bit nonce for every AES-GCM encryption under a given key.
- Use one canonical header encoder for AAD and signatures.
- Verify admin certificate, sender signature, community, epoch, and expiry before revealing plaintext.
- Treat packet fields as untrusted JSON; validate length and type before allocating large buffers.
- Limit QR frame count, chunk length, total transfer length, and partial-transfer count.
- Do not render message text as HTML.
- Never log plaintext, invite secret, group key, private key, or approval ciphertext.
- Stop camera tracks after scan completes or user exits.
- Require HTTPS for real-device PWA/camera use; localhost may be used for development.
- Pin dependencies and keep all runtime code locally bundled.

## 8. Privacy UX copy

Before creating a community:

“Your community and messages stay on this device and are transferred directly by QR. CARRY does not use a message server. If you clear browser data or lose this device, your local data may be lost.”

Before showing an invitation:

“Share this invitation only with people you trust. Anyone who obtains it can request to join, but the administrator must approve each request.”

Before scanning a join approval:

“This approval contains the community key encrypted for this device. Do not share the approval QR.”

Before acknowledging:

“An acknowledgement must be carried back to the sender before they can see it.”
