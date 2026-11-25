# 01: Kiroween night theme with a Light choice

**What to build:** CARRY opens in the Kiroween night theme. A member can switch to Light in Settings, and the choice survives reloads and offline use. Every screen passes WCAG AA in both themes, and QR codes stay dark on white.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Role tokens from design.md are CSS variables (RGB channels with `<alpha-value>`). Every component uses them; old colour names remain only for the QR surface and the camera panel.
- [ ] Night is the default without any inline script, and Light applies through `data-theme="light"` on `<html>`.
- [ ] Settings has a Theme section with Night and Light as large radio cards with text labels. The choice is stored as `carry.theme`, and a pure helper for it has unit tests.
- [ ] `theme-color`, the manifest and `offline.html` use the night colours.
- [ ] QR images are dark on white in both themes. Acknowledged is the only teal-green status in both themes.
- [ ] A one-off axe audit shows zero WCAG 2.2 A/AA violations on the main screens in both themes. The tool is removed afterwards, and the final token values are recorded in BRAND_GUIDELINES §12.
- [ ] The existing browser suites pass, and a new e2e step switches to Light, reloads, and sees Light still selected.
