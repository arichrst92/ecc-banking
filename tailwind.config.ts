import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Brand baru ECC (mengikuti logo 3Els) ──
        brand: {
          black:  "#0a0a0a",   // background gelap dominan
          black2: "#1a1a1a",   // surface gelap second
          black3: "#2a2a2a",   // border / dark divider
          orange: { DEFAULT: "#e85d10", 2: "#ff7d2e", soft: "#fff1e6" },
          yellow: { DEFAULT: "#fec736", 2: "#ffd866", soft: "#fff8e1" },
        },

        // ── Legacy (dipertahankan untuk minimum breakage) ──
        // Aliased ke brand baru biar konsisten:
        navy: { DEFAULT: "#0a0a0a", 2: "#1a1a1a", 3: "#2a2a2a" },
        gold: { DEFAULT: "#e85d10", 2: "#ff7d2e" },

        // ── Netral ──
        cream: { DEFAULT: "#fafaf7", 2: "#f1f0eb" },
        ink:   { DEFAULT: "#1a1a1a", 2: "#4a4a4a", 3: "#8a8a8a" },
        good:  "#2e7d6e",
        bad:   { DEFAULT: "#c0392b", 2: "#e74c3c" },
        info:  "#2563eb",
        line:  "#e8e5dd",
      },
      fontFamily: {
        sans:  ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        serif: ["Fraunces", "serif"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(10,10,10,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
