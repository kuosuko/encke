/**
 * Loading the Huffman tables.
 *
 * Node never reaches this file — under Node, `encke` resolves to
 * dist/node.js, which registers a synchronous fs provider at startup. This
 * is for browsers / Workers / Deno.
 */
import { hasTrieTables, setTrieTables, type TrieTables } from "./registry";

export interface LoadTablesOptions {
  /**
   * Where h.data / spq.data / cpq.data are served from (your own static
   * assets or a CDN). Pass this and the 1.5 MB embedded tables never enter
   * the bundle.
   */
  baseUrl?: string;
  /** Custom fetch implementation; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Tables you have already loaded yourself. */
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
 * Make sure the Huffman tables are ready. Calling it again is free, and
 * concurrent calls still load only once.
 *
 * ```ts
 * await loadTables();                               // embedded tables (own chunk, ~1.5 MB)
 * await loadTables({ baseUrl: "/appclip-tables" }); // from your static dir (0 KB of JS)
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

  // Must be cleared once it settles. Otherwise a call after resetTrieTables()
  // gets handed the old, already-resolved promise and returns straight away
  // without reloading anything.
  inflight = run().finally(() => { inflight = null; });
  return inflight;
}
