/**
 * Build the oracle fixture using Apple's own AppClipCodeGenerator.
 *
 * Runs only on macOS with /usr/local/bin/AppClipCodeGenerator installed. The
 * output is committed to the repo, so CI and every other machine can run the
 * tests without that tool.
 *
 *   node scripts/gen-oracle.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = "AppClipCodeGenerator";

/**
 * Covers every compression path, plus every shape that has ever encoded
 * wrong: template words, wordbook words, LEB128 numbers, queries (including
 * path and query together), all three host formats, subdomains, fragments,
 * root paths, and arcs that wrap past 0 degrees.
 */
const URLS = [
  "https://appclip.apple.com/id?p=com.example.app",
  "https://oru.okuso.uk/su",
  "https://oru.okuso.uk/sv",
  "https://oru.okuso.uk/st",
  "https://a.co/p",
  "https://go.co/p/123",
  "https://example.com/menu",
  "https://example.com/order",
  "https://example.com/shop/42",
  "https://example.com/p/1234567",
  "https://example.org/cart",
  "https://example.net/checkout",
  "https://ex.app/product/9",
  "https://ex.io/x",
  "https://shop.example.com/item?p=7",
  "https://m.example.de/store",
  "https://q.example.jp/food",
  "https://example.com/a/b/c",
  "https://example.com/search?p=shoes",
  "https://t.co/gift",

  // host format 1 (8-bit TLD index)
  "https://ex.io/x", "https://ex.app/product/9", "https://a.ch/events", "https://m.clip.work/x",
  // host format 2 (whole host through Huffman) — on a length tie with
  // format 0/1, native picks 2
  "https://go.us/hotels?p=904", "https://www.abc.ca/more", "https://m.abc.cn/today/payments",
  "https://www.shop.ch/content/21241",
  // path and query together
  "https://a.co/x?a=1&b=2", "https://a.co/x?a=0&b=2", "https://a.co/x?a=30&b=payment",
  "https://a.co/x?a=1&b=2&c=3", "https://a.co/x?ab=cd&ef=gh", "https://a.co/x?a=&b=2",
  "https://m.go.cn/x?a=0&b=recipe", "https://m.clip.work/x?a=10&b=store-locator",
  // root path, trailing slash, fragment
  "https://a.co/", "https://a.co/a/", "https://a.co/?a=1", "https://a.co/#x", "https://a.co/x#f",
  // three wordbook entries whose indices are easy to get off by one
  "https://a.co/data", "https://a.co/store-locator", "https://a.co/item_id/9",
  // LEB128 boundaries
  "https://a.co/127", "https://a.co/128", "https://a.co/16383", "https://a.co/16384",
  "https://a.co/p/2097151",
  // subdomain
  "https://appclip.a.no/compare/88252", "https://appclip.clip.plus/id", "https://www.m.hu/rewards/tours/844",
];

/** The color paths: the built-in templates plus a few custom pairs. */
const COLOR_CASES = [
  ...Array.from({ length: 18 }, (_, index) => ({ index })),
  { foreground: "000000", background: "FFFFFF" },
  { foreground: "123456", background: "FFFFFF" },
  { foreground: "800000", background: "FFEEDD" },
  { foreground: "FFFFFF", background: "123456" },
];

const dir = mkdtempSync(join(tmpdir(), "appclip-oracle-"));
const svgPath = join(dir, "out.svg");

function runNative(args) {
  execFileSync(TOOL, [...args, "--output", svgPath], { stdio: ["ignore", "ignore", "pipe"] });
  return readFileSync(svgPath, "utf8");
}

/**
 * Flatten each ring to one line: "color:end,end;color:end,end;…".
 * Native draws backwards with sweep=0 and we draw forwards with sweep=1 —
 * the same arc either way, so sort the endpoints before comparing.
 * This function must stay exactly in step with ringSignatures() in
 * test/helpers.ts.
 */
function extractRings(svg) {
  const markers = svg.slice(svg.indexOf('<g id="Markers"'));
  return [...markers.matchAll(/<g name="ring-\d"[^>]*>([\s\S]*?)<\/g>/g)].map(([, body]) =>
    [...body.matchAll(
      /<path d="M ([\d.-]+) ([\d.-]+) A ([\d.-]+) [\d.-]+ 0 \d \d ([\d.-]+) ([\d.-]+)"[^>]*data-color="(\d)"/g
    )]
      .map(m => {
        const ends = [[+m[1], +m[2]], [+m[4], +m[5]]]
          .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)
          .sort();
        return `${m[6]}@${Number(m[3]).toFixed(4)}:${ends.join("|")}`;
      })
      .join(";")
  );
}

const strokeColors = svg =>
  [...new Set([...svg.matchAll(/stroke:#([0-9a-f]{6})/g)].map(m => m[1].toUpperCase()))].sort();

const cases = [];
try {
  for (const url of URLS) {
    const svg = runNative(["generate", "--url", url, "--index", "1", "--logo", "none"]);
    cases.push({ url, rings: extractRings(svg) });
  }

  const colors = COLOR_CASES.map(c => {
    const args = c.index !== undefined
      ? ["--index", String(c.index)]
      : ["--foreground", c.foreground, "--background", c.background];
    const svg = runNative(["generate", "--url", "https://oru.okuso.uk/su", ...args, "--logo", "none"]);
    const bg = svg.match(/id="Background"[^>]*fill:#([0-9a-f]{6})/)[1].toUpperCase();
    const strokes = strokeColors(svg).filter(c2 => c2 !== bg);
    return { ...c, background: bg, strokes };
  });

  const version = execFileSync(TOOL, ["--version"], { encoding: "utf8" }).trim();
  writeFileSync(
    "test/fixtures/oracle.json",
    JSON.stringify({ generator: version, tool: TOOL, cases, colors }, null, 2) + "\n"
  );
  console.log(`test/fixtures/oracle.json — ${cases.length} URLs, ${colors.length} color cases (${version})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
