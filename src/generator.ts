/**
 * App Clip Code 生成器 — 公開 API
 * 管線：URL →(壓縮)→ rawBits →(codec)→ 208 bits →(render)→ SVG
 * 100% 純 TypeScript、零 Apple 依賴、零 Apple 美術資產。
 * 演算法細節見 RE_NOTES.md。
 */
import { compressBits, compressedBitsToPayload } from "./compressor";
import { encodePayload, bitsToArcs, arcPath, RING_R, RING_ROT, STROKE_WIDTH } from "./codecRender";
import { createCenterG } from "./center";
import { TEMPLATE_COLORS, tintFor, normalizeHex } from "./colors";
import { assertColorsScannable } from "./colorCheck";
import { loadTables, type LoadTablesOptions } from "./tables/load";

/** 中心視覺："disc" = 預設實心圓盤，"none" = 留空，或自訂 SVG 字串（以 0,0 為中心）。 */
export type Center = string | "disc" | "none";

/**
 * 畫布配置。
 * - `code`   800×800，整張都是環碼（對應原生 `--logo none`）
 * - `lockup` -50 -50 900 1100，下方留出品牌條空間（對應原生 `--logo badge` 的畫布）
 * - `auto`   有 lockupSvg 就用 lockup，否則用 code
 */
export type Layout = "auto" | "code" | "lockup";

export interface GenerateOptions {
  /** 要編碼的網址（需掛 AASA 的短網域） */
  url: string;
  /** 前景色（環碼），# 可省略 */
  foreground?: string;
  /** 背景色，# 可省略 */
  background?: string;
  /** 輔助色（data-color="1" 的弧）。不給就依配色自動推導。 */
  tint?: string;
  /** 內建 18 種配色模板索引（0-17），覆蓋 fg/bg/tint */
  templateIndex?: number;
  /** 中心視覺，預設 "disc" */
  center?: Center;
  /** @deprecated 改名為 center */
  logo?: Center;
  /** 自訂中心 SVG 的縮放（識別區建議直徑 ≈ 210 units） */
  centerScale?: number;
  /** 環碼下方的自有品牌條（你的 SVG，座標同 viewBox）— 預設無 */
  lockupSvg?: string;
  /** 畫布配置，預設 "auto" */
  layout?: Layout;
  /**
   * 跳過配色可掃描性檢查。預設 false —— 對比不足的配色原生工具會直接拒絕，
   * 印出來也掃不到，所以預設擋下來。
   */
  allowUnscannableColors?: boolean;
}

export interface GenerateResult {
  svg: string;
  /** 壓縮後的 URL 位元字串 */
  rawBits: string;
  /** 補到 128 bit 的 payload */
  payloadHex: string;
  arcCount: number;
  /** 實際用到的三個顏色（不含 #） */
  colors: { foreground: string; background: string; tint: string };
}

/** lockup 版畫布沿用原生的 -0.99 / -3.8 位移，方便跟原生輸出逐點比對。 */
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

  // 1. 壓縮（Huffman，與原生逐位一致）
  const rawBits = compressBits(url);

  // 2. codec：payload（右對齊）→ 208 bits
  const payload = compressedBitsToPayload(rawBits);
  const payloadHex = Array.from(payload, b => b.toString(16).padStart(2, "0")).join("");
  const bits = encodePayload(payload);

  // 3. render：slot 可見性 + 顏色流 → 弧線
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

  // 4. 中心（預設純色圓盤）+ 使用者自帶 lockup
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
 * 瀏覽器 / Workers 用的方便版：先確保 Huffman 表載好，再生成。
 * Node 下 loadTables() 是 no-op，兩者行為一致。
 */
export async function generateAppClipCodeAsync(
  opts: GenerateOptions & { tables?: LoadTablesOptions }
): Promise<GenerateResult> {
  await loadTables(opts.tables);
  return generateAppClipCode(opts);
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
