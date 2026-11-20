Status: ready-for-agent

# Community coordination: design

Requirements and user stories are in `requirements.md`. Vocabulary follows `GLOSSARY.md`; ADR-0001 records the relay entry decision.

## Implementation Decisions

### Protocol (documented first)

- `PACKET_PROTOCOL.md` and `SECURITY_MODEL.md` are updated before any code. They cover the relay entry format, the verification rules, the acknowledgement journey and the residual truncation risk.
- The new fields are additive within protocol v1. Older builds ignore them, and the v1 golden vectors keep verifying unchanged.

**Message kind**

- Optional field in the encrypted message body, with values Announcement, Change or Request.
- A missing kind means Announcement.
- It is never placed in the cleartext header, so relays cannot see it.

**Relay entry**

- Optional list in the packet's mutable relay section, next to `hopCount`. The author adds no entry. Each relay appends exactly one when it shows the relay QR.
- An entry holds the relay's member ID, hop number, the relay's local time and an ECDSA P-256 signature. The relay's certificate is not included, which keeps an entry at roughly 140 characters.
- The signature covers a canonical string with the protocol label, packet ID, hop number, relay member ID, relay time and the hash of the previous entry. The first entry chains from the packet's author signature. The string is built only by the canonical serialization module.

**Verification on import**

1. If entries are present, their count must equal `hopCount`, and hop numbers must run 1…n in order. Otherwise the packet is rejected.
2. The hash chain must link. Otherwise the packet is rejected.
3. Each entry whose member this device knows (a membership record with a signing key) must have a valid signature. Otherwise the packet is rejected.
4. An entry whose member is unknown is kept, but marked as an unknown member.
5. A relay time before the packet's creation, or more than a small tolerance in the future, is flagged, not rejected.

A packet with no entries and `hopCount` above 0 is accepted with an unrecorded journey.

Relays that cannot sign stay compatible: an older build relays without adding an entry. The next device then sees a count mismatch, so the rule is narrowed: entries may be fewer than `hopCount` only when entries are absent entirely. This keeps the check strict for packets produced by this build.

**Acknowledgement journey**

- The encrypted acknowledgement body gets an optional copy of the message's relay entries, exactly as the acknowledging device stored them.
- The author re-verifies that copy against the original message's packet ID and author signature, so a forged copy is caught.
- The acknowledgement packet has its own relay entries for the way back.

**Error codes**

- Protocol error codes gain one code for relay entry failures (`RELAY_ENTRY_INVALID`).
- Count mismatch, a broken chain and a bad signature all use this code.

### Application layer

- Showing a received packet for relay signs and appends the entry, then increments `hopCount`. This stays the single relay operation, so no caller can relay without signing.
- Reading a packet returns, in addition to today's view:
  - the message kind;
  - the verified relay journey: author, then each hop with member ID, display name when known, verified / unknown member, reported time and a clock flag;
  - for acknowledgements, the copied journey of the original message.
- Creating an acknowledgement copies the message's stored relay entries into the acknowledgement body.
- A Ledger read for one community returns this device's own messages, newest first. Each item has kind, status and acknowledgement count, plus, per acknowledgement, who acknowledged, when it was scanned, the outbound journey and the return journey. It is built from the existing packet and acknowledgement tables; no schema change is needed.
- Statuses map to the glossary words in one place. Stored values stay as they are, with no migration:
  - READY = Created; READY after the first show = Shown;
  - IMPORTED = Received;
  - RELAYED = Shown for relay.

  "Shown" needs one new local fact: the time the author first displayed the packet. It is stored on the packet record as an optional field, with no new index, so the Dexie schema version does not change.

### UI

