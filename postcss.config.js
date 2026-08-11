// Vite has built-in PostCSS support and auto-discovers this file — no
// vite.config.js changes needed for this to take effect.
//
// Before this, legacy.css had ZERO automatic vendor prefixing. Every
// property that needs a browser-specific prefix to work consistently —
// backdrop-filter (-webkit- for Safari), user-select, appearance, and
// dozens of others scattered through 6,800+ lines — only worked in
// whichever browser happens to support the unprefixed form. Autoprefixer
// reads .browserslistrc (Chrome, Edge, Firefox, Safari, iOS Safari,
// Samsung Internet — Brave isn't listed separately since it's the same
// Chromium engine as Chrome) and adds exactly the prefixes each property
// still needs for that browser list, automatically, on every build —
// not just once for what exists in the file today.
export default {
  plugins: {
    autoprefixer: {},
  },
}