import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// No Tailwind — using CSS Modules + CSS custom properties (design tokens)
// Native tsconfig path resolution via resolve.tsconfigPaths
export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
});
