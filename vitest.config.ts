import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // loadTables() 以套件自身的 subpath 動態載入內嵌表，好讓 bundler 切成獨立 chunk。
      // 測試是直接跑原始碼，所以把它接回原檔。
      "encke/tables": fileURLToPath(new URL("./src/tables/embedded.ts", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.{ts,tsx}"] },
});
