# 05: Status per device

**What to build:** Status words describe only what this device has observed, using the glossary. An author's message reads Created until its frames are first shown, then Shown, and Acknowledged only once an acknowledgement is scanned there. A received packet reads Received, then Shown for relay. Nothing ever claims a message was delivered.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Status words read: a new outbound message shows Created; after its QR frames are first displayed it shows Shown; after an acknowledgement of it is scanned on this device it shows Acknowledged.
- [x] Received packets show Received, and Shown for relay after the relay QR is displayed. Expired and Rejected are unchanged.
- [x] The first-shown time is stored locally for the author's own packets without a Dexie schema version change or migration. Existing records without it read as Created until shown.
- [x] Mapping from stored values to displayed words happens in one place.
- [x] Teal/green appears only for Acknowledged. Every status keeps its text label.
- [x] Multi-device protocol tests assert the status sequence on author, relay and recipient devices.
- [x] The existing browser tests are updated to the new words and still pass.
