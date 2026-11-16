# CARRY — Kiroween Demo Plan

## 1. Demo objective

Prove that three devices can create a private community, enroll members, exchange a message through manual QR relay, and return an acknowledgement while every device is in Airplane Mode.

## 2. Equipment

- Three smartphones with camera access and a modern browser (Android Chrome is the primary target).
- CARRY PWA deployed on an HTTPS static origin or served locally for development.
- All three devices preloaded with the same CARRY app build.
- One printed test card with the expected message and packet IDs (optional).

No router, internet access, backend, paid API, or QR scanner subscription is needed during packet exchange.

## 3. Pre-demo preparation

1. Build the production PWA.
2. Deploy to a secure HTTPS origin.
3. Open CARRY on all phones while online.
4. Install the PWA where supported.
5. Wait for service worker activation and the app-shell precache check.
6. Open the app once more and confirm the offline-ready badge.
7. Confirm camera permission works while online.
8. Create no live group yet; use the demo flow in front of judges.
9. Charge devices and set screen brightness high enough for QR scanning.
10. Record the exact build/protocol version.

## 4. Live demonstration script (3 devices)

### Scene 1 — Connectivity disappears

- Explain that the apps have been preloaded.
- Enable Airplane Mode on all devices.
- Confirm Wi-Fi and mobile data are disabled.
- Reopen CARRY on each device to prove the PWA shell is cached.

### Scene 2 — Create a private community

- Device A creates “Campus Volunteers”.
- A generates an invitation QR.
- Device B scans the invitation and creates a join request QR.
- A scans the request, checks the display name and key fingerprint, then approves.
- A shows the encrypted approval QR; B scans it.
- Repeat for Device C.

### Scene 3 — Carry a message

- A writes: “Meet at the north entrance. Bring the first-aid kit.”
- A generates QR frames.
- B scans all frames and sees the imported message.
- B selects Relay and displays the packet frames.
- C scans all frames and sees the same message.

### Scene 4 — Return acknowledgement

- C selects Acknowledge.
- C displays an ACK QR.
- B scans and relays it to A.
- A scans the ACK and changes the original message state to Acknowledged.

### Scene 5 — Show integrity controls

- Scan the same packet again; CARRY must mark it as duplicate.
- Show a deliberately modified/corrupt test frame; reassembly or signature validation must reject it.
- Show an expired packet fixture; CARRY must not allow relay.

## 5. Judge-facing explanation

“CARRY does not create an automatic wireless mesh. It uses a human-carried store-and-forward model. One device stores a private encrypted message, displays it as QR frames, and another device physically scans and carries it onward. No server or internet is used during the exchange.”

## 6. Fallbacks

- **Camera fails:** use the image-upload scanner fallback with a screenshot of a generated QR frame. Clearly identify this as a fallback, not the primary live flow.
- **One device unavailable:** demonstrate A → B → A with ACK, then show C in a separate relay test.
- **PWA cache fails:** switch to a rehearsed local build only if it is served from a secure origin accessible to the device; do not pretend a first-load PWA works without prior cache.
- **Partial QR scan:** use larger QR display, increase brightness, reduce chunk size, or scan frames again. Duplicate frames must be idempotent.
- **Join approval fails:** use the pre-created demo community only as a clearly labeled fallback; do not hide a broken membership feature.

## 7. Pass/fail checklist

- [ ] Airplane Mode is on for all devices during message exchange.
- [ ] App opens from cache on all devices.
- [ ] No runtime external network request is required for core flow.
- [ ] Invitation does not contain group key.
- [ ] Admin approval is required before key delivery.
- [ ] Message packet is encrypted and signed.
- [ ] Incomplete transfer is not displayed as a message.
- [ ] Corrupt packet is rejected.
- [ ] Duplicate packet does not create duplicate inbox entry.
- [ ] Relay preserves packet ID and ciphertext.
- [ ] ACK must return to sender before status changes to Acknowledged.
- [ ] No unsupported guarantee of delivery or emergency service is made.

## 8. Measurement

Record five consecutive rehearsals:
- Join flow success.
- Mean frames per message.
- QR scans required per successful transfer.
- Message relay completion.
- ACK return completion.
- Duplicate rejection result.
- Offline app-shell readiness.

Use results to tune chunk size and UI camera guidance.
