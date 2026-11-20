# 10: KIRO.md, judge testing instructions, README and redeploy

**What to build:** Judges can understand how Kiro shaped the project and can verify CARRY themselves on one laptop. The live site runs the new build.

**Blocked by:** 01, 08, 09

**Status:** ready-for-agent

- [ ] `KIRO.md` explains steering, this spec, the tickets, the hook and the agents. It covers three real bugs, each with how it was found and fixed:
  - ZXing mask-pattern decode failures;
  - the 500 ms post-read pause skipping a frame every cycle;
  - the false update banner on first install in Firefox.
- [ ] `KIRO.md` states plainly that work before this spec was not spec-driven.
- [ ] Judge testing instructions cover join, a message of each kind, relay, acknowledgement, the Ledger, and the duplicate and tamper checks. They use two or three browser profiles and only real app paths (frame text, paste, screenshot upload), with no simulation mode.
- [ ] The README describes the coordination positioning, the new features and the updated test counts, without claiming a first, a mesh, or emergency use.
- [ ] The full suite passes (unit, golden vectors, browser tests on three engines), and `npm run deploy` publishes the build.
- [ ] The live site is checked for headers, offline reload and the new build version.
