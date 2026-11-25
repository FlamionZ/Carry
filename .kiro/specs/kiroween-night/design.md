Status: ready-for-agent

# Kiroween night: design

Requirements: `requirements.md`. Brand: `docs/BRAND_GUIDELINES.md` §12. Decision: ADR-0002.

## Theme tokens

Tailwind colours become **role tokens** backed by CSS variables written as RGB channels with `<alpha-value>`, so opacity modifiers like `bg-accent/10` keep working. This is the Tailwind v3 documented approach, looked up with the context7 power.

- **Default and switching.** `:root` holds the night values; `[data-theme="light"]` on `<html>` overrides them with the light values.
- **No-script first paint.** Night is the default, so the first paint needs no script. The CSP forbids inline scripts.
- **Stored choice.** The choice is stored in `localStorage` as `carry.theme` (like the other non-sensitive preferences) and applied in `main.tsx` before React renders.
- **Browser colours.** `theme-color` and the manifest colours follow the night theme.

| Token | Replaces | Light | Night |
|---|---|---|---|
| canvas | `paper` page background | `#F4F2EA` | `#0F1513` |
| surface | `bg-white` cards, inputs | `#FFFFFF` | `#18211E` |
| fg | `ink` body text | `#14201E` | `#EDEBE3` |
| muted | `sage-dark` secondary text | `#55635D` | `#A9B5AF` |
| line | `black/10`, `sage`, `sage/50` borders | `#81918A` (with opacity) | `#81918A` (with opacity) |
| accent | `forest` used as text/tints/borders | `#163A35` | `#8FD3C0` |
| brand / on-brand | `bg-forest` header, hero / `text-white` on them | `#163A35` / `#FFFFFF` | `#0A0F0E` / `#F4F2EA` |
| primary / on-primary | `btn-primary` | `#1A7060` / `#FFFFFF` | `#3DBFA6` / `#0B1512` |
| signal / on-signal | `amber` backgrounds / text on them | `#F1B45B` / `#14201E` | `#F1B45B` / `#14201E` |
| signal-fg | `amber-dark` text | `#8A5A12` | `#F5C77E` |
| ack | `teal`/`teal-dark` for Acknowledged and offline-ready | `#1A7060` | `#5FD1B8` |
| danger / danger-fg | `alert` | `#C94C4C` / `#A33A3A` | `#E06767` / `#F08A8A` |
| focus | focus ring | `#1A7060` | `#F1B45B` |

Rules:
- **QR codes stay dark on white.** The QR display keeps a literal white background, and the encoder keeps its fixed dark-on-white colours.
- **The camera panel stays dark** (`bg-ink`) in both themes.
- **Text on coloured backgrounds** uses the matching `on-*` token on signal and primary, never `fg`.
- **One logical change.** Rename the classes in every component in the same change. Keep old literal colour names only where a literal is required (the QR surface and the camera panel).
- The values in the table are starting points. Adjust any token that fails WCAG AA, and record the final values in BRAND_GUIDELINES §12.

## Settings

A "Theme" section offers Night (the default) and Light as two large radio cards. The choice applies immediately.

## Welcome and motif

- **Welcome text.** The identity-setup hero keeps the tagline and adds: "In the 1980s, FidoNet carried messages from one computer to the next, night after night. CARRY brings that store-and-forward idea back, hand to hand by QR, with modern encryption and no server."
- **Lantern.** A small inline SVG lantern (no network) appears in the hero and in empty states. It glows softly only under `prefers-reduced-motion: no-preference`, and the CARRY mark itself is never altered.
- **Offline page.** `offline.html` follows the night palette.

## Testing Decisions

- **Theme preference.** The helper that reads and writes `carry.theme` is pure, with unit tests.
- **Existing browser suites** must still pass with night as the default.
- **New e2e step:** switch to Light in Settings, reload, and check that the choice persisted.
- **Accessibility audit.** A one-off axe-core audit (WCAG 2.2 A/AA) covers the main screens in both themes, run the same way as the earlier audit: installed with `--no-save` and removed afterwards. Both themes must report zero violations.

## Out of Scope

See `requirements.md`.
