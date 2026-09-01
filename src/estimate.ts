/**
 * Will this URL fit in a code? — ask before actually generating one.
 */
import { compressBitsUnchecked, PAYLOAD_LIMIT_BITS } from "./compressor";

export interface PayloadEstimate {
  /** Bits after compression; null when the URL cannot be encoded at all. */
  bits: number | null;
  /** The limit, always 128. */
  limit: number;
  /** Bits left over; negative means it overflows. null when not encodable. */
  headroom: number | null;
  willFit: boolean;
  /** Why, when willFit is false. */
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
