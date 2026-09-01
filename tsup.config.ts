import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    node: "src/node.ts",
    react: "src/react.tsx",
    "react-node": "src/react-node.tsx",
    cli: "src/cli.ts",
    // 內嵌的 Huffman 表 (~1.5 MB)。獨立成一個 entry，這樣主 bundle 不會碰到它 ——
    // loadTables() 只在真的需要時才 dynamic import。
    tables: "src/tables/embedded.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  treeshake: true,
  // 自我引用，讓 dynamic import("encke/tables") 原樣輸出、由 exports map 解析
  external: ["encke"],
});
