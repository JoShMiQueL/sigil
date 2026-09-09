import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    passWithNoTests: true,
    fileParallelism: false,
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@sigilpanel/shared": "../../packages/shared/src/index.ts",
      "@sigilpanel/db": "../../packages/db/src/index.ts",
    },
  },
});
