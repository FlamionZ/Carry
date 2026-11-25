# CARRY

Carry the message. Keep the community connected.

CARRY is a tool for offline community coordination. When mobile data and Wi-Fi are overloaded, for example at a crowded campus event, organizers still need to tell members that a meeting point moved or that volunteers are needed somewhere. In CARRY, a member writes a short message on one phone. The message is encrypted and signed, shown as a sequence of QR frames, and scanned by the next person, who can carry it further. An acknowledgement travels back the same way. There is no server, no account and no network request at runtime.

Live: **https://carry-beu.pages.dev**. The specification lives in [`docs/`](docs/).

## Kiroween 2026: Resurrection

CARRY is entered in the **Resurrection** category. In the 1980s, FidoNet and UUCP moved mail between computers that were not online all the time: each machine stored messages and passed them on to the next one at night. People also carried data by hand on disks, which was called sneakernet. CARRY brings that store-and-forward idea back for phones. Packets travel hand to hand as QR frames, with modern encryption, signatures, and no server.

The submission edition opens in a dark "Kiroween night" theme with a small lantern motif. Light is still available in Settings. QR codes stay dark on white in both themes ([ADR-0002](docs/adr/0002-kiroween-night-theme.md)). CARRY is not an automatic mesh, does not guarantee delivery, and is not an emergency network. Someone has to carry every packet.

CARRY was started for Kiroween 2026: the first commit is dated 16 November 2026. Submission texts are in [`docs/submission/`](docs/submission/).

## Documents

- [`TESTING.md`](TESTING.md): how to verify CARRY on one laptop with three browser profiles.
- [`KIRO.md`](KIRO.md): how Kiro was used (steering, two specs and their tickets, the hook, the custom agents, subagents, skills, the context7 power), what was not used, and the bugs found along the way.

## Features

- **Message kinds.** The author marks each message as an Announcement, a Change (a new time or place) or a Request. Members see the kind as an icon and a text label. The kind is inside the ciphertext, so someone photographing a QR does not learn it. Messages from older builds without a kind read as Announcements.
- **Signed relay entries.** Each relay adds a signed entry to the packet's relay section ([ADR-0001](docs/adr/0001-signed-relay-entries.md), PACKET_PROTOCOL.md §11A). Entries are hash-chained and must match the hop count, so altered or reordered entries, and entries removed from the middle, are rejected. A relay can still cut off trailing entries while lowering the hop count; this is the documented residual risk (SECURITY_MODEL.md §5A). The ciphertext and the author's signature stay unchanged, and relays never decrypt.
- **Relay journey.** A received message shows who carried it, in hop order: for example "Alex → Sam → you". Hops from members this device has no certificate for read "Unknown member on this device" and are never shown as verified. A packet from an older build without entries shows an unrecorded journey with only its hop count.
- **Journey back to the author.** An acknowledgement carries a copy of the message's journey, plus its own relay entries. The author sees both the way out and the way back, verified on their own device.
- **Ledger.** A tab in each community lists the author's own messages with kind, status, the number of members who acknowledged (for a Request: "N members confirmed"), and both journeys. Each entry opens a timeline of what this device observed.
- **Status per device.** Status words describe only what this device has seen: Created, Shown, Received, Shown for relay, Acknowledged, Expired. A packet that fails verification is rejected at scan time with an error message and code, and is never stored. CARRY never says "delivered". "Acknowledged" (the only teal status) appears only after an acknowledgement is scanned on the author's device.

## Quick start

