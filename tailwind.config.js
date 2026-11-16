/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#163A35",
        teal: { DEFAULT: "#2AA58F", dark: "#1E7D6C" },
        amber: { DEFAULT: "#F1B45B", dark: "#8A5A12" },
        paper: "#F4F2EA",
        ink: "#14201E",
        sage: { DEFAULT: "#81918A", dark: "#55635D" },
        alert: "#C94C4C",
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
