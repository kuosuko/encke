/**
 * Huffman trie 表的存放處。
 *
 * 三張表加起來約 1.7 MB，是整個套件唯一的大東西。刻意不從 compressor.ts
 * 靜態 import，這樣 bundler 才不會把它拉進主 bundle —— 載入方式見 load.ts。
 */
export interface TrieTables {
  /** host 用（data/h.data） */
  h: Uint8Array;
  /** segmented path/query 用（data/spq.data） */
  spq: Uint8Array;
  /** combined path/query 用（data/cpq.data） */
  cpq: Uint8Array;
}

/** 第一次需要表時才呼叫的同步取得器（Node 走這條）。 */
export type SyncTableProvider = () => TrieTables;

let tables: TrieTables | null = null;
let provider: SyncTableProvider | null = null;

/** 直接塞入已解好的表。 */
export function setTrieTables(t: TrieTables): void {
  tables = t;
}

/** 註冊延遲同步取得器；等到真的要編碼時才會執行。 */
export function setSyncTableProvider(p: SyncTableProvider): void {
  provider = p;
}

export function hasTrieTables(): boolean {
  return tables !== null || provider !== null;
}

export class TablesNotLoadedError extends Error {
  constructor() {
    super(
      "encke: Huffman tables are not loaded.\n" +
      "  Browser / Workers:  await loadTables()  before calling generateAppClipCode()\n" +
      "  or use the async helper:  await generateAppClipCodeAsync({ url })\n" +
      "  (Node loads them automatically from the package's data/ directory.)"
    );
    this.name = "TablesNotLoadedError";
  }
}

export function getTrieTables(): TrieTables {
  if (!tables) {
    if (!provider) throw new TablesNotLoadedError();
    tables = provider();
  }
  return tables;
}

/** 測試用：清空已載入的表。 */
export function resetTrieTables(): void {
  tables = null;
  provider = null;
}
