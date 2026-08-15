import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// No Tailwind — using CSS Modules + CSS custom properties (design tokens)
export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    alias: {
      // @timeless/shared → resolve directly from source (no dist/ build needed)
      "@timeless/shared": path.resolve(
        __dirname,
        "../../packages/shared/src/index.ts"
      ),
    },
    tsconfigPaths: true,
  },
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
});
