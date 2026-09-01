/**
 * encke — App Clip Code generation in pure TypeScript
 *
 * Node (including the Next.js server): just call it. The Huffman tables are
 * read from the package's data/ directory automatically.
 * Browsers / Workers: `await loadTables()` first, or use
 * `generateAppClipCodeAsync()` instead.
 *
 * @example
 * import { generateAppClipCode } from "encke";
 * const { svg } = generateAppClipCode({ url: "https://oru.okuso.uk/su" });
 *
 * @example Custom center
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
  percentEncodeUnsupported,
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
