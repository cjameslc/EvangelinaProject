import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        rausch: "#FF385C",
        violet: "#6C5CE7",
        green: "#008A05",
        amber: "#C87D00",
        teal: "#0B7C74",
        blue: "#3B71E8",
        fb: "#1877F2",
        gcash: "#007DFE",
        tiktok: "#111111",
        ink: "var(--ink)",
        muted: "var(--gray)",
        line: "var(--line)",
        line2: "var(--line-2)",
        bg: "var(--bg)",
        bg2: "var(--bg-2)",
        card: "var(--card)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "-apple-system", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        field: "12px",
      },
      boxShadow: {
        card: "0 6px 20px rgba(0,0,0,.10)",
        cardDark: "0 8px 24px rgba(0,0,0,.55)",
        s: "0 1px 2px rgba(0,0,0,.06)",
      },
      keyframes: {
        "toast-in": { from: { opacity: "0", transform: "translate(-50%, 20px)" }, to: { opacity: "1", transform: "translate(-50%, 0)" } },
      },
      animation: {
        "toast-in": "toast-in .25s ease forwards",
      },
    },
  },
  plugins: [],
};
export default config;
