# 03: Property-based tests for frames and packets

**What to build:** The protocol's existing guarantees are checked against generated inputs, not only hand-written cases. Any order or repetition of frames still reassembles correctly. Any tampering is rejected without showing content. Expired or hop-limited packets are never accepted. Repeated imports never duplicate a message.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] fast-check is a dev dependency.
- [x] Pure frame rules, with thousands of runs:
  - any permutation of a packet's frames reassembles the identical payload;
  - inserting duplicate frames anywhere never changes the result.
- [x] Multi-device protocol seam: changing any single character of any frame or packet is always rejected, and the message text is never returned.
- [x] Multi-device protocol seam: a packet at or past expiry, or at its hop limit, is never imported or relayed.
- [x] Multi-device protocol seam: importing the same packet any number of times, through any number of transfers, yields exactly one message.
- [x] A failing property reports a shrunk counterexample.
- [x] The full unit suite stays under 30 seconds.
