# 08: Ledger tab

**What to build:** Each community has a Ledger tab where an organizer sees all of their own messages: kind, status per device, and how many members acknowledged. Opening one shows its timeline (Created, Shown, each acknowledgement) with the journeys out and back. It stays accurate offline and after reloads.

**Blocked by:** 04, 05, 07

**Status:** done

- [x] The community page has four tabs: Messages, Relay, Ledger, Members.
- [x] The Ledger lists this device's own messages, newest first, each with kind, status word and acknowledgement count.
- [x] Opening an item shows its timeline (Created, Shown, each acknowledgement with who and when it was scanned) and the outbound and return journeys.
- [x] An expired message with no acknowledgements reads plainly as expired.
- [x] The Ledger is built from data already stored. There is no schema change, and it works offline.
- [x] A Ledger read is covered at the multi-device protocol seam.
- [x] The three-phone browser test opens the Ledger on A and sees the acknowledgement count and both journeys.
- [x] The accessibility rules hold: text labels, large targets, visible focus.
