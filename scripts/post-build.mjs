/**
 * dist/tables.cjs 是 1.4 MB 的 base64，而且沒人會用到 ——
 * Node 直接讀 data/*.data，瀏覽器走 ESM。刪掉省 tarball。
 */
import { rmSync, existsSync, chmodSync } from "node:fs";

for (const f of ["dist/tables.cjs", "dist/tables.cjs.map", "dist/tables.d.cts"]) {
  if (existsSync(f)) rmSync(f);
}
for (const f of ["dist/cli.js", "dist/cli.cjs"]) {
  if (existsSync(f)) chmodSync(f, 0o755);
}
console.log("post-build: dropped CJS copy of the embedded tables, made CLI executable");
