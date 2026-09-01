/**
 * App Clip Code URL 壓縮器 — 純 TS 移植
 * 演算法從 Apple URLCompression.framework 逆向，
 * 並以原生 AppClipCodeGenerator 為 oracle 逐位驗證。
 *
 * trie 資料格式（h.data / spq.data / cpq.data）:
 *   node_count = 1 + k + k² (深度 0..2), 每node k 個 uint16 BE 頻率
 *   child(node, sym) = k*node + 1 + sym
 */

import { getTrieTables, setTrieTables, type TrieTables } from "./tables/registry";
import { KNOWN_WORDS as KW, FIXED_TLDS } from "./tables.generated";

export const HOST_SYMS = [..."-", ...".", ..."0123456789", ..."abcdefghijklmnopqrstuvwxyz", "|"];
export const SPQ_SYMS = [..."&+", ..."-.", ..."/", ..."0123456789", ..."=?", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "_", ..."abcdefghijklmnopqrstuvwxyz", "|"];
export const CPQ_SYMS = [..."#%&+", ...",-.", ..."/", ..."0123456789", ...":;=?", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "_", ..."abcdefghijklmnopqrstuvwxyz"];
export const FIXED6 = "." + "0123456789" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "abcdefghijklmnopqrstuvwxyz" + "|";

export const HUFF_TLDS: Record<string, number> = {
  ".com": 0xfffe, ".org": 0x26f6, ".net": 0x1766, ".de": 0x1163, ".ru": 0x0fed,
  ".cn": 0x0cb7, ".uk": 0x0c86, ".jp": 0x08e2, ".it": 0x062c, ".fr": 0x059d,
  ".nl": 0x0598, ".au": 0x0513, ".br": 0x04ad, ".ca": 0x0482, ".info": 0x0449,
  ".in": 0x03d5, ".edu": 0x03c1, ".us": 0x0361, ".pl": 0x0352, ".ga": 0x0346,
};

// --- Huffman（Apple 規則：min-heap, tie = 子樹「最左葉」的符號序, 先彈 = left = 0）---
//
// tie-break 用的是最左葉，不是子樹裡字母序最小的符號 —— 這兩者只在少數節點上不同，
// 但足以讓某些 URL 編出跟原生不一樣的碼（掃出來就是別的網址）。
// 這條規則是拿 790 組 URL 對原生輸出做差異測試選出來的，八種候選規則裡只有它全中。
type Node = { freq: number; first: string; leaf?: number; l?: Node; r?: Node };

export function buildHuffman(freqs: number[], syms: string[]): string[] {
  const codes = new Array<string>(freqs.length).fill("");
  const heap: Node[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] > 0) heap.push({ freq: freqs[i], first: syms[i], leaf: i });
  }
  if (heap.length === 0) return codes;
  if (heap.length === 1) { codes[heap[0].leaf!] = "0"; return codes; }
  const pop = () => {
    let bi = 0;
    for (let i = 1; i < heap.length; i++) {
      const a = heap[i], b = heap[bi];
      if (a.freq < b.freq || (a.freq === b.freq && a.first < b.first)) bi = i;
    }
    return heap.splice(bi, 1)[0];
  };
  while (heap.length > 1) {
    const l = pop();   // 先彈 = left = 0
    const r = pop();   // 後彈 = right = 1
    heap.push({ freq: l.freq + r.freq, first: l.first, l, r });
  }
  const walk = (n: Node, p: string): void => {
    if (n.leaf !== undefined) { codes[n.leaf] = p || "0"; return; }
    walk(n.l!, p + "0"); walk(n.r!, p + "1");
  };
  walk(pop(), "");
  return codes;
}

class Trie {
  k: number; maxd = 2;
  constructor(public data: Uint8Array, public syms: string[]) {
    this.k = syms.length;
    if (data.length !== (1 + this.k + this.k * this.k) * this.k * 2)
      throw new Error(`trie size mismatch: ${data.length} for k=${this.k}`);
  }
  freqs(node: number): number[] {
    const base = node * this.k * 2, out: number[] = [];
    for (let i = 0; i < this.k; i++) out.push((this.data[base + i * 2] << 8) | this.data[base + i * 2 + 1]);
    return out;
  }
  child(node: number, sym: number) { return this.k * node + 1 + sym; }
}

