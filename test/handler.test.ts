import { describe, it, expect, beforeAll } from "vitest";
import { createHandler, optionsFromParams } from "../src/handler";
import { loadTables } from "../src/tables/load";

const handler = createHandler();
const get = (query: string, init?: RequestInit) =>
  handler(new Request("https://codes.example.com/" + query, init));

const OK = "?url=https%3A%2F%2Fgithub.com%2Fkuosuko%2Fencke";

beforeAll(async () => {
  await loadTables();
});

describe("createHandler", () => {
  it("returns an SVG for a valid url", async () => {
    const res = await get(OK);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("<svg ");
    expect(body).toContain('data-design="Fingerprint"');
  });

  it("caches hard and serves 304 on a matching ETag", async () => {
    const first = await get(OK);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(first.headers.get("cache-control")).toContain("immutable");

    const second = await get(OK, { headers: { "if-none-match": etag! } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("applies colours from the query", async () => {
    const body = await (await get(OK + "&foreground=FF3B30&background=ffffff")).text();
    expect(body).toContain("stroke:#FF3B30");
    expect(body).toContain("fill:#FFFFFF");
  });

  it("accepts the short colour aliases", async () => {
    const long = await (await get(OK + "&foreground=007AFF&background=FFFFFF")).text();
    const short = await (await get(OK + "&fg=007AFF&bg=FFFFFF")).text();
    expect(short).toBe(long);
  });

  it("uses a built-in template by index", async () => {
    const body = await (await get(OK + "&index=5")).text();
    expect(body).toContain("<svg ");
  });

  it("adds width/height when size is given", async () => {
    const body = await (await get(OK + "&size=512")).text();
    expect(body).toContain('width="512"');
    expect(body).toContain('height="512"');
  });

  it("keeps the aspect ratio for the lockup canvas", async () => {
    const body = await (await get(OK + "&size=900&layout=lockup")).text();
    // the viewBox is 900x1100
    expect(body).toContain('width="900"');
    expect(body).toContain('height="1100"');
  });

  it("offers a download when asked", async () => {
    const res = await get(OK + "&download=1");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="appclip-/);
  });

  it("sends a HEAD response with headers but no body", async () => {
    const res = await get(OK, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBeTruthy();
    expect(await res.text()).toBe("");
  });

  it("answers preflight", async () => {
    const res = await get(OK, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("rejects non-GET methods", async () => {
    const res = await get(OK, { method: "POST" });
    expect(res.status).toBe(405);
  });
});

describe("input validation", () => {
  const bad = async (query: string) => (await get(query)).status;

  it("400s without a url", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing "url"/);
  });

  it("400s on non-https", async () => {
    expect(await bad("?url=http%3A%2F%2Fexample.com")).toBe(400);
  });

  it("400s on a bad colour", async () => {
    const res = await get(OK + "&foreground=notacolour");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/hex colour/);
  });

  it("400s on an out-of-range template index", async () => {
    expect(await bad(OK + "&index=99")).toBe(400);
  });

  it("400s on a bad size", async () => {
    expect(await bad(OK + "&size=99999")).toBe(400);
  });

  it("400s on a bad layout or center", async () => {
    expect(await bad(OK + "&layout=sideways")).toBe(400);
    expect(await bad(OK + "&center=%3Cscript%3E")).toBe(400);
  });

  it("422s when the URL will not fit in 128 bits", async () => {
    const long = "https://example.com/" + "abcdefgh/".repeat(20);
    const res = await get("?url=" + encodeURIComponent(long));
    expect(res.status).toBe(422);
  });

  it("422s on colours that will not scan, and lets force through", async () => {
    const q = OK + "&foreground=BBBBBB&background=CCCCCC";
    const res = await get(q);
    expect(res.status).toBe(422);
    // Someone arriving over HTTP only has the query; do not tell them to pass a JS option
    const { error } = await res.json();
    expect(error).toContain("&force=1");
    expect(error).not.toContain("allowUnscannableColors");
    expect((await get(q + "&force=1")).status).toBe(200);
  });

  it("tells an over-long URL what to do in HTTP terms", async () => {
    const long = "https://example.com/" + "abcdefgh/".repeat(20);
    const { error } = await (await get("?url=" + encodeURIComponent(long))).json();
    expect(error).not.toContain("estimatePayloadBits()");
    expect(error).toMatch(/Shorten the domain or the path/);
  });

  it("never lets markup into the response", async () => {
    // center takes only disc/none and rejects everything else — nobody gets
    // to inject markup into an SVG we serve
    const res = await get(OK + "&center=" + encodeURIComponent("<script>alert(1)</script>"));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("<script>");
  });

  it("escapes the url it echoes into data-payload", async () => {
    // The URL goes into data-payload verbatim, so quotes and angle brackets
    // must be escaped — otherwise the query can close the attribute and
    // inject markup.
    const res = await get("?url=" + encodeURIComponent('https://ex.com/"'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('data-payload="https://ex.com/&quot;"');
    expect(body).not.toContain("<script");
  });

  it("caps the url length", async () => {
    const handler = createHandler({ maxUrlLength: 40 });
    const res = await handler(
      new Request("https://x/?url=" + encodeURIComponent("https://example.com/" + "a".repeat(60)))
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/longer than 40/);
  });
});

describe("allowedHosts", () => {
  const restricted = createHandler({ allowedHosts: ["example.com"] });
  const call = (url: string) =>
    restricted(new Request("https://x/?url=" + encodeURIComponent(url)));

  it("allows the host itself", async () => {
    expect((await call("https://example.com/a")).status).toBe(200);
  });

  it("allows subdomains", async () => {
    expect((await call("https://go.example.com/a")).status).toBe(200);
  });

  it("blocks anything else", async () => {
    const res = await call("https://evil.com/a");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not generate codes for evil.com/);
  });

  it("is not fooled by a suffix match", async () => {
    expect((await call("https://notexample.com/a")).status).toBe(400);
  });
});

describe("options", () => {
  it("applies defaults when the query omits them", () => {
    const { generate, size } = optionsFromParams(new URLSearchParams("url=https://example.com/a"), {
      defaults: { foreground: "0071e3", background: "FFFFFF", size: 256 },
    });
    expect(generate.foreground).toBe("0071e3");
    expect(size).toBe(256);
  });

  it("lets the query win over the defaults", () => {
    const { generate } = optionsFromParams(
      new URLSearchParams("url=https://example.com/a&foreground=FF3B30"),
      { defaults: { foreground: "0071e3" } }
    );
    expect(generate.foreground).toBe("FF3B30");
  });

  it("can turn CORS off", async () => {
    const noCors = createHandler({ cors: null });
    const res = await noCors(new Request("https://x/" + OK));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
