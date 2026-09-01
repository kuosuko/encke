/**
 * 從 URLCompression.framework 重建 path/query 詞庫。
 *
 * 詞庫在 binary 裡是一段連續的字串表，但短字串（data / id / app …）會被 linker
 * 去重到別處，所以 `strings` 的順序會缺項 —— 必須再用原生工具逐詞量索引才對得起來。
 * 這個腳本只印出可見區塊供人工核對；權威索引由 npm run test:oracle 驗證。
 *
 *   node scripts/extract-wordbook.mjs
 */
import { execFileSync } from "node:child_process";

const FRAMEWORK =
  "/Library/Developer/AppClipCodeGenerator/AppClipCodeGenerator.bundle/Contents/" +
  "Frameworks/URLCompression.framework/Versions/A/URLCompression";

const all = execFileSync("strings", ["-a", FRAMEWORK], { encoding: "utf8" }).split("\n");
const start = all.indexOf("about");
const end = all.indexOf("wiki", start);
if (start < 0 || end < 0) throw new Error("wordbook block not found — did the framework layout change?");

const visible = all.slice(start, end + 1);
console.log(`${visible.length} strings between "about" and "wiki"`);
console.log(visible.join(" "));
console.log(
  "\nNote: short words deduplicated elsewhere in the binary are missing above.\n" +
  "src/tables.generated.ts is the reconciled table; test/oracle.test.ts checks it against the native encoder."
);
