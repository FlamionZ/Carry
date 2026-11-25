# Blog post draft

Suggested venues: dev.to, Medium, Hashnode or a personal blog. Keep the first line: the Kiroween blog prize asks for posts made for the hackathon. Add the video link and two or three screenshots before publishing.

---

# Resurrecting FidoNet with QR codes: building CARRY with Kiro

*I wrote this post as part of the Kiroween 2026 hackathon, where I entered CARRY in the Resurrection category.*

At a crowded campus event, the network fails first. Thousands of phones fight over the same cell, and the group chat stops loading just when an organizer needs to say "the meeting point moved to the north gate".

Computers had this problem in the 1980s. FidoNet and UUCP moved mail between machines that were rarely online. Each machine stored messages and passed them to the next one, often overnight. That idea, store and forward, has almost disappeared from phones, because we assume they are always online. For Kiroween I tried to bring it back.

## What CARRY does

[CARRY](https://carry-beu.pages.dev) is a web app for private community messages that people carry between phones as QR codes. There is no server and no account, and the app makes no network request at runtime.

1. An organizer creates a community. Members join through an invitation QR, a join request QR and an encrypted approval, after the organizer compares key fingerprints.
2. A member writes a short message, up to 280 characters. CARRY encrypts it with AES-256-GCM, signs it with ECDSA P-256 and shows it as a cycle of QR frames.
3. The next person scans the frames and can relay them. A relay never decrypts the packet. It adds a signed, hash-chained entry that records who carried the packet.
4. The reader acknowledges, and the acknowledgement travels back the same way. The message reads **Acknowledged** only once that acknowledgement is scanned on the author's phone.

CARRY is honest about what it can't do. It is not an automatic mesh. Someone has to carry every packet, so delivery is never guaranteed, and the app never says "delivered".

## How Kiro helped

I started with a set of design documents: architecture, packet protocol, database schema, security model and brand. The first version came from vibe sessions with Kiro working from those documents. The more interesting part came after.

**Steering files as the project's memory.** `.kiro/steering/protocol.md` holds rules such as "scanned data is untrusted, verify in this order" and "relays never decrypt or re-encrypt". Every session and every delegated agent got those rules in its context. I didn't have to repeat them in each prompt.

**Specs and tickets.** The second phase began with a grilling interview, using Matt Pocock's skills inside Kiro. It produced a glossary (for example, "relay journey", "unknown member", and "never say *delivered*") and an architecture decision record. Then came a spec with 45 user stories and 10 tickets, each with a "Blocked by" line.

**Parallel agents.** Kiro ran the tickets in waves, with each implementer agent in its own git worktree. Afterwards, two review agents checked the result in parallel: one against the project's standards and one against the spec. They reported 22 findings, and all of them were fixed before deploying.

**A hook as a guardrail.** Saving any file in `src/domain/` or `src/application/` runs the type check and all 106 unit tests. Two frozen "golden vector" files pin the wire format byte for byte. A change that would break phones running an older build fails as soon as the file is saved.

**A power for documentation.** For the Kiroween night theme, I needed Tailwind colours that switch at runtime under a CSP that bans inline scripts and styles. The context7 power fetched the current Tailwind v3 documentation for CSS-variable colours, and the theme follows that pattern.

## Bugs worth telling

- **QR masks.** The bundled decoder failed to read about a quarter of perfectly sharp QR images, depending on the mask pattern. CARRY now decodes each frame while drawing it, and redraws it with another mask if that fails. In a test of 80 frames, read-back went from 56 to 80.
- **A pause that skipped a frame forever.** After a successful read, the scanner paused 500 ms. That pause fell into step with the frame cycle, so the same frame was missed on every pass. A 150 ms pause fixed it.
- **A property test found what I missed.** A fast-check property states that any single-character change to a signed packet is rejected. It found a change in Base64 padding bits that produced a generic error instead of a clean rejection. The shrunk counterexample is now a regression test.
- **Agents can be wrong about their own work.** Twice, a subagent reported a commit hash that didn't exist, and its work was lost with the worktree. Now I check the hash before cleaning up.

## Try it

Open https://carry-beu.pages.dev on two or three phones while online, and wait for "Offline-ready". Then turn on Airplane Mode and pass a message around. If you only have a laptop, `TESTING.md` in the [repository](https://github.com/FlamionZ/Carry) walks through the whole flow with three browser profiles.

The code is MIT-licensed. The protocol has not been independently audited, so please don't rely on CARRY as your only channel for anything life-critical.

#KiroweenHackathon26 #Kiro
