import { useId, useRef, useState } from "react";
import { CENTER_DIAMETER } from "../../src/index";
import { ICONS } from "../icons";
import { Pill } from "./Pill";
import { useRadioGroup } from "./useRadioGroup";

export type Slot = "center" | "lockup";
export interface SvgValue {
  markup: string;
  label: string;
  /** A built-in icon stores only its id — the markup is recomputed outside from the current foreground colour. */
  preset?: string;
}
export const EMPTY_SVG: SvgValue = { markup: "", label: "" };

// ── Foreign SVG: sanitize, then reposition ──────────────────────

/**
 * Uploaded and pasted SVG is foreign content; injecting it straight into the
 * DOM is opening the door. Keep only what is needed to draw — scripts, styles,
 * event handlers and external references all go.
 */
const BANNED_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "use",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  // <style> has to go: this SVG is inlined into the host document rather than
  // loaded as its own, so its CSS rules apply to the whole page — enough to
  // cover the entire UI, or to fire external requests through url().
  "style",
]);

/** url(#local) is fine; url(anything else) is not — http, data, relative paths included. */
const REMOTE_URL = /url\(\s*['"]?\s*(?!#)/i;

export function sanitizeSvg(markup: string): string {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    "image/svg+xml"
  );
  const root = doc.documentElement;
  if (root.querySelector("parsererror")) throw new Error("That doesn't parse as SVG.");

  for (const node of [...root.querySelectorAll("*")]) {
    if (BANNED_TAGS.has(node.tagName.toLowerCase())) {
      node.remove();
      continue;
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const isRemoteRef = /^(href|xlink:href|src)$/.test(name) && !value.startsWith("#");
      if (
        name.startsWith("on") ||
        isRemoteRef ||
        value.startsWith("javascript:") ||
        REMOTE_URL.test(value)
      ) {
        node.removeAttribute(attr.name);
      }
    }
  }
  return root.innerHTML.trim();
}

/**
 * Rewrite foreign SVG into the code's coordinate space.
 *
 * The file has a viewBox of its own, so pasting it verbatim lands it off-canvas
 * or at completely the wrong size. A centre is fitted to the identification
 * circle's diameter and centred on (0, 0) — the library then clips it to that
 * circle as well. A lockup is aligned to the band below the code.
 */
export function fitSvg(text: string, slot: Slot): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.querySelector("svg");
  if (!root) return sanitizeSvg(text); // already a fragment, so only sanitize

  const inner = sanitizeSvg(root.innerHTML);
  const box = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some(Number.isNaN)) return inner;

  const [minX, minY, w, h] = box;
  if (slot === "center") {
    const scale = CENTER_DIAMETER / Math.max(w, h);
    return `<g transform="scale(${scale.toFixed(4)}) translate(${(-minX - w / 2).toFixed(2)} ${(-minY - h / 2).toFixed(2)})">${inner}</g>`;
  }
  const scale = Math.min(800 / w, 240 / h);
  const x = (800 - w * scale) / 2 - minX * scale;
  return `<g transform="translate(${x.toFixed(2)} ${(830 - minY * scale).toFixed(2)}) scale(${scale.toFixed(4)})">${inner}</g>`;
}

// ── Component ───────────────────────────────────────────────────

const SHEET: Record<Slot, { title: string; note: string }> = {
  center: {
    title: "Centre artwork",
    note: "Drawn around (0, 0) and clipped to the identification circle.",
  },
  lockup: {
    title: "Lockup artwork",
    note: "Drawn in the code's coordinate space — the canvas is 800 wide.",
  },
};

/** One row: choose a file, drop one, or paste markup — all three take the same sanitize-and-fit path. */
interface SvgSourceProps {
  slot: Slot;
  value: SvgValue;
  onChange: (value: SvgValue) => void;
}

export function SvgSource({ slot, value, onChange }: SvgSourceProps) {
  const file = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const titleId = useId();
  const { groupProps, radioProps } = useRadioGroup(ICONS, icon => icon.id === value.preset);

  const accept = (markup: string, label: string) => {
    try {
      onChange({ markup: fitSvg(markup, slot), label });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openSheet = () => {
    setDraft(value.markup);
    sheet.current?.showModal();
  };

  const closeSheet = () => {
    if (sheet.current?.returnValue !== "apply") return;
    const raw = draft.trim();
    // Paste goes down the same path as upload. Skip this and pasted artwork
    // lands in the top-left corner of the canvas.
    if (raw) accept(raw, "Pasted markup");
    else onChange(EMPTY_SVG);
  };

  const chosen = Boolean(value.markup || value.preset);
  const className = "source" + (chosen ? " filled" : "") + (dragging ? " dragover" : "");

  return (
    <>
      <div
        className={className}
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) void dropped.text().then(text => accept(text, dropped.name));
        }}
      >
        <input
          ref={file}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={e => {
            const picked = e.target.files?.[0];
            if (picked) void picked.text().then(text => accept(text, picked.name));
            e.target.value = ""; // so the same file can be picked twice in a row
          }}
        />
        <span className="source-state">{error || (chosen ? value.label : "No file")}</span>
        <span className="source-actions">
          <Pill variant="text" onClick={() => file.current?.click()}>
            Choose…
          </Pill>
          <Pill variant="text" onClick={openSheet}>
            Paste
          </Pill>
          {chosen && (
            <Pill variant="text" onClick={() => onChange(EMPTY_SVG)}>
              Remove
            </Pill>
          )}
        </span>
      </div>

      {/* People without a file on hand should still be able to see the effect, so offer a row of ready-made icons. */}
      <div className="icons" role="radiogroup" aria-label="Built-in icons" {...groupProps}>
        {ICONS.map((icon, i) => (
          <button
            key={icon.id}
            type="button"
            role="radio"
            aria-checked={value.preset === icon.id}
            aria-label={icon.label}
            title={icon.label}
            className={value.preset === icon.id ? "icon on" : "icon"}
            {...radioProps(i)}
            onClick={() =>
              onChange(
                value.preset === icon.id
                  ? EMPTY_SVG
                  : { markup: "", label: icon.label, preset: icon.id }
              )
            }
          >
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path d={icon.path} fill="currentColor" fillRule={icon.evenodd ? "evenodd" : undefined} />
            </svg>
          </button>
        ))}
      </div>

      <dialog className="sheet" ref={sheet} onClose={closeSheet} aria-labelledby={titleId}>
        <form method="dialog" className="sheet-inner">
          <h2 id={titleId}>{SHEET[slot].title}</h2>
          <p className="lede">{SHEET[slot].note}</p>
          <textarea
            rows={10}
            spellCheck={false}
            aria-label="SVG markup"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="sheet-actions">
            <button value="cancel" className="pill pill-outlined">
              Cancel
            </button>
            <button value="apply" className="pill pill-filled">
              Apply
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
