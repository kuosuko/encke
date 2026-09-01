/**
 * React wrapper。伺服器端（表已就緒）用 renderToStaticMarkup 直接驗；
 * 瀏覽器端（表未載）驗它不會炸、會顯示 fallback，並自己把表載起來重繪。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppClipCode, AppClipCodeImg } from "../src/react";
import { setTrieTables, resetTrieTables } from "../src/index";
import { readTablesFromDisk } from "../src/tables/node";

const URL_ = "https://oru.okuso.uk/su";

describe("server rendering (tables ready)", () => {
  beforeEach(() => setTrieTables(readTablesFromDisk()));

  it("inlines the SVG", () => {
    const html = renderToStaticMarkup(<AppClipCode url={URL_} templateIndex={11} />);
    expect(html).toContain("<svg");
    expect(html).toContain("#00A6A1");
    expect(html).toContain("#88DDCC");
  });

  it("applies width and height instead of dropping them", () => {
    const html = renderToStaticMarkup(<AppClipCode url={URL_} width={220} height={220} />);
    expect(html).toMatch(/width:\s*220px/);
    expect(html).toMatch(/height:\s*220px/);
  });

  it("renders an img with a data URL", () => {
    const html = renderToStaticMarkup(<AppClipCodeImg url={URL_} alt="Scan me" width={180} />);
    expect(html).toContain('alt="Scan me"');
    expect(html).toContain("src=\"data:image/svg+xml;utf8,");
    expect(html).toContain('width="180"');
  });

  it("shows the fallback instead of an error SVG when the URL will not fit", () => {
    const onError = vi.fn();
    const html = renderToStaticMarkup(
      <AppClipCode
        url="https://very-long-subdomain.example.com/a/very/long/path?with=query&and=more"
        fallback={<span>too long</span>}
        onError={onError}
      />
    );
    expect(html).toBe("<span>too long</span>");
    expect(html).not.toContain("<svg");
  });

  it("blocks unscannable colors like the core API does", () => {
    const html = renderToStaticMarkup(
      <AppClipCode url={URL_} foreground="777777" background="888888" fallback={<i>bad colors</i>} />
    );
    expect(html).toBe("<i>bad colors</i>");
  });
});

describe("browser rendering (tables not loaded)", () => {
  beforeEach(() => resetTrieTables());

  it("renders the fallback instead of throwing", () => {
    const html = renderToStaticMarkup(<AppClipCode url={URL_} fallback={<span>loading</span>} />);
    expect(html).toBe("<span>loading</span>");
  });

  it("renders nothing at all when no fallback is given", () => {
    expect(renderToStaticMarkup(<AppClipCode url={URL_} />)).toBe("");
  });
});
