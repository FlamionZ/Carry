# 01: Repo housekeeping and Kiro artefacts

**What to build:** The repository is eligible and clear for judges. It has an open-source licence and no unrelated product document. Kiro actively supports protocol work: saving protocol code runs the checks automatically, and two custom agents give protocol changes a consistent design and review pass.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] An MIT licence is in the repository root and named in `package.json`.
- [ ] The unrelated coal-blending PRD is removed from `docs/`, and steering no longer has to warn about it.
- [ ] A Kiro agent hook runs the typecheck and the unit tests when a domain or application file is saved.
- [ ] A Protocol Engineer custom agent works from `PACKET_PROTOCOL.md`, the golden vectors, `GLOSSARY.md` and the ADRs.
- [ ] A Security Reviewer custom agent reviews changes against `SECURITY_MODEL.md` and the protocol steering rules.
- [ ] `.kiro/` is committed in full and not ignored.
