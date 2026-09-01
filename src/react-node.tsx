/**
 * React 進入點的 Node 版 —— package.json 的 "./react" node condition 指到這裡。
 *
 * 少了這一層，Server Component 只 import "encke/react" 時永遠不會註冊
 * 讀檔的取得器，元件就會一路走到 fallback、什麼都畫不出來。
 */
import { registerNodeTables } from "./tables/node";

registerNodeTables();

export * from "./react";
