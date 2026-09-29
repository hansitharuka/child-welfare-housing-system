import { defineConfig } from "vitest/config";

// Database tests: reset the test database once, then run one file at a time against it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**"],
    globalSetup: ["tests/db/global-setup.ts"],
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
  },
});
