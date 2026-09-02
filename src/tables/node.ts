/**
 * Table loading on Node: register a sync provider at startup, and only
 * actually touch the disk on the first encode. That is why Node and the
 * Next.js server never need `await loadTables()` and never pull in the
 * 1.5 MB embedded tables.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setSyncTableProvider, type TrieTables } from "./registry";

let overrideDir: string | null = null;

/**
 * Point at a different data/ directory (e.g. when deploying the data files
 * elsewhere). Naming a directory is explicit enough to register the disk
 * provider even where the fs probe below said no.
 */
export function setDataDir(dir: string): void {
  overrideDir = dir;
  setSyncTableProvider(readTablesFromDisk);
}

// Do not probe __dirname — `node -e` leaks __dirname="." onto globalThis,
// which under ESM resolves to the wrong directory. tsup already shims
// import.meta.url for the CJS build.
function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function dataDir(): string {
  if (overrideDir) return overrideDir;
  const fromEnv = globalThis.process?.env?.APPCLIP_DATA_DIR;
  if (fromEnv) return fromEnv;

  const here = moduleDir();
  // Bundled: dist/node.js -> ../data. Running from source: src/tables/node.ts -> ../../data
  const candidates = [join(here, "..", "data"), join(here, "..", "..", "data")];
  return candidates.find(dir => existsSync(join(dir, "h.data"))) ?? candidates[0];
}

/**
 * Is there a real filesystem behind node:fs?
 *
 * Bundlers resolve the "node" export condition by target platform, not by
 * deployment target: webpack, esbuild and Wrangler all pull dist/node.js into
 * Worker bundles, where node:fs is missing or a stub. A stub either throws or
 * answers false for every path; a real one always finds the working directory
 * and the directory this module was loaded from.
 */
function hasRealFs(): boolean {
  try {
    if (typeof readFileSync !== "function" || typeof existsSync !== "function") return false;
    return existsSync(".") || existsSync(moduleDir());
  } catch {
    return false;
  }
}

export function readTablesFromDisk(): TrieTables {
  const dir = dataDir();
  const read = (name: string): Uint8Array => {
    const path = join(dir, `${name}.data`);
    try {
      const buf = readFileSync(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (cause) {
      throw new Error(
        `encke: cannot read ${path}. ` +
        `Set APPCLIP_DATA_DIR or call setDataDir() if the data/ directory moved.`,
        { cause }
      );
    }
  };
  return { h: read("h"), spq: read("spq"), cpq: read("cpq") };
}

/**
 * Wire up the disk loader. Does nothing — and returns false — where there is
 * no filesystem to read from, so a Worker bundle that swept this file in still
 * falls through to loadTables() instead of failing on the first encode.
 */
export function registerNodeTables(): boolean {
  if (!hasRealFs()) return false;
  setSyncTableProvider(readTablesFromDisk);
  return true;
}
