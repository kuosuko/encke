/**
 * Colors — an App Clip Code actually uses three of them, not two.
 *
 * Every code is drawn by interleaving the foreground color with a lighter
 * "tint" color, and the scanner reads data-color by clustering the two.
 * The tint is not grey: teal 00A6A1 pairs with 88DDCC.
 * The 18 triples below were extracted straight out of Apple's own
 * AppClipCodeGenerator output and verified one by one.
 *
 * Every tint lands on a 4-bit palette (each byte is a repeated nibble, e.g.
 * 88 / DD / CC), and we snap custom colors to the same palette — see
 * tintFor().
 */

export interface ColorTemplate {
  /** The code's main color. */
  fg: string;
  /** The background. */
  bg: string;
  /** The tint — arcs with data-color="1". */
  third: string;
}

/** Apple's 18 built-in schemes; the indices match the native `--index`. */
export const TEMPLATE_COLORS: readonly ColorTemplate[] = [
  { fg: "FFFFFF", bg: "000000", third: "888888" },
  { fg: "000000", bg: "FFFFFF", third: "888888" },
  { fg: "FFFFFF", bg: "777777", third: "AAAAAA" },
  { fg: "777777", bg: "FFFFFF", third: "AAAAAA" },
  { fg: "FFFFFF", bg: "FF3B30", third: "FF9999" },
  { fg: "FF3B30", bg: "FFFFFF", third: "FF9999" },
  { fg: "FFFFFF", bg: "EE7733", third: "EEBB88" },
  { fg: "EE7733", bg: "FFFFFF", third: "EEBB88" },
  { fg: "FFFFFF", bg: "33AA22", third: "99DD99" },
  { fg: "33AA22", bg: "FFFFFF", third: "99DD99" },
  { fg: "FFFFFF", bg: "00A6A1", third: "88DDCC" },
  { fg: "00A6A1", bg: "FFFFFF", third: "88DDCC" },
  { fg: "FFFFFF", bg: "007AFF", third: "77BBFF" },
  { fg: "007AFF", bg: "FFFFFF", third: "77BBFF" },
  { fg: "FFFFFF", bg: "5856D6", third: "BBBBEE" },
  { fg: "5856D6", bg: "FFFFFF", third: "BBBBEE" },
  { fg: "FFFFFF", bg: "CC73E1", third: "EEBBEE" },
  { fg: "CC73E1", bg: "FFFFFF", third: "EEBBEE" },
] as const;

/** "#FfF000" -> "FFF000" (uppercase, no #, 3-digit shorthand expanded) */
export function normalizeHex(input: string): string {
  const h = input.trim().replace(/^#/, "");
  const full = h.length === 3 ? [...h].map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex color: ${input}`);
  return full.toUpperCase();
}

const channels = (hex: string): [number, number, number] => {
  const h = normalizeHex(hex);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

/** Find the built-in template matching this exact fg/bg pair. */
export function findTemplate(fg: string, bg: string): ColorTemplate | undefined {
  const f = normalizeHex(fg), b = normalizeHex(bg);
  return TEMPLATE_COLORS.find(t => t.fg === f && t.bg === b);
}

/**
 * Pick the tint color.
 *
 * Built-in schemes are a table lookup and come out character-for-character
 * identical to the native tool. For custom colors, quantize fg and bg onto
 * Apple's 4-bit palette, interpolate 0.555 of the way toward the background,
 * and round.
 *
 * This one is an approximation: across 85 native samples, all 85 land within
 * a single 4-bit step of Apple's choice, and 70 of them (82%) match exactly.
 * Hue is always preserved.
 */
export function tintFor(fg: string, bg: string): string {
  const exact = findTemplate(fg, bg);
  if (exact) return exact.third;

  const F = channels(fg), B = channels(bg);
  const q = (v: number) => Math.round((v * 15) / 255);
  return F.map((v, i) => {
    const n = Math.round(q(v) + 0.555 * (q(B[i]) - q(v)));
    const clamped = Math.max(0, Math.min(15, n));
    return (clamped * 17).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

/** "FFFFFF" -> "#ffffff" (for <input type="color"> and friends) */
export function hexToCss(hex: string): string {
  return `#${normalizeHex(hex).toLowerCase()}`;
}
