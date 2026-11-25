# Video script: CARRY (target 2:45, hard limit 3:00)

Judges are not required to watch past 3:00. Upload publicly to YouTube and paste the link into Devpost.

**Setup before recording** (DEMO_PLAN.md §3): three phones (A Alex, B Sam, C Chris) open https://carry-beu.pages.dev while online. Wait for the **Offline-ready** badge on each phone. Set brightness high. Clear old data (Settings → Clear local data) so the community is created on camera. Film the phones from above, and record the screen of one phone for close-ups if you can.

To save time, record the second join (C) off camera and say so in the voice-over. Speed up long scan sequences 2× and label them "2× speed".

| Time | Picture | Voice-over |
|---|---|---|
| 0:00–0:10 | Black screen, then a lantern glow fading in on phone A's welcome screen | "What if your entire community could stay connected, even when the internet disappears?" |
| 0:10–0:25 | The welcome screen's FidoNet sentence, held long enough to read | "In the 1980s, FidoNet passed messages from one computer to the next, store and forward. CARRY brings that idea back for phones. Messages travel hand to hand as QR codes, encrypted and signed, with no server." |
| 0:25–0:35 | All three phones: swipe down and turn on Airplane Mode; Wi-Fi and data off | "All three phones are in Airplane Mode. The app was opened once online, so it now runs from its cache." |
| 0:35–1:00 | A: New community "Campus Volunteers" → Invite → QR. B scans it, shows a join request. A scans it; close-up of the matching fingerprints; Approve. B scans the approval. | "Alex creates a private community. Sam scans the invitation and shows a join request. Alex checks that the key fingerprints match and approves. The group key only travels inside that encrypted approval. Chris joined the same way off camera." |
| 1:00–1:20 | A: Write → Change → "Meet at the north entrance. Bring the first-aid kit." → Create packet. QR frames cycle. B scans (2×). | "Alex writes a Change. CARRY encrypts it, signs it and splits it into QR frames. Sam scans them." |
| 1:20–1:40 | B: the message, then Relay this packet. C scans (2×). C: the message and its Relay journey, where Sam's hop reads "Unknown member on this device" | "Sam can read the message but can't change it, only carry it on. Relaying adds Sam's signed entry to its journey. Chris's phone has never seen Sam's membership certificate, so CARRY says so instead of claiming the hop is verified." |
| 1:40–2:05 | C: Acknowledge → QR. B scans and relays. A scans. A's message turns **Acknowledged** (teal) | "Chris acknowledges. The acknowledgement is carried back through Sam to Alex. Only now, on Alex's own phone, does the message read Acknowledged. CARRY never says delivered, because it can't know that." |
| 2:05–2:20 | C: scan B's relay QR again → "Already on this device". Settings → Integrity tests → Corrupted frame → rejected with its code | "Scanning a packet twice doesn't duplicate it. A changed character is rejected, and its text is never shown." |
| 2:20–2:35 | Laptop: `.kiro/specs/` tree, a steering file, the hook JSON, the green test run | "We built CARRY with Kiro: two specs and 13 tickets, steering files that hold the protocol rules, and a hook that runs all 106 unit tests on every protocol save. Parallel agents implemented the tickets, and a two-axis code review checked them." |
| 2:35–2:45 | A: the **Ledger** tab, the Change with "1 member acknowledged" and both journeys, out and back | "Alex's Ledger shows who carried the message out and who carried the answer back. CARRY: carry the message, keep the community connected." |
| 2:45–2:50 | End card: CARRY logo, carry-beu.pages.dev, github.com/FlamionZ/Carry, "Kiroween 2026 · Resurrection" | (silence) |

**Check before uploading:**
- The video is under 3:00.
- Nothing in it claims a mesh, guaranteed or instant delivery, emergency use or anonymity.
- Any sped-up part is labelled.
- Every on-screen label you mention matches the phone. If the app text differs from this script, the app is right.
