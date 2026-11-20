# How Kiro was used to build CARRY

This document describes what Kiro contributed to CARRY, which files show it, and where the process was not spec-driven. Every file and commit named here is in this repository; `git log --oneline` shows the full history.

## Two phases

**Before the spec (16–18 November 2026, not spec-driven).** The first version of CARRY and its production hardening were built in conversation with Kiro, working from the documents in `docs/` (architecture, packet protocol, database schema, security model, brand guidelines, demo plan). There was no Kiro spec, no ticket list and no hook. This phase produced three commits and a deploy setup:

- `968af49` CARRY: offline-first QR community messenger PWA
- `0682be9` Production readiness: headers, resilience, golden vectors, a11y, CI
- `4491477`, `0915053` Cloudflare Pages deploy and the live URL

**The community coordination spec (20 November 2026, spec-driven).** Spec-driven work started with `.kiro/specs/community-coordination/`. Everything from commit `d3518d3` onward was planned in that spec and its tickets.

## Steering

`.kiro/steering/` holds three rule files that Kiro loads into its context:

| File | Loaded | What it enforces |
|---|---|---|
| `product.md` | always | Product vocabulary, banned claims (automatic mesh, guaranteed or instant delivery, emergency network, anonymity, "unhackable"), "Acknowledged" only after the ACK is scanned on the sender's device, state shown with a text label and never with colour alone, camera explanation and fallbacks. |
| `tech.md` | always | Stack, commands, the layer rules (`src/domain` has no React, DOM, IndexedDB or Web Crypto), the CSP limits (no `eval`, no inline styles), Dexie transaction and migration rules, where security headers live. |
| `protocol.md` | when a file matching `src/**/*.ts` is in context | Allowed Web Crypto primitives, the scan verification order, what a relay may change, what must never be stored or logged, and that both golden vector files are frozen. |

The protocol rules changed during the spec, and the history shows it. Ticket 06 (`d237adf`) changed "a relay only changes `relay.hopCount`" to include signed relay entries and added the `relay entries` step to the verification order. Ticket 09 (`9dd1513`) added the second frozen vector file.

## Matt Pocock's skills workflow

The spec was produced with Matt Pocock's engineering skills (`mattpocock/skills`), configured for this repository:

- `AGENTS.md` and `docs/agents/` (commit `d3518d3`) set up the skills: the issue tracker is local markdown in `.kiro/specs/<feature>/` so one trail serves both the skills and Kiro's spec format (`docs/agents/issue-tracker.md`), the five default triage labels (`docs/agents/triage-labels.md`), and a single-context domain layout (`docs/agents/domain.md`).
- `GLOSSARY.md` (commit `86ba725`) fixes the domain vocabulary: community, member, invitation, join request, approval, packet, frame, relay, relay entry, relay journey, unknown member, unrecorded journey, Ledger, and the status words. Each term lists the words to avoid, such as "delivered", "mesh" or "anonymous relay".
- `docs/adr/0001-signed-relay-entries.md` (same commit) records the main design decision: each relay signs an entry into the packet's mutable relay section. It lists the rejected options (device-local history only, an unsigned relay list) and why.
- `requirements.md` and `design.md` (commit `29c1a68`), then ten tickets (commit `6bedc3b`).

## This spec

`.kiro/specs/community-coordination/` contains:

- `requirements.md`: the problem (organizers at a crowded event with overloaded networks), the solution, and 45 user stories.
- `design.md`: implementation decisions for the protocol, application layer, UI and repository, the testing decisions, and what is out of scope.
- `tasks.md`: the ticket index in blocking order.
- `issues/01-…md` to `issues/10-…md`: one file per ticket, each with a `Status:` line, a `Blocked by:` line and acceptance criteria.

| Ticket | Blocked by | Commit |
|---|---|---|
| 01 Repo housekeeping and Kiro artefacts | none | `c3aaf81` |
| 02 Protocol documents | none | `e5f49a8` |
| 03 Property-based tests for frames and packets | none | `c0ef346` |
| 04 Message kinds | 02 | `974b0ca` |
| 05 Status per device | none | `f45cea7` |
| 06 Signed relay entries and the relay journey | 02, 03 | `d237adf` |
| 07 Acknowledgement journey back to the author | 06 | `e21c50b` |
| 08 Ledger tab | 04, 05, 07 | `c5d85b6` |
| 09 Golden vectors for relay entries | 04, 07 | `9dd1513` |
| 10 KIRO.md, judge testing instructions, README and redeploy | 01, 08, 09 | this commit |

