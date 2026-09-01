/**
 * Codec + Render — 已用原生 oracle 驗證（su/sv/st 208bits 全一致）
 * 演算法詳見 RE_NOTES.md
 */
import { gfTables, rsEncode } from "./reedSolomon";
const E8L8 = gfTables(0x11d, 256), E4L4 = gfTables(0x13, 16);

const LUT = [16,0,1,2,4,5,6,7,30,31,32,33,34,36,37,38,127,95,94,66,65,17,18,19,101,102,103,71,72,46,23,24,114,115,116,117,83,84,56,57,118,119,120,85,86,87,58,59,96,97,98,67,68,41,42,20,104,105,73,74,75,47,48,25,8,9,10,11,12,13,14,15,121,122,123,88,89,60,61,62,124,125,126,91,92,93,64,39,100,69,70,43,44,21,22,3,111,112,113,80,81,82,54,53,106,107,108,76,77,49,50,26,109,110,78,79,51,52,28,29,27,35,40,45,55,63,90,99];

export function encodePayload(p16: Uint8Array): string {
  let t = [...p16]; while (t.length && t[0] === 0) t.shift();
  const ver = t.length <= 14 ? 0 : 1;
  const A = ver ? 11 : 9, B = ver ? 2 : 4, C = 5, D = 2, total = A + C;
  const padded = new Uint8Array(total); padded.set(t.slice(-total), total - Math.min(t.length, total));
  const scr = new Uint8Array(total);
  for (let i = 0; i < total; i++) scr[i] = padded[total - 1 - i] ^ 0xa5;
  const gmsg = [...scr.slice(0, A)];
  const gaps = gmsg.concat(rsEncode(gmsg, B, E8L8, 1));
  let gb = gaps.map(s => s.toString(2).padStart(8, "0")).join("");
  const z = (gb.match(/0/g) || []).length, inv = z <= 51;
  if (inv) gb = gb.split("").map(c => c === "0" ? "1" : "0").join("");
  const meta = [ver >> 3, (inv ? 1 : 0) | ((ver & 7) << 1)];
  const mb = meta.concat(rsEncode(meta, 2, E4L4, 0)).map(s => s.toString(2).padStart(4, "0")).join("");
  const amsg = [...scr.slice(total - C)];
  const ab = amsg.concat(rsEncode(amsg, D, E8L8, 1)).map(s => s.toString(2).padStart(8, "0")).join("");
  const pre = mb + gb + "01010100";
  const perm = new Array<string>(128);
  for (let i = 0; i < 128; i++) perm[LUT[i]] = pre[i];   // output[LUT[i]] = pre[i]
  let bits = perm.join("");
  const z128 = (bits.match(/0/g) || []).length;
  return bits + "0" + ab + gb.slice(0, Math.max(0, z128 - 56));
}

export const RING_SLOTS = [17, 23, 26, 29, 33] as const;
export const RING_R = [177.2016, 224.1012, 271.0008, 317.9004, 364.8] as const;
export const RING_ROT = [-78, -85, -70, -63, -70] as const;
export const HALF_GAP = [7.5, 5.6, 5.0, 4.2, 3.5] as const;
export const STROKE_WIDTH = 23.5;

/** bits → 每個可見 slot 的 {ring, slotIndex, color}（弧向右延伸吸收隱藏 slot）*/
export function bitsToArcs(bits: string) {
  const gap = bits.slice(0, 128), colors = bits.slice(128);
  const arcs: { ring: number; slot: number; color: 0 | 1; startDeg: number; endDeg: number }[] = [];
  let ci = 0, off = 0;
  RING_SLOTS.forEach((n, ring) => {
    const vis: (0 | 1 | null)[] = [];
    for (let i = 0; i < n; i++) {
      if (gap[off + i] === "0") {
        const c: 0 | 1 = colors[ci++] === "1" ? 1 : 0;
        vis.push(c);
      } else {
        vis.push(null);
      }
    }
    off += n;
    const step = 360 / n, hg = HALF_GAP[ring];
    for (let i = 0; i < n; i++) {
      if (vis[i] === null) continue;
      // 每條弧往右吃掉連續的隱藏 slot，且會繞過 0 度 ——
      // 環上最後一條可見弧要一路吃到開頭的隱藏 slot 為止。
      let k = i + 1;
      while (k < i + n && vis[k % n] === null) k++;
      arcs.push({ ring, slot: i, color: vis[i]!, startDeg: i * step + hg, endDeg: k * step - hg });
    }
  });
  return arcs;
}

export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(rad(startDeg)), sy = cy + r * Math.sin(rad(startDeg));
  const ex = cx + r * Math.cos(rad(endDeg)), ey = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(6)} ${sy.toFixed(6)} A ${r.toFixed(6)} ${r.toFixed(6)} 0 ${large} 1 ${ex.toFixed(6)} ${ey.toFixed(6)}`;
}
