/**
 * 表的載入路徑。這裡刻意從 ../src/index（通用進入點）import，
 * 不是 ../src/node —— 模擬瀏覽器 / Workers：表要自己載。
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
