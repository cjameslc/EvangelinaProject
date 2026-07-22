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
        "pop-in": { "0%": { opacity: "0", transform: "scale(0.6) rotate(-6deg)" }, "60%": { opacity: "1", transform: "scale(1.08) rotate(2deg)" }, "100%": { transform: "scale(1) rotate(0deg)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "glow-pulse": { "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,56,92,.45)" }, "50%": { boxShadow: "0 0 0 8px rgba(255,56,92,0)" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-4px)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(28px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "ken-burns": { "0%": { transform: "scale(1) translate(0,0)" }, "50%": { transform: "scale(1.14) translate(-2%,-1.5%)" }, "100%": { transform: "scale(1) translate(0,0)" } },
        sheen: { "0%": { backgroundPosition: "220% 0" }, "100%": { backgroundPosition: "-220% 0" } },
        dust: { "0%": { transform: "translateY(0)", opacity: "0" }, "10%": { opacity: "0.8" }, "85%": { opacity: "0.3" }, "100%": { transform: "translateY(-46px)", opacity: "0" } },
      },
      animation: {
        "toast-in": "toast-in .25s ease forwards",
        "pop-in": "pop-in .5s cubic-bezier(.34,1.56,.64,1) forwards",
        shimmer: "shimmer 2.5s linear infinite",
        "glow-pulse": "glow-pulse 1.8s ease-out infinite",
        float: "float 2.4s ease-in-out infinite",
        "fade-up": "fade-up .7s cubic-bezier(.16,1,.3,1) forwards",
        "ken-burns": "ken-burns 16s ease-in-out infinite",
        sheen: "sheen 7s linear infinite",
        dust: "dust 7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
