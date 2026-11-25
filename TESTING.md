# Testing CARRY on one laptop

These steps let you check CARRY's protocol with one laptop and the live site, **https://carry-beu.pages.dev**. They take about 20 minutes.

There is no simulation mode. Every step below goes through the same code a phone uses: packets are encrypted, signed, split into QR frames, and verified on the receiving side. The only difference is how frames move between "phones": you copy the frame text or upload a screenshot instead of pointing a camera. The camera path itself needs real phones (see the end of this document).

## Set up three "phones"

Each browser profile has its own storage, keys and communities, so each one acts as a separate phone.

| Phone | Browser profile | Display name |
|---|---|---|
| A, the administrator | Chrome or Edge, normal window | Alex |
| B, a relaying member | Chrome or Edge, private window (Ctrl+Shift+N) | Sam |
| C, a receiving member | Firefox, normal window (or a second Chrome profile) | Chris |

Notes:
- Use a normal window for phone A. The offline check at the end needs a service worker, and Firefox private windows do not run service workers.
- A private window forgets everything when it is closed. Keep phone B's window open until you finish.
- If you have visited CARRY before in one of these profiles, you may see "A new version of CARRY is cached." Tap **Reload to update**.

On each phone, open https://carry-beu.pages.dev, type the display name, and tap **Continue**.

**Expected:** the screen shows "Your communities" with **New community** and **Scan QR** buttons. The bottom bar has Home, Scan and Settings.

## How to move a QR between phones

Whenever a step says "carry the QR from X to Y", use one of these two methods.

**Frame text (fastest).**
1. On X, below the QR, open **Frame text (diagnostics)**. It lists one text box per frame, each starting with `C1:`. Clicking a box selects its text.
2. On Y, tap **Scan** in the bottom bar, open **Fallbacks: image upload or frame text**, and tap **Paste frame text**.
3. Copy each frame from X and paste it into the box labelled "Frame text (one or more C1:… frames)", one frame per line. Tap **Import frame text**.

You can also import one frame at a time. Y then shows, for example, "1 of 3 QR frames scanned." and waits for the rest.

**Screenshot upload.**
1. On X, tap **Pause**, then use the arrow buttons to show frame 1. The text under the QR reads "Frame 1 of N".
2. Take a screenshot of the QR (Windows: Win+Shift+S; macOS: Cmd+Shift+4) and save it as an image file.
3. On Y, tap **Scan**, open **Fallbacks: image upload or frame text**, tap **Scan a QR image**, and choose the file.
4. Repeat for every frame.

If an image cannot be read, Y shows "No QR code was found in that image." Crop the screenshot closer to the QR and try again.

## 1. Create a community (phone A)

On A, tap **New community**, type "Campus Volunteers" as the community name, and tap **Create community**.

**Expected:** the community page opens with the heading "Campus Volunteers" and "You are the administrator · key epoch 1". It has **Write**, **Scan** and **Invite** buttons and the tabs Messages, Relay, Ledger and Members.

## 2. Invite and join, comparing fingerprints (phones A and B)

1. On A, tap **Invite**, then **Show invitation QR**.
   **Expected:** "Invitation to Campus Volunteers", a line "This invite expires in … Single use.", and an "Admin key fingerprint".
2. Carry the QR from A to B.
   **Expected on B:** "Invitation scanned", then "Invitation to join" above the community name "Campus Volunteers", and an "Admin key fingerprint". It is the same as the fingerprint on A.
3. On B, tap **Request to join**.
   **Expected:** "Join Campus Volunteers", "Step 2 of 3: show this to the administrator.", a QR labelled "Join request", and "Your key fingerprint".
4. On A, tap **Next: scan their join request**, and carry the QR from B to A.
   **Expected on A:** "Join request: Sam" with a "Member key fingerprint". It is the same as "Your key fingerprint" on B.
5. On A, tap **Approve**.
   **Expected:** "Show this approval only to Sam." and a QR labelled "Join approval".
6. On B, tap **Scan approval**, and carry the QR from A to B.
   **Expected on B:** the "Campus Volunteers" community page with "Member · key epoch 1".

Repeat steps 1 to 6 with phone C and the name Chris. Each invitation works once, so A shows a new one for C.

## 3. Write a Change (phone A)

On A, open Campus Volunteers and tap **Write**.

**Expected:** "Write a message", with three kinds: Announcement (selected), Change and Request.

Tap **Change**, type "Meet at the north entrance. Bring the first-aid kit." and tap **Create packet**.

**Expected:** the QR appears with "Ready to pass this message along." In A's Messages tab the message shows the label "Change" and the status "Shown".

Optional: write an Announcement and a Request the same way. Each row in the Messages tab shows its kind as an icon and a text label.

## 4. Relay it through B to C

1. Carry the message QR from A to B.
   **Expected on B:** the message text, the label "Change", the status "Received", and a "Relay journey" section reading "Alex → you".
2. On B, tap **Relay this packet**.
   **Expected:** a QR labelled "Relay copy: the same encrypted packet, with your signed relay entry for the next hop." B's status changes to "Shown for relay".
3. Carry the relay QR from B to C.
   **Expected on C:** the same text, "Change", "Received", "Relay hops 1 of 6", and a "Relay journey" reading "Alex → unknown member → you". The middle hop is marked "Unknown member on this device".

