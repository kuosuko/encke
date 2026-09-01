/**
 * Pack -> genuinely install into a clean project -> exercise every entry
 * point.
 *
 * The unit tests run against the source tree, so they structurally cannot
 * catch packaging problems: the exports map, bin, dist/'s path relative to
 * data/, and the self-referencing import("encke/tables") all only resolve
 * once the package is actually sitting in node_modules.
 *
 *   npm run test:pack
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "appclip-smoke-"));
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

const checks = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: (e.stderr || e.message || "").toString().trim().split("\n").slice(-3).join(" ") });
  }
};

try {
  // Build first. A stale or half-finished dist/ packs a tarball with files
  // missing, every check then blows up, and it reads as broken entry points
  // when all that happened is an empty shell got packed.
  console.log("building…");
  run("npm", ["run", "build"], { cwd: repo });

  console.log("packing…");
  run("npm", ["pack", "--pack-destination", work, "--silent"], { cwd: repo });
  const tarball = join(work, readdirSync(work).find(f => f.endsWith(".tgz")));

  const app = join(work, "app");
  run("mkdir", ["-p", app]);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "smoke", version: "1.0.0", type: "module", private: true }));
  console.log("installing…");
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", tarball, "react@^19", "react-dom@^19"], { cwd: app });

  const script = (name, body) => {
    writeFileSync(join(app, name), body);
    return run("node", [name], { cwd: app }).trim();
  };

  check("ESM entry (node condition)", () =>
    script("a.mjs", `
      import { generateAppClipCode, estimatePayloadBits, checkColors } from "encke";
      const r = generateAppClipCode({ url: "https://oru.okuso.uk/su", templateIndex: 11 });
      if (r.rawBits.length !== 65) throw new Error("bits " + r.rawBits.length);
      if (r.colors.tint !== "88DDCC") throw new Error("tint " + r.colors.tint);
      if (!estimatePayloadBits("https://a.co/p").willFit) throw new Error("estimate");
      if (checkColors("777777", "888888").ok) throw new Error("checkColors let a dead pair through");
      console.log(r.arcCount + " arcs, tint " + r.colors.tint);
    `));

  check("CJS entry (require)", () =>
    script("b.cjs", `
      const { generateAppClipCode } = require("encke");
      console.log(generateAppClipCode({ url: "https://a.co/p" }).arcCount + " arcs");
    `).replace(/^/, ""));

  check("./react — server render", () =>
    script("c.mjs", `
      import React from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { AppClipCode, AppClipCodeImg } from "encke/react";
      const html = renderToStaticMarkup(React.createElement(AppClipCode, { url: "https://oru.okuso.uk/su", templateIndex: 11, width: 220 }));
      if (!html.includes("<svg")) throw new Error("no svg — the react subpath never registered the Node tables");
      if (!html.includes("#88DDCC")) throw new Error("no tint");
      if (!/width:\\s*220px/.test(html)) throw new Error("width dropped");
      const img = renderToStaticMarkup(React.createElement(AppClipCodeImg, { url: "https://a.co/p" }));
      if (!img.includes("data:image/svg+xml")) throw new Error("no data URL");
      console.log("svg + data URL ok");
    `));

  check("./handler — HTTP endpoint", () =>
    script("f.mjs", `
      import { createHandler } from "encke/handler";
      const handler = createHandler({ allowedHosts: ["oru.okuso.uk"] });

      const ok = await handler(new Request("https://x/?url=https%3A%2F%2Foru.okuso.uk%2Fsu&index=11&size=256"));
      if (ok.status !== 200) throw new Error("status " + ok.status + " — the handler subpath never registered the Node tables");
      const svg = await ok.text();
      if (!svg.includes("#88DDCC")) throw new Error("no tint");
      if (!svg.includes('width="256"')) throw new Error("size dropped");
      if (!ok.headers.get("etag")) throw new Error("no etag");

      const blocked = await handler(new Request("https://x/?url=https%3A%2F%2Fevil.com%2Fa"));
      if (blocked.status !== 400) throw new Error("allowedHosts let evil.com through");

      console.log("svg + etag + host allowlist ok");
    `));

  check("./tables subpath", () =>
    script("d.mjs", `
      import { decodeEmbeddedTables } from "encke/tables";
      const t = await decodeEmbeddedTables();
      if (t.h.length !== 121758) throw new Error("h " + t.h.length);
      console.log("h/spq/cpq " + [t.h, t.spq, t.cpq].map(x => x.length).join("/"));
    `));

  check("browser path — self-referencing dynamic import", () =>
    script("e.mjs", `
      import { compressBits, resetTrieTables, loadTables, hasTrieTables } from "encke";
      const fromDisk = compressBits("https://example.com/search?p=shoes");
      resetTrieTables();
      if (hasTrieTables()) throw new Error("reset did nothing");
      await loadTables();
      if (compressBits("https://example.com/search?p=shoes") !== fromDisk) throw new Error("embedded tables disagree with the files");
      console.log("embedded tables match the filesystem tables");
    `));

  check("CLI bin", () => {
    const bin = join(app, "node_modules", ".bin", "encke");
    const templates = run(bin, ["templates"]);
    if (!templates.includes("Tint: 88DDCC")) throw new Error("templates output");
    const estimate = run(bin, ["estimate", "--url", "https://oru.okuso.uk/menu"]).trim();
    const svg = run(bin, ["--url", "https://oru.okuso.uk/su", "-i", "11"]);
    if (!svg.includes("#88DDCC")) throw new Error("generate output");
    return estimate;
  });
} finally {
  const width = Math.max(...checks.map(c => c.name.length));
  console.log();
  for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"}  ${c.name.padEnd(width)}  ${c.detail}`);
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} entry points work from a real install`);
  rmSync(work, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
