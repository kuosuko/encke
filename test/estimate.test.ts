import { describe, it, expect } from "vitest";
import { estimatePayloadBits, compressBits, PAYLOAD_LIMIT_BITS } from "../src/node";

describe("estimatePayloadBits", () => {
  it("reports the real bit count for URLs that fit", () => {
    const e = estimatePayloadBits("https://oru.okuso.uk/su");
    expect(e.bits).toBe(compressBits("https://oru.okuso.uk/su").length);
    expect(e.willFit).toBe(true);
    expect(e.headroom).toBe(PAYLOAD_LIMIT_BITS - e.bits!);
    expect(e.reason).toBeUndefined();
  });

  it("reports overflow instead of throwing", () => {
    const e = estimatePayloadBits("https://very-long-subdomain.example.com/a/very/long/path?with=query&and=more");
    expect(e.willFit).toBe(false);
    expect(e.bits).toBeGreaterThan(PAYLOAD_LIMIT_BITS);
    expect(e.headroom).toBeLessThan(0);
    expect(e.reason).toMatch(/over the limit/);
  });

  it("reports unencodable URLs instead of throwing", () => {
    const e = estimatePayloadBits("http://a.co/p");
    expect(e).toMatchObject({ bits: null, headroom: null, willFit: false });
    expect(e.reason).toMatch(/https/i);
  });

  it("shows short hosts and paths are cheaper", () => {
    const short = estimatePayloadBits("https://a.co/p").bits!;
    const long = estimatePayloadBits("https://a.co/products/category/item").bits!;
    expect(short).toBeLessThan(long);
  });
});
