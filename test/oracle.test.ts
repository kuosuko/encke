/**
 * 與 Apple 原生 AppClipCodeGenerator 逐弧比對。
 * fixture 由 scripts/gen-oracle.mjs 產生（需要 macOS + 原生工具），已 commit，
 * 所以任何機器都能跑這組測試。
 */
import { describe, it, expect } from "vitest";
import { generateAppClipCode } from "../src/node";
import { oracle, ringSignatures } from "./helpers";

describe(`arc geometry matches the native generator (${oracle.generator})`, () => {
  it.each(oracle.cases.map(c => [c.url, c] as const))("%s", (_url, expected) => {
    // fixture 用 --index 1 --logo none：黑環白底、800×800 畫布、無中心圖
    const { svg } = generateAppClipCode({
      url: expected.url,
      templateIndex: 1,
      layout: "code",
      center: "none",
    });
    expect(ringSignatures(svg)).toEqual(expected.rings);
  });

  it("has five rings with arcs in every fixture", () => {
    for (const c of oracle.cases) {
      expect(c.rings, c.url).toHaveLength(5);
      expect(c.rings.every(r => r.length > 0), c.url).toBe(true);
    }
  });
});

describe("colors match the native generator", () => {
  const byIndex = oracle.colors.filter(c => c.index !== undefined);

  it.each(byIndex.map(c => [c.index!, c] as const))("template %i", (index, expected) => {
    const { colors } = generateAppClipCode({ url: "https://oru.okuso.uk/su", templateIndex: index });
    expect(colors.background).toBe(expected.background);
    // 原生輸出裡的兩個 stroke 顏色就是「前景 + 輔助色」
    expect([colors.foreground, colors.tint].sort()).toEqual(expected.strokes);
  });
});