- **Compose screen.** Three large kind buttons (Announcement default), each with icon and label.
- **Message list and packet page.** Kind icon and text label on every message.
- **Packet page.** A Relay Journey section: a vertical sequence of members with verified / unknown member markers and the time "according to <name>'s phone". It is readable as plain text, not colour-only, and respects reduced motion.
- **Community page.** A fourth tab, Ledger (Messages | Relay | Ledger | Members). Tapping an item opens the packet page with its timeline and journeys.
- **Copy.** Uses the glossary words. Never "delivered", "sent" or "mesh".

### Kiro and repository

- Tickets for this spec live in `tasks.md` and `issues/` here.
- Agent hook: when a file in the domain or application layer is saved, run the typecheck and the unit tests.
- Two custom agents:
  - **Protocol Engineer**: designs protocol changes against `PACKET_PROTOCOL.md`, the golden vectors and the ADRs.
  - **Security Reviewer**: reviews diffs against `SECURITY_MODEL.md` and the protocol steering rules.
- `KIRO.md` explains how Kiro was used, including three real bugs from development and how each was found and fixed:
  - the ZXing mask-pattern decode failures;
  - the 500 ms post-read pause skipping the same frame every cycle;
  - the false update banner on first install in Firefox.

  It describes the earlier work honestly as not spec-driven, and this spec as the point where specs started.
- MIT `LICENSE`. `docs/PRD.md` is removed, since it describes an unrelated product.
- Testing instructions for judges: two or three browser profiles on one laptop, moving frames with the diagnostics text, paste or screenshot upload. No simulation mode.

## Testing Decisions

- A good test drives CARRY through its public seam and checks what a member would observe: accepted or rejected with which code, what the packet view or Ledger shows. It never asserts on internal helpers or storage layout.

**Primary seam: multi-device protocol.** This is the existing simulated-device harness from the protocol and golden-vector tests (fake-indexeddb, real Web Crypto, frames moved by showing on one device and scanning on another). It covers:

- message kinds, including the default and old-build fallback;
- relay entry creation, verification, and every rejection rule;
- the unknown member and unrecorded journey cases;
- clock flags;
- the acknowledgement journey back to the author;
- the Ledger read and status mapping.

**Property-based tests (fast-check)**, at the lowest seam that exercises each property:

| Seam | Properties | Runs |
|---|---|---|
| Pure frame rules | 1. Any frame order reassembles the same packet. 2. Duplicate frames never change the result. | Thousands |
| Multi-device protocol | 3. Any single-character change in a frame or packet is rejected and its content never shown. 4. Expired or hop-limited packets are never accepted or relayed. 5. Importing the same packet any number of times yields exactly one message. 6. Altered, reordered or middle-removed relay entries are always rejected. | Fewer, because real crypto is involved |

The total unit suite stays under 30 seconds.

**Golden vectors.** The v1 vector file is never edited. A second vector file adds:

- a message relayed twice with signed entries;
- an acknowledgement carrying the copied journey;
- invalid cases for each relay entry rule.

It is generated once by the existing generator approach and verified by the same style of test.

**UI seam: Playwright.** The existing three-phone scenario is extended to:

- choose a kind;
- relay A → B → C and return the acknowledgement C → B → A;
- open the Ledger on A and see both journeys verified;
- see an unknown member on C.

It must stay free of console errors, CSP violations and external requests on all three engines.

## Out of Scope

- Any transport other than QR: Bluetooth, NFC, Wi-Fi, automatic mesh.
- Files, photos, voice, reply threads, reactions.
- Member removal, key rotation, backup or export.
- A signed member roster to verify unknown members.
- A simulation mode for judges.
- Changing the v1 golden vectors or the core packet header.
- Physical-phone reliability testing, the demo video and making the repository public. These are done by the project owner.

## Further Notes

- Submission deadline: December 4, 2026, 2:00 PM PST.
- Scope is deliberately narrow. If time runs short, cut in this order: polish of the visual journey, then the Request-specific copy. Never cut the protocol rules or their tests.
- Residual risk to document: a malicious relay can still truncate trailing relay entries while lowering `hopCount`. Duplicate detection by packet ID stays the primary loop guard.
