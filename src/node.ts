/**
 * Node entry point — package.json's "node" condition points here.
 * Identical to the main entry point, except the disk loader for data/ is
 * already wired up, so the API stays in sync across both.
 */
import { registerNodeTables } from "./tables/node";

registerNodeTables();

export * from "./index";
export { setDataDir, readTablesFromDisk } from "./tables/node";
