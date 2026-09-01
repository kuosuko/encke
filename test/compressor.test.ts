import { describe, it, expect } from "vitest";
import {
  compressBits,
  compressBitsUnchecked,
  compressURL,
  percentEncodeUnsupported,
  PAYLOAD_LIMIT_BITS,
} from "../src/node";
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
    // Past bug: parseURL only picked up the query when there was no path,
    // so the entire query got swallowed
    const withQuery = compressBits("https://example.com/search?p=shoes");
    const withoutQuery = compressBits("https://example.com/search");
    expect(withQuery).not.toBe(withoutQuery);
    expect(withQuery.length).toBeGreaterThan(withoutQuery.length);
  });

  it("sets the template-type flag when the template encoding wins", () => {
    // /menu is a wordbook word, so it takes the template encoding -> bit 1 must be 1
    expect(compressBits("https://example.com/menu")[1]).toBe("1");
    // a multi-segment path cannot use the template encoding
    expect(compressBits("https://example.com/a/b/c")[1]).toBe("0");
  });

  it("marks the appclip. subdomain", () => {
    expect(compressBits("https://appclip.apple.com/p/hello")[2]).toBe("1");
    expect(compressBits("https://apple.com/p/hello")[2]).toBe("0");
  });

  it("uses the 8-bit TLD table for TLDs outside the Huffman set", () => {
    // .io is in the 113-entry fixed table but not among the 20 Huffman TLDs,
    // so it takes host format 1 ("10")
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

describe("characters outside Apple's alphabet", () => {
  it("treats @ and %40 as the same URL", () => {
    // Apple's tool rejects "@" outright but accepts "%40", and the two name
    // the same resource
    expect(compressBits("https://a.co/@suko")).toBe(compressBits("https://a.co/%40suko"));
  });

  it("encodes the other rejected punctuation too", () => {
    for (const url of ["https://a.co/a~b", "https://a.co/a!b", "https://a.co/a(b)", "https://a.co/a$b"])
      expect(compressBits(url).length, url).toBeGreaterThan(0);
  });

  it("does not double-encode an already-encoded URL", () => {
    expect(percentEncodeUnsupported("/%40suko")).toBe("/%40suko");
    expect(percentEncodeUnsupported("/@suko")).toBe("/%40suko");
  });

  it("leaves every character Apple accepts untouched", () => {
    // The guardrail for bit-for-bit parity: not one character inside the
    // alphabet may be altered
    const alphabet = "#%&+,-./0123456789:;=?ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
    expect(percentEncodeUnsupported(alphabet)).toBe(alphabet);
  });

  it("handles non-ASCII by encoding its UTF-8 bytes", () => {
    expect(percentEncodeUnsupported("/日")).toBe("/%E6%97%A5");
    expect(compressBits("https://a.co/%E6%97%A5")).toBe(compressBits("https://a.co/日"));
  });

  it("rejects userinfo rather than mangling it", () => {
    expect(() => compressBits("https://user@a.co/p")).toThrow(/userinfo/i);
  });

  it("names the offending character when a host cannot be encoded", () => {
    expect(() => compressBits("https://a_b.co/p")).toThrow(/Host contains "_"/);
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
