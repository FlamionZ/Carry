# 01: Repo housekeeping and Kiro artefacts

**What to build:** The repository is eligible and clear for judges. It has an open-source licence and no unrelated product document. Kiro actively supports protocol work: saving protocol code runs the checks automatically, and two custom agents give protocol changes a consistent design and review pass.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] An MIT licence is in the repository root and named in `package.json`.
- [x] The unrelated coal-blending PRD is removed from `docs/`, and steering no longer has to warn about it.
- [x] A Kiro agent hook runs the typecheck and the unit tests when a domain or application file is saved.
- [x] A Protocol Engineer custom agent works from `PACKET_PROTOCOL.md`, the golden vectors, `GLOSSARY.md` and the ADRs.
- [x] A Security Reviewer custom agent reviews changes against `SECURITY_MODEL.md` and the protocol steering rules.
- [x] `.kiro/` is committed in full and not ignored.
