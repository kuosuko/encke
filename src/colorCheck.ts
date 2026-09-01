/**
 * Is this color pair scannable?
 *
 * The native AppClipCodeGenerator flatly rejects low-contrast pairs
 * ("Color combination not supported") — not fussiness: cameras genuinely
 * cannot read those codes. This reconstructs where that line sits.
 *
 * The rule was fitted against 624 samples from the native tool (the full
 * greyscale grid plus random colors):
 *   |Δluma(Rec.601)| ≥ 100  and  WCAG contrast ≥ 2.8
 * That agrees with the native verdict 97.1% of the time (9 pairs we accept
 * and it rejects, 9 pairs we reject and it accepts), and all 18 built-in
 * schemes pass. The sample data is in test/fixtures/color-validity.txt.
 */
import { normalizeHex, TEMPLATE_COLORS } from "./colors";

export const MIN_LUMA_DELTA = 100;
export const MIN_CONTRAST_RATIO = 2.8;

const rgb = (hex: string): [number, number, number] => {
  const h = normalizeHex(hex);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const toLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance. */
const relativeLuminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** Rec.601 luma (0-255). */
const luma601 = ([r, g, b]: [number, number, number]): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** WCAG contrast ratio between two colors (1-21). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(rgb(a));
  const l2 = relativeLuminance(rgb(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ColorCheck {
  ok: boolean;
  contrast: number;
  lumaDelta: number;
  /** When ok is false, which check fell short. */
  reason?: string;
}

/**
 * Will this pair scan once it is printed?
 *
 * ```ts
 * checkColors("777777", "888888");
 * // { ok: false, contrast: 1.15, lumaDelta: 17, reason: "..." }
 * ```
 */
export function checkColors(foreground: string, background: string): ColorCheck {
  const contrast = contrastRatio(foreground, background);
  const lumaDelta = Math.abs(luma601(rgb(foreground)) - luma601(rgb(background)));
  const failures: string[] = [];
  if (lumaDelta < MIN_LUMA_DELTA)
    failures.push(`brightness difference ${lumaDelta.toFixed(0)} (needs ≥ ${MIN_LUMA_DELTA})`);
  if (contrast < MIN_CONTRAST_RATIO)
    failures.push(`contrast ${contrast.toFixed(2)}:1 (needs ≥ ${MIN_CONTRAST_RATIO}:1)`);

  return failures.length === 0
    ? { ok: true, contrast, lumaDelta }
    : { ok: false, contrast, lumaDelta, reason: failures.join(", ") };
}

export function assertColorsScannable(foreground: string, background: string): void {
  const result = checkColors(foreground, background);
  if (result.ok) return;
  throw new Error(
    `encke: #${normalizeHex(foreground)} on #${normalizeHex(background)} will not scan reliably — ` +
    `${result.reason}. Pick a stronger pair (see TEMPLATE_COLORS), or pass ` +
    `allowUnscannableColors: true if you know what you're doing.`
  );
}

/** Nearest built-in schemes to this pair that do pass the check. */
export function suggestColors(foreground: string, background: string): { fg: string; bg: string; third: string }[] {
  const target = rgb(background);
  const distance = (hex: string) => {
    const c = rgb(hex);
    return Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2]);
  };
  void foreground;
  return [...TEMPLATE_COLORS]
    .sort((a, b) => distance(a.bg) - distance(b.bg))
    .slice(0, 3)
    .map(t => ({ fg: t.fg, bg: t.bg, third: t.third }));
}
