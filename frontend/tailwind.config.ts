import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: "#1a1a1a",
          50: "#2a2a2a",
          100: "#242424",
          200: "#1e1e1e",
          300: "#181818",
          400: "#121212",
          500: "#0e0e0e",
        },
        amber: {
          DEFAULT: "#f5a623",
          50: "#fef7e8",
          100: "#fdecc6",
          200: "#fbd88a",
          300: "#f8c44e",
          400: "#f5a623",
          500: "#d4891a",
          600: "#b06e14",
          700: "#8c5510",
        },
        cream: {
          DEFAULT: "#faf5ee",
          50: "#ffffff",
          100: "#fdfbf7",
          200: "#faf5ee",
          300: "#f0e8d8",
          400: "#e6dbc8",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      animation: {
        "ticker": "ticker 60s linear infinite",
        "slide-in": "slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "lock-in": "lock-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "fade-in": "fade-in 0.6s ease-out",
        "pulse-amber": "pulse-amber 3s ease-in-out infinite",
      },
      keyframes: {
        "ticker": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "slide-in": {
          "0%": { transform: "translateX(-20px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "lock-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-amber": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
