/**
 * Node 端的表載入：開機註冊一個同步取得器，第一次編碼時才真的讀檔。
 * 所以 Node / Next.js server 完全不用 await loadTables()，也不會把 1.5 MB 內嵌表拉進來。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setSyncTableProvider, type TrieTables } from "./registry";

let overrideDir: string | null = null;

/** 自訂 data/ 位置（例如把資料檔搬到別的地方部署時）。 */
export function setDataDir(dir: string): void {
  overrideDir = dir;
}

function dataDir(): string {
  if (overrideDir) return overrideDir;
  const fromEnv = globalThis.process?.env?.APPCLIP_DATA_DIR;
  if (fromEnv) return fromEnv;

  // 不要用 __dirname 判斷 —— `node -e` 會把 __dirname="." 洩到 globalThis，
  // 在 ESM 下反而拿到錯的目錄。tsup 已經幫 CJS 補好 import.meta.url。
  const here = dirname(fileURLToPath(import.meta.url));
  // 打包後是 dist/node.js → ../data；直接跑原始碼是 src/tables/node.ts → ../../data
  const candidates = [join(here, "..", "data"), join(here, "..", "..", "data")];
  return candidates.find(dir => existsSync(join(dir, "h.data"))) ?? candidates[0];
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

export function registerNodeTables(): void {
  setSyncTableProvider(readTablesFromDisk);
}