C has never seen Sam's membership certificate, so it cannot check Sam's signature. It shows the hop as unknown instead of claiming it is verified. That is the intended result.

## 5. Scan the same packet again (duplicate, phone C)

Carry B's relay QR to C a second time.

**Expected on C:** "Already on this device" and "This packet was imported before, so no new entry was created." There is still one copy of the message in C's Messages tab.

## 6. Acknowledge it (phone C)

On C, tap **Open it** (or open the message from the Messages tab), then tap **Acknowledge**.

**Expected:** a page headed "Acknowledgement" with a QR labelled "Ready to carry this acknowledgement back."

## 7. Carry the acknowledgement back through B to A

1. Before you start, look at A's Messages tab. **Expected:** the message still reads "Shown", because no acknowledgement has reached A yet.
2. Carry the acknowledgement QR from C to B.
   **Expected on B:** an "Acknowledgement" page reading "Chris acknowledged Alex's message" followed by the quoted text.
3. On B, tap **Relay this packet**, and carry the QR from B to A.
   **Expected on A:** the message page opens with the status "Acknowledged". The "Acknowledgements" section reads "1 member acknowledged" and lists Chris, with two journeys:
   - "Message journey to Chris": "Alex → Sam → Chris", with Sam marked "Verified".
   - "Acknowledgement journey back from Chris": "Chris → Sam → Alex", with Sam marked "Verified".

A approved both Sam and Chris, so it knows their certificates and can verify every hop.

## 8. Open the Ledger (phone A)

On A, open Campus Volunteers and tap the **Ledger** tab.

**Expected:** the Change is listed with "Change", "Acknowledged", "1 member acknowledged", "Out: You → Sam → Chris" and "Back: Chris → Sam → you".

Tap the entry. **Expected:** a "Timeline" section with "Created on this device", "Shown: first displayed as QR frames" and "Acknowledged by Chris: their acknowledgement was scanned on this device", followed by both journeys from step 7.

Optional: for a Request, the count reads "confirmed" instead, for example "1 member confirmed", both in the Ledger and on the message page.

## 9. Integrity tests: corrupted and expired packets (phones A and B)

1. On A, open **Settings**. Under **Integrity tests**, tap **Corrupted frame**.
   **Expected:** a notice "TEST FIXTURE · corrupted frame (one character changed)" and a QR.
2. Carry that QR from A to B.
   **Expected on B:** "The scanned frames do not match their checksum. The transfer was discarded." No message is shown.
3. On A, tap **Hide test QR**, then **Expired packet**.
   **Expected:** "TEST FIXTURE · expired packet (validly signed, expiry in the past)".
4. Carry that QR from A to B.
   **Expected on B:** "This packet has expired and can no longer be imported or relayed."
5. On B, open **Settings** and scroll to **Rehearsal measurements**.
   **Expected:** under "Rejected transfers", "TRANSFER_DIGEST_MISMATCH: 1" and "PACKET_EXPIRED: 1". On C, the same section shows "Duplicates detected" as 1 from step 5.

## 10. Offline check (phone A)

1. On A, open **Settings** and reload the page once. Under **Offline readiness**, check the list.
   **Expected:** "Yes" for "Service workers supported", "Page controlled by the CARRY service worker", "App precache present", "App shell cached" and "Files this page uses are cached". "Persistent storage granted" may read "No"; it is not needed for this check. The header badge reads "Offline-ready".
2. Open DevTools (F12), go to the **Network** tab, and set the throttling menu to **Offline**.
3. Reload the page.
   **Expected:** Settings loads again. The header shows "No connection" next to "Offline-ready". Home still lists Campus Volunteers, and its Ledger still shows the acknowledged Change.

Set the throttling back to **No throttling** when you are done.

## 11. Theme (any phone)

1. Look at any screen. **Expected:** the dark "Kiroween night" theme. QR codes are dark on white.
2. Open **Settings**. Under **Theme**, tap **Light**. **Expected:** the app switches to the light theme at once.
3. Reload the page. **Expected:** Light is still selected. Tap **Kiroween night** to switch back.

## What this does not test

- **The camera.** Scanning with **Open camera** needs a phone or webcam pointed at another screen. To test it, open the live site on two or three phones, wait for the "Offline-ready" badge on each, and follow the same steps using **Open camera** instead of the fallbacks.
- **Real phone conditions:** glare, screen brightness, focus and distance, and Safari on an iPhone.

## Automated tests (local)

Requires Node `^20.19` or `>=22.12`.

```bash
npm install
npm test                                        # unit, protocol, property and golden-vector tests (Vitest)
npx playwright install chromium webkit firefox  # first time only
npm run build                                   # the browser tests run against dist/
npm run test:e2e                                # Playwright in Chromium, WebKit and Firefox
```

`npm test` runs 106 tests in 7 files. `npm run test:e2e` runs 5 browser tests on each of the three engines. `e2e/carry.spec.ts` follows the same steps as this document with three isolated browser contexts and the paste fallback, and also checks the theme choice. `e2e/camera.spec.ts` covers the camera code path with a fake camera, screenshot upload, and denied camera permission. Playwright's WebKit build for Windows cannot run the fake camera, so that one test is skipped there.
