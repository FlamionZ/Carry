# 04: Message kinds

**What to build:** An organizer marks each message as an Announcement, a Change or a Request. Every member sees the kind as an icon and a text label wherever the message appears. The kind is private to members, and messages from older builds read as Announcements.

**Blocked by:** 02

**Status:** done

- [x] The compose screen offers Announcement, Change and Request as large buttons with icon and label. Announcement is selected by default.
- [x] The kind travels only inside the encrypted message body, never in the cleartext header.
- [x] The message list and the packet page show the kind as icon plus text label, never colour alone.
- [x] A message without a kind, as from an older build or the v1 golden vectors, reads as Announcement.
- [x] Multi-device protocol tests cover each kind arriving intact through a relay, plus the fallback.
- [x] The three-phone browser test writes a Change and checks its label on the receiving phone.
- [x] The v1 golden vectors still pass unchanged.
