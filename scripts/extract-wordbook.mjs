/**
 * Recover the path/query wordbook from URLCompression.framework.
 *
 * The wordbook sits in the binary as one contiguous string table, but the
 * linker dedupes short strings (data / id / app …) elsewhere, so the order
 * `strings` reports has holes in it — the only way to line the indices up is
 * to measure them word by word against the native tool.
 * This script just prints the visible block for manual cross-checking; the
 * authoritative indices are verified by npm run test:oracle.
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
