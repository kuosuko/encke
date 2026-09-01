/**
 * The center visual — 100% original, no Apple artwork of any kind.
 *
 * The icon is Apple's trademark and we do not reproduce it. The default is a
 * neutral filled disc; pass your own SVG to put your brand there instead.
 * The geometry, on the other hand, is copied from the native tool exactly.
 */

/**
 * Diameter of the recognition area, in units. The camera needs a solid,
 * high-contrast block of at least this size to lock on, so the number is a
 * spec, not an aesthetic choice.
 *
 * Measured from native output: the center group is
 *   <g id="Logo" transform="translate(293.275699 293.275699) scale(1.874)">
 * wrapped around a shape 113.9000015 wide, so
 *   diameter = 113.9000015 x 1.874 = 213.4486
 *   center   = 293.275699 + 213.4486 / 2 = 400.0000  ✓
 */
export const CENTER_DIAMETER = 213.4486;

export interface CenterOptions {
  fg?: string;
  scale?: number;
  radius?: number;
  cx?: number;
  cy?: number;
}

/**
 * Derive a stable clipPath id from the content: same content gives the same
 * id, and different content never collides.
 */
function stableId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `acc-center-${(h >>> 0).toString(36)}`;
}

export function createCenterG(centerSvg: string | undefined, opts: CenterOptions = {}): string {
  const { fg = "000000", scale = 1, radius = CENTER_DIAMETER / 2, cx = 400, cy = 400 } = opts;

  if (!centerSvg?.trim()) {
    // Default: a neutral filled disc. It already fits inside the
    // recognition area, so there is nothing to clip.
    return (
      `<g id="Center" transform="translate(${cx} ${cy}) scale(${scale})">\n` +
      `<circle cx="0" cy="0" r="${radius}" style="fill:#${fg}"/>\n` +
      `</g>`
    );
  }

  // Custom content is always clipped to the recognition circle. Anything
  // that spills out covers arcs on the rings, and the code stops scanning —
  // so this is correctness, not decoration.
  const inner = centerSvg.trim();
  const clip = stableId(inner + radius);
  return (
    `<g id="Center" transform="translate(${cx} ${cy})">\n` +
    `<clipPath id="${clip}"><circle cx="0" cy="0" r="${radius}"/></clipPath>\n` +
    `<g clip-path="url(#${clip})" transform="scale(${scale})">\n${inner}\n</g>\n` +
    `</g>`
  );
}
