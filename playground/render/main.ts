/**
 * Image API — parameters in, one code out. The page has no interface at all;
 * it is the image.
 *
 *   /render/?url=https://example.com/a&index=11
 *   /render/?url=…&format=png&size=1024
 *   /render/?url=…&download=1
 *
 * Generation runs entirely in the browser, so this is purely static — GitHub
 * Pages or any CDN will serve it, no server involved.
 *
 * One limitation up front: nobody can point an <img src> at this, because
 * <img> does not run JavaScript. Use an <iframe> to embed it; if you genuinely
 * need <img>, you need a server, and that path is encke/handler.
 */
import { generateAppClipCode, loadTables, CENTER_DIAMETER, type Center } from "../../src/index";
import { optionsFromParams } from "../../src/handler";
import { ICONS, iconSvg, centerIconMarkup } from "../icons";
import { fitSvg } from "../components/SvgSource";
import { escapeText, download, toPng } from "../lib";

const params = new URLSearchParams(location.search);

function show(node: Node) {
  document.body.replaceChildren(node);
}

function fail(message: string) {
  const p = document.createElement("p");
  p.className = "msg";
  p.textContent = message;
  show(p);
  document.title = "encke — error";
}

/** Icon parameters specific to the playground; the HTTP endpoint has none (it accepts no artwork). */
function artwork(key: "centerIcon" | "lockupIcon", fg: string, bg: string): string | undefined {
  const id = params.get(key);
  if (!id) return undefined;
  const icon = ICONS.find(i => i.id === id);
  if (!icon) throw new Error(`Unknown icon "${id}". Try one of: ${ICONS.map(i => i.id).join(", ")}`);
  return key === "centerIcon"
    ? centerIconMarkup(icon, fg, bg, CENTER_DIAMETER / 2)
    : fitSvg(iconSvg(icon, fg), "lockup");
}

async function main() {
  if (!params.get("url") && !params.get("u")) {
    fail("Add ?url=https://example.com/path to this address and the code appears here — nothing else on the page.");
    return;
  }

  // Parameter parsing is shared with the HTTP endpoint, so the two never
  // disagree about what a query means.
  const { generate, size } = optionsFromParams(params);

  // The tables are static assets at the site root and this page lives in a
  // subdirectory, so the base has to come from BASE_URL rather than "/".
  await loadTables({ baseUrl: import.meta.env.BASE_URL });

  const fg = generate.foreground ?? "000000";
  const bg = generate.background ?? "FFFFFF";
  const wordmark = params.get("wordmark")?.trim();

  const centerIcon = artwork("centerIcon", fg, bg);
  const lockup =
    artwork("lockupIcon", fg, bg) ??
    (wordmark
      ? `<text x="400" y="985" text-anchor="middle" font-size="64" font-weight="600" fill="#${fg}" font-family="-apple-system, system-ui, sans-serif">${escapeText(wordmark)}</text>`
      : undefined);

  const center: Center = centerIcon ?? generate.center ?? "disc";
  const result = generateAppClipCode({ ...generate, center, lockupSvg: lockup });

  document.body.style.background = `#${result.colors.background}`;
  document.title = generate.url;

  const png = params.get("format") === "png";
  const wants = params.get("download");

  if (png) {
    const dataUrl = await toPng(result.svg, size ?? 1024);
    const img = new Image();
    img.src = dataUrl;
    img.alt = generate.url;
    if (size) img.width = size;
    show(img);
    if (wants) download(dataUrl, "appclip.png");
    return;
  }

  const host = document.createElement("div");
  host.innerHTML = result.svg;
  const svg = host.querySelector("svg")!;
  if (size) {
    svg.setAttribute("width", String(size));
    svg.removeAttribute("height");
  }
  show(svg);
  if (wants) {
    download(URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" })), "appclip.svg");
  }
}

main().catch((e: Error) => fail(e.message));
