import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0f1d3a", 2: "#162447", 3: "#1e3a6e" },
        gold: { DEFAULT: "#c9a84c", 2: "#e8c97a" },
        cream: { DEFAULT: "#f8f5ef", 2: "#ede8dc" },
        ink: { DEFAULT: "#1a1a2e", 2: "#4a5568", 3: "#8a94a6" },
        good: "#2e7d6e",
        bad: { DEFAULT: "#c0392b", 2: "#e74c3c" },
        info: "#2563eb",
        line: "#e2ddd4",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        serif: ["Fraunces", "serif"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(15,29,58,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
