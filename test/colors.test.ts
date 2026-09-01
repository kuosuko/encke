import { describe, it, expect } from "vitest";
import { TEMPLATE_COLORS, tintFor, findTemplate, normalizeHex, hexToCss } from "../src/node";
import { parseSamples, rgb } from "./helpers";

describe("TEMPLATE_COLORS", () => {
  it("has Apple's 18 templates in index order", () => {
    expect(TEMPLATE_COLORS).toHaveLength(18);
    expect(TEMPLATE_COLORS[1]).toEqual({ fg: "000000", bg: "FFFFFF", third: "888888" });
    expect(TEMPLATE_COLORS[11]).toEqual({ fg: "00A6A1", bg: "FFFFFF", third: "88DDCC" });
  });

  it("uses a real tint, never a flat gray, for the colored templates", () => {
    const colored = TEMPLATE_COLORS.filter(t => t.fg !== "FFFFFF" && !/^(.)\1(.)\2(.)\3$/.test(t.fg));
    expect(colored.length).toBeGreaterThan(0);
    for (const t of colored) {
      const [r, g, b] = rgb(t.third);
      expect(r === g && g === b, `${t.fg} → ${t.third}`).toBe(false);
    }
  });

  it("keeps every tint on Apple's 4-bit palette", () => {
    for (const t of TEMPLATE_COLORS) expect(t.third).toMatch(/^(([0-9A-F])\2){3}$/);
  });
});

describe("normalizeHex", () => {
  it("accepts #, lowercase and 3-digit shorthand", () => {
    expect(normalizeHex("#ff8800")).toBe("FF8800");
    expect(normalizeHex("f80")).toBe("FF8800");
    expect(normalizeHex("FF8800")).toBe("FF8800");
  });
  it("rejects junk", () => {
    expect(() => normalizeHex("nope")).toThrow(/invalid hex/i);
    expect(() => normalizeHex("#12345")).toThrow(/invalid hex/i);
  });
  it("hexToCss round-trips", () => expect(hexToCss("FF8800")).toBe("#ff8800"));
});

describe("tintFor", () => {
  it("returns the exact table value for built-in pairs", () => {
    for (const t of TEMPLATE_COLORS) expect(tintFor(t.fg, t.bg)).toBe(t.third);
  });

  it("finds templates regardless of case or #", () => {
    expect(findTemplate("#00a6a1", "ffffff")?.third).toBe("88DDCC");
    expect(findTemplate("123456", "654321")).toBeUndefined();
  });

  it("stays on the 4-bit palette for custom colors", () => {
    for (const [fg, bg] of [["123456", "FFFFFF"], ["800000", "FFEEDD"], ["0A0B0C", "F0F0F0"]])
      expect(tintFor(fg, bg)).toMatch(/^(([0-9A-F])\2){3}$/);
  });

  it("tracks Apple's own choice on the sampled pairs", () => {
    // 85 組原生取樣。自訂配色是近似 —— 這裡把準確度釘住，退步就會被抓到。
    const samples = parseSamples("color-tints.txt");
    let exact = 0;
    for (const [fg, bg, expected] of samples) {
      const got = rgb(tintFor(fg, bg)), want = rgb(expected.toUpperCase());
      // 一律落在 Apple 選擇的一個 4-bit 級距內
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `${fg}/${bg}`).toBeLessThanOrEqual(17);
      if (got.every((v, i) => v === want[i])) exact++;
    }
    expect(exact / samples.length).toBeGreaterThanOrEqual(0.8);
  });
});
