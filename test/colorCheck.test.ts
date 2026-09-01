import { describe, it, expect } from "vitest";
import { checkColors, contrastRatio, suggestColors, TEMPLATE_COLORS } from "../src/node";
import { parseSamples } from "./helpers";

describe("checkColors", () => {
  it("passes every built-in template", () => {
    for (const t of TEMPLATE_COLORS) expect(checkColors(t.fg, t.bg).ok, `${t.fg}/${t.bg}`).toBe(true);
  });

  it("rejects low-contrast pairs with a reason", () => {
    const result = checkColors("777777", "888888");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/brightness|contrast/);
  });

  it("is symmetric", () => {
    expect(checkColors("000000", "FFFFFF").ok).toBe(checkColors("FFFFFF", "000000").ok);
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("000000", "FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("FFFFFF", "FFFFFF")).toBeCloseTo(1, 5);
  });

  it("agrees with the native validator on the sampled pairs", () => {
    // 624 組原生取樣（灰階全格 + 隨機彩色）。規則是近似 —— 釘住一致率。
    const samples = parseSamples("color-validity.txt");
    const agree = samples.filter(([fg, bg, verdict]) => checkColors(fg, bg).ok === (verdict === "OK"));
    expect(agree.length / samples.length).toBeGreaterThanOrEqual(0.97);
  });

  it("suggests usable built-in alternatives", () => {
    const picks = suggestColors("777777", "888888");
    expect(picks.length).toBe(3);
    for (const p of picks) expect(checkColors(p.fg, p.bg).ok).toBe(true);
  });
});
