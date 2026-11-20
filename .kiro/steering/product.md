---
inclusion: always
---

# CARRY product rules

CARRY is an offline-first PWA for private community messages that people carry between phones as QR frames. There is no server and no automatic mesh.

Specs live in `docs/`: `ARCHITECTURE (1).md`, `PACKET_PROTOCOL.md`, `DATABASE_SCHEMA.md`, `SECURITY_MODEL.md`, `BRAND_GUIDELINES.md`, `DEMO_PLAN.md`.

## Copy and UX

- Prefer: community, member, invitation, join request, approval, packet, relay, scan, acknowledged, offline-ready.
- Never claim automatic mesh, instant or guaranteed delivery, an emergency network, anonymity, or "military-grade"/"unhackable" security.
- A message is "Acknowledged" only after its ACK was scanned on the sender's device. Teal/green status is reserved for that.
- Show state with a text label, never with color alone. Keep touch targets large and focus visible, and respect reduced motion.
- Explain before opening the camera, and keep the image-upload and paste-text fallbacks.
- Colors and fonts come from `tailwind.config.js` (brand tokens in BRAND_GUIDELINES.md §11). Fonts are bundled with `@fontsource`; never load remote fonts or assets.
