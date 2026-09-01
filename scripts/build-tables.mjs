/**
 * data/{h,spq,cpq}.data → src/trie-data.generated.ts（gzip + base64）
 * 只有需要瀏覽器內嵌 fallback 的人會用到這份；Node 直接讀 data/。
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

const names = ["h", "spq", "cpq"];
const body = names
  .map(n => `export const ${n.toUpperCase()}_GZ_B64 = "${gzipSync(readFileSync(`data/${n}.data`), { level: 9 }).toString("base64")}";`)
  .join("\n");

writeFileSync(
  "src/trie-data.generated.ts",
  `/* Apple Huffman trie 資料 (data/{h,spq,cpq}.data) — gzip + base64。\n` +
  ` * 只有 tables/embedded.ts 會 import 這個檔；Node 直接讀 data/*.data，不會載到這裡。\n` +
  ` * 由 scripts/build-tables.mjs 產生，勿手改。 */\n${body}\n`
);
console.log(`src/trie-data.generated.ts  ${(statSync("src/trie-data.generated.ts").size / 1e6).toFixed(2)} MB`);
