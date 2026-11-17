---
inclusion: always
---

# CARRY tech and structure

Stack: Vite 8, React 18, TypeScript (strict), React Router 7 in declarative mode (import from `react-router`), Tailwind 3, Dexie 4 (IndexedDB), Zod 4, `qrcode` + `@zxing/browser`, Web Crypto, vite-plugin-pwa 2 (Workbox generateSW), Vitest 5, Playwright.

## Commands

- `npm run build` (tsc -b, then vite build), `npm test` (Vitest, single run), `npm run test:e2e` (Playwright against `dist/` in Chromium, WebKit and Firefox; build first).
- `npm run vectors` writes the golden vectors and refuses to overwrite them. Only for a new protocol version.
- Do not start dev servers or watch mode from the agent; ask the user to run `npm run dev`.
- Security and cache headers live in `vite.config.ts` (`SECURITY_HEADERS`, `CACHE_RULES`). They are emitted as `dist/_headers` and applied by `vite preview`, so the browser tests run with them. Change them there, nowhere else.

## Layers

Dependencies point inward.

- `src/domain`: pure rules (encoding, canonical strings, Zod schemas, QR frames, relay rules, error codes). No React, DOM, IndexedDB or Web Crypto.
- `src/application`: use cases that take a `Device` (`{ db, now }`). Use the injected clock for anything time-based.
- `src/infrastructure`: Web Crypto, Dexie schema, QR encoding and scanning, PWA registration and readiness.
- `src/features`, `src/components`: React UI. Call use cases; do not call Web Crypto or write to Dexie directly. Reading with `useLiveQuery` is fine.

## Rules

- No runtime network requests, CDNs, analytics or remote fonts.
- The production CSP has `script-src 'self'` (no eval) and `style-src 'self'` (no inline style attributes; setting `element.style` from JS is allowed). Zod runs with `jitless` for this reason.
- Dexie transactions: finish all Web Crypto and other non-Dexie async work before `db.transaction(...)`. Awaiting anything else inside a transaction commits it early.
- Schema changes need a new `db.version(n)` whose upgrade keeps CryptoKey objects. Never clear key tables in a migration.
- Protocol behaviour is tested in `src/application/protocol.test.ts` (fake-indexeddb with real Web Crypto); UI flows in `e2e/`. Add tests only when asked.
