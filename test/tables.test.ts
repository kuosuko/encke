/**
 * The table-loading paths. These deliberately import from ../src/index (the
 * universal entry point) rather than ../src/node, to reproduce the browser /
 * Workers situation where the tables must be loaded by hand.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadTables,
  setTrieTables,
  hasTrieTables,
  resetTrieTables,
  TablesNotLoadedError,
  compressBits,
} from "../src/index";
import { readTablesFromDisk, registerNodeTables } from "../src/tables/node";
import { setSyncTableProvider } from "../src/tables/registry";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("table loading", () => {
  beforeEach(() => resetTrieTables());

  it("fails with an actionable error before the tables are loaded", () => {
    expect(hasTrieTables()).toBe(false);
    expect(() => compressBits("https://a.co/p")).toThrow(TablesNotLoadedError);
    expect(() => compressBits("https://a.co/p")).toThrow(/await loadTables\(\)/);
  });

  it("accepts tables handed in directly", () => {
    setTrieTables(readTablesFromDisk());
    expect(hasTrieTables()).toBe(true);
    expect(compressBits("https://a.co/p")).toMatch(/^[01]+$/);
  });

  it("loads the embedded gzip tables", async () => {
    await loadTables();
    expect(compressBits("https://oru.okuso.uk/su").length).toBe(65);
  });

  it("is idempotent and safe to call concurrently", async () => {
    await Promise.all([loadTables(), loadTables(), loadTables()]);
    expect(hasTrieTables()).toBe(true);
  });

  it("produces the same bits however the tables arrived", async () => {
    setTrieTables(readTablesFromDisk());
    const fromDisk = compressBits("https://example.com/search?p=shoes");
    resetTrieTables();
    await loadTables();
    expect(compressBits("https://example.com/search?p=shoes")).toBe(fromDisk);
  });
});

/**
 * Bundlers pick the "node" export condition by target platform, not by
 * deployment target: webpack, esbuild and Wrangler all sweep dist/node.js —
 * and its fs provider — into Worker bundles that have no filesystem. Nothing
 * in there may hijack the loading paths a Worker actually has.
 */
describe("a registered sync provider that cannot deliver", () => {
  const dataDir = new URL("../data/", import.meta.url).pathname;
  /** Stands in for node:fs behind a bundler stub. */
  const deadProvider = () => {
    throw new Error("readFileSync is not a function");
  };
  const fetchFromDisk: typeof globalThis.fetch = async (input) => {
    const name = String(input).split("/").pop()!;
    return new Response(readFileSync(join(dataDir, name)));
  };

  beforeEach(() => resetTrieTables());

  it("does not short-circuit loadTables({ baseUrl })", async () => {
    setSyncTableProvider(deadProvider);
    await loadTables({ baseUrl: "/appclip-tables", fetch: fetchFromDisk });
    expect(compressBits("https://oru.okuso.uk/su").length).toBe(65);
  });

  it("does not short-circuit loadTables({ tables })", async () => {
    setSyncTableProvider(deadProvider);
    await loadTables({ tables: readTablesFromDisk() });
    expect(compressBits("https://oru.okuso.uk/su").length).toBe(65);
  });

  it("falls back to the embedded tables when nothing else is named", async () => {
    setSyncTableProvider(deadProvider);
    await loadTables();
    expect(compressBits("https://oru.okuso.uk/su").length).toBe(65);
  });

  it("still loads from disk under Node, without touching the embedded copy", async () => {
    expect(registerNodeTables()).toBe(true);
    await loadTables();
    expect(compressBits("https://oru.okuso.uk/su").length).toBe(65);
  });
});
