/**
 * Where the Huffman trie tables live.
 *
 * The three tables come to roughly 1.7 MB — the only large thing in the
 * package. compressor.ts deliberately does not import them statically, so
 * bundlers cannot pull them into the main bundle. See load.ts for how they
 * get in.
 */
export interface TrieTables {
  /** For hosts (data/h.data). */
  h: Uint8Array;
  /** For segmented path/query (data/spq.data). */
  spq: Uint8Array;
  /** For combined path/query (data/cpq.data). */
  cpq: Uint8Array;
}

/** Sync provider, called the first time the tables are needed (Node uses this). */
export type SyncTableProvider = () => TrieTables;

let tables: TrieTables | null = null;
let provider: SyncTableProvider | null = null;

/** Install already-decoded tables directly. */
export function setTrieTables(t: TrieTables): void {
  tables = t;
}

/** Register a lazy sync provider; it runs only when encoding actually starts. */
export function setSyncTableProvider(p: SyncTableProvider): void {
  provider = p;
}

export function hasTrieTables(): boolean {
  return tables !== null || provider !== null;
}

/**
 * Tables actually in hand. A registered provider does not count: it is only a
 * promise that someone can produce them, and that promise is not always good
 * (see registerNodeTables()).
 */
export function trieTablesLoaded(): boolean {
  return tables !== null;
}

/**
 * Materialize the tables through the registered sync provider. Returns false
 * when there is no provider, or when it throws — a provider that cannot
 * deliver is dropped so the caller can fall back to another source.
 */
export function loadFromSyncProvider(): boolean {
  if (!provider) return false;
  try {
    tables = provider();
    return true;
  } catch {
    provider = null;
    return false;
  }
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

/** For tests: drop whatever tables are loaded. */
export function resetTrieTables(): void {
  tables = null;
  provider = null;
}
