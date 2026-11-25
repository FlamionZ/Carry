# CARRY — Brand Guidelines

**Version:** 1.0  
**Brand idea:** Human-powered connectivity  
**Primary tagline:** Carry the message. Keep the community connected.

## 1. Brand foundation

### What CARRY is

CARRY is an offline-first private community communication tool. It helps a group exchange short messages by passing QR packets from one device to another. The people in the community physically carry the information.

### Brand essence

**Human-powered connectivity.**

### Positioning statement

For communities that need to coordinate when internet access is unreliable or unavailable, CARRY is a private offline-first communication PWA that moves encrypted messages through QR handoffs instead of a central messaging server.

### Brand promise

Important community updates can move with people, even when the internet cannot.

### Vision

Communities remain connected and informed when connectivity is limited.

### Mission

Make offline information sharing practical, private, and accessible through simple human-carried technology.

## 2. Personality

- **Resilient:** calm and capable when connectivity is unavailable.
- **Human:** built around people helping people.
- **Trustworthy:** transparent about privacy and delivery limits.
- **Practical:** simple flows, short messages, clear statuses.
- **Approachable:** not militaristic, intimidating, or overly technical.

CARRY is not a survivalist or emergency-dispatch brand. It is a community utility that can also be useful in low-connectivity settings.

## 3. Messaging system

### Primary tagline

**Carry the message. Keep the community connected.**

### Supporting lines

- A community network that travels hand to hand.
- No signal? Pass it along.
- Messages move when people do.
- Private community messages, carried device to device.

### Homepage description

CARRY helps your community share short, private updates without relying on an internet connection. Create a group, invite members with QR, and pass encrypted message packets from one device to another.

### Short description

An offline-first community messenger powered by QR handoffs.

### Vocabulary

Prefer:
- community
- member
- invitation
- join request
- approval
- packet
- relay
- scan
- acknowledged
- offline-ready

Avoid misleading terms:
- automatic mesh (QR relay is manual)
- instant delivery (there is a physical handoff delay)
- guaranteed delivery
- emergency network
- anonymous (packets carry member identity/certificate)
- military-grade encryption

## 4. Logo direction

### Concept

The CARRY mark is an open circular route built from three connected nodes. The open ring suggests a path that continues; three nodes represent sender, relay, and recipient. The center remains open to communicate movement rather than a closed central server.

### Logo variants

- **Primary mark:** three-node open-loop symbol.
- **Wordmark:** CARRY in uppercase geometric sans serif.
- **Stacked lockup:** mark above wordmark for app splash or poster.
- **Monochrome:** one-color version for small or constrained use.

### Clear space and minimum size

- Keep clear space at least the diameter of one node around the mark.
- Minimum mark size: 24 px for digital use.
- Minimum wordmark width: 112 px.
- Do not add glow, bevel, 3D effects, drop shadows, or extra nodes.
- Do not rotate, distort, or recolor individual nodes independently.

## 5. Color system

| Token | Hex | Usage |
|---|---|---|
| Carry Forest | `#163A35` | Primary brand, headers, navigation |
| Carry Teal | `#2AA58F` | Main action, active state, connection/path accent |
| Warm Signal | `#F1B45B` | Attention, relay prompt, secondary highlight |
| Paper | `#F4F2EA` | Main light surface |
| Deep Ink | `#14201E` | Text and dark surfaces |
| Muted Sage | `#81918A` | Secondary text and dividers |
| Cloud White | `#FFFFFF` | Cards and text on dark surfaces |
| Alert Red | `#C94C4C` | Errors and security warnings only |

### Color usage ratio

- 55% Paper / Cloud White
- 25% Forest / Deep Ink
- 15% Teal
- 5% Warm Signal or semantic alert

Do not use green to imply message delivery unless an ACK has returned. Use explicit labels alongside color.

## 6. Typography

- **Display and headings:** Manrope, weight 600–700.
- **Body and interface:** Inter, weight 400–600.
- **Protocol IDs and technical details:** IBM Plex Mono, weight 400–500.

Bundle fonts locally or use system fallbacks. Do not load Google Fonts or any remote font at runtime because the PWA must work offline.