class Coder {
  private cache = new Map<number, string[]>();
  private idx = new Map<string, number>();
  constructor(private t: Trie) { t.syms.forEach((s, i) => this.idx.set(s, i)); }
  private coder(node: number) {
    let c = this.cache.get(node);
    if (!c) { c = buildHuffman(this.t.freqs(node), this.t.syms); this.cache.set(node, c); }
    return c;
  }
  encode(syms: string[], start = ""): string {
    let node = 0, depth = 0, out = "";
    for (const c of start) { [node, depth] = this.adv(node, depth, this.idx.get(c)!); }
    for (const c of syms) {
      const i = this.idx.get(c)!;
      const code = this.coder(node)[i];
      if (!code) throw new Error(`cannot encode "${c}" @node ${node}`);
      out += code;
      [node, depth] = this.adv(node, depth, i);
    }
    return out;
  }
  private adv(node: number, depth: number, i: number): [number, number] {
    if (depth < this.t.maxd) return [this.t.child(node, i), depth + 1];
    const prev = (node - 1) % this.t.k;
    return [this.t.child(1 + prev, i), depth];
  }
}

let coders: { host: Coder; spq: Coder; cpq: Coder } | null = null;
let builtFrom: TrieTables | null = null;

/** 取得三個 coder；表換掉的話會自動重建。 */
function C() {
  const t = getTrieTables();
  if (!coders || builtFrom !== t) {
    coders = {
      host: new Coder(new Trie(t.h, HOST_SYMS)),
      spq: new Coder(new Trie(t.spq, SPQ_SYMS)),
      cpq: new Coder(new Trie(t.cpq, CPQ_SYMS)),
    };
    builtFrom = t;
  }
  return coders;
}

/** @deprecated 改用 setTrieTables({ h, spq, cpq }) */
export function setTrieData(h: Uint8Array, spq: Uint8Array, cpq: Uint8Array): void {
  setTrieTables({ h, spq, cpq });
}

const tldSyms = Object.keys(HUFF_TLDS).sort();
const tldCodes = buildHuffman(tldSyms.map(t => HUFF_TLDS[t]), tldSyms);

// --- 常數表（extracted from Apple binary, MIT-licensed reference cross-checked）---
const KNOWN_WORDS = KW;
// 上表若與 156 個有差，缺的詞會自動 fallback 到其他編碼，不影響正確性

function leb128(v: number): string {
  let out = "";
  do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out += b.toString(2).padStart(8, "0"); } while (v);
  return out;
}
const fixed6 = (s: string) => [...s].map(c => {
  const i = FIXED6.indexOf(c);
  if (i < 0) throw new Error(`"${c}" is outside the 6-bit alphabet`);
  return i.toString(2).padStart(6, "0");
}).join("");
const spq = (start: string, val: string, term: boolean) => C().spq.encode([...val + (term ? "|" : "")], start);
/**
 * 從候選裡挑最短；長度相同時取「後面」的。
 *
 * 所以候選必須依偏好由低到高排列。原生在 tie 時的偏好是
 *   wordbook > leb128 > spq > fixed6
 * （由 800 組 URL 對原生輸出做差異測試反推 —— 不是隨便選的順序，
 *   改動它會讓一部分 URL 編出跟原生不同的環碼。）
 */
const pickShortest = (candidates: (string | null)[]): string => {
  let best: string | null = null;
  for (const c of candidates) if (c !== null && (best === null || c.length <= best.length)) best = c;
  if (best === null) throw new Error("no viable encoding");
  return best;
};
const attempt = (fn: () => string): string | null => {
  try { return fn(); } catch { return null; }
};

