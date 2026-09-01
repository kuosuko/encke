/**
 * The embedded trie tables (gzip + base64, ~1.5 MB).
 *
 * Last resort for the browser. Only ever reached through a dynamic import
 * inside loadTables(), so bundlers split it into its own chunk and leave the
 * main bundle alone.
 * To skip it entirely: loadTables({ baseUrl }) and serve data/*.data from
 * your own static assets.
 */
import { H_GZ_B64, SPQ_GZ_B64, CPQ_GZ_B64 } from "../trie-data.generated";
import type { TrieTables } from "./registry";

function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node without atob (unreachable in practice — Node 18+ has it)
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "function") {
    throw new Error(
      "encke: DecompressionStream is unavailable in this runtime. " +
      "Load the tables another way — loadTables({ baseUrl }) or setTrieTables()."
    );
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeEmbeddedTables(): Promise<TrieTables> {
  const [h, spq, cpq] = await Promise.all(
    [H_GZ_B64, SPQ_GZ_B64, CPQ_GZ_B64].map(b => gunzip(b64ToBytes(b)))
  );
  return { h, spq, cpq };
}
