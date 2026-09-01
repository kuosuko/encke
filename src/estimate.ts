/**
 * URL 能不能塞進環碼？—— 在真的生成之前先問。
 */
import { compressBitsUnchecked, PAYLOAD_LIMIT_BITS } from "./compressor";

export interface PayloadEstimate {
  /** 壓縮後的位元數；URL 根本無法編碼時為 null。 */
  bits: number | null;
  /** 上限，固定 128。 */
  limit: number;
  /** 還剩多少位元（負數代表超出）。無法編碼時為 null。 */
  headroom: number | null;
  willFit: boolean;
  /** willFit 為 false 時的原因。 */
  reason?: string;
}

/**
 * ```ts
 * estimatePayloadBits("https://oru.okuso.uk/su");  // { bits: 65, willFit: true, headroom: 63 }
 * estimatePayloadBits("https://very.long.example.com/deep/path?a=1&b=2");  // { willFit: false }
 * ```
 */
export function estimatePayloadBits(url: string): PayloadEstimate {
  try {
    const bits = compressBitsUnchecked(url).length;
    const willFit = bits <= PAYLOAD_LIMIT_BITS;
    return {
      bits,
      limit: PAYLOAD_LIMIT_BITS,
      headroom: PAYLOAD_LIMIT_BITS - bits,
      willFit,
      ...(willFit ? {} : { reason: `${bits} bits, ${bits - PAYLOAD_LIMIT_BITS} over the limit` }),
    };
  } catch (e) {
    return {
      bits: null,
      limit: PAYLOAD_LIMIT_BITS,
      headroom: null,
      willFit: false,
      reason: (e as Error).message,
    };
  }
}
