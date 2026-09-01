/**
 * Arc-by-arc comparison against Apple's own AppClipCodeGenerator.
 * The fixture is produced by scripts/gen-oracle.mjs (which needs macOS and
 * the native tool) and is committed, so these tests run on any machine.
 */
import { describe, it, expect } from "vitest";
import { generateAppClipCode } from "../src/node";
import { oracle, ringSignatures } from "./helpers";

describe(`arc geometry matches the native generator (${oracle.generator})`, () => {
  it.each(oracle.cases.map(c => [c.url, c] as const))("%s", (_url, expected) => {
    // The fixture was made with --index 1 --logo none: black on white, an
    // 800x800 canvas, no center graphic
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
    // The two stroke colors in native output are exactly foreground + tint
    expect([colors.foreground, colors.tint].sort()).toEqual(expected.strokes);
  });
});