Requires Node `^20.19` or `>=22.12` (`.nvmrc` pins 22).

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # unit, protocol, property and golden-vector tests (Vitest)
npm run check      # type-check, then npm test
npm run build      # type-check, then production build in dist/
npm run test:e2e   # browser tests against dist/ (build first)
npm run icons      # regenerate PNG icons from the logo geometry
npm run vectors        # write carry-v1.json; fails with a refusal if it exists (new protocol versions only)
npm run vectors:relay  # write carry-v1-relay.json; same refusal
```

The first browser-test run needs the browsers: `npx playwright install chromium webkit firefox`.

## Deploying to production

Live: **https://carry-beu.pages.dev** (Cloudflare Pages project `carry`, direct upload).

To deploy, run `npm run deploy`. It builds, runs the unit tests, and uploads `dist/` with Wrangler. The first time on a machine, run `npx wrangler login`. Pushing to GitHub does not deploy. Commit before deploying, so Settings shows a build number without `.dirty`.

`dist/` is a static site. It needs HTTPS, an SPA fallback to `index.html`, and the response headers in `dist/_headers`.

| Host | Steps |
|---|---|
| Netlify | Drag `dist/` onto Netlify Drop, or connect the repository with build command `npm run build` and publish directory `dist`. `_headers` and `_redirects` are applied automatically. |
| Cloudflare Pages | Build command `npm run build`, output directory `dist`. `_headers` is applied; the SPA fallback is built in. The build log flags the `/* /index.html 200` rule in `_redirects` as an infinite loop and ignores it ([Cloudflare community](https://community.cloudflare.com/t/how-to-configure-redirects-for-react-spa-without-infinite-loop-warning/872690)); that rule is only for Netlify. |
| Other static hosts | Serve `dist/` over HTTPS, rewrite unknown paths to `/index.html`, and copy the headers from `dist/_headers`. Without header support (e.g. GitHub Pages) the CSP still applies from a `<meta>` tag, but clickjacking protection (`frame-ancestors`) and the other headers are lost. |

What `_headers` sets, from `vite.config.ts`:
- A CSP with no inline scripts, inline styles, `eval` or remote origins, plus `frame-ancestors 'none'`.
- `Permissions-Policy`: camera allowed for CARRY only; microphone and geolocation off.
- `nosniff`, `no-referrer`, COOP and CORP `same-origin`, and `X-Frame-Options: DENY`.
- `immutable` caching for hashed files in `/assets/`; `no-cache` for `/sw.js`.

HSTS is left to the host. `*.netlify.app` and `*.pages.dev` addresses are covered because browsers preload HSTS for the whole `.app` and `.dev` domains. Netlify also sends HSTS for custom domains ([Netlify forum](https://answers.netlify.com/t/define-strict-transport-security-header-cause-duplicate-headers/28179)). On Cloudflare, turn it on for a custom domain in the dashboard.

After each deploy:
1. Open the site and check that Settings shows build `0.1.0+<commit>`. Netlify, Cloudflare Pages and GitHub Actions provide the commit; local builds append `.dirty` when there are uncommitted changes.
2. Reload once, then check that Settings → Offline readiness passes every check.
3. Phones running an older version show "A new version of CARRY is cached. Reload to update". Tapping it reloads every open CARRY tab. Nothing updates while a user is in the middle of a handoff unless they tap.

### iPhone and iPad

Safari deletes a site's stored data after 7 days of Safari use without visiting it. A Home Screen web app keeps its own data, separate from Safari, and is not subject to that rule ([WebKit](https://webkit.org/blog/9521/intelligent-tracking-prevention-2-3/); content was rephrased for compliance with licensing restrictions). CARRY's keys and communities live in that storage. iOS users should therefore add CARRY to the Home Screen first and use it from there; the Home screen shows a notice in Safari on iOS until they do. Data created in a Safari tab does not carry over to the Home Screen app.

## Running on phones during development

Web Crypto, the camera and service workers only work in a secure context (HTTPS or `localhost`). Opening the dev server at a plain `http://192.168.x.x` address shows a red warning banner, and encryption is unavailable there.

| Option | Encryption + camera | Offline mode |
|---|---|---|
| A deployed HTTPS site (above) | Yes | Yes |
| Android over USB: `npm run build && npm run preview`, then `adb reverse tcp:4173 tcp:4173` and open `http://localhost:4173` on the phone | Yes | Yes |
| `npm run dev:https` or `npm run preview:https` (self-signed certificate on the LAN; accept the browser warning) | Yes | No: browsers refuse to install a service worker from an untrusted certificate |

For the live demo (DEMO_PLAN.md §3), open the deployed app once while online on every phone and wait for the **Offline-ready** badge before turning on Airplane Mode.

## Where the demo steps live

| Demo step | In the app |
|---|---|
| Create a community | Home → New community |
| Invite, join, approve | Admin: Community → Invite. Joiner: Scan → Request to join. Admin: Scan the join request → compare fingerprints → Approve. Joiner: Scan approval. |
| Send a message | Community → Write → choose Announcement, Change or Request → Create packet. Frames cycle automatically; Pause and the arrows step through them. The screen stays on while QR frames are shown, where the browser allows it. |
| Relay | Receiver opens the message → Relay this packet. The **Relay** tab lists every packet this phone can still pass on. The message page shows its **Relay journey**. |
| Acknowledge | Recipient → Acknowledge, then carry the ACK back through relays. The sender's message shows **Acknowledged** only after the ACK is scanned there, with the journeys out and back. |
| Ledger | Community → **Ledger** tab: the author's own messages, acknowledgement counts and journeys; open one for its timeline. |
| Integrity checks | Scan the same packet twice (duplicate). Settings → Integrity tests has labelled corrupted-frame and expired-packet fixtures. |
| Interrupted scan | Scan lists unfinished transfers (e.g. "2 of 3 frames") until they are completed, discarded, or 24 hours old. The camera turns off when CARRY goes to the background; frames already scanned are kept. |
| Rehearsal numbers | Settings → Rehearsal measurements (frames per message, seconds per transfer, ACKs returned, duplicates, rejections) |

Scanner fallbacks: upload a QR image, or paste frame text (each QR display has a "Frame text (diagnostics)" section with the same content).

## Tests

Step-by-step manual checks for judges are in [`TESTING.md`](TESTING.md).

- `npm test`: 106 Vitest tests in 7 files.
  - `src/app/theme.test.ts` (4): the theme preference helper (night default, unknown values, storage failures).
  - `src/domain/domain.test.ts` (24): encoding, frames, schemas and relay rules.
  - `src/application/protocol.test.ts` (30): a three-device protocol run on IndexedDB (fake-indexeddb) with real Web Crypto keys. It covers join, message kinds, relay with signed relay entries, the relay journey, ACK and the journey back, the Ledger, duplicates, corrupted and conflicting frames, tampered packets, expiry, single-use invitations and approvals meant for another device.
  - Property-based tests with fast-check (8 properties). `src/domain/frames.property.test.ts` (2): any order of frames, and duplicate frames anywhere, reassemble the identical payload. `src/application/protocol.property.test.ts` (6): any single-character change to a frame or a signed packet is rejected without showing the text; expired or hop-limited packets are never imported or relayed; repeated imports yield one message; altered, reordered or middle-removed relay entries, and any single-character change inside a relay entry, are rejected.
  - Golden vectors (PACKET_PROTOCOL.md §14), `src/application/vectors.test.ts` (27): `src/test/vectors/carry-v1.json` holds an invitation, join request, approval, message (as frames and relayed), ACK and member message, plus 19 invalid inputs with their expected error codes. Each receiving device is rebuilt from the file and must accept or reject the frozen bytes exactly. A deliberately changed AAD separator made the four packet vectors fail, so they pin the wire format. Never edit or regenerate this file for protocol v1.
  - Relay entry golden vectors, `src/application/vectors-relay.test.ts` (13): `src/test/vectors/carry-v1-relay.json` holds a message with a kind relayed once and twice, and an ACK with the copied journey relayed once and twice, plus 6 invalid cases (entry count, hop order, broken chain, altered signatures, forged copied journey). It is frozen in the same way.
- `npm run test:e2e`: 5 Playwright tests against the production build and its response headers, in Chromium (Pixel 7 profile), WebKit (iPhone 14 profile) and Firefox. Each phone is a separate browser context. Any request outside the app origin, console or page error, or CSP violation fails the test.
  - `e2e/carry.spec.ts` runs DEMO_PLAN.md scenes 1–5 with three phones: a Change relayed A → B → C, the relay journey with an unknown member, the acknowledgement carried back with both journeys verified on A, the Ledger and its timeline, the integrity fixtures, and an offline reload. Frames move through the paste fallback. A second test checks that the night theme is the default and that a Light choice survives a reload.
  - `e2e/camera.spec.ts`:
    - A join and a four-frame message go through the real camera code path (getUserMedia → video → ZXing). A fake 1280×720 camera shows the displayed QR images tilted, blurred and drifting.
    - Screenshot upload of the displayed QR.
    - Denied camera permission.
  - Playwright's WebKit build for Windows has no `canvas.captureStream`, so the fake-camera test is skipped there.
- CI (`.github/workflows/ci.yml`) runs the runtime dependency audit, build, unit tests and browser tests on every push and pull request.
- A one-off axe-core audit of 22 screens and states (WCAG 2.2 A/AA rules) found no violations in the original light design after the contrast fixes. The night theme was not audited with axe, because the tool could not be installed. Instead, a one-off script computed WCAG contrast for 24 text and control pairs in both themes and found no failures. Neither check is part of the suite.

Not covered by the automated tests: physical phone cameras, real screens (focus, glare, moiré), Safari on a real iPhone, and the live HTTPS deployment (check it by hand after each deploy, as described above).

## QR scanning notes

ZXing, the bundled scanner, fails to read about 25–30% of perfectly sharp, axis-aligned QR renderings with the default mask pattern. Other decoders read the same images; the failures depend on the mask. Four measures handle this:

- Each frame is decoded once while it is rendered. If ZXing cannot read it back, the frame is re-rendered with another mask. In a test of 80 frames of 360 characters, the default mask read back 56 times; with the fallback mask, 80.
- Uploaded images are retried with small rotations and scalings: 354 of 450 test images decoded on the first attempt, 449 with retries.
- The camera is requested at 1280×720. A 360-character frame is QR version 16 (81 modules), and at 640×480 the QR is too small for reliable reads.
- After each read, the scanner pauses 150 ms instead of ZXing's default 500 ms. The longer pause could fall into step with the display cycle and skip the same frame on every pass. The fake-camera test then passed 16 of 16 runs.

If phones struggle during rehearsal, lower Settings → QR frame size. Smaller frames are easier to read, but a message needs more of them.

## Code map

```text
src/domain/          Pure rules: Base64URL, canonical JSON + AAD strings, Zod schemas,
                     C1 frame parsing/reassembly, expiry/relay rules, error codes
src/application/     Use cases: identity, communities, membership (invite → join request →
                     approval → accept), packets (compose, import, relay, ACK), relay entries
                     and journeys, Ledger, QR transfer, scan dispatcher, retention cleanup
src/infrastructure/  Web Crypto adapter, Dexie schema, QR encode (qrcode) / scan (ZXing), PWA
src/features/        React screens; src/components/ shared UI
src/**/*.test.ts     Vitest suites; src/test/vectors/ holds the golden vectors
scripts/             Icon generator and the two golden-vector generators
e2e/                 Playwright specs, helpers and the fake camera
.kiro/steering/      Project rules for Kiro: product copy, stack and layers, protocol/security
.kiro/specs/         The community coordination and Kiroween night specs, tickets and task indexes
.kiro/hooks/         Save hook that runs npm run check (see KIRO.md)
.kiro/agents/        Protocol Engineer and Security Reviewer custom agents (see KIRO.md)
GLOSSARY.md          Domain vocabulary
docs/adr/            Architecture decisions
.github/workflows/   CI
```

## Implementation choices the docs left open

- The packet signature hashes `canonicalCertificateBody || adminSignature`, with the signature taken as the UTF-8 bytes of its Base64URL string.
- Canonical JSON means sorted keys and no whitespace. It is used for certificate bodies, encrypted bodies and envelopes.
- ECDSA signatures use Web Crypto's raw 64-byte (r‖s) format. Base64URL decoding rejects non-canonical encodings.
- Locally stored group keys are wrapped under the device vault key with AAD `CARRY|1|VAULT|<communityId>|<keyEpoch>`.
- QR chunks are kept only while a transfer is partial. Handled transfers are deleted because invitation and join-request chunks contain the invite secret. Corrupt or conflicting transfers keep only metadata, marked `INVALID`. Duplicates are detected by community ID + packet ID.
- The stored status `RELAYED` (shown as "Shown for relay") means this phone displayed the relay QR. Whether the next person scanned it cannot be observed. In the same way, "Shown" means the author's phone displayed its own packet.
- Limits: messages up to 280 characters, 24 h expiry, `maxHops` 6, invitations single-use for 15 min, join requests valid for 1 h, frame size adjustable in Settings (360 → 180 characters).
- Retention beyond DATABASE_SCHEMA.md §5: local audit events (used for rehearsal measurements) are deleted after 90 days.
- The production CSP allows no `eval`, so Zod runs with `jitless: true`.
- The QR libraries load on first use, so screens without QR codes start with about 153 kB of gzipped JavaScript instead of 277 kB. All files are still cached for offline use.
- A screen that fails to render shows a recovery card with the error code instead of a blank page.
- Local fields added beyond DATABASE_SCHEMA.md:
  - `joinRequests.receivedAt` and `approvalPayload`. The stored approval lets the admin show it again. The key inside it can only be unwrapped with ephemeral keys that are deleted after use.
  - `pendingJoinRequests.communityName`, `adminSigningPublicJwk`, `adminFingerprint` and `requestPayload`. The request payload is deleted on acceptance or expiry.
  - `packets.senderId` and `originalPacketId`.
  - `acknowledgements.acknowledgedByName`.
- Colours are role tokens (canvas, surface, text, accent, primary, signal, danger, acknowledged) stored as CSS variables in `src/app/styles/index.css`, with night values on `:root` and Light values under `[data-theme="light"]`. The older Tailwind names (`paper`, `ink`, `forest`, `sage`, `amber`, `alert`) are aliases for those roles. The focus ring is pumpkin `#F1B45B` in night and `#1A7060` in Light. The theme choice is stored in `localStorage` as `carry.theme`.

## Limitations

These follow SECURITY_MODEL.md §6. The protocol has not been independently audited. There is no key rotation or member removal yet (planned for P1; until then, create a new community). There is no backup or export, so clearing browser data deletes communities and keys. Delivery is never guaranteed, and CARRY should not be the only channel for life-critical emergencies.

Dependencies: runtime packages have no known advisories (`npm audit --omit=dev`; CI fails on moderate or higher). `workbox-build`, which vite-plugin-pwa uses at build time, pulls in versions of `glob` and `minimatch` with moderate advisories. They run only during `npm run build` and are not in the app bundle. npm's suggested fix downgrades `workbox-build` below what vite-plugin-pwa 2 requires.

Third-party licenses of everything in the bundle are written to `dist/licenses.txt` and linked from Settings.

## License

CARRY is released under the [MIT License](LICENSE). Copyright (c) 2026 Rakha Abimanyu (FlamionZ).
