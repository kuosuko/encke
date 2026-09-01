import { describe, it, expect } from "vitest";
import { compressBits, compressBitsUnchecked, compressURL, PAYLOAD_LIMIT_BITS } from "../src/node";
import { KNOWN_WORDS, FIXED_TLDS } from "../src/tables.generated";

describe("compressBits", () => {
  it("starts every payload with the begin marker", () => {
    for (const url of ["https://a.co/p", "https://example.com/menu", "https://oru.okuso.uk/su"]) {
      expect(compressBits(url)[0]).toBe("1");
    }
  });

  it("is deterministic", () => {
    const a = compressBits("https://example.com/search?p=shoes");
    expect(compressBits("https://example.com/search?p=shoes")).toBe(a);
  });

  it("keeps the query when the URL also has a path", () => {
    // 曾經的 bug：parseURL 只在沒有 path 時才取 query，導致 query 被整段吞掉
    const withQuery = compressBits("https://example.com/search?p=shoes");
    const withoutQuery = compressBits("https://example.com/search");
    expect(withQuery).not.toBe(withoutQuery);
    expect(withQuery.length).toBeGreaterThan(withoutQuery.length);
  });

  it("sets the template-type flag when the template encoding wins", () => {
    // /menu 是詞庫裡的詞，走 template 編碼 → bit 1 必須是 1
    expect(compressBits("https://example.com/menu")[1]).toBe("1");
    // 多段 path 走不了 template
    expect(compressBits("https://example.com/a/b/c")[1]).toBe("0");
  });

  it("marks the appclip. subdomain", () => {
    expect(compressBits("https://appclip.apple.com/p/hello")[2]).toBe("1");
    expect(compressBits("https://apple.com/p/hello")[2]).toBe("0");
  });

  it("uses the 8-bit TLD table for TLDs outside the Huffman set", () => {
    // .io 在 113 個固定表裡但不在 20 個 Huffman TLD 裡 → host format 1 ("10")
    expect(compressBits("https://ex.io/x").slice(3, 5)).toBe("10");
  });

  it("rejects non-https", () => {
    expect(() => compressBits("http://a.co/p")).toThrow(/https/i);
    expect(() => compressBits("ftp://a.co/p")).toThrow(/https/i);
  });

  it("rejects payloads over the 128-bit limit", () => {
    const long = "https://very-long-subdomain.example.com/a/very/long/path?with=query&and=more&plus=extra";
    expect(compressBitsUnchecked(long).length).toBeGreaterThan(PAYLOAD_LIMIT_BITS);
    expect(() => compressBits(long)).toThrow(/too large/i);
  });

  it("right-aligns compressURL into 16 bytes", () => {
    const bytes = compressURL("https://a.co/p");
    expect(bytes).toHaveLength(16);
    expect(bytes[0]).toBe(0);
  });
});

describe("extracted tables", () => {
  it("has 156 wordbook entries with contiguous indices", () => {
    const values = Object.values(KNOWN_WORDS).sort((a, b) => a - b);
    expect(values).toHaveLength(156);
    expect(values).toEqual(values.map((_, i) => i));
  });

  it("keeps the three entries that the string dump misses", () => {
    expect(KNOWN_WORDS.data).toBe(37);
    expect(KNOWN_WORDS.id).toBe(62);
    expect(KNOWN_WORDS["store-locator"]).toBe(128);
  });

  it("has 113 fixed TLDs, indices 1-113", () => {
    const values = Object.values(FIXED_TLDS).sort((a, b) => a - b);
    expect(values).toHaveLength(113);
    expect(values[0]).toBe(1);
    expect(values[112]).toBe(113);
  });
});
