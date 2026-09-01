/**
 * Ready-made icons, so nobody has to draw an SVG first just to see what a
 * centre mark or lockup looks like.
 *
 * All drawn in a 100×100 box using fill only (no stroke), so they hold up at
 * any size. Colour is supplied from outside — an icon follows the foreground.
 */
export interface Icon {
  id: string;
  label: string;
  path: string;
  /** Shapes with holes need evenodd, otherwise the hole fills in. */
  evenodd?: boolean;
}

export const ICONS: readonly Icon[] = [
  {
    id: "bolt",
    label: "Bolt",
    path: "M60 6 L26 56 H46 L40 94 L74 44 H54 Z",
  },
  {
    id: "bag",
    label: "Bag",
    path:
      "M18 34 H82 V88 A8 8 0 0 1 74 96 H26 A8 8 0 0 1 18 88 Z " +
      "M36 34 V28 A14 14 0 0 1 64 28 V34 H54 V28 A4 4 0 0 0 46 28 V34 Z",
    evenodd: true,
  },
  {
    id: "cup",
    label: "Cup",
    path:
      "M22 22 H68 V56 A23 23 0 0 1 22 56 Z " +
      "M68 30 A15 15 0 0 1 68 62 V52 A5 5 0 0 0 68 40 Z " +
      "M16 88 H74 V96 H16 Z",
  },
  {
    id: "pin",
    label: "Pin",
    path:
      "M50 6 A28 28 0 0 0 22 34 C22 56 50 94 50 94 S78 56 78 34 A28 28 0 0 0 50 6 Z " +
      "M50 46 A11 11 0 1 1 50 24 A11 11 0 0 1 50 46 Z",
    evenodd: true,
  },
  {
    id: "ticket",
    label: "Ticket",
    path: "M10 28 H90 V44 A8 8 0 0 0 90 60 V76 H10 V60 A8 8 0 0 0 10 44 Z",
  },
  {
    id: "star",
    label: "Star",
    path: "M50 8 L62 38 L94 41 L70 62 L77 94 L50 77 L23 94 L30 62 L6 41 L38 38 Z",
  },
  {
    id: "heart",
    label: "Heart",
    path: "M50 90 C18 68 8 52 8 37 A21 21 0 0 1 50 28 A21 21 0 0 1 92 37 C92 52 82 68 50 90 Z",
  },
  {
    id: "cube",
    label: "Cube",
    path:
      "M50 6 L88 27 L50 48 L12 27 Z " +
      "M8 34 L46 55 L46 96 L8 75 Z " +
      "M92 34 L92 75 L54 96 L54 55 Z",
  },
];

/** Wrap as a complete SVG so it can take the same fitSvg path as an uploaded file. */
export function iconSvg(icon: Icon, hex: string): string {
  const rule = icon.evenodd ? ' fill-rule="evenodd"' : "";
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}" fill="#${hex}"${rule}/></svg>`;
}

/**
 * Centre icon: keep the disc, knock the glyph out of the middle of it.
 *
 * That centre circle is what the camera looks for, so the move is not to
 * replace it but to work inside it — the disc stays in the foreground colour
 * and the glyph is punched through in the background colour. Already drawn in
 * the code's coordinate space (origin at the centre), so it skips fitSvg.
 */
const GLYPH = 118; // the circle is ~213 across; the glyph occupies this much of the middle

export function centerIconMarkup(icon: Icon, fg: string, bg: string, radius: number): string {
  const rule = icon.evenodd ? ' fill-rule="evenodd"' : "";
  return (
    `<circle cx="0" cy="0" r="${radius}" fill="#${fg}"/>` +
    `<g transform="translate(${-GLYPH / 2} ${-GLYPH / 2}) scale(${(GLYPH / 100).toFixed(4)})">` +
    `<path d="${icon.path}" fill="#${bg}"${rule}/>` +
    `</g>`
  );
}
