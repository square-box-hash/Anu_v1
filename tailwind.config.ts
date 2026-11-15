import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        soft: "var(--bg-soft)",
        panel: "var(--panel)",
        panel2: "var(--panel-2)",
        line: "var(--line)",
        linestrong: "var(--line-strong)",
        ink: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          pale: "var(--accent-pale)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { xl2: "1.15rem" },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: { rise: "rise .26s ease-out both", fade: "fade .2s ease-out both" },
    },
  },
  plugins: [],
};

export default config;
