/**
 * 載入 Huffman 表。
 *
 * Node 用不到這個檔 —— `encke` 在 Node 下解析到 dist/node.js，
 * 開機就註冊了同步的 fs 取得器。這裡是給瀏覽器 / Workers / Deno 用的。
 */
import { hasTrieTables, setTrieTables, type TrieTables } from "./registry";

export interface LoadTablesOptions {
  /**
   * 放著 h.data / spq.data / cpq.data 的位置（自己 host 的靜態資源或 CDN）。
   * 給了這個就不會把 1.5 MB 的內嵌表拉進 bundle。
   */
  baseUrl?: string;
  /** 自訂抓取方式，預設用全域 fetch。 */
  fetch?: typeof globalThis.fetch;
  /** 已經自己讀好的表。 */
  tables?: TrieTables;
}

let inflight: Promise<void> | null = null;

async function fetchTables(baseUrl: string, f: typeof globalThis.fetch): Promise<TrieTables> {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const one = async (name: string) => {
    const res = await f(base + name + ".data");
    if (!res.ok) throw new Error(`encke: failed to fetch ${base}${name}.data (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const [h, spq, cpq] = await Promise.all([one("h"), one("spq"), one("cpq")]);
  return { h, spq, cpq };
}

/**
 * 確保 Huffman 表已就緒。重複呼叫沒有成本，同時呼叫多次也只會載入一次。
 *
 * ```ts
 * await loadTables();                               // 內嵌表（獨立 chunk，約 1.5 MB）
 * await loadTables({ baseUrl: "/appclip-tables" }); // 從自己的靜態目錄抓（bundle 零成本）
 * ```
 */
export function loadTables(opts: LoadTablesOptions = {}): Promise<void> {
  if (hasTrieTables()) return Promise.resolve();
  if (inflight) return inflight;

  const run = async (): Promise<void> => {
    if (opts.tables) return setTrieTables(opts.tables);
    if (opts.baseUrl) {
      const f = opts.fetch ?? globalThis.fetch;
      if (typeof f !== "function") throw new Error("encke: no fetch available; pass options.fetch");
      return setTrieTables(await fetchTables(opts.baseUrl, f));
    }
    const { decodeEmbeddedTables } = await import("encke/tables");
    setTrieTables(await decodeEmbeddedTables());
  };

  // settle 後一定要清掉，否則 resetTrieTables() 之後再呼叫會拿到已 resolve 的舊 promise，
  // 直接 return 而不重新載入。
  inflight = run().finally(() => { inflight = null; });
  return inflight;
}
