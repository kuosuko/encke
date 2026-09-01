import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // loadTables() dynamic-imports the embedded tables through the package's
      // own subpath, so bundlers split them into a separate chunk. Tests run
      // against the source tree, so point that back at the real file.
      "@sz.ws/encke/tables": fileURLToPath(new URL("./src/tables/embedded.ts", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.{ts,tsx}"] },
});
