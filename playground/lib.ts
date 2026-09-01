/** Small helpers shared by the two entry points (the editor and the image API). */

/** Escape before writing into an SVG attribute or text node — otherwise a parameter can inject markup. */
export const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

/**
 * SVG to PNG: let the browser draw the SVG into a canvas and hand back a data URL.
 *
 * onerror is not optional — without it a decode failure does nothing at all,
 * silently, and the blob URL is never released.
 */
export function toPng(svg: string, width: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const box = svg.match(/viewBox="([\d.\- ]+)"/)?.[1].split(" ").map(Number) ?? [0, 0, 800, 800];
    const [, , vw, vh] = box.length === 4 ? box : [0, 0, 800, 800];
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const done = (fn: () => void) => {
      URL.revokeObjectURL(blobUrl);
      fn();
    };

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((width * vh) / vw);
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(() => reject(new Error("This browser will not give us a canvas")));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      done(() => resolve(canvas.toDataURL("image/png")));
    };
    img.onerror = () => done(() => reject(new Error("Could not rasterise the SVG")));
    img.src = blobUrl;
  });
}
