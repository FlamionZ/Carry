# Devpost text: CARRY

Copy each section into the matching Devpost field. Every number here comes from the repository; the source is noted where it is not obvious.

**Category:** Resurrection

**Tagline (short description):**
The ghost of FidoNet, carried by hand: private community messages that travel phone to phone as QR codes, with no server and no internet.

**Links:**
- Live app: https://carry-beu.pages.dev
- Code (MIT): https://github.com/FlamionZ/Carry
- Video: <YouTube link>

---

## Inspiration

At a crowded campus event, the mobile network is often the first thing to fail. Organizers still need to tell volunteers that the meeting point moved or that help is needed at the north gate.

Computers had this problem before. In the 1980s, FidoNet and UUCP moved mail between machines that were rarely online: each one stored messages and passed them on to the next, often overnight. People also carried data by hand on disks, which was called sneakernet. Store-and-forward is a dead technology on today's always-online phones. We wanted to bring it back, with a phone camera instead of a modem, and with modern encryption and signatures.

## What it does

CARRY is an offline-first web app (PWA) for private community messages.

- An organizer creates a **community** on their phone. Members join by scanning an **invitation** QR, showing a **join request** QR, and receiving an encrypted **approval** after the organizer compares key fingerprints.
- A member writes a short message: an Announcement, a Change or a Request, up to 280 characters. CARRY encrypts and signs it and shows it as a cycle of QR frames.
- The next person scans the frames. They can read it, then **relay** it: their phone shows the same encrypted packet to the next person and adds its own signed relay entry. Relays never decrypt or re-encrypt.
- The reader taps **Acknowledge**, and the acknowledgement is carried back the same way. The author's message reads **Acknowledged** only after that acknowledgement is scanned on the author's own phone.
- The author's **Ledger** shows each message's kind, status, how many members acknowledged it, and the verified journey out and back, for example "Alex → Sam → Chris" and back.

Status words describe only what this phone has seen. CARRY never says "delivered", because it cannot know. It is not an automatic mesh, it does not guarantee delivery, and it is not an emergency network. Someone has to carry every packet.

The Kiroween edition opens in a dark "Kiroween night" theme with a small lantern motif, the light carried from hand to hand. Light is still a choice in Settings, and QR codes are always dark on white.

## How we built it

CARRY is React 18, TypeScript (strict), Vite 8 and Tailwind 3. Data lives in IndexedDB through Dexie. Cryptography is Web Crypto only: AES-256-GCM, ECDSA P-256 and ECDH P-256 with HKDF. QR codes are drawn with `qrcode` and read with ZXing. It is hosted as a static site on Cloudflare Pages. There is no backend, no account and no runtime network request. The browser tests fail on any request that leaves the app origin.

We built it with Kiro, in three phases (details in `KIRO.md`):

1. **Vibe sessions** (16–18 November) built the first version and hardened it for production from the protocol, security and design documents in `docs/`.
2. **The community coordination spec**: a grilling session produced a glossary and an ADR, then `requirements.md` (45 user stories), `design.md` and 10 tickets. Parallel subagents implemented the tickets in separate git worktrees, in waves set by each ticket's "Blocked by" line. A two-axis code review (standards and spec, in parallel subagents) reported 22 findings, which were fixed before deploying.
3. **The Kiroween night spec**: an ADR, 10 user stories and 3 tickets for the theme, the welcome story and these texts. The context7 power supplied the Tailwind v3 documentation for runtime theming that works under a strict CSP.

**Steering** files hold the product vocabulary and banned claims, the layer rules and the protocol rules: the scan verification order, what a relay may change, and what must never be stored. An **agent hook** runs the type check and all unit tests whenever a protocol file is saved. Two **custom agents**, a Protocol Engineer and a Security Reviewer, carry the protocol rules into delegated work. The planning used Matt Pocock's engineering **skills**.

## Challenges we ran into

- **QR decoding depends on the mask pattern.** ZXing failed to read about 25–30% of perfectly sharp QR images with the default mask. CARRY now decodes each frame while drawing it and redraws it with another mask if needed. In a test of 80 frames, read-back went from 56 to 80.
- **A scanner pause skipped the same frame forever.** ZXing's default 500 ms pause after a read fell into step with the frame cycle, so one frame was missed on every pass. A 150 ms pause fixed it, and the fake-camera browser test passed 16 of 16 runs.
- **Proving who carried a message without trusting the carriers.** Each relay signs a hash-chained entry, so the journey cannot be altered, reordered or have its middle removed without detection. A relay can still drop trailing entries; that residual risk is documented in the security model.
- **A dark theme under a strict CSP.** No inline scripts or styles are allowed, so night is the stylesheet default and only a Light choice needs code. A computed contrast check found that white text on the first night danger colour failed WCAG AA, so we added an `on-danger` role.

## Accomplishments that we're proud of

- 106 unit and protocol tests, including 8 fast-check properties. Examples: any single-character change to a frame or signed packet is rejected without showing the text, and duplicate frames never change the result. One property found a real bug that hand-written tests had missed: Base64 padding bits.
- Two frozen golden-vector files that pin the wire format byte for byte, so a future build cannot silently break phones running an older one.
- 5 Playwright tests on Chromium, WebKit and Firefox. One runs the whole demo with three isolated "phones": join, relay A → B → C, acknowledgement back, integrity checks, and an offline reload. One sends QR frames through the real camera code path with a fake camera that tilts, blurs and drifts the image.
- Honest status language. "Acknowledged" is the only teal status, and it is earned on the author's own device.

## What we learned

Writing the rules down first paid off. Once the scan verification order and the "relays never decrypt" rule were in steering, delegated agents followed them without being reminded. When the protocol changed, the protocol document changed first, then the vectors, then the code.

We also learned to verify subagent work. Twice, a subagent reported a commit that did not exist. Now we check the hash before removing a worktree.

## What's next for CARRY

- Testing with real organizers at a real event, using the rehearsal measurements already built into Settings: frames per message, seconds per transfer and acknowledgements returned.
- Key rotation and member removal. Until then, a new community is the workaround.
- An independent review of the protocol, which has not been audited.

## Built with

react, typescript, vite, tailwindcss, dexie, indexeddb, web-crypto, zod, zxing, qrcode, workbox, vite-plugin-pwa, vitest, fast-check, playwright, cloudflare-pages, kiro
