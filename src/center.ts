/**
 * 中心視覺層 — 100% 原創，不含任何 Apple 美術資產。
 *
 * 原生把相機圖示畫在直徑約 210 units 的識別區裡（translate 293.2757 + scale 1.874）。
 * 那個圖示是 Apple 的商標，我們不重製；預設給一個中性的實心圓盤，
 * 使用者要換成自己的品牌就傳 SVG 進來。
 */

/** 識別區建議直徑（units）。相機需要一塊夠大的高對比實心區塊才鎖得住。 */
export const CENTER_DIAMETER = 210;

export interface CenterOptions {
  fg?: string;
  scale?: number;
  radius?: number;
  cx?: number;
  cy?: number;
}

export function createCenterG(centerSvg: string | undefined, opts: CenterOptions = {}): string {
  const { fg = "000000", scale = 1, radius = CENTER_DIAMETER / 2, cx = 400, cy = 400 } = opts;
  const inner = centerSvg?.trim() ?? `<circle cx="0" cy="0" r="${radius}" style="fill:#${fg}"/>`;
  return `<g id="Center" transform="translate(${cx} ${cy}) scale(${scale})">\n${inner}\n</g>`;
}
