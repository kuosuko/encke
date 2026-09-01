/**
 * encke — 純 TypeScript 的 App Clip Code 生成器
 *
 * Node（含 Next.js server）：直接用，Huffman 表會自動從套件的 data/ 讀進來。
 * 瀏覽器 / Workers：先 `await loadTables()`，或改用 `generateAppClipCodeAsync()`。
 *
 * @example
 * import { generateAppClipCode } from "encke";
 * const { svg } = generateAppClipCode({ url: "https://oru.okuso.uk/su" });
 *
 * @example 自訂中心
 * const { svg } = generateAppClipCode({
 *   url: "https://oru.okuso.uk/su",
 *   center: `<circle cx="0" cy="0" r="90" fill="#007AFF"/>`,
 * });
 */

export {
  TEMPLATE_COLORS,
  tintFor,
  findTemplate,
  normalizeHex,
  hexToCss,
  type ColorTemplate,
} from "./colors";
export {
  checkColors,
  contrastRatio,
  suggestColors,
  assertColorsScannable,
  MIN_CONTRAST_RATIO,
  MIN_LUMA_DELTA,
  type ColorCheck,
} from "./colorCheck";
export {
  compressBits,
  compressURL,
  compressBitsUnchecked,
  compressedBitsToPayload,
  PAYLOAD_LIMIT_BITS,
  setTrieData,
} from "./compressor";
export { estimatePayloadBits, type PayloadEstimate } from "./estimate";
export { encodePayload, bitsToArcs, arcPath, RING_SLOTS, RING_R, RING_ROT, HALF_GAP, STROKE_WIDTH } from "./codecRender";
export { createCenterG, CENTER_DIAMETER, type CenterOptions } from "./center";
export {
  generateAppClipCode,
  generateDataURL,
  generateAppClipCodeAsync,
  type GenerateOptions,
  type GenerateResult,
  type Center,
  type Layout,
} from "./generator";
export { loadTables, type LoadTablesOptions } from "./tables/load";
export {
  setTrieTables,
  hasTrieTables,
  resetTrieTables,
  TablesNotLoadedError,
  type TrieTables,
} from "./tables/registry";

export { generateAppClipCode as generate } from "./generator";
