# 01: Kiroween night theme with a Light choice

**What to build:** CARRY opens in the Kiroween night theme. A member can switch to Light in Settings, and the choice survives reloads and offline use. Every screen passes WCAG AA in both themes, and QR codes stay dark on white.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Role tokens from design.md are CSS variables (RGB channels with `<alpha-value>`). Every component uses them. *Deviation:* the old colour names (`paper`, `ink`, `forest`, `sage`, `amber`, `alert`, …) were kept in `tailwind.config.js` as aliases that point at the role variables, instead of renaming about 150 class uses. Only the QR surface (`bg-white`) and the camera panel (`bg-black`) use fixed colours.
- [x] Night is the default without any inline script, and Light applies through `data-theme="light"` on `<html>`.
- [x] Settings has a Theme section with Night and Light as large radio cards with text labels. The choice is stored as `carry.theme`, and a pure helper for it has unit tests (`src/app/theme.test.ts`).
- [x] `theme-color`, the manifest and `offline.html` use the night colours (`offline.html` uses `offline.css`, because the CSP forbids inline styles).
- [x] QR images are dark on white in both themes. Acknowledged is the only teal-green status in both themes.
- [~] *Not met as written:* `@axe-core/playwright` could not be installed (npm hung twice), so no axe audit ran. Instead a one-off script computed WCAG contrast for 24 text/control pairs in both themes: 0 failures. Night danger moved from `#E06767` to `#E87A7A` with a new `on-danger` role, because white text on `#E06767` failed AA. Final values are in BRAND_GUIDELINES §12.
- [x] The existing browser suites pass, and a new e2e test switches to Light, reloads, and sees Light still selected.
