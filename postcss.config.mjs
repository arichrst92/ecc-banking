// Mirror dari postcss.config.js — keep both untuk safety.
// Next.js akan prefer .js (CommonJS) lebih dulu.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
