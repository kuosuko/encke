import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    node: "src/node.ts",
    react: "src/react.tsx",
    "react-node": "src/react-node.tsx",
    handler: "src/handler.ts",
    "handler-node": "src/handler-node.ts",
    cli: "src/cli.ts",
    // The embedded Huffman tables (~1.5 MB). Kept as their own entry so the
    // main bundle never touches them — loadTables() dynamic-imports this only
    // when it is genuinely needed.
    tables: "src/tables/embedded.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  treeshake: true,
  // Self-reference: keeps dynamic import("@sz.ws/encke/tables") in the output
  // verbatim so the exports map resolves it at runtime
  external: ["@sz.ws/encke"],
});
