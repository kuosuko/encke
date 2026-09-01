/**
 * Node build of the HTTP endpoint — package.json's "./handler" node
 * condition points here.
 *
 * Without this layer, importing "@sz.ws/encke/handler" under Node never registers
 * the disk-reading loader, so the first request pays to decode the 1.5 MB
 * embedded tables for nothing.
 */
import { registerNodeTables } from "./tables/node";

registerNodeTables();

export * from "./handler";