function encodeHost(host: string, hasPQ: boolean): [string, number] {
  const ld = host.lastIndexOf(".");
  if (ld < 0) throw new Error(`host has no TLD: ${host}`);
  const tld = host.slice(ld), domain = host.slice(0, ld) + (hasPQ ? "|" : "");
  // 三種格式全部算過再挑最短；長度相同時取編號大的（與原生一致）。
  const candidates: [string, number][] = [];

  // format 0：20 個高頻 TLD 走 Huffman
  if (tld in HUFF_TLDS) {
    const i = tldSyms.indexOf(tld);
    try { candidates.push([tldCodes[i] + C().host.encode([...domain]), 0]); } catch { /* skip */ }
  }
  // format 1：113 個 TLD 走 8-bit 固定索引
  const fixed = FIXED_TLDS[tld];
  if (fixed !== undefined) {
    try { candidates.push([fixed.toString(2).padStart(8, "0") + C().host.encode([...domain]), 1]); } catch { /* skip */ }
  }
  // format 2：整條 host 走 Huffman
  candidates.push([C().host.encode([...host + (hasPQ ? "|" : "")]), 2]);

  return candidates.reduce((best, c) => (c[0].length <= best[0].length ? c : best));
}

const buildItems = (path: string, hasQuery: boolean): string[] => {
  if (!path) return [];
  const items = path.replace(/^\//, "").split("/").filter(Boolean);
  // 光是 "/" 的 path 只有在後面沒有 query 時才需要那個 "/" 項目 ——
  // 有 query 的話 "https://a.co/?x=1" 原生不會為它額外花 2 bits。
  if (items.length === 0 && hasQuery) return [];
  if (items.length === 0 || path.endsWith("/")) items.push("/");
  return items;
};

function segComponent(comp: string, term: boolean): string {
  const w = KNOWN_WORDS[comp];
  return pickShortest([
    attempt(() => "10" + fixed6(comp + (term ? "|" : ""))),
    attempt(() => "00" + spq("", comp, term)),
    /^\d+$/.test(comp) ? "01" + leb128(parseInt(comp, 10)) : null,
    w !== undefined && w <= 255 ? "11" + w.toString(2).padStart(8, "0") : null,
  ]);
}

function segPQ(path: string, query: string, frag: string): string {
  if (frag) throw new Error("no fragment in segmented");
  let bits = "";
  const items = buildItems(path, query !== "");
  items.forEach((item, i) => {
    if (item === "/") { bits += "10"; return; }
    bits += "0" + segComponent(item, i + 1 < items.length || query !== "");
  });
  if (query) {
    bits += "11";
    query.split("&").forEach((param, i, arr) => {
      const eq = param.indexOf("=");
      const key = eq < 0 ? param : param.slice(0, eq);
      const val = eq < 0 ? "" : param.slice(eq + 1);
      const kwT = spq("?", key, true), kwN = spq("?", key, i + 1 < arr.length);
      const term = i + 1 < arr.length;
      bits += pickShortest([
        attempt(() => "10" + kwT + fixed6(val + (term ? "|" : ""))),
        attempt(() => "00" + kwT + spq("=", val, term)),
        /^\d+$/.test(val) ? "01" + leb128(parseInt(val, 10)) + kwN : null,
      ]);
    });
  }
  if (!bits) throw new Error("empty");
  return bits;
}

function combPQ(path: string, query: string, frag: string): string {
  let s = path + (query ? "?" + query : "") + (frag ? "#" + frag : "");
  if (s.startsWith("/") && (s.length === 1 || s[1] !== "#")) s = s.slice(1);
  if (!s) throw new Error("empty combined");
  return C().cpq.encode([...s]);
}

function templatePQ(path: string, query: string, frag: string): string {
  if (frag) throw new Error();
  if (path.length >= 2 && path.endsWith("/")) throw new Error();
  if (query.endsWith("&")) throw new Error();
  const pp = path.split("/").filter(Boolean);
  if (pp.length > 1) throw new Error();
  let pw = "";
  if (pp.length === 1) {
    const w = KNOWN_WORDS[pp[0]];
    if (w === undefined || w > 255) throw new Error();
    pw = pp[0];
  }
  const params = query.split("&").filter(Boolean);
  params.forEach((param, i) => {
    const eq = param.indexOf("=");
    if (eq < 0) throw new Error();
    if (param.slice(0, eq) !== (i === 0 ? "p" : `p${i}`)) throw new Error();
  });
  let bits = "";
  if (pw) bits += "0" + KNOWN_WORDS[pw].toString(2).padStart(8, "0");
  if (params.length) {
    bits += "1";
    params.forEach((param, i) => {
      const val = param.slice(param.indexOf("=") + 1), term = i + 1 < params.length;
      bits += pickShortest([
        attempt(() => "10" + fixed6(val + (term ? "|" : ""))),
        attempt(() => "00" + spq("=", val, term)),
        /^\d+$/.test(val) ? "01" + leb128(parseInt(val, 10)) : null,
      ]);
    });
  }
  if (!bits) throw new Error();
  return bits;
}

function parseURL(url: string) {
  if (!url.toLowerCase().startsWith("https://")) throw new Error("Only https is supported");
  const rest = url.slice(8);

  const hashAt = rest.indexOf("#");
  const beforeFrag = hashAt >= 0 ? rest.slice(0, hashAt) : rest;
  const frag = hashAt >= 0 ? rest.slice(hashAt + 1) : "";

  const queryAt = beforeFrag.indexOf("?");
  const beforeQuery = queryAt >= 0 ? beforeFrag.slice(0, queryAt) : beforeFrag;
  const query = queryAt >= 0 ? beforeFrag.slice(queryAt + 1) : "";

  const slashAt = beforeQuery.indexOf("/");
  return {
    host: (slashAt >= 0 ? beforeQuery.slice(0, slashAt) : beforeQuery).toLowerCase(),
    path: slashAt >= 0 ? beforeQuery.slice(slashAt) : "",
    query,
    frag,
  };
}

/** 壓縮後的 payload 上限；超過就塞不進環碼。 */
export const PAYLOAD_LIMIT_BITS = 128;

/** 不檢查長度的壓縮，給 estimatePayloadBits() 用。 */
export function compressBitsUnchecked(url: string): string {
  const { host: h0, path, query, frag } = parseURL(url);
  let host = h0, sub = 0;
  if (host.startsWith("appclip.")) { sub = 1; host = host.slice(8); }
  const hasPQ = !!(path || query || frag);
  let tt = 0, pq = "";
  if (hasPQ) {
    const cands: [string, number][] = [];
    try { cands.push([templatePQ(path, query, frag), 1]); } catch {}
    try {
      const cb = combPQ(path, query, frag);
      let sb: string | null = null;
      try { sb = segPQ(path, query, frag); } catch {}
      if (sb === null) cands.push(["0" + cb, 0]);
      else if (cb.length <= sb.length) cands.push(["0" + cb, 0]);
      else cands.push(["1" + sb, 0]);
    } catch {
      try { cands.push(["1" + segPQ(path, query, frag), 0]); } catch {}
    }
    if (cands.length === 0) throw new Error("cannot encode path/query");
    // 勝出的候選同時決定 template_type 旗標 —— 漏掉這個的話，
    // 解碼端會用錯的模式解析 path/query，掃出來就是別的網址。
    const winner = cands.reduce((best, c) => (c[0].length <= best[0].length ? c : best));
    pq = winner[0];
    tt = winner[1];
  }
  let bits = "1" + (tt === 1 ? "1" : "0") + (sub === 1 ? "1" : "0");
  const [hb, hf] = encodeHost(host, hasPQ);
  bits += { 0: "0", 1: "10", 2: "11" }[hf] + hb + pq;
  return bits;
}

function compressBits(url: string): string {
  const bits = compressBitsUnchecked(url);
  if (bits.length > PAYLOAD_LIMIT_BITS)
    throw new Error(
      `Compressed URL too large: ${bits.length} bits (max ${PAYLOAD_LIMIT_BITS}). ` +
      `Use estimatePayloadBits() to see how much you need to trim.`
    );
  return bits;
}

/**
 * 壓縮 URL → 128-bit payload（16 bytes，右對齊）。
 * 右對齊是 codec 真正吃的格式 —— 左移補齊會產生完全不同的環碼。
 */
export function compressURL(url: string): Uint8Array {
  return compressedBitsToPayload(compressBits(url));
}

/** 壓縮位元字串 → 16 bytes，右對齊（左邊補 0）。 */
export function compressedBitsToPayload(bits: string): Uint8Array {
  const v = BigInt("0b" + bits);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = Number((v >> BigInt(120 - 8 * i)) & 0xffn);
  return out;
}

export { compressBits };
