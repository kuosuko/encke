/**
 * Node build of the React entry point — package.json's "./react" node
 * condition points here.
 *
 * Without this layer, a Server Component that only imports "encke/react"
 * never registers the disk-reading loader, so the component falls all the
 * way through to the fallback and renders nothing.
 */
import { registerNodeTables } from "./tables/node";

registerNodeTables();

export * from "./react";
