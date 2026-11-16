# CARRY

Carry the message. Keep the community connected.

CARRY is an offline-first community messenger. Messages are encrypted and signed on one phone, shown as a sequence of QR frames, and scanned by the next person. There is no server, no account and no network request at runtime. The specification lives in [`docs/`](docs/).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # domain + protocol tests (Vitest)
npm run build      # type-check, then production build with service worker
npm run test:e2e   # browser tests against dist/ (build first)
npm run icons      # regenerate PNG icons from the logo geometry
```

The first browser-test run needs the browsers: `npx playwright install chromium webkit firefox`.

## Running on phones

Web Crypto, the camera and service workers only work in a secure context (HTTPS or `localhost`). Opening the dev server at a plain `http://192.168.x.x` address shows a red warning banner, and encryption is unavailable there.

| Option | Encryption + camera | Offline mode |
|---|---|---|
| Deploy `dist/` to a static HTTPS host. `public/_redirects` gives Netlify and Cloudflare Pages the SPA fallback. | Yes | Yes |
| Android over USB: `npm run build && npm run preview`, then `adb reverse tcp:4173 tcp:4173` and open `http://localhost:4173` on the phone | Yes | Yes |
| `npm run dev:https` or `npm run preview:https` (self-signed certificate on the LAN; accept the browser warning) | Yes | No: browsers refuse to install a service worker from an untrusted certificate |

For the live demo (DEMO_PLAN.md §3), open the deployed app once while online on every phone, reopen it, and wait for the **Offline-ready** badge before turning on Airplane Mode. Settings → Offline readiness lists each check, including whether every file the page uses is in the cache.

## Where the demo steps live

| Demo step | In the app |
|---|---|
| Create a community | Home → New community |
| Invite, join, approve | Admin: Community → Invite. Joiner: Scan → Request to join. Admin: Scan the join request → compare fingerprints → Approve. Joiner: Scan approval. |
| Send a message | Community → Write → Create packet. Frames cycle automatically; Pause and the arrows step through them. |
| Relay | Receiver opens the message → Relay this packet. The **Relay** tab lists every packet this phone can still pass on. |
| Acknowledge | Recipient → Acknowledge, then carry the ACK back through relays. The sender's message shows **Acknowledged** only after the ACK is scanned there. |
| Integrity checks | Scan the same packet twice (duplicate). Settings → Integrity tests has labelled corrupted-frame and expired-packet fixtures. |
| Interrupted scan | Scan lists unfinished transfers (e.g. "2 of 3 frames") until they are completed, discarded, or 24 hours old. |
| Rehearsal numbers | Settings → Rehearsal measurements (frames per message, seconds per transfer, ACKs returned, duplicates, rejections) |

Scanner fallbacks: upload a QR image, or paste frame text (each QR display has a "Frame text (diagnostics)" section with the same content).

## Tests

- `npm test`: 35 Vitest tests. They cover encoding, frames, schemas and relay rules, plus a three-device protocol run on IndexedDB (fake-indexeddb) with real Web Crypto keys. That run covers join, message, relay, ACK, duplicates, corrupted frames, conflicting frames, tampered packets, expiry, single-use invitations and approvals meant for another device.
- `npm run test:e2e`: Playwright against the production build in Chromium (Pixel 7 profile), WebKit (iPhone 14 profile) and Firefox. Each phone is a separate browser context. The tests fail on any request outside the app origin, any console or page error, and any CSP violation.
  - `e2e/carry.spec.ts` runs DEMO_PLAN.md scenes 1–5 with three phones, ending with an offline reload. Frames move through the paste fallback.
  - `e2e/camera.spec.ts`:
    - A join and a four-frame message go through the real camera code path (getUserMedia → video → ZXing). A fake 1280×720 camera shows the displayed QR images tilted, blurred and drifting.
    - Screenshot upload of the displayed QR.
    - Denied camera permission.
  - Playwright's WebKit build for Windows has no `canvas.captureStream`, so the fake-camera test is skipped there.
  - No physical phone camera has been tested. Focus, glare and moiré on real screens are not emulated.

## QR scanning notes

