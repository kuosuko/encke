/**
 * encke playground
 *
 * Imports ../src directly, so what you see here is the package's own behaviour.
 * The Huffman tables come from loadTables({ baseUrl }) against the data/ files
 * vite serves — the same approach recommended in production.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import {
  CENTER_DIAMETER,
  generateAppClipCode,
  estimatePayloadBits,
  checkColors,
  suggestColors,
  tintFor,
  normalizeHex,
  hexToCss,
  loadTables,
  TEMPLATE_COLORS,
  PAYLOAD_LIMIT_BITS,
  type Center,
} from "../src/index";
import { Field } from "./components/Field";
import { Segmented } from "./components/Segmented";
import { Swatch, nameOf } from "./components/Swatch";
import { Pill } from "./components/Pill";
import { SvgSource, EMPTY_SVG, fitSvg, type Slot, type SvgValue } from "./components/SvgSource";
import { useRadioGroup } from "./components/useRadioGroup";
import { escapeText, download, toPng } from "./lib";
import { ICONS, iconSvg, centerIconMarkup } from "./icons";

/** A built-in icon stores only its id, so redraw it from the current colours each time. */
function artworkOf(value: SvgValue, slot: Slot, fg: string, bg: string): string {
  if (!value.preset) return value.markup;
  const icon = ICONS.find(i => i.id === value.preset);
  if (!icon) return "";
  return slot === "center"
    ? centerIconMarkup(icon, fg, bg, CENTER_DIAMETER / 2)
    : fitSvg(iconSvg(icon, fg), "lockup");
}

const CENTER_OPTIONS = [
  { value: "disc", label: "Disc" },
  { value: "none", label: "None" },
  { value: "custom", label: "SVG" },
] as const;

const LOCKUP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "text", label: "Wordmark" },
  { value: "custom", label: "SVG" },
] as const;

type CenterMode = (typeof CENTER_OPTIONS)[number]["value"];
type LockupMode = (typeof LOCKUP_OPTIONS)[number]["value"];

/** Colours used when the URL carries no settings at all (black on white). */
const DEFAULT_TEMPLATE = 1;

/**
 * Read the opening state out of the URL.
 *
 * The parameter names are shared with /render/ and the HTTP endpoint, so a
 * setup dialled in here produces the same image by moving the query across.
 */
function initialState() {
  const p = new URLSearchParams(location.search);
  const hex = (key: string) => {
    const v = p.get(key);
    if (!v) return undefined;
    try {
      return normalizeHex(v);
    } catch {
      return undefined;
    }
  };

  // Number("") === 0, so an empty ?index= cannot be caught by has() + isInteger
  // alone — it would silently resolve to template 0.
  const raw = p.get("index")?.trim();
  const index = Number(raw);
  const template =
    raw && Number.isInteger(index) && index >= 0 && index < TEMPLATE_COLORS.length ? index : null;

  const centerParam = p.get("center");
  const centerIcon = p.get("centerIcon");
  const centerMode: CenterMode =
    centerIcon || centerParam === "svg" ? "custom" : centerParam === "none" ? "none" : "disc";

  const wordmark = p.get("wordmark");
  const lockupIcon = p.get("lockupIcon");
  const lockupMode: LockupMode =
    lockupIcon || p.get("lockup") === "svg" ? "custom" : wordmark ? "text" : "none";

  const preset = (id: string | null): SvgValue => {
    const icon = id ? ICONS.find(i => i.id === id) : undefined;
    return icon ? { markup: "", label: icon.label, preset: icon.id } : EMPTY_SVG;
  };

  // Fall back to the default template when the URL carries nothing. Derive the
  // colours from that index rather than hardcoding a second copy — the two
  // values only agree today by coincidence, and reordering TEMPLATE_COLORS
  // would desync them.
  const effective = p.toString() === "" ? DEFAULT_TEMPLATE : template;

  return {
    url: p.get("url") ?? p.get("u") ?? "https://github.com/kuosuko/encke",
    templateIndex: effective,
    fg: effective !== null ? TEMPLATE_COLORS[effective].fg : (hex("fg") ?? hex("foreground") ?? "000000"),
    bg: effective !== null ? TEMPLATE_COLORS[effective].bg : (hex("bg") ?? hex("background") ?? "FFFFFF"),
    centerMode,
    lockupMode,
    lockupText: wordmark ?? "YOUR BRAND",
    centerSvg: preset(centerIcon),
    lockupSvg: preset(lockupIcon),
  };
}

