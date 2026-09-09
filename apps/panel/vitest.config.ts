import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@sigilpanel/shared": "../../packages/shared/src/index.ts",
      "@sigilpanel/ui": "../../packages/ui/src/index.ts",
    },
  },
});
