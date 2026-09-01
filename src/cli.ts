#!/usr/bin/env node
/**
 * encke CLI — the flags deliberately mirror Apple's own
 * AppClipCodeGenerator, so existing scripts can swap one for the other.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { registerNodeTables } from "./tables/node";
import { generateAppClipCode, type Center, type Layout } from "./generator";
import { estimatePayloadBits } from "./estimate";
import { TEMPLATE_COLORS } from "./colors";
import { checkColors, suggestColors } from "./colorCheck";
import { createHandler } from "./handler";

registerNodeTables();

const USAGE = `encke — App Clip Code generator (pure TypeScript)

Usage:
  encke --url URL [--output FILE] [options]
  encke serve [--port N] [--host ADDR] [--hosts a.com,b.com]
  encke templates
  encke estimate --url URL
  encke check --foreground HEX --background HEX

Options:
  -u, --url URL             URL to encode (https, must fit in 128 bits)
  -o, --output FILE         Write SVG here (default: stdout)
  -i, --index N             Built-in color template 0-17 (overrides -f/-b)
  -f, --foreground HEX      Ring color            (default 000000)
  -b, --background HEX      Background color      (default FFFFFF)
      --tint HEX            Secondary arc color   (default: derived from -f/-b)
      --center VALUE        "disc" (default), "none", or a path to an SVG file
      --center-scale N      Scale for a custom center (default 1)
      --lockup FILE         SVG drawn under the code (implies --layout lockup)
      --layout MODE         auto | code | lockup   (default auto)
      --force               Generate even if the colors will not scan
  -h, --help                Show this help
  -v, --version             Show version

serve options:
      --port N              Port to listen on      (default 8787)
      --host ADDR           Address to bind        (default 127.0.0.1)
      --hosts a.com,b.com   Only encode URLs on these hosts (default: any)

  GET /?url=https://example.com/a&foreground=000000&background=FFFFFF&size=512
`;

type Flags = Record<string, string | boolean>;

/** serve runs forever, so main returns this to mean "do not exit". */
const KEEP_ALIVE = -1;

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const alias: Record<string, string> = {
    u: "url", o: "output", i: "index", f: "foreground", b: "background", h: "help", v: "version",
  };
  const flags: Flags = {};
  let command = "generate";
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) { rest.push(arg); continue; }
    const raw = arg.replace(/^--?/, "");
    const [name, inline] = raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, undefined];
    const key = alias[name] ?? name;
    if (inline !== undefined) { flags[key] = inline; continue; }
    const next = argv[i + 1];
    if (next && !next.startsWith("-")) { flags[key] = next; i++; } else flags[key] = true;
  }
  if (rest.length && ["templates", "estimate", "check", "generate", "serve"].includes(rest[0])) command = rest[0];
  return { command, flags };
}

/**
 * Bridge node:http requests onto the standard Web handler.
 * The same handler deployed straight to Workers / Next.js behaves
 * identically.
 */
async function serve(flags: Flags): Promise<void> {
  const { createServer } = await import("node:http");
  const port = Number(str(flags.port) ?? 8787);
  const host = str(flags.host) ?? "127.0.0.1";
  const allowedHosts = str(flags.hosts)?.split(",").map(s => s.trim()).filter(Boolean);
  const handler = createHandler({ allowedHosts });

  createServer((req, res) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    }
    const request = new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? host}`), {
      method: req.method,
      headers,
    });
    handler(request)
      .then(async response => {
        const out: Record<string, string> = {};
        response.headers.forEach((value, key) => { out[key] = value; });
        res.writeHead(response.status, out);
        res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
      })
      .catch((e: Error) => {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(e.message);
      });
  }).listen(port, host, () => {
    process.stderr.write(
      `encke serving on http://${host}:${port}/?url=https://example.com\n` +
        (allowedHosts?.length ? `  restricted to: ${allowedHosts.join(", ")}\n` : "")
    );
  });
}

const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined);

function resolveCenter(flags: Flags): Center | undefined {
  const value = str(flags.center);
  if (!value) return undefined;
  if (value === "disc" || value === "none") return value;
  return readFileSync(value, "utf8");
}

function main(argv: string[]): number {
  const { command, flags } = parseArgs(argv);

  if (flags.help || (argv.length === 0)) { process.stdout.write(USAGE); return 0; }
  if (flags.version) {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  if (command === "serve") {
    void serve(flags);
    return KEEP_ALIVE;
  }

  if (command === "templates") {
    TEMPLATE_COLORS.forEach((t, i) =>
      process.stdout.write(`Index: ${String(i).padStart(2)}  Foreground: ${t.fg}  Background: ${t.bg}  Tint: ${t.third}\n`)
    );
    return 0;
  }

  if (command === "check") {
    const fg = str(flags.foreground), bg = str(flags.background);
    if (!fg || !bg) { process.stderr.write("check needs --foreground and --background\n"); return 2; }
    const result = checkColors(fg, bg);
    process.stdout.write(
      `${result.ok ? "OK" : "NOT SCANNABLE"}  contrast ${result.contrast.toFixed(2)}:1  ` +
      `brightness delta ${result.lumaDelta.toFixed(0)}\n`
    );
    if (!result.ok) {
      process.stdout.write(`  ${result.reason}\n  try instead:\n`);
      for (const s of suggestColors(fg, bg)) process.stdout.write(`    -f ${s.fg} -b ${s.bg}\n`);
    }
    return result.ok ? 0 : 1;
  }

  const url = str(flags.url);
  if (!url) { process.stderr.write("Missing --url\n\n" + USAGE); return 2; }

  if (command === "estimate") {
    const e = estimatePayloadBits(url);
    process.stdout.write(
      e.bits === null
        ? `cannot encode: ${e.reason}\n`
        : `${e.bits} / ${e.limit} bits — ${e.willFit ? `fits, ${e.headroom} to spare` : e.reason}\n`
    );
    return e.willFit ? 0 : 1;
  }

  const lockupFile = str(flags.lockup);
  const result = generateAppClipCode({
    url,
    templateIndex: flags.index !== undefined ? Number(flags.index) : undefined,
    foreground: str(flags.foreground),
    background: str(flags.background),
    tint: str(flags.tint),
    center: resolveCenter(flags),
    centerScale: flags["center-scale"] !== undefined ? Number(flags["center-scale"]) : undefined,
    lockupSvg: lockupFile ? readFileSync(lockupFile, "utf8") : undefined,
    layout: str(flags.layout) as Layout | undefined,
    allowUnscannableColors: flags.force === true,
  });

  const output = str(flags.output);
  if (output) {
    writeFileSync(output, result.svg);
    process.stderr.write(`${output}  (${result.rawBits.length}/128 bits, ${result.arcCount} arcs)\n`);
  } else {
    process.stdout.write(result.svg + "\n");
  }
  return 0;
}

try {
  const code = main(process.argv.slice(2));
  if (code !== KEEP_ALIVE) process.exit(code); // serve needs the event loop kept alive
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
}