/** Generation either succeeded or failed. `ok` is the discriminant so TypeScript can narrow. */
type CodeState =
  | { ok: true; result: ReturnType<typeof generateAppClipCode> }
  | { ok: false; error: string };

/**
 * The hex field applies as you type, so it keeps two values: the field shows
 * exactly what was typed, while the real colour only moves once the text
 * parses.
 */
function useColour(initial: string) {
  const [hex, setHex] = useState(initial);
  const [draft, setDraft] = useState(`#${initial}`);
  return {
    hex,
    draft,
    type(text: string) {
      setDraft(text);
      try {
        setHex(normalizeHex(text));
      } catch {
        /* mid-typing — wait for the next character */
      }
    },
    set(value: string) {
      const next = normalizeHex(value);
      setHex(next);
      setDraft(`#${next}`);
    },
  };
}

/**
 * Fade the edges of the horizontally scrolling row.
 * Slicing a swatch in half at the container edge reads as "cut off" rather
 * than "there is more".
 */
function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [fade, setFade] = useState<"none" | "start" | "end" | "both">("none");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft >= max - 1;
      setFade(max <= 1 ? "none" : atStart ? "end" : atEnd ? "start" : "both");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return [ref, fade] as const;
}

export function App() {
  const [initial] = useState(initialState);
  const [swatchRef, swatchFade] = useEdgeFade<HTMLDivElement>();
  const [tables, setTables] = useState<"loading" | "ready" | string>("loading");
  const [url, setUrl] = useState(initial.url);
  const fg = useColour(initial.fg);
  const bg = useColour(initial.bg);
  const [templateIndex, setTemplateIndex] = useState<number | null>(initial.templateIndex);
  const [centerMode, setCenterMode] = useState<CenterMode>(initial.centerMode);
  const [lockupMode, setLockupMode] = useState<LockupMode>(initial.lockupMode);
  const [lockupText, setLockupText] = useState(initial.lockupText);
  const [centerSvg, setCenterSvg] = useState<SvgValue>(initial.centerSvg);
  const [lockupSvg, setLockupSvg] = useState<SvgValue>(initial.lockupSvg);

  // The browser has to load the Huffman tables itself; without them there is
  // no way to compress a URL. Use BASE_URL rather than a hardcoded "/" — under
  // a subpath deployment (user.github.io/repo/) a hardcoded root fetches the
  // domain root, 404s, and leaves the whole page stuck loading.
  useEffect(() => {
    loadTables({ baseUrl: import.meta.env.BASE_URL })
      .then(() => setTables("ready"))
      .catch((e: Error) => setTables(e.message));
  }, []);
  const ready = tables === "ready";

  const swatchKeys = useRadioGroup(TEMPLATE_COLORS, (_, i) => i === templateIndex);

  const trimmed = url.trim();
  const tint = templateIndex !== null ? TEMPLATE_COLORS[templateIndex].third : tintFor(fg.hex, bg.hex);
  const check = useMemo(() => checkColors(fg.hex, bg.hex), [fg.hex, bg.hex]);

  const lockupMarkup = useMemo(() => {
    if (lockupMode === "text") {
      const text = lockupText.trim();
      if (!text) return undefined;
      return `<text x="400" y="985" text-anchor="middle" font-size="64" font-weight="600" fill="#${fg.hex}" font-family="-apple-system, system-ui, sans-serif">${escapeText(text)}</text>`;
    }
    if (lockupMode === "custom") return artworkOf(lockupSvg, "lockup", fg.hex, bg.hex) || undefined;
    return undefined;
  }, [lockupMode, lockupText, lockupSvg, fg.hex, bg.hex]);

  const centerMarkup = useMemo(
    () => artworkOf(centerSvg, "center", fg.hex, bg.hex),
    [centerSvg, fg.hex, bg.hex]
  );

  const code = useMemo((): CodeState => {
    if (!ready) return { ok: false, error: tables === "loading" ? "Loading…" : tables };
    const center: Center = centerMode === "custom" ? centerMarkup || "disc" : centerMode;
    try {
      return {
        ok: true,
        result: generateAppClipCode({
          url: trimmed,
          foreground: fg.hex,
          background: bg.hex,
          tint,
          center,
          lockupSvg: lockupMarkup,
          // Allowed here because the verdict is already shown on screen
          allowUnscannableColors: true,
        }),
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [ready, tables, trimmed, fg.hex, bg.hex, tint, centerMode, centerMarkup, lockupMarkup]);

  const estimate = ready ? estimatePayloadBits(trimmed) : null;
  const svg = code.ok ? code.result.svg : "";
  const downloadable = check.ok && svg !== "";

  /**
   * The current settings as an API query.
   *
   * The same parameters produce the same image through /render/ (browser-side,
   * no server), through encke/handler (server required), or through the CLI —
   * they all share optionsFromParams.
   *
   * Uploaded or pasted SVG is left out: that is kilobytes of markup, and
   * stuffing it into a query just yields a URL nobody can use. Built-in icons
   * are only an id, so those travel.
   */
  const share = useMemo(() => {
    const params = new URLSearchParams();
    if (trimmed) params.set("url", trimmed);
    if (templateIndex !== null) {
      params.set("index", String(templateIndex));
    } else {
      params.set("fg", fg.hex);
      params.set("bg", bg.hex);
    }
    if (centerMode !== "disc") params.set("center", centerMode === "none" ? "none" : "svg");
    if (centerMode === "custom" && centerSvg.preset) params.set("centerIcon", centerSvg.preset);
    if (lockupMode === "text" && lockupText.trim()) params.set("wordmark", lockupText.trim());
    if (lockupMode === "custom") {
      params.set("lockup", "svg");
      if (lockupSvg.preset) params.set("lockupIcon", lockupSvg.preset);
    }

    const dropsUpload =
      (centerMode === "custom" && !centerSvg.preset && centerSvg.markup !== "") ||
      (lockupMode === "custom" && !lockupSvg.preset && lockupSvg.markup !== "");

    return { query: `?${params}`, dropsUpload };
  }, [trimmed, templateIndex, fg.hex, bg.hex, centerMode, centerSvg, lockupMode, lockupSvg, lockupText]);

  // Keep the address bar in step with the settings, so a reload, a bookmark,
  // or a link pasted to someone else all come back to the same code.
  useEffect(() => {
    window.history.replaceState(null, "", share.query);
  }, [share.query]);

  /** Once the colours are set by hand they no longer belong to any preset. */
  const applyColours = (nextFg: string, nextBg: string) => {
    fg.set(nextFg);
    bg.set(nextBg);
    const match = TEMPLATE_COLORS.findIndex(
      t => normalizeHex(t.fg) === normalizeHex(nextFg) && normalizeHex(t.bg) === normalizeHex(nextBg)
    );
    setTemplateIndex(match >= 0 ? match : null);
  };

  return (
    <>
      <nav className="globalnav" aria-label="Global">
        <span className="globalnav-mark">encke</span>
        <span className="globalnav-spacer" />
        <a href="https://github.com/kuosuko/encke">GitHub</a>
        <a href="https://www.npmjs.com/package/encke">npm</a>
      </nav>

      <div className="workspace">
        <section className="controls" aria-label="Settings">
          <section className="group">
            <h2>Link</h2>
            <p className="lede">
              The URL has to fit in 128 bits once compressed. Short domains with short paths do.
            </p>
            <Field label="URL" type="url" value={url} onChange={setUrl} />
            <div className="budget">
              <div className="budget-track">
                <div
                  className={estimate?.willFit === false ? "budget-fill over" : "budget-fill"}
                  style={{
                    width: estimate?.bits
                      ? `${Math.min(100, (estimate.bits / PAYLOAD_LIMIT_BITS) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <p className="note">
                {estimate === null
                  ? ""
                  : estimate.bits === null
                    ? (estimate.reason ?? "")
                    : estimate.willFit
                      ? `${estimate.bits} of ${PAYLOAD_LIMIT_BITS} bits — ${estimate.headroom} to spare`
                      : `Over by ${estimate.bits - PAYLOAD_LIMIT_BITS} bits — shorten the domain or the path`}
              </p>
            </div>
          </section>

          <section className="group">
            <h2>Colour</h2>
            <p className="lede">Pick a preset, or set your own pair. The third is derived for you.</p>

            <div
              className="swatches"
              data-fade={swatchFade}
              ref={swatchRef}
              role="radiogroup"
              aria-label="Colour presets"
              onKeyDown={swatchKeys.groupProps.onKeyDown}
            >
              {TEMPLATE_COLORS.map((t, i) => (
                <Swatch
                  key={i}
                  fg={t.fg}
                  bg={t.bg}
                  selected={i === templateIndex}
                  {...swatchKeys.radioProps(i)}
                  onSelect={() => {
                    fg.set(t.fg);
                    bg.set(t.bg);
                    setTemplateIndex(i);
                  }}
                />
              ))}
            </div>

            <div className="fields">
              <Field
                label="Foreground"
                value={fg.draft}
                maxLength={7}
                chip={hexToCss(fg.hex)}
                onChange={v => {
                  fg.type(v);
                  setTemplateIndex(null);
                }}
                onChipChange={v => {
                  fg.set(v);
                  setTemplateIndex(null);
                }}
              />
              <Field
                label="Background"
                value={bg.draft}
                maxLength={7}
                chip={hexToCss(bg.hex)}
                onChange={v => {
                  bg.type(v);
                  setTemplateIndex(null);
                }}
                onChipChange={v => {
                  bg.set(v);
                  setTemplateIndex(null);
                }}
              />
              <Field label="Tint" value={`#${tint}`} chip={hexToCss(tint)} readOnly />
            </div>

            <Pill
              variant="text"
              className="link-icon"
              onClick={() => applyColours(bg.hex, fg.hex)}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 2v9M4 14l-3-3M4 14l3-3M12 14V5M12 2l3 3M12 2L9 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Swap colours
            </Pill>

            <p className="verdict">
              <b>{check.ok ? "These colours will scan. " : "These colours won't scan. "}</b>
              {`Contrast ${check.contrast.toFixed(2)}:1, brightness difference ${check.lumaDelta.toFixed(0)}`}
              {check.ok ? "." : " — a code needs at least 2.8:1 and 100."}
              {!check.ok && (
                <span className="fixes">
                  {suggestColors(fg.hex, bg.hex).map(s => (
                    <button
                      key={`${s.fg}${s.bg}`}
                      type="button"
                      className="fix"
                      onClick={() => applyColours(s.fg, s.bg)}
                    >
                      <i style={{ background: hexToCss(s.fg) }} />
                      <i style={{ background: hexToCss(s.bg) }} />
                      {nameOf(s.fg)} / {nameOf(s.bg)}
                    </button>
                  ))}
                </span>
              )}
            </p>
          </section>

          <section className="group">
            <h2>Artwork</h2>
            <p className="lede">The centre is what the camera locks onto, so its size is fixed.</p>

            {/* These two are the same thing — pick a source, maybe one more row of settings. Side by side. */}
            <div className="pair">
              <div className="pane">
                <h3>Centre</h3>
                <Segmented
                  label="Centre artwork"
                  value={centerMode}
                  options={CENTER_OPTIONS}
                  onChange={setCenterMode}
                />
                {centerMode === "custom" && (
                  <SvgSource slot="center" value={centerSvg} onChange={setCenterSvg} />
                )}
              </div>

              <div className="pane">
                <h3>Lockup</h3>
                <Segmented
                  label="Lockup"
                  value={lockupMode}
                  options={LOCKUP_OPTIONS}
                  onChange={setLockupMode}
                />
                {lockupMode === "text" && (
                  <input
                    className="text-input"
                    type="text"
                    maxLength={24}
                    aria-label="Wordmark"
                    value={lockupText}
                    onChange={e => setLockupText(e.target.value)}
                  />
                )}
                {lockupMode === "custom" && (
                  <SvgSource slot="lockup" value={lockupSvg} onChange={setLockupSvg} />
                )}
              </div>
            </div>
          </section>
        </section>

        <Preview
          svg={svg}
          error={code.ok ? "" : code.error}
          url={trimmed}
          bits={code.ok ? code.result.rawBits.length : 0}
          arcs={code.ok ? code.result.arcCount : 0}
          downloadable={downloadable}
          share={share}
        />
      </div>
    </>
  );
}

// ── Preview and export ─────────────────────────────────────────

interface PreviewProps {
  svg: string;
  error: string;
  url: string;
  bits: number;
  arcs: number;
  downloadable: boolean;
  share: { query: string; dropsUpload: boolean };
}

function Preview({ svg, error, url, bits, arcs, downloadable, share }: PreviewProps) {
  const [copied, setCopied] = useState<"" | "data" | "link">("");
  const [failure, setFailure] = useState("");

  const flash = (what: "data" | "link") => {
    setFailure("");
    setCopied(what);
    setTimeout(() => setCopied(""), 1200);
  };

  const slug = () => {
    try {
      return new URL(url).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "code";
    } catch {
      return "code";
    }
  };

  const downloadPng = () => {
    toPng(svg, 1024)
      .then(dataUrl => download(dataUrl, `appclip-${slug()}.png`))
      .catch((e: Error) => setFailure(e.message));
  };

  /** The clipboard rejects on an insecure origin or without permission; unhandled, the button just does nothing. */
  const copy = (text: string, what: "data" | "link") =>
    navigator.clipboard
      .writeText(text)
      .then(() => flash(what))
      .catch(() => setFailure("Could not copy — your browser blocked clipboard access."));

  return (
    <section className="preview" aria-label="Preview">
      {svg ? (
        <div className="render" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="render">
          <p>{error}</p>
        </div>
      )}
      <p className="preview-url">{url}</p>
      <dl className="stats">
        <div>
          <dt>Compressed</dt>
          <dd>
            <NumberFlow value={bits} />
            <span className="unit">/{PAYLOAD_LIMIT_BITS}</span>
          </dd>
        </div>
        <div>
          <dt>Arcs</dt>
          <dd>
            <NumberFlow value={arcs} />
          </dd>
        </div>
      </dl>
      <div className="actions">
        <Pill variant="outlined" disabled={!downloadable} onClick={downloadPng}>
          Download PNG
        </Pill>
        <Pill
          variant="filled"
          disabled={!downloadable}
          onClick={() =>
            download(
              URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
              `appclip-${slug()}.svg`
            )
          }
        >
          Download SVG
        </Pill>
      </div>
      {/* What this setup looks like called as an API — that page is only the image, no interface. */}
      <div className="api">
        <span className="api-label">Image API</span>
        {/* BASE_URL so a subpath deployment shows the path that actually works */}
        <code>
          {import.meta.env.BASE_URL}render/{share.query}
        </code>
        <span className="api-actions">
          <Pill
            variant="text"
            onClick={() => copy(new URL(`render/${share.query}`, location.href).href, "link")}
          >
            {copied === "link" ? "Copied" : "Copy"}
          </Pill>
          <a className="link" href={`render/${share.query}`} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </span>
      </div>

      <div className="links">
        <Pill
          variant="text"
          disabled={!downloadable}
          onClick={() => copy(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, "data")}
        >
          {copied === "data" ? "Copied" : "Copy data URL"}
        </Pill>
      </div>
      {failure && <p className="note">{failure}</p>}
      {share.dropsUpload && (
        <p className="note">
          The API carries settings, not files — uploaded artwork stays on this page.
        </p>
      )}
    </section>
  );
}
