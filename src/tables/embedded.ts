/**
 * 內嵌的 trie 表（gzip + base64，約 1.5 MB）。
 *
 * 這是瀏覽器端的最後手段。只會被 loadTables() 用 dynamic import 拉進來，
 * 所以 bundler 會把它切成獨立 chunk，不碰主 bundle。
 * 想完全避開它：改用 loadTables({ baseUrl }) 從自己的靜態資源抓 data/*.data。
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
  // Node without atob（理論上到不了，Node 18+ 有）
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
