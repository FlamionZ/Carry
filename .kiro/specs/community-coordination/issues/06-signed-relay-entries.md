# 06: Signed relay entries and the relay journey on received packets

**What to build:** When a member relays a packet, their device signs a relay entry into it automatically. Every receiving device verifies the entries against the members it knows and shows the relay journey: author, each relay, and this device. A relay it cannot verify is marked as an unknown member. A packet without entries shows an unrecorded journey. Altered, reordered or partly removed entries are rejected.

**Blocked by:** 02, 03

**Status:** done

- [x] Showing a received packet for relay appends exactly one signed relay entry and increments `hopCount`. There is no way to relay without signing.
- [x] Ciphertext, header and author signature are unchanged by a relay.
- [x] On import, a packet is rejected with `RELAY_ENTRY_INVALID` when:
  - the entry count differs from `hopCount` while entries are present;
  - hop numbers are out of sequence;
  - the hash chain is broken;
  - a known member's signature fails.
- [x] An entry from a member this device has no certificate for is kept and shown as an unknown member, not counted as verified.
- [x] A packet with no entries and `hopCount` above 0 is accepted and shows an unrecorded journey.
- [x] Relay times read "according to <name>'s phone". Times before creation or in the future are flagged, not rejected. The journey is ordered by hop number.
- [x] The packet page shows a Relay Journey section as readable text with verified / unknown member markers, respecting reduced motion.
- [x] Property-based test: any alteration, reordering or middle removal of relay entries is rejected.
- [x] The three-phone browser test shows, on C, Alex → unknown member → you for a message relayed by Sam.
- [x] The v1 golden vectors still pass unchanged.
