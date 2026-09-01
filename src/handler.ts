/**
 * HTTP endpoint — turn a query string straight into an App Clip Code.
 *
 * It takes a standard Web Request and returns a standard Web Response, so
 * the same code runs unchanged on Cloudflare Workers, a Next.js route
 * handler, Deno and Bun. On Node, use `encke serve` or wire it to node:http
 * yourself.
 *
 * @example Cloudflare Workers
 * import { createHandler } from "encke/handler";
 * export default { fetch: createHandler() };
 *
 * @example Next.js app/code/route.ts
 * import { createHandler } from "encke/handler";
 * export const GET = createHandler({ allowedHosts: ["example.com"] });
 *
 * URLs look like this:
 *   /?url=https://example.com/a&foreground=000000&background=FFFFFF&size=512
 */
import { generateAppClipCode, type GenerateOptions, type Layout } from "./generator";
import { loadTables, type LoadTablesOptions } from "./tables/load";
import { hasTrieTables } from "./tables/registry";
import { TEMPLATE_COLORS, normalizeHex } from "./colors";

export interface HandlerOptions {
  /** Used when the query does not supply them. */
  defaults?: {
    foreground?: string;
    background?: string;
    tint?: string;
    templateIndex?: number;
    center?: "disc" | "none";
    layout?: Layout;
    /**
     * Output width/height in px. Omit it and only the viewBox is set,
     * leaving the sizing to the caller.
     */
    size?: number;
  };
  /**
   * Only encode URLs on these hosts (subdomains included).
   * Worth setting on a public endpoint — without it you are generating codes
   * that point at anyone else's site, for free.
   */
  allowedHosts?: readonly string[];
  /** Immutable for a year by default: the same query always yields the same image. */
  cacheControl?: string;
  /** Access-Control-Allow-Origin; defaults to "*". Pass null to omit the header. */
  cors?: string | null;
  /**
   * Passed to loadTables(); useful when a Worker serves the tables from its
   * own static assets.
   */
  tables?: LoadTablesOptions;
  /** Maximum URL length; defaults to 512. */
  maxUrlLength?: number;
}

export type FetchHandler = (request: Request) => Promise<Response>;

/** Errors that map to a 400; anything else is treated as a 500. */
class BadRequest extends Error {}

const MAX_SIZE = 4096;
const MIN_SIZE = 16;

/** The same value can arrive under a long or short name, mirroring the CLI flags. */
function pick(params: URLSearchParams, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function flag(params: URLSearchParams, name: string): boolean {
  const value = params.get(name);
  if (value === null) return false;
  return value === "" || !/^(0|false|no)$/i.test(value.trim());
}

function int(value: string | undefined, label: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequest(`"${label}" must be an integer between ${min} and ${max}`);
  }
  return n;
}

function colour(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeHex(value);
  } catch {
    throw new BadRequest(`"${label}" must be a hex colour like 0071e3`);
  }
}

/**
 * The host itself or any subdomain counts, so allowedHosts: ["example.com"]
 * covers a.example.com.
 */
function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some(a => {
    const base = a.toLowerCase().replace(/^\./, "");
    return host === base || host.endsWith("." + base);
  });
}

/**
 * Parse the query into generateAppClipCode arguments.
 *
 * Custom center / lockup SVG is deliberately **not** accepted from the
 * query: that would let anyone inject arbitrary markup into an SVG served
 * from your domain, and an SVG opened directly does execute scripts. For
 * custom artwork, call generateAppClipCode() from your own code.
 */
