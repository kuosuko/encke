/**
 * App Clip Code generator — the public API.
 * Pipeline: URL ->(compress)-> rawBits ->(codec)-> 208 bits ->(render)-> SVG
 * 100% pure TypeScript, no Apple dependency, no Apple artwork.
 * Algorithm details in RE_NOTES.md.
 */
import { compressBits, compressedBitsToPayload } from "./compressor";
import { encodePayload, bitsToArcs, arcPath, RING_R, RING_ROT, STROKE_WIDTH } from "./codecRender";
import { createCenterG } from "./center";
import { TEMPLATE_COLORS, tintFor, normalizeHex } from "./colors";
import { assertColorsScannable } from "./colorCheck";
import { loadTables, type LoadTablesOptions } from "./tables/load";

/**
 * Center visual: "disc" is the default filled disc, "none" leaves it empty,
 * or pass your own SVG string (centered on 0,0).
 */
export type Center = string | "disc" | "none";

/**
 * Canvas layout.
 * - `code`   800x800, all code and nothing else (native `--logo none`)
 * - `lockup` -50 -50 900 1100, leaving room for a lockup below (the canvas
 *            native uses for `--logo badge`)
 * - `auto`   lockup when lockupSvg is given, otherwise code
 */
export type Layout = "auto" | "code" | "lockup";

export interface GenerateOptions {
  /** The URL to encode (a short domain serving an AASA file). */
  url: string;
  /** Foreground color (the code itself); # optional. */
  foreground?: string;
  /** Background color; # optional. */
  background?: string;
  /** Tint color (arcs with data-color="1"). Derived from the pair when omitted. */
  tint?: string;
  /** Index into the 18 built-in color templates (0-17); overrides fg/bg/tint. */
  templateIndex?: number;
  /** Center visual; defaults to "disc". */
  center?: Center;
  /** @deprecated Renamed to center. */
  logo?: Center;
  /**
   * Scale for a custom center SVG. The recognition area is 213.4486 units
   * across — see CENTER_DIAMETER.
   */
  centerScale?: number;
  /** Your own lockup below the code, in viewBox coordinates. None by default. */
  lockupSvg?: string;
  /** Canvas layout; defaults to "auto". */
  layout?: Layout;
  /**
   * Skip the scannability check on the colors. Defaults to false — the
   * native tool rejects low-contrast pairs outright and they genuinely do
   * not scan once printed, so they are blocked by default here too.
   */
  allowUnscannableColors?: boolean;
}

export interface GenerateResult {
  svg: string;
  /** The compressed URL as a bit string. */
  rawBits: string;
  /** The payload, padded to 128 bits. */
  payloadHex: string;
  arcCount: number;
  /** The three colors actually used (no leading #). */
  colors: { foreground: string; background: string; tint: string };
}

/**
 * The lockup canvas keeps native's -0.99 / -3.8 offset, so the output stays
 * point-by-point comparable with the native tool.
 */
const LOCKUP_DX = -0.99, LOCKUP_DY = -3.8;

function resolveColors(opts: GenerateOptions) {
  if (opts.templateIndex !== undefined) {
    const t = TEMPLATE_COLORS[opts.templateIndex];
    if (!t) throw new Error(`templateIndex must be 0-${TEMPLATE_COLORS.length - 1}`);
    return { foreground: t.fg, background: t.bg, tint: t.third };
  }
  const foreground = normalizeHex(opts.foreground ?? "000000");
  const background = normalizeHex(opts.background ?? "FFFFFF");
  return {
    foreground,
    background,
    tint: opts.tint ? normalizeHex(opts.tint) : tintFor(foreground, background),
  };
}

export function generateAppClipCode(opts: GenerateOptions): GenerateResult {
  const { url, centerScale = 1, lockupSvg } = opts;
  const center = opts.center ?? opts.logo ?? "disc";
  const colors = resolveColors(opts);
  if (!opts.allowUnscannableColors) assertColorsScannable(colors.foreground, colors.background);

  const layout: Exclude<Layout, "auto"> =
    !opts.layout || opts.layout === "auto" ? (lockupSvg ? "lockup" : "code") : opts.layout;
  const isLockup = layout === "lockup";
  const dx = isLockup ? LOCKUP_DX : 0;
  const dy = isLockup ? LOCKUP_DY : 0;
  const viewBox = isLockup ? "-50 -50 900 1100" : "0 0 800 800";
  const shift = isLockup ? ` transform="translate(${dx} ${dy})"` : "";

  // 1. Compress (Huffman; bit-for-bit identical to native)
  const rawBits = compressBits(url);

  // 2. Codec: payload (right-aligned) -> 208 bits
  const payload = compressedBitsToPayload(rawBits);
  const payloadHex = Array.from(payload, b => b.toString(16).padStart(2, "0")).join("");
  const bits = encodePayload(payload);

  // 3. Render: slot visibility + color stream -> arcs
  const arcs = bitsToArcs(bits);
  const byRing: string[][] = [[], [], [], [], []];
  for (const a of arcs) {
    const d = arcPath(400 + dx, 400 + dy, RING_R[a.ring], a.startDeg, a.endDeg);
    const stroke = `#${a.color === 0 ? colors.foreground : colors.tint}`;
    byRing[a.ring].push(
      `<path d="${d}" data-color="${a.color}" style="fill:none;stroke:${stroke};` +
      `stroke-linecap:round;stroke-miterlimit:10;stroke-width:${STROKE_WIDTH}px"/>`
    );
  }
  const markers = byRing
    .map((ps, i) => `<g name="ring-${i + 1}" transform="rotate(${RING_ROT[i]} 400 400)">\n${ps.join("\n")}\n</g>`)
    .join("\n");

  // 4. The center (a plain disc by default) plus the caller's own lockup
  const centerG =
    center === "none"
      ? ""
      : createCenterG(center === "disc" ? undefined : center, {
          fg: colors.foreground,
          scale: centerScale,
          cx: 400 + dx,
          cy: 400 + dy,
        });

  const svg = `<?xml version="1.0" encoding="utf-8"?>
<svg data-design="Fingerprint" data-payload="${escapeAttr(url)}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
    <title>App Clip Code</title>
    <circle cx="400" cy="400" id="Background" r="400" style="fill:#${colors.background}"${shift}/>
    <g id="Markers"${shift}>
        ${markers}
    </g>
    ${centerG}
    ${lockupSvg?.trim() ?? ""}
</svg>`;

  return { svg, rawBits, payloadHex, arcCount: arcs.length, colors };
}

export function generateDataURL(opts: GenerateOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(generateAppClipCode(opts).svg)}`;
}

/**
 * Convenience wrapper for browsers / Workers: make sure the Huffman tables
 * are loaded, then generate. Under Node loadTables() just reads the package's
 * data/ directory, so the two behave the same.
 */
export async function generateAppClipCodeAsync(
  opts: GenerateOptions & { tables?: LoadTablesOptions }
): Promise<GenerateResult> {
  await loadTables(opts.tables);
  return generateAppClipCode(opts);
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
