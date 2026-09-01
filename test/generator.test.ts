import { describe, it, expect } from "vitest";
import {
  generateAppClipCode,
  generateDataURL,
  generateAppClipCodeAsync,
  TEMPLATE_COLORS,
  RING_SLOTS,
  CENTER_DIAMETER,
} from "../src/node";

const URL = "https://oru.okuso.uk/su";

describe("generateAppClipCode", () => {
  it("returns a self-contained SVG plus the debug fields", () => {
    const r = generateAppClipCode({ url: URL });
    expect(r.svg).toMatch(/^<\?xml/);
    expect(r.svg).toContain("</svg>");
    expect(r.svg).not.toMatch(/https?:\/\/[^"]*\.(png|svg|css|js)/); // no external resources
    expect(r.rawBits).toMatch(/^[01]+$/);
    expect(r.payloadHex).toHaveLength(32);
    expect(r.arcCount).toBeGreaterThan(0);
  });

  it("never draws more arcs than there are slots", () => {
    const total = RING_SLOTS.reduce((a, b) => a + b, 0);
    expect(generateAppClipCode({ url: URL }).arcCount).toBeLessThanOrEqual(total);
  });

  it("applies template colors and reports them", () => {
    const r = generateAppClipCode({ url: URL, templateIndex: 11 });
    expect(r.colors).toEqual({ foreground: "00A6A1", background: "FFFFFF", tint: "88DDCC" });
    expect(r.svg).toContain("#00A6A1");
    expect(r.svg).toContain("#88DDCC");
    expect(r.svg).not.toContain("#888888");
  });

  it("derives a tint for custom colors instead of hardcoding gray", () => {
    const r = generateAppClipCode({ url: URL, foreground: "123456", background: "FFFFFF" });
    expect(r.colors.tint).not.toBe("888888");
    expect(r.svg).toContain(`#${r.colors.tint}`);
  });

  it("honours an explicit tint", () => {
    const r = generateAppClipCode({ url: URL, foreground: "000000", background: "FFFFFF", tint: "#abc" });
    expect(r.colors.tint).toBe("AABBCC");
  });

  it("rejects an out-of-range templateIndex", () => {
    expect(() => generateAppClipCode({ url: URL, templateIndex: 18 })).toThrow(/0-17/);
    expect(TEMPLATE_COLORS).toHaveLength(18);
  });

  it("blocks unscannable colors unless told otherwise", () => {
    const opts = { url: URL, foreground: "777777", background: "888888" };
    expect(() => generateAppClipCode(opts)).toThrow(/will not scan/);
    expect(() => generateAppClipCode({ ...opts, allowUnscannableColors: true })).not.toThrow();
  });
});

describe("layout", () => {
  it("defaults to a tight 800x800 canvas with no lockup", () => {
    expect(generateAppClipCode({ url: URL }).svg).toContain('viewBox="0 0 800 800"');
  });

  it("switches to the taller canvas when a lockup is supplied", () => {
    const r = generateAppClipCode({ url: URL, lockupSvg: "<text>brand</text>" });
    expect(r.svg).toContain('viewBox="-50 -50 900 1100"');
    expect(r.svg).toContain("<text>brand</text>");
  });

  it("can be forced either way", () => {
    expect(generateAppClipCode({ url: URL, layout: "lockup" }).svg).toContain('viewBox="-50 -50 900 1100"');
    expect(generateAppClipCode({ url: URL, layout: "code", lockupSvg: "<g/>" }).svg).toContain('viewBox="0 0 800 800"');
  });
});

describe("center", () => {
  it("draws a solid disc by default", () => {
    expect(generateAppClipCode({ url: URL }).svg).toMatch(/<g id="Center"[\s\S]*<circle/);
  });
  it('omits it for "none"', () => {
    expect(generateAppClipCode({ url: URL, center: "none" }).svg).not.toContain('id="Center"');
  });
  it("inlines a custom SVG and scales it", () => {
    const r = generateAppClipCode({ url: URL, center: '<rect id="mine"/>', centerScale: 0.5 });
    expect(r.svg).toContain('<rect id="mine"/>');
    expect(r.svg).toContain("scale(0.5)");
  });
  it("sizes the identification circle exactly like the native tool", () => {
    // Measured from native output:
    //   <g id="Logo" transform="translate(293.275699 293.275699) scale(1.874)">
    // wrapped around a shape 113.9000015 wide. This size is a scanning spec,
    // not an aesthetic choice — an earlier value of 210 left the center
    // 1.64% too small.
    expect(CENTER_DIAMETER).toBeCloseTo(113.9000015 * 1.874, 3);
    // and it has to land exactly at the canvas center
    expect(293.275699 + CENTER_DIAMETER / 2).toBeCloseTo(400, 3);
  });

  it("clips custom artwork to the identification circle", () => {
    // Content spilling out of the recognition area covers the code's arcs, killing the code
    const r = generateAppClipCode({ url: URL, center: '<rect x="-9999" y="-9999" width="19998" height="19998"/>' });
    const radius = CENTER_DIAMETER / 2;
    expect(r.svg).toContain(`<circle cx="0" cy="0" r="${radius}"/>`);
    expect(r.svg).toMatch(/<clipPath id="acc-center-[a-z0-9]+">/);
    expect(r.svg).toMatch(/clip-path="url\(#acc-center-[a-z0-9]+\)"/);
  });

  it("gives identical artwork the same clip id, and different artwork a different one", () => {
    const idOf = (svg: string) => svg.match(/acc-center-([a-z0-9]+)/)![1];
    const a = generateAppClipCode({ url: URL, center: "<rect/>" }).svg;
    const b = generateAppClipCode({ url: URL, center: "<rect/>" }).svg;
    const c = generateAppClipCode({ url: URL, center: "<circle/>" }).svg;
    expect(idOf(a)).toBe(idOf(b));
    expect(idOf(a)).not.toBe(idOf(c));
  });

  it("does not clip the default disc, which is already inside", () => {
    expect(generateAppClipCode({ url: URL }).svg).not.toContain("clipPath");
  });

  it("accepts the deprecated logo alias", () => {
    expect(generateAppClipCode({ url: URL, logo: "none" }).svg).not.toContain('id="Center"');
    // center wins over logo
    expect(generateAppClipCode({ url: URL, center: "none", logo: "disc" }).svg).not.toContain('id="Center"');
  });
});

describe("escaping", () => {
  it("escapes the payload attribute", () => {
    const r = generateAppClipCode({ url: "https://a.co/x?a=1&b=2" });
    expect(r.svg).toContain('data-payload="https://a.co/x?a=1&amp;b=2"');
  });
});

describe("generateDataURL / generateAppClipCodeAsync", () => {
  it("produces an inline-able data URL", () => {
    const url = generateDataURL({ url: URL });
    expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(url.slice(24))).toContain("</svg>");
  });

  it("works without pre-loading tables", async () => {
    const r = await generateAppClipCodeAsync({ url: URL });
    expect(r.svg).toContain("</svg>");
  });
});
