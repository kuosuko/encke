import { hexToCss } from "../../src/index";

/** Friendly names for the colours that show up in the built-in templates; anything else reports its hex. */
const COLOUR_NAMES: Record<string, string> = {
  "000000": "Black",
  FFFFFF: "White",
  "777777": "Grey",
  FF3B30: "Red",
  EE7733: "Orange",
  "33AA22": "Green",
  "00A6A1": "Teal",
  "007AFF": "Blue",
  "5856D6": "Indigo",
  CC73E1: "Purple",
};

export const nameOf = (hex: string) => COLOUR_NAMES[hex] ?? `#${hex}`;

/**
 * A diagonally split two-tone circle with its name underneath.
 * The row scrolls horizontally, so hover must not use transform — see style.css.
 */
interface SwatchProps {
  fg: string;
  bg: string;
  selected: boolean;
  tabIndex: number;
  onSelect: () => void;
}

export function Swatch({ fg, bg, selected, tabIndex, onSelect }: SwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${nameOf(fg)} on ${nameOf(bg)}`}
      tabIndex={tabIndex}
      className={selected ? "swatch on" : "swatch"}
      onClick={e => {
        onSelect();
        e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
      }}
    >
      <i style={{ ["--fg" as string]: hexToCss(fg), ["--bg" as string]: hexToCss(bg) }} />
      <span aria-hidden="true">
        {nameOf(fg)} / {nameOf(bg)}
      </span>
    </button>
  );
}