### How it was executed

A coordinating Kiro session ran the tickets with parallel implementer agents. Each agent worked in its own git worktree on a branch `ticket/NN`, branched from the integration branch `feat/community-coordination`. Tickets ran in waves set by the `Blocked by:` lines:

1. 01, 02, 03 and 05 in parallel, merged as `a41030a`, `191f104`, `0899fee`, `91fca02`.
2. 04 and 06, merged as `dd97ae4`, `4c87ff8`, followed by the fix in bug (e) below.
3. 07, merged as `e635081`.
4. 08 and 09, merged as `80b3f75`, `f6a2087`.
5. 10, this ticket.

Each agent finished by running `npm run check`, setting the ticket's `Status:` to `done`, ticking `tasks.md`, committing as `NN: <title>`, and merging the integration tip into its own branch so the coordinator could merge it cleanly. Protocol changes followed the order set in the steering and the spec: ticket 02 updated `docs/PACKET_PROTOCOL.md` (§5 message kind, §10 acknowledgement journey, §11A relay entries) before tickets 04, 06 and 07 changed code.

## The hook

`.kiro/hooks/protocol-check-on-save.json` (commit `4dc2446`) runs `npm run check` (TypeScript build check, then the Vitest suite including the protocol and golden-vector tests) whenever a file in `src/domain/` or `src/application/` is saved. The matcher is the regular expression `src[\\/](domain|application)[\\/].*\.ts$` and the timeout is 180 seconds. A change that breaks the wire format therefore fails as soon as the file is saved.

## The custom agents

`.kiro/agents/` holds two agents, added in ticket 01. Each file has YAML front matter (name, description, tools, resources) and a system prompt. Steering is not loaded automatically for custom agents, so both list `.kiro/steering/**/*.md`, `AGENTS.md` and `GLOSSARY.md` as resources.

- **Protocol Engineer** (`protocol-engineer.md`, tools: read, write, shell). Designs and implements wire-format changes. Its sources are `docs/PACKET_PROTOCOL.md`, `docs/SECURITY_MODEL.md`, the ADRs, `src/test/vectors/carry-v1.json`, `src/domain/canonical.ts` and `src/domain/errors.ts`. It must update the protocol document first, then the tests, then the code, prefer additive changes that older builds can still read, and never edit the v1 vectors.
- **Security Reviewer** (`security-reviewer.md`, tools: read, shell). Reviews diffs against `docs/SECURITY_MODEL.md` and the steering rules and does not edit files. Its checklist covers the verification order, nonces, relays never decrypting, secrets never persisted or logged, non-extractable keys, the CSP, frozen vectors, and banned copy. It reports findings by severity and ends with approve or request changes.

## Property-based tests and golden vectors

