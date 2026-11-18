import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // each test with a database boots an in-memory Postgres and runs every migration; 5s is too tight on a busy machine
  test: { environment: "node", testTimeout: 30_000, hookTimeout: 30_000 },
});
