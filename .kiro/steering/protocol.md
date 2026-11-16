---
inclusion: fileMatch
fileMatchPattern: "src/**/*.ts"
---

# CARRY protocol and security rules

`docs/PACKET_PROTOCOL.md` is the protocol source of truth and `docs/SECURITY_MODEL.md` the threat model. Read them before changing protocol code. Update the doc and the conformance tests before changing a wire format.

- Use only Web Crypto primitives: AES-256-GCM, ECDSA P-256 with SHA-256, ECDH P-256 with HKDF-SHA-256. No custom cryptography.
- Every AES-GCM encryption uses a fresh 96-bit nonce. All AAD and signature input strings come from `src/domain/canonical.ts`.
- Scanned data is untrusted. The order is: `parseFrame` → digest check → `decodePayload` (Zod) → community and key epoch → admin certificate → sender signature → decrypt. Never show partial or unverified content.
- Relays never decrypt or re-encrypt; only `relay.hopCount` changes.
- Never persist or log plaintext, group keys, invite secrets, private keys or approval ciphertext. Audit event details hold non-sensitive metadata only.
- Private keys are non-extractable CryptoKeys. Group key bytes are stored only after wrapping with the device vault key.
- QR transfers keep chunks only while partial. Handled transfers are deleted because chunks can contain invite secrets.
- Throw `CarryError` with a code from `src/domain/errors.ts`.
