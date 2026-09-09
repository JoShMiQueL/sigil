import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@sigilpanel/shared": "../../packages/shared/src/index.ts",
      "@sigilpanel/db": "../../packages/db/src/index.ts",
    },
  },
});
