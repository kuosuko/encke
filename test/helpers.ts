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
 * Flatten each ring to one line: "color@r:end|end;…".
 * Native draws backwards with sweep=0 and we draw forwards with sweep=1 —
 * the same arc either way, so sort the endpoints before comparing.
 * Must stay exactly in step with extractRings() in scripts/gen-oracle.mjs.
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

/** Parse a sample file of three columns: "fg bg value". */
export function parseSamples(name: string): [string, string, string][] {
  return fixture(name)
    .trim()
    .split("\n")
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts.length === 3) as [string, string, string][];
}

/** "aabbcc" / "AABBCC" -> [r,g,b] */
export const rgb = (hex: string): [number, number, number] =>
  [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
