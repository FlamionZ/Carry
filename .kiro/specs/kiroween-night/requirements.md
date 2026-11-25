Status: ready-for-agent

# Kiroween night: requirements

Submission edition of CARRY for Kiroween 2026 (category **Resurrection**). Vocabulary follows `GLOSSARY.md`. Decision: ADR-0002. Brand rules: `docs/BRAND_GUIDELINES.md` §12.

## Problem Statement

Kiroween is a Halloween-themed hackathon, and judges score Design and Presentation as much as engineering. CARRY looks like a light, everyday utility. Nothing in the app or the submission connects it to the event, or to the "dead technology" its category asks it to resurrect. Some Kiro features also go unmentioned in the write-up, which judges assess explicitly.

## Solution

- **Kiroween night theme.** CARRY opens in a dark night theme by default: a warm lantern carried hand to hand in the dark. It keeps every accessibility rule and stays plainly usable. The light theme remains a Settings choice.
- **Welcome story.** The welcome screen tells the resurrection story in two sentences: store-and-forward messaging (FidoNet, UUCP, sneakernet) brought back with QR codes and modern cryptography.
- **Submission materials.** The write-up and materials (Devpost text, blog draft, social post draft, video script) are ready, and every claim in them is backed by the repository.

## User Stories

1. As a member, I want CARRY to open in a calm night theme, so that it is comfortable to use in the evening events it is made for.
2. As a member, I want to switch between night and light themes in Settings and keep my choice after reloads and offline, so that I can pick what is readable for me.
3. As a member, I want every screen to keep WCAG AA contrast, text labels and visible focus in both themes, so that the theme never costs usability.
4. As a member scanning a QR, I want QR codes always dark on white, so that the theme never makes scanning harder.
5. As a member, I want Acknowledged to remain the only teal-green state in both themes, so that the colour still means "confirmed".
6. As a new visitor, I want the welcome screen to explain in two sentences what old technology CARRY brings back and why, so that I understand the idea instantly.
7. As a member, I want the lantern motif shown only where it helps (welcome, empty states) and never animated under reduced motion, so that it stays tasteful.
8. As a judge, I want `KIRO.md` to state every Kiro feature used, including the power used for documentation and the features not used, and why, so that I can assess Kiro usage honestly.
9. As the project owner, I want a Devpost description, a blog post draft, a social post draft and a video script under three minutes, so that I can submit on time.
10. As a judge, I want the README to state the category and the resurrection story, so that the category fit is obvious in the pass/fail stage.

## Out of Scope

- New messaging features or protocol changes.
- Horror imagery (ghosts, skulls, blood).
- A third theme or automatic switching by time.
- Recording the video, publishing posts, and testing on physical phones. The project owner does these.
