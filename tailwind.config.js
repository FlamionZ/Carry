/** @type {import('tailwindcss').Config} */

// Role tokens are CSS variables holding RGB channels (src/app/styles/index.css),
// so the Kiroween night and light themes share every class (ADR-0002, BRAND §12).
const role = (name) => `rgb(var(--carry-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme-dependent roles.
        canvas: role("canvas"),
        surface: role("surface"),
        fg: role("fg"),
        muted: role("muted"),
        line: role("line"),
        accent: role("accent"),
        brand: role("brand"),
        "on-brand": role("on-brand"),
        primary: role("primary"),
        "on-primary": role("on-primary"),
        signal: role("signal"),
        "on-signal": role("on-signal"),
        "signal-fg": role("signal-fg"),
        ack: role("ack"),
        danger: role("danger"),
        "on-danger": role("on-danger"),
        "danger-fg": role("danger-fg"),
        // Legacy names mapped onto roles, so existing classes follow the theme.
        paper: role("canvas"),
        ink: role("fg"),
        forest: role("accent"),
        sage: { DEFAULT: role("line"), dark: role("muted") },
        amber: { DEFAULT: role("signal"), dark: role("signal-fg") },
        alert: { DEFAULT: role("danger"), dark: role("danger-fg") },
        // Bright teal is fixed in both themes (chips, QR progress dots) and always
        // carries dark text; teal-dark is the Acknowledged text colour.
        teal: { DEFAULT: "#2AA58F", dark: role("ack") },
      },
      fontFamily: {
        display: ["Manrope", "Avenir Next", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { card: "16px", control: "10px" },
    },
  },
  plugins: [],
};
