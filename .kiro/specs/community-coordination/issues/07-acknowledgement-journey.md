# 07: The acknowledgement carries the journey back to the author

**What to build:** When a member acknowledges a message, the acknowledgement carries that message's relay journey back. The author then sees, verified on their own device, both how the message travelled out and how the acknowledgement travelled back.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Creating an acknowledgement copies the message's stored relay entries into the encrypted acknowledgement body.
- [ ] The author re-verifies the copied entries against the original message's packet ID and author signature. A forged or mismatched copy is not shown as verified.
- [ ] The acknowledgement gets its own relay entries for the way back, under the same rules as ticket 06.
- [ ] On the author's packet page, each acknowledgement shows the outbound journey and the return journey.
- [ ] Multi-device protocol tests cover A → B → C and C → B → A, with all members verified on A.
- [ ] The three-phone browser test shows both journeys verified on A after the acknowledgement is scanned.