export function optionsFromParams(
  params: URLSearchParams,
  options: HandlerOptions = {}
): { generate: GenerateOptions; size?: number; download: boolean } {
  const defaults = options.defaults ?? {};

  const url = pick(params, "url", "u");
  if (!url) throw new BadRequest('Missing "url". Try ?url=https://example.com/path');

  const maxUrlLength = options.maxUrlLength ?? 512;
  if (url.length > maxUrlLength) {
    throw new BadRequest(`"url" is longer than ${maxUrlLength} characters`);
  }
  if (!/^https:\/\//i.test(url)) {
    throw new BadRequest("App Clip Code URLs must start with https://");
  }

  if (options.allowedHosts?.length) {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      throw new BadRequest(`"url" is not a valid URL`);
    }
    if (!hostAllowed(host, options.allowedHosts)) {
      throw new BadRequest(`This endpoint does not generate codes for ${host}`);
    }
  }

  const centerRaw = pick(params, "center") ?? defaults.center;
  if (centerRaw !== undefined && centerRaw !== "disc" && centerRaw !== "none") {
    throw new BadRequest('"center" must be "disc" or "none"');
  }

  const layoutRaw = pick(params, "layout") ?? defaults.layout;
  if (layoutRaw !== undefined && !["auto", "code", "lockup"].includes(layoutRaw)) {
    throw new BadRequest('"layout" must be "auto", "code" or "lockup"');
  }

  const templateIndex =
    int(pick(params, "index", "template", "i"), "index", 0, TEMPLATE_COLORS.length - 1) ??
    defaults.templateIndex;

  return {
    generate: {
      url,
      templateIndex,
      foreground: colour(pick(params, "foreground", "fg", "f"), "foreground") ?? defaults.foreground,
      background: colour(pick(params, "background", "bg", "b"), "background") ?? defaults.background,
      tint: colour(pick(params, "tint"), "tint") ?? defaults.tint,
      center: centerRaw,
      layout: layoutRaw as Layout | undefined,
      allowUnscannableColors: flag(params, "force"),
    },
    size: int(pick(params, "size"), "size", MIN_SIZE, MAX_SIZE) ?? defaults.size,
    download: flag(params, "download"),
  };
}

/** Add width/height so an <img> knows how much room to reserve before the SVG loads. */
function withSize(svg: string, size: number): string {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
  const [w, h] = viewBox?.length === 4 ? [viewBox[2], viewBox[3]] : [1, 1];
  const height = Math.round((size * h) / w);
  return svg.replace("<svg ", `<svg width="${size}" height="${height}" `);
}

/**
 * ETag derived from the content — generation is pure, so the same query is
 * always the same image.
 */
function etagOf(body: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < body.length; i++) {
    h1 = Math.imul(h1 ^ body.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 + body.charCodeAt(i), 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `"${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}"`;
}

function corsHeaders(options: HandlerOptions): Record<string, string> {
  const origin = options.cors === undefined ? "*" : options.cors;
  return origin === null ? {} : { "access-control-allow-origin": origin };
}

/**
 * The library's error messages are written for developers calling the API,
 * so they name JS options. Someone arriving over HTTP only has the query
 * string, so rewrite them in terms of the matching parameters.
 */
function httpMessage(message: string): string {
  return message
    .replace(/pass allowUnscannableColors: true/g, "add &force=1")
    .replace(/Use estimatePayloadBits\(\) to see how much you need to trim\./g, "Shorten the domain or the path.")
    .replace(/^encke: /, "");
}

function errorResponse(status: number, message: string, options: HandlerOptions): Response {
  return new Response(JSON.stringify({ error: message }, null, 2) + "\n", {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(options),
    },
  });
}

/**
 * Build a fetch handler.
 *
 * ```ts
 * const handler = createHandler({ allowedHosts: ["example.com"] });
 * export default { fetch: handler };            // Workers
 * export const GET = handler;                   // Next.js route handler
 * ```
 */
export function createHandler(options: HandlerOptions = {}): FetchHandler {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          allow: "GET, HEAD, OPTIONS",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-max-age": "86400",
          ...corsHeaders(options),
        },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(405, `${request.method} is not supported; use GET`, options);
    }

    let params: URLSearchParams;
    try {
      params = new URL(request.url).searchParams;
    } catch {
      return errorResponse(400, "Could not parse the request URL", options);
    }

    try {
      const { generate, size, download } = optionsFromParams(params, options);

      // Node registered a sync provider long before this point; this is for Workers / Deno.
      if (!hasTrieTables()) await loadTables(options.tables);

      const result = generateAppClipCode(generate);
      const body = size ? withSize(result.svg, size) : result.svg;
      const etag = etagOf(body);

      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers: { etag, ...corsHeaders(options) } });
      }

      const headers: Record<string, string> = {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": options.cacheControl ?? "public, max-age=31536000, immutable",
        etag,
        // This SVG is only ever a picture: no scripts, no external resources.
        // Nail that down in the header rather than trusting the content.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff",
        ...corsHeaders(options),
      };
      if (download) {
        headers["content-disposition"] = `attachment; filename="appclip-${result.payloadHex.slice(0, 8)}.svg"`;
      }

      return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
    } catch (e) {
      const message = httpMessage(e instanceof Error ? e.message : String(e));
      // Malformed parameters are a 400; valid parameters that cannot produce a
      // code (too long, contrast too low) are a 422.
      return errorResponse(e instanceof BadRequest ? 400 : 422, message, options);
    }
  };
}
