/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand tokens: BRAND_GUIDELINES.md §11. The `dark` shades are derived for
        // WCAG AA text contrast (≥ 4.5:1 on white, paper and their own 15% tints).
        forest: "#163A35",
        teal: { DEFAULT: "#2AA58F", dark: "#1A7060" },
        amber: { DEFAULT: "#F1B45B", dark: "#8A5A12" },
        paper: "#F4F2EA",
        ink: "#14201E",
        sage: { DEFAULT: "#81918A", dark: "#55635D" },
        alert: { DEFAULT: "#C94C4C", dark: "#A33A3A" },
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
