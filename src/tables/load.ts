/**
 * Loading the Huffman tables.
 *
 * Mostly for browsers / Workers / Deno: under Node, `encke` resolves to
 * dist/node.js, which registers a synchronous fs provider at startup, and
 * loadTables() only has to run it.
 */
import { loadFromSyncProvider, setTrieTables, trieTablesLoaded, type TrieTables } from "./registry";

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
  // trieTablesLoaded(), not hasTrieTables(): a registered sync provider must
  // not short-circuit this. Bundlers resolve the "node" export condition even
  // for Worker builds, so dist/node.js — and its fs provider — can end up in a
  // bundle with no filesystem behind it. Returning early there would skip the
  // fetch and leave the failure for the first encode.
  if (trieTablesLoaded()) return Promise.resolve();
  if (inflight) return inflight;

  const run = async (): Promise<void> => {
    // A source named by the caller always wins over whatever is registered.
    if (opts.tables) return setTrieTables(opts.tables);
    if (opts.baseUrl) {
      const f = opts.fetch ?? globalThis.fetch;
      if (typeof f !== "function") throw new Error("encke: no fetch available; pass options.fetch");
      return setTrieTables(await fetchTables(opts.baseUrl, f));
    }
    // Nothing named: Node's disk provider is free and already there. If it
    // cannot deliver, fall through to the embedded copy rather than throwing.
    if (loadFromSyncProvider()) return;
    const { decodeEmbeddedTables } = await import("@sz.ws/encke/tables");
    setTrieTables(await decodeEmbeddedTables());
  };

  // Must be cleared once it settles. Otherwise a call after resetTrieTables()
  // gets handed the old, already-resolved promise and returns straight away
  // without reloading anything.
  inflight = run().finally(() => { inflight = null; });
  return inflight;
}
