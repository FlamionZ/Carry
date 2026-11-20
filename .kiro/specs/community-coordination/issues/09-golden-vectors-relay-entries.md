# 09: Golden vectors for relay entries

**What to build:** Frozen test vectors prove that future builds keep reading what this build writes for relayed packets, message kinds and acknowledgement journeys, alongside the untouched v1 vectors.

**Blocked by:** 04, 07

**Status:** done

- [x] A second vector file is generated once, and the generator refuses to overwrite it. It contains:
  - a message with a kind, relayed twice with signed entries;
  - an acknowledgement carrying the copied journey and its own entries.
- [x] It contains invalid cases for each relay entry rule (count mismatch, hop sequence, broken chain, bad known signature) with their expected error codes.
- [x] A conformance test rebuilds each receiving device from the file and accepts or rejects the frozen bytes exactly.
- [x] The v1 vector file is not modified.
- [x] Steering states that the new file is frozen like v1.
