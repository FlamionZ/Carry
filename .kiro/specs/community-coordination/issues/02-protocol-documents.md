# 02: Protocol documents for message kinds, relay entries and the acknowledgement journey

**What to build:** The protocol and security documents describe the new behaviour completely before any code changes, so they remain the source of truth: message kinds, signed relay entries, and the relay journey an acknowledgement carries back. A contributor can implement them from the documents alone.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `PACKET_PROTOCOL.md` defines the optional message kind in the encrypted body (Announcement, Change, Request; missing means Announcement).
- [x] It defines the relay entry: fields, the canonical signed string, the hash chain from the author signature, and size per hop.
- [x] It defines the verification rules:
  - entry count equals `hopCount`, or entries are absent;
  - hop numbers run 1…n;
  - the chain links;
  - signatures of known members verify;
  - unknown members are kept but marked;
  - impossible relay times are flagged, not rejected.
- [x] It defines the acknowledgement journey: the copied message entries in the encrypted acknowledgement body, re-verified by the author.
- [x] The error-code list gains `RELAY_ENTRY_INVALID`.
- [x] The documents state that the fields are additive within v1 and that the v1 golden vectors stay unchanged.
- [x] `SECURITY_MODEL.md` adds the residual risks: trailing-entry truncation with a lowered `hopCount`, relay member IDs visible in cleartext, and unverifiable unknown members.