ZXing, the bundled scanner, fails to read about 25–30% of perfectly sharp, axis-aligned QR renderings with the default mask pattern. Other decoders read the same images; the failures depend on the mask. Three measures handle this:

- Each frame is decoded once while it is rendered. If ZXing cannot read it back, the frame is re-rendered with another mask. In a test of 80 frames of 360 characters, the default mask read back 56 times; with the fallback mask, 80.
- Uploaded images are retried with small rotations and scalings: 354 of 450 test images decoded on the first attempt, 449 with retries.
- The camera is requested at 1280×720. A 360-character frame is QR version 16 (81 modules). In a 640×480 view with the QR about 300 px wide, a frame was occasionally never decoded. At 720p with the QR at about 540 px, 10 of 10 camera runs passed.

If phones struggle during rehearsal, lower Settings → QR frame size. Smaller frames are easier to read, but a message needs more of them.

## Code map

```text
src/domain/          Pure rules: Base64URL, canonical JSON + AAD strings, Zod schemas,
                     C1 frame parsing/reassembly, expiry/relay rules, error codes
src/application/     Use cases: identity, communities, membership (invite → join request →
                     approval → accept), packets (compose, import, relay, ACK), QR transfer,
                     scan dispatcher, retention cleanup
src/infrastructure/  Web Crypto adapter, Dexie schema, QR encode (qrcode) / scan (ZXing), PWA
src/features/        React screens; src/components/ shared UI
src/**/*.test.ts     Vitest suites
e2e/                 Playwright specs, helpers and the fake camera
.kiro/steering/      Project rules for Kiro: product copy, stack and layers, protocol/security
```

## Implementation choices the docs left open

- The packet signature hashes `canonicalCertificateBody || adminSignature`, with the signature taken as the UTF-8 bytes of its Base64URL string.
- Canonical JSON means sorted keys and no whitespace. It is used for certificate bodies, encrypted bodies and envelopes.
- ECDSA signatures use Web Crypto's raw 64-byte (r‖s) format. Base64URL decoding rejects non-canonical encodings.
- Locally stored group keys are wrapped under the device vault key with AAD `CARRY|1|VAULT|<communityId>|<keyEpoch>`.
- QR chunks are kept only while a transfer is partial. Handled transfers are deleted because invitation and join-request chunks contain the invite secret. Corrupt or conflicting transfers keep only metadata, marked `INVALID`. Duplicates are detected by community ID + packet ID.
- `RELAYED` means this phone displayed the relay QR. Whether the next person scanned it cannot be observed.
- Limits: messages up to 280 characters, 24 h expiry, `maxHops` 6, invitations single-use for 15 min, join requests valid for 1 h, frame size adjustable in Settings (360 → 180 characters).
- The production CSP allows no `eval`, so Zod runs with `jitless: true`.
- Local fields added beyond DATABASE_SCHEMA.md:
  - `joinRequests.receivedAt` and `approvalPayload`. The stored approval lets the admin show it again. The key inside it can only be unwrapped with ephemeral keys that are deleted after use.
  - `pendingJoinRequests.communityName`, `adminSigningPublicJwk`, `adminFingerprint` and `requestPayload`. The request payload is deleted on acceptance or expiry.
  - `packets.senderId` and `originalPacketId`.
  - `acknowledgements.acknowledgedByName`.

## Limitations

These follow SECURITY_MODEL.md §6. The protocol has not been independently audited. There is no key rotation or member removal yet (planned for P1; until then, create a new community). There is no backup or export, so clearing browser data deletes communities and keys. Delivery is never guaranteed, and CARRY should not be the only channel for life-critical emergencies.

Dependencies: runtime packages have no known advisories (`npm audit --omit=dev`). `workbox-build`, which vite-plugin-pwa uses at build time, pulls in versions of `glob`, `minimatch` and `deepmerge` with low/moderate advisories. They run only during `npm run build` and are not in the app bundle. npm's suggested fix downgrades `workbox-build` below what vite-plugin-pwa 2 requires.

## Note on `docs/PRD.md`

`docs/PRD.md` describes a different product: a coal-blending optimization dashboard for Adaro Site Kelanis. It was not implemented. CARRY is built from the other six documents in `docs/`.
