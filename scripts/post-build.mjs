/**
 * dist/tables.cjs is 1.4 MB of base64 that nothing ever reaches — Node reads
 * data/*.data directly and browsers take the ESM path. Drop it and keep the
 * tarball small.
 */
import { rmSync, existsSync, chmodSync } from "node:fs";

for (const f of ["dist/tables.cjs", "dist/tables.cjs.map", "dist/tables.d.cts"]) {
  if (existsSync(f)) rmSync(f);
}
for (const f of ["dist/cli.js", "dist/cli.cjs"]) {
  if (existsSync(f)) chmodSync(f, 0o755);
}
console.log("post-build: dropped CJS copy of the embedded tables, made CLI executable");
