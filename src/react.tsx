/**
 * React / Next.js wrapper
 *
 * Server Component、route handler、build 期產生 —— 直接用，瀏覽器一個位元組的
 * Huffman 表都不用載，client 只收到 SVG 字串。
 *
 * Client Component（使用者即時輸入網址才生成）—— 元件會自己去載表並重繪。
 * 表不在主 bundle 裡，是獨立的 lazy chunk；想連那個 chunk 都不要，就把
 * data/*.data 放進自己的靜態目錄，傳 tables={{ baseUrl: "/…" }}。
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
  /** 表還在載、或這個網址編不出來時顯示的東西。預設不顯示任何東西。 */
  fallback?: React.ReactNode;
  /**
   * 瀏覽器端要怎麼取得 Huffman 表。
   * 預設自動載內嵌的那份；`{ baseUrl }` 改成抓自己 host 的 data/*.data；
   * `false` 表示不自動載（你自己會先 await loadTables()）。
   */
  tables?: LoadTablesOptions | false;
  /** 生成失敗時呼叫（網址太長、配色掃不出來、表載不到…）。 */
  onError?: (error: Error) => void;
};

type Outcome<T> = { value: T; error?: undefined } | { value?: undefined; error: Error };

/**
 * 同步產生；表還沒到位就先載再重繪。
 * Server 端 generate 一次就成功，effect 根本不會跑。
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
    // attempt 是刻意的相依：表載好之後要重算一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  // options 物件通常是行內字面值，放進相依會每次重跑；用 ref 讀最新值就好
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

/** 內聯 SVG。想要 <img> 就用 AppClipCodeImg。 */
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

/** 同樣的東西，但輸出成 <img src="data:image/svg+xml…">。 */
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
