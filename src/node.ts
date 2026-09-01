/**
 * Node 進入點 —— package.json 的 "node" condition 指到這裡。
 * 跟主進入點一模一樣，只是預先接好從 data/ 讀表的路徑，所以 API 全部保持同步。
 */
import { registerNodeTables } from "./tables/node";

registerNodeTables();

export * from "./index";
export { setDataDir, readTablesFromDisk } from "./tables/node";
