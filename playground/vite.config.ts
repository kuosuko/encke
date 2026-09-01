import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createReadStream, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const TABLES = ["h", "spq", "cpq"];

/**
 * og:image has to be an absolute URL for crawlers to fetch it, and the domain
 * is only known at deploy time — so PLAYGROUND_SITE fills it in at build.
 * Unset, it falls back to a relative path: fine locally, and most crawlers
 * still resolve it, but that is not guaranteed.
 */
function socialCard(): Plugin {
  const site = (process.env.PLAYGROUND_SITE ?? "").replace(/\/$/, "");
  return {
    name: "encke-social-card",
    transformIndexHtml: {
      order: "pre",
      handler: html => html.replaceAll("__SITE__", site),
    },
  };
}

/**
 * Serve the package's Huffman tables as static assets.
 *
 * They live in ../data, outside the playground, and there can be only one
 * publicDir — that slot goes to the playground's own assets (og image, favicon).
 */
function tables(): Plugin {
  let outDir = "";
  return {
    name: "encke-tables",
    configResolved(config) {
      // outDir is relative to the vite root. Joining it directly writes under
      // process.cwd() instead — that is the package's own dist/, which npm
      // would then ship.
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/(h|spq|cpq)\.data(\?|$)/)?.[1];
        if (!name) return next();
        res.setHeader("content-type", "application/octet-stream");
        createReadStream(join(DATA_DIR, `${name}.data`)).pipe(res);
      });
    },
    closeBundle() {
      for (const name of TABLES) {
        copyFileSync(join(DATA_DIR, `${name}.data`), join(outDir, `${name}.data`));
      }
    },
  };
}

/**
 * The playground is purely static: all generation happens in the browser, so a
 * build is just a pile of files that GitHub Pages or any CDN can serve. There
 * is no server-side piece.
 *
 * dev and build take the same path, so there is no "works locally, 404s in
 * production" gap. Wanting <img src> or wget to fetch the image is a different
 * problem — that needs a server, and that path is encke/handler.
 */
export default defineConfig({
  // Root for a custom domain; set PLAYGROUND_BASE=/repo/ for user.github.io/repo
  base: process.env.PLAYGROUND_BASE ?? "/",
  plugins: [react(), tables(), socialCard()],
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: {
      "@sz.ws/encke/tables": fileURLToPath(new URL("../src/tables/embedded.ts", import.meta.url)),
    },
  },
  // Two pages: index is the editor, render is the image API (parameters in, a
  // full-page code out, no interface).
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        render: fileURLToPath(new URL("./render/index.html", import.meta.url)),
      },
    },
  },
  server: { port: 5199 },
});
