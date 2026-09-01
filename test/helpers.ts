import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

export interface Oracle {
  generator: string;
  cases: { url: string; rings: string[] }[];
  colors: { index?: number; foreground?: string; background: string; strokes: string[] }[];
}

export const oracle: Oracle = JSON.parse(fixture("oracle.json"));

/**
 * 每個 ring 壓成一行 "color@r:end|end;…"。
 * 原生用 sweep=0 反向畫、我們用 sweep=1 正向畫 —— 同一段弧，所以端點排序後再比。
 * 必須與 scripts/gen-oracle.mjs 的 extractRings() 完全一致。
 */
export function ringSignatures(svg: string): string[] {
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

/** 解析 "fg bg value" 三欄的取樣檔。 */
export function parseSamples(name: string): [string, string, string][] {
  return fixture(name)
    .trim()
    .split("\n")
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts.length === 3) as [string, string, string][];
}

/** "aabbcc" / "AABBCC" → [r,g,b] */
export const rgb = (hex: string): [number, number, number] =>
  [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
