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
import { readTablesFromDisk } from "../src/tables/node";

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
