/**
 * React / Next.js wrapper
 *
 * Server Components, route handlers, build-time generation — just use it.
 * The browser downloads not one byte of the Huffman tables; the client
 * receives finished SVG markup.
 *
 * Client Components (generating from a URL the user types) — the component
 * loads the tables itself and re-renders. They are never in the main bundle,
 * only a separate lazy chunk. To avoid even that chunk, serve data/*.data
 * from your own static directory and pass tables={{ baseUrl: "/…" }}.
 */
import * as React from "react";
import { generateAppClipCode, generateDataURL, type GenerateOptions } from "./generator";
import { loadTables, type LoadTablesOptions } from "./tables/load";
import { TablesNotLoadedError } from "./tables/registry";

export type AppClipCodeProps = GenerateOptions & {
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
  /**
   * Shown while the tables load, or when this URL cannot be encoded.
   * Renders nothing by default.
   */
  fallback?: React.ReactNode;
  /**
   * How the browser should get the Huffman tables.
   * By default it loads the embedded copy; `{ baseUrl }` fetches data/*.data
   * that you host yourself; `false` disables auto-loading (you will have
   * awaited loadTables() on your own).
   */
  tables?: LoadTablesOptions | false;
  /**
   * Called when generation fails: URL too long, colors that will not scan,
   * tables that would not load.
   */
  onError?: (error: Error) => void;
};

type Outcome<T> = { value: T; error?: undefined } | { value?: undefined; error: Error };

/**
 * Generate synchronously; if the tables are not there yet, load them and
 * re-render. On the server the first generate succeeds and the effects never
 * run at all.
 */
function useAppClipCode<T>(
  produce: () => T,
  deps: React.DependencyList,
  { tables, onError }: Pick<AppClipCodeProps, "tables" | "onError">
): Outcome<T> {
  const [attempt, retry] = React.useReducer((n: number) => n + 1, 0);

  const outcome = React.useMemo<Outcome<T>>(() => {
    try {
      return { value: produce() };
    } catch (e) {
      return { error: e as Error };
    }
    // attempt is a deliberate dependency: recompute once the tables land
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  // The options objects are usually inline literals, so putting them in the
  // dependency list would re-run on every render; read the latest via a ref
  const tablesRef = React.useRef(tables);
  tablesRef.current = tables;
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;

  const needsTables = outcome.error instanceof TablesNotLoadedError;

  React.useEffect(() => {
    if (!needsTables || tablesRef.current === false) return;
    let alive = true;
    loadTables(tablesRef.current || undefined)
      .then(() => { if (alive) retry(); })
      .catch((e: Error) => { if (alive) onErrorRef.current?.(e); });
    return () => { alive = false; };
  }, [needsTables]);

  React.useEffect(() => {
    if (outcome.error && !needsTables) onErrorRef.current?.(outcome.error);
  }, [outcome.error, needsTables]);

  return outcome;
}

const generateOptions = (props: AppClipCodeProps): GenerateOptions => ({
  url: props.url,
  foreground: props.foreground,
  background: props.background,
  tint: props.tint,
  templateIndex: props.templateIndex,
  center: props.center,
  logo: props.logo,
  centerScale: props.centerScale,
  lockupSvg: props.lockupSvg,
  layout: props.layout,
  allowUnscannableColors: props.allowUnscannableColors,
});

const optionDeps = (o: GenerateOptions) => [
  o.url, o.foreground, o.background, o.tint, o.templateIndex, o.center, o.logo,
  o.centerScale, o.lockupSvg, o.layout, o.allowUnscannableColors,
];

/** Inline SVG. Use AppClipCodeImg if you want an <img>. */
export function AppClipCode(props: AppClipCodeProps) {
  const { className, style, width = 300, height = "auto", fallback = null, tables, onError } = props;
  const options = generateOptions(props);
  const { value, error } = useAppClipCode(
    () => generateAppClipCode(options).svg,
    optionDeps(options),
    { tables, onError }
  );

  if (error || !value) return <>{fallback}</>;
  return (
    <div
      className={className}
      style={{ width, height, ...style }}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}

/** The same thing, emitted as <img src="data:image/svg+xml…">. */
export function AppClipCodeImg(
  props: AppClipCodeProps & { alt?: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, keyof AppClipCodeProps | "alt" | "src">
) {
  const { alt = "App Clip Code", fallback = null, tables, onError, width = 300, height, className, style, ...rest } = props;
  const options = generateOptions(props);
  const { value, error } = useAppClipCode(
    () => generateDataURL(options),
    optionDeps(options),
    { tables, onError }
  );

  if (error || !value) return <>{fallback}</>;
  const passthrough = Object.fromEntries(
    Object.entries(rest).filter(([k]) => !(k in options))
  ) as React.ImgHTMLAttributes<HTMLImageElement>;
  return <img src={value} alt={alt} width={width} height={height} className={className} style={style} {...passthrough} />;
}
