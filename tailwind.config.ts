import type { Config } from "tailwindcss";

/**
 * Design tokens are intentionally minimal here; the visual system lives in
 * `app/globals.css` as CSS custom properties so both Tailwind utilities and
 * raw CSS (e.g. Tiptap node styles) can share the same palette.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "var(--color-ground)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        muted: "var(--color-muted)",
        ink: "var(--color-ink)",
        accent: "var(--color-accent)",
        signal: "var(--color-signal)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
