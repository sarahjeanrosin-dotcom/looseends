// Explicit empty config so Vite/PostCSS doesn't walk up and pick up an
// unrelated postcss.config.js from a parent directory (e.g. one in the
// user's home directory referencing Tailwind, which this project doesn't use).
export default {
  plugins: {},
};
