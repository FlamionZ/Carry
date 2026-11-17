# CARRY

Carry the message. Keep the community connected.

CARRY is an offline-first community messenger. Messages are encrypted and signed on one phone, shown as a sequence of QR frames, and scanned by the next person. There is no server, no account and no network request at runtime. The specification lives in [`docs/`](docs/).

## Quick start

Requires Node `^20.19` or `>=22.12` (`.nvmrc` pins 22).

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # unit, protocol and golden-vector tests (Vitest)
npm run build      # type-check, then production build in dist/
npm run test:e2e   # browser tests against dist/ (build first)
npm run icons      # regenerate PNG icons from the logo geometry
npm run vectors    # write golden vectors; refuses to overwrite them (new protocol versions only)
```

The first browser-test run needs the browsers: `npx playwright install chromium webkit firefox`.

## Deploying to production

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
| Send a message | Community → Write → Create packet. Frames cycle automatically; Pause and the arrows step through them. The screen stays on while QR frames are shown, where the browser allows it. |
| Relay | Receiver opens the message → Relay this packet. The **Relay** tab lists every packet this phone can still pass on. |
| Acknowledge | Recipient → Acknowledge, then carry the ACK back through relays. The sender's message shows **Acknowledged** only after the ACK is scanned there. |
| Integrity checks | Scan the same packet twice (duplicate). Settings → Integrity tests has labelled corrupted-frame and expired-packet fixtures. |
| Interrupted scan | Scan lists unfinished transfers (e.g. "2 of 3 frames") until they are completed, discarded, or 24 hours old. The camera turns off when CARRY goes to the background; frames already scanned are kept. |
| Rehearsal numbers | Settings → Rehearsal measurements (frames per message, seconds per transfer, ACKs returned, duplicates, rejections) |

Scanner fallbacks: upload a QR image, or paste frame text (each QR display has a "Frame text (diagnostics)" section with the same content).

## Tests

- `npm test`: 62 Vitest tests.
  - Encoding, frames, schemas and relay rules.
  - A three-device protocol run on IndexedDB (fake-indexeddb) with real Web Crypto keys. It covers join, message, relay, ACK, duplicates, corrupted and conflicting frames, tampered packets, expiry, single-use invitations and approvals meant for another device.
  - Golden vectors (PACKET_PROTOCOL.md §14): `src/test/vectors/carry-v1.json` holds an invitation, join request, approval, message (as frames and relayed), ACK and member message, plus 19 invalid inputs with their expected error codes. Each receiving device is rebuilt from the file and must accept or reject the frozen bytes exactly. A deliberately changed AAD separator made the four packet vectors fail, so they pin the wire format. Never edit or regenerate this file for protocol v1.
- `npm run test:e2e`: Playwright against the production build and its response headers, in Chromium (Pixel 7 profile), WebKit (iPhone 14 profile) and Firefox. Each phone is a separate browser context. Any request outside the app origin, console or page error, or CSP violation fails the test.
  - `e2e/carry.spec.ts` runs DEMO_PLAN.md scenes 1–5 with three phones, ending with an offline reload. Frames move through the paste fallback.
  - `e2e/camera.spec.ts`:
    - A join and a four-frame message go through the real camera code path (getUserMedia → video → ZXing). A fake 1280×720 camera shows the displayed QR images tilted, blurred and drifting.
    - Screenshot upload of the displayed QR.
    - Denied camera permission.
  - Playwright's WebKit build for Windows has no `canvas.captureStream`, so the fake-camera test is skipped there.
- CI (`.github/workflows/ci.yml`) runs the runtime dependency audit, build, unit tests and browser tests on every push and pull request. It has not run yet because the repository has no GitHub remote.
- A one-off axe-core audit of 22 screens and states (WCAG 2.2 A/AA rules) found no violations after the contrast fixes. It is not part of the suite.

Not tested: physical phone cameras, real screens (focus, glare, moiré), Safari on a real iPhone, and a real HTTPS deployment.

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
                     approval → accept), packets (compose, import, relay, ACK), QR transfer,
                     scan dispatcher, retention cleanup
src/infrastructure/  Web Crypto adapter, Dexie schema, QR encode (qrcode) / scan (ZXing), PWA
src/features/        React screens; src/components/ shared UI
src/**/*.test.ts     Vitest suites; src/test/vectors/ holds the golden vectors
scripts/             Icon generator and golden-vector generator
e2e/                 Playwright specs, helpers and the fake camera
.kiro/steering/      Project rules for Kiro: product copy, stack and layers, protocol/security
.github/workflows/   CI
```

## Implementation choices the docs left open

- The packet signature hashes `canonicalCertificateBody || adminSignature`, with the signature taken as the UTF-8 bytes of its Base64URL string.
- Canonical JSON means sorted keys and no whitespace. It is used for certificate bodies, encrypted bodies and envelopes.
- ECDSA signatures use Web Crypto's raw 64-byte (r‖s) format. Base64URL decoding rejects non-canonical encodings.
- Locally stored group keys are wrapped under the device vault key with AAD `CARRY|1|VAULT|<communityId>|<keyEpoch>`.
- QR chunks are kept only while a transfer is partial. Handled transfers are deleted because invitation and join-request chunks contain the invite secret. Corrupt or conflicting transfers keep only metadata, marked `INVALID`. Duplicates are detected by community ID + packet ID.
- `RELAYED` means this phone displayed the relay QR. Whether the next person scanned it cannot be observed.
- Limits: messages up to 280 characters, 24 h expiry, `maxHops` 6, invitations single-use for 15 min, join requests valid for 1 h, frame size adjustable in Settings (360 → 180 characters).
- Retention beyond DATABASE_SCHEMA.md §5: local audit events (used for rehearsal measurements) are deleted after 90 days.
- The production CSP allows no `eval`, so Zod runs with `jitless: true`.
- The QR libraries load on first use, so screens without QR codes start with about 144 kB of gzipped JavaScript instead of 262 kB. All files are still cached for offline use.
- A screen that fails to render shows a recovery card with the error code instead of a blank page.
- Local fields added beyond DATABASE_SCHEMA.md:
  - `joinRequests.receivedAt` and `approvalPayload`. The stored approval lets the admin show it again. The key inside it can only be unwrapped with ephemeral keys that are deleted after use.
  - `pendingJoinRequests.communityName`, `adminSigningPublicJwk`, `adminFingerprint` and `requestPayload`. The request payload is deleted on acceptance or expiry.
  - `packets.senderId` and `originalPacketId`.
  - `acknowledgements.acknowledgedByName`.
- Text colours `teal.dark`, `amber.dark`, `sage.dark` and `alert.dark` are darker shades of the brand tokens, chosen for WCAG AA contrast. The focus ring uses `#1A7060` on light backgrounds and paper on dark ones.

## Limitations

These follow SECURITY_MODEL.md §6. The protocol has not been independently audited. There is no key rotation or member removal yet (planned for P1; until then, create a new community). There is no backup or export, so clearing browser data deletes communities and keys. Delivery is never guaranteed, and CARRY should not be the only channel for life-critical emergencies.

Dependencies: runtime packages have no known advisories (`npm audit --omit=dev`; CI fails on moderate or higher). `workbox-build`, which vite-plugin-pwa uses at build time, pulls in versions of `glob` and `minimatch` with moderate advisories. They run only during `npm run build` and are not in the app bundle. npm's suggested fix downgrades `workbox-build` below what vite-plugin-pwa 2 requires.

Third-party licenses of everything in the bundle are written to `dist/licenses.txt` and linked from Settings. This project has no license file of its own yet.

## Note on `docs/PRD.md`

`docs/PRD.md` describes a different product: a coal-blending optimization dashboard for Adaro Site Kelanis. It was not implemented. CARRY is built from the other six documents in `docs/`.
