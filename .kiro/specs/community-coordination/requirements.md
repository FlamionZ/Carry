Status: ready-for-agent

# Community coordination: requirements

Spec for the Kiroween 2026 build of CARRY. Vocabulary follows `GLOSSARY.md`; the relay entry decision is ADR-0001. Implementation decisions are in `design.md`, tickets in `tasks.md`.

## Problem Statement

At a campus event with hundreds of people, mobile data and Wi-Fi slow to a crawl. Organizers still need to tell members that the meeting point moved, that a session starts later, or that two volunteers are needed at the north gate. Messaging apps that depend on a server stall exactly then.

CARRY already moves encrypted, signed messages between phones as QR frames, relays them, and confirms receipt with acknowledgements. But from a member's point of view it is still a plain offline messenger:

- Every message looks the same, so an urgent change of place reads like a general note.
- Once a message leaves the author's phone, the author cannot see how it travelled. They only learn that someone acknowledged it.
- Nobody can prove who carried a message. The relay count is a bare number any relay could reset.
- The author has no single place that shows which of their messages got through and which did not.

## Solution

CARRY becomes an offline coordination tool for a community:

- **Message kinds.** Authors choose a message kind (Announcement, Change or Request). Members see it at a glance, by icon and label, never by colour alone.
- **Signed relay entries.** Every relay adds a signed relay entry to the packet. Any device can check the relay journey against the members it knows, and says honestly when a relay is an unknown member or a journey is unrecorded.
- **Journey back to the author.** An acknowledgement carries the message's relay journey back to the author. The author sees both the path out (A → B → C) and the path back (C → B → A), verified on their own device.
- **Ledger.** A per-community Ledger lists the author's own messages, how far each is known to have travelled, and who acknowledged it.
- **Status per device.** Status words describe only what this device has observed: Created, Shown, Received, Shown for relay, Acknowledged, Expired, Rejected. CARRY never claims "delivered".

Judges and contributors can verify all of this:

- Property-based tests for the protocol.
- Golden vectors for the new packet field.
- Kiro specs, hooks and agents that drove the work.
- Testing instructions that run on one laptop with several browser profiles.

## User Stories

### Writing and reading messages

1. As an organizer, I want to mark a message as an Announcement, a Change or a Request, so that members know how to treat it before reading it in full.
2. As an organizer, I want Announcement selected by default, so that writing an everyday message takes no extra tap.
3. As an organizer, I want the three kinds shown as large buttons with icon and label, so that I can choose one-handed in a crowd.
4. As a member, I want each message in the list to show its kind as an icon and a text label, so that I can spot a Change without relying on colour.
5. As a member, I want the kind to stay private to members, so that someone photographing the QR learns nothing about what kind of message it is.
6. As a member, I want a message from an older CARRY build with no kind to appear as an Announcement, so that nothing breaks while people update.
7. As a member, I want a Request to be answered by acknowledging it, so that I don't need a separate reply flow.
8. As an organizer, I want the acknowledgement count of a Request to read as "who confirmed", so that I can tell how many people responded.

### Carrying with relay entries

9. As a member relaying a packet, I want my device to sign a relay entry automatically when it shows the relay QR, so that carrying needs no extra step.
10. As a member relaying a packet, I want the relay entry to name me only by member ID, so that the packet stays small enough for a few frames.
11. As a member, I want a packet whose relay entries were altered, reordered or partly removed to be rejected, so that nobody can rewrite who carried it.
12. As a member, I want a packet whose number of relay entries does not match its hop count to be rejected, so that the two can't drift apart.
13. As a member, I want a packet with no relay entries (from an older build) to be accepted with an unrecorded journey, so that mixed versions still work.
14. As a member, I want a relay entry signed by an unknown member to be shown as "unknown member on this device" and not counted as verified, so that the journey never claims more than this device can check.
15. As a member, I want relay entry times shown as "according to Sam's phone", so that I understand phone clocks may disagree.
16. As a member, I want a relay entry whose time looks impossible to be flagged rather than rejected, so that a wrong phone clock doesn't stop a message.
17. As a member, I want the journey ordered by hop number, not by time, so that clock differences can't scramble it.
18. As a member, I want relays to keep the packet's ciphertext and author signature unchanged, so that carrying never weakens the message's protection.
19. As a member, I want a packet that reached its hop limit or expired to be refused for relay as before, so that relay entries don't extend a packet's life.

### Seeing the journey

20. As a member who received a message, I want to see its relay journey (author, each relay, me), so that I know how it reached me.
21. As an organizer, I want an acknowledgement to bring back the journey of my message, so that I can see who carried it out.
22. As an organizer, I want to see the journey of the acknowledgement itself, so that I can see who carried the confirmation back.
23. As an organizer, I want journey entries I can verify to be marked verified and the others marked unknown, so that I can trust what I see.
24. As an organizer, I want the journey to show only relays that were actually recorded, so that CARRY never draws an invented network map.
25. As a member, I want the journey shown in text as well as visually, so that screen readers and small screens get the same information.

### Ledger

26. As an organizer, I want a Ledger tab in each community, so that I have one place to check on my messages.
27. As an organizer, I want the Ledger to list my own messages with their kind, status and number of acknowledgements, so that I can see at a glance what still needs carrying.
28. As an organizer, I want to open a message from the Ledger and see its timeline (Created, Shown, each acknowledgement), so that I know what happened and when on my device.
29. As an organizer, I want the timeline to include the journeys out and back, so that the whole trip is in one view.
30. As an organizer, I want an expired message without acknowledgements to read plainly as expired, so that I know to send a new one.
31. As an organizer, I want the Ledger to stay accurate offline and after reloads, so that I can rely on it during the event.

### Status words

32. As an author, I want my new message to read "Created" until I show it, so that I know it hasn't left my phone.
33. As an author, I want it to read "Shown" after I display its frames, so that I am not told it was delivered when nobody may have scanned it.
34. As a member, I want a packet I scanned to read "Received", and "Shown for relay" once I show it onward, so that I know my part in carrying it.
35. As an author, I want "Acknowledged" only after an acknowledgement is scanned on my phone, so that green/teal always means confirmed.

### Trust, testing and submission

36. As a contributor, I want property-based tests that shuffle, duplicate and corrupt frames and packets, so that the protocol's guarantees hold for inputs nobody wrote by hand.
37. As a contributor, I want property-based tests for relay entries (altered, reordered, removed in the middle), so that the journey can't be forged.
38. As a contributor, I want new golden vectors for packets with relay entries, while the v1 vectors stay untouched, so that older and newer builds provably interoperate.
39. As a contributor, I want the packet protocol and security model documents updated before the code, so that the docs stay the source of truth.
40. As a contributor, I want typecheck and protocol tests to run automatically when protocol code is saved, so that regressions show up immediately.
41. As a contributor, I want a Protocol Engineer agent and a Security Reviewer agent, so that protocol changes get a consistent design and review pass.
42. As a judge, I want testing instructions that work with one laptop and several browser profiles, so that I can verify the protocol without three phones.
43. As a judge, I want the instructions to use only the app's real paths (frame text, paste, screenshot upload), so that I am testing the real protocol, not a simulation.
44. As a judge, I want a short document explaining how Kiro was used, with real bugs it helped find, so that I can assess the development process.
45. As a judge, I want an open-source licence and no unrelated documents in the repository, so that the submission is clear and eligible.

## Out of Scope

See `design.md`.