Ticket 03 added [fast-check](https://github.com/dubzzz/fast-check) property tests. A failing property reports a shrunk counterexample.

- `src/domain/frames.property.test.ts` (2 properties, 2,000 runs each): any order of a packet's frames reassembles the identical payload, and duplicate frames inserted anywhere never change the result.
- `src/application/protocol.property.test.ts` (5 properties), on several simulated phones with fake-indexeddb and real Web Crypto keys:
  - any single-character change in any frame is rejected and the text is never shown (150 runs);
  - any single-character change in the signed packet is rejected and the text is never shown (300 runs);
  - a packet at or past expiry, or at its hop limit, is never imported or relayed (60 runs);
  - importing the same packet any number of times, through any number of transfers, yields one message (30 runs);
  - any alteration, reordering or middle removal of relay entries is rejected and the text is never shown (200 runs, added in ticket 06).

Golden vectors pin the wire format byte for byte. A conformance test rebuilds each receiving device from the file and must accept or reject the frozen bytes exactly.

- `src/test/vectors/carry-v1.json` (from the pre-spec hardening, checked by `src/application/vectors.test.ts`): an invitation, join request, approval, message as frames and relayed, ACK and member message, plus 19 invalid inputs. No ticket in this spec modified it.
- `src/test/vectors/carry-v1-relay.json` (ticket 09, checked by `src/application/vectors-relay.test.ts`): a message with a kind, relayed once and twice with signed entries, and an acknowledgement with the copied journey, relayed once and twice. It has six invalid cases: entry count not matching `hopCount`, entries out of hop order, a broken hash chain, an altered signature of a known member, a forged copied journey in an acknowledgement, and an altered relay signature on the acknowledgement itself. Its generator, `scripts/generate-vectors-relay.ts`, refuses to overwrite the file.

## Real bugs found during development

Bugs (a) to (c) were found and fixed before the spec existed. Bugs (d) and (e) were found while executing the spec.

**(a) ZXing could not read some sharp QR renderings, depending on the mask pattern.** ZXing, the bundled decoder, failed to read about 25–30% of perfectly sharp, axis-aligned QR images with the default mask pattern. Other decoders read the same images, so the images were valid and the failures followed the mask. Fixed in `968af49`: each frame is decoded once while it is rendered, and if ZXing cannot read it back, the frame is re-rendered with another mask. In a test of 80 frames of 360 characters, the default mask read back 56 times and the fallback 80 times. Uploaded images are retried with small rotations and scalings: 354 of 450 test images decoded on the first attempt, 449 with retries. The numbers are in the README under "QR scanning notes".

**(b) The scanner's pause after a read skipped the same frame on every pass.** ZXing waits 500 ms after each successful read by default. In a multi-frame transfer, every read is followed by a new frame, and that pause could fall into step with the display's frame cycle, so one frame was missed on every pass and the transfer never completed. Fixed in `0682be9` by lowering the pause to 150 ms (`delayBetweenScanSuccess: 150` in `src/infrastructure/qr/scanner.ts`, with a comment explaining why). After the fix, the fake-camera browser test (`e2e/camera.spec.ts`) passed 16 of 16 runs.

**(c) A false "new version" banner on first install in Firefox.** On a first visit in Firefox, CARRY showed "A new version of CARRY is cached" although nothing was out of date: a service worker installed by an earlier load of the same page was reported as a waiting update. Fixed in `0682be9`: `onNeedRefresh` in `src/infrastructure/pwa/register.ts` shows the banner only when a service worker already controls the page, because only such a page can be out of date. The same commit makes "Reload to update" reload every open CARRY tab; the commit message records that this was checked on three browser engines.

**(d) A ciphertext with non-zero padding bits produced a generic error.** The property "any single-character change in the signed packet is rejected" (ticket 03) found a case the hand-written tests had missed. When the ciphertext's length leaves padding bits in its last Base64URL character, changing that character to one that sets those bits passed the schema check (which checks only the alphabet), and the strict decoder then threw a plain exception instead of a CARRY rejection. Fixed in `c0ef346`: `src/application/use-cases/packets.ts` decodes the nonce and ciphertext through `envelopeBytes`, which turns a decoding failure into `PACKET_SCHEMA_INVALID`. The shrunk counterexample became the regression test "rejects a ciphertext whose last character has non-zero padding bits" in `src/application/protocol.test.ts`.

**(e) Shared test phones were left with clocks a day ahead.** The property suites share three simulated phones created once per file. The expiry property suite moves two phones' clocks up to a day forward and did not put them back. This was harmless until tickets 04 and 06 were merged together: ticket 06's relay entry property suite, in the same file, then ran on those phones after the expiry suite, with the wrong clocks, and the merged suite failed. Fixed in `ff9c4c5` ("Restore phone clocks after the expiry property suite"): the suite records every phone's clock in `beforeAll` and restores it in `afterAll`. Later implementers were told to restore clocks or use fresh phones in new suites.

## What Kiro did not do

- The pre-spec version was not planned in a spec, and its tests were written alongside the code rather than from acceptance criteria.
- The camera path has only been tested with a fake camera in the browser tests, not with phone cameras. `TESTING.md` explains what a judge can and cannot check on one laptop.
- The protocol has not been independently audited.