Suggested CSS fallbacks:

```css
--font-display: "Manrope", "Avenir Next", system-ui, sans-serif;
--font-body: "Inter", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;
```

## 7. UI visual language

- Friendly utility, not hacker terminal.
- Large, legible QR transfer surfaces.
- Warm off-white canvas with forest-green navigation.
- Teal for primary actions and active relay states.
- Amber for pending handoff or attention.
- Rounded cards, subtle borders, minimal shadows.
- Clear progress labels for multi-frame QR transfers.
- Large touch targets for one-handed phone use.
- Use a route/relay motif sparingly in diagrams and empty states.

## 8. Iconography and illustration

Use Lucide-style outline icons with consistent stroke width. Recommended concepts: users, message-square, qr-code, scan-line, repeat, shield-check, clock, inbox, send, and wifi-off. Avoid military insignia, warning-tape aesthetics, ghost imagery, and stock photos of disaster scenes.

## 9. Tone of voice

CARRY sounds calm, direct, human, and transparent.

Good:
- “Ready to pass this message along.”
- “2 of 3 QR frames scanned.”
- “Message received on this device. Return an acknowledgement to confirm it with the sender.”
- “This invite expires in 10 minutes.”

Avoid:
- “Your message is delivered!” before an ACK returns.
- “Emergency communication guaranteed.”
- “Unhackable private network.”

## 10. Accessibility

- Maintain WCAG AA contrast for text and controls.
- Do not communicate state with color alone.
- Keep QR labels readable and provide a text fallback for test/diagnostics.
- Respect reduced-motion preferences.
- Provide camera permission explanation before opening the camera.
- Use keyboard-accessible controls and visible focus states.

## 11. Brand tokens

```css
:root {
  --carry-forest: #163A35;
  --carry-teal: #2AA58F;
  --carry-amber: #F1B45B;
  --carry-paper: #F4F2EA;
  --carry-ink: #14201E;
  --carry-sage: #81918A;
  --carry-white: #FFFFFF;
  --carry-alert: #C94C4C;
  --carry-radius-card: 16px;
  --carry-radius-control: 10px;
  --carry-font-display: "Manrope", "Avenir Next", system-ui, sans-serif;
  --carry-font-body: "Inter", system-ui, sans-serif;
  --carry-font-mono: "IBM Plex Mono", ui-monospace, monospace;
}
```

## 12. Kiroween edition (night theme)

For Kiroween 2026, CARRY's default look is **Kiroween night**: a lantern carried through the dark. Messages travel hand to hand at night, like the store-and-forward networks (FidoNet, UUCP) CARRY brings back to life. ADR-0002 records the decision. The original light theme stays available in Settings.

**Mood:** calm night, warm light. Not horror. Sections 2, 8 and 9 still apply. No ghosts, skulls, blood, cobwebs or warning-tape, and no fear-based copy. The Halloween feeling comes from the dark palette, the pumpkin-amber light and the lantern motif.

**Night palette** (role tokens; light values are the §5 colours):

| Role | Night | Usage |
|---|---|---|
| Canvas | `#0F1513` | Page background |
| Surface | `#18211E` | Cards |
| Text | `#EDEBE3` | Body text |
| Muted | `#A9B5AF` | Secondary text |
| Accent | `#8FD3C0` | Headings, links |
| Brand | `#0A0F0E` | Header, hero |
| Primary | `#3DBFA6` with dark text | Main action |
| Signal (pumpkin) | `#F1B45B` with dark text | Attention, relay prompt, focus ring |
| Acknowledged | `#5FD1B8` | Reserved for Acknowledged |
| Danger | `#F08A8A` | Errors and security warnings |

**Rules:**
- Every text and control pair must pass WCAG AA in both themes.
- QR codes are always dark on white, whatever the theme.
- The lantern motif is a small warm glow on the relay path. It is used sparingly: the welcome screen, empty states and the relay journey. It never animates when reduced motion is requested.
- In-app status words and copy stay plain (section 9). The Halloween story belongs on the welcome screen, in the README and in the video.
