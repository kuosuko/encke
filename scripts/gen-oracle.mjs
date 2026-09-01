/**
 * 用 Apple 原生 AppClipCodeGenerator 產生 oracle fixture。
 *
 * 只能在裝了 /usr/local/bin/AppClipCodeGenerator 的 macOS 上跑。產物 commit 進 repo，
 * 所以 CI 和其他機器不需要那支工具也能跑測試。
 *
 *   node scripts/gen-oracle.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = "AppClipCodeGenerator";

/**
 * 涵蓋每一條壓縮路徑，外加所有曾經編錯的形狀：
 * template word、字典詞、LEB128 數字、query（含 path+query 同時存在）、
 * 三種 host format、subdomain、fragment、root path、繞過 0 度的弧。
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

  // host format 1（8-bit TLD 索引）
  "https://ex.io/x", "https://ex.app/product/9", "https://a.ch/events", "https://m.clip.work/x",
  // host format 2（整條 host Huffman）—— 與 format 0/1 長度相同時原生選 2
  "https://go.us/hotels?p=904", "https://www.abc.ca/more", "https://m.abc.cn/today/payments",
  "https://www.shop.ch/content/21241",
  // path + query 同時存在
  "https://a.co/x?a=1&b=2", "https://a.co/x?a=0&b=2", "https://a.co/x?a=30&b=payment",
  "https://a.co/x?a=1&b=2&c=3", "https://a.co/x?ab=cd&ef=gh", "https://a.co/x?a=&b=2",
  "https://m.go.cn/x?a=0&b=recipe", "https://m.clip.work/x?a=10&b=store-locator",
  // root path、trailing slash、fragment
  "https://a.co/", "https://a.co/a/", "https://a.co/?a=1", "https://a.co/#x", "https://a.co/x#f",
  // 詞庫裡容易錯位的三個詞
  "https://a.co/data", "https://a.co/store-locator", "https://a.co/item_id/9",
  // LEB128 邊界
  "https://a.co/127", "https://a.co/128", "https://a.co/16383", "https://a.co/16384",
  "https://a.co/p/2097151",
  // subdomain
  "https://appclip.a.no/compare/88252", "https://appclip.clip.plus/id", "https://www.m.hu/rewards/tours/844",
];

/** 顏色路徑：內建模板 + 幾組自訂配色。 */
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
 * 每個 ring 壓成一行 "color:end,end;color:end,end;…"。
 * 原生用 sweep=0 反向畫、我們用 sweep=1 正向畫 —— 同一段弧，所以端點排序後再比。
 * 這個函式必須與 test/helpers.ts 的 ringSignatures() 完全一致。
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
