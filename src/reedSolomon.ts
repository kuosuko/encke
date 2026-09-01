/**
 * Reed-Solomon encoder — ZXing compatible (GenericGF algorithm, public spec)
 */
export interface GF { exp: Int32Array; log: Int32Array; size: number }

export function gfTables(primitive: number, size: number): GF {
  const exp = new Int32Array(size), log = new Int32Array(size);
  let x = 1;
  for (let i = 0; i < size; i++) {
    exp[i] = x; log[x] = i;
    x <<= 1;
    if (x >= size) x ^= primitive;
  }
  return { exp, log, size };
}

function mul(gf: GF, a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return gf.exp[(gf.log[a] + gf.log[b]) % (gf.size - 1)];
}

/** ZXing ReedSolomonEncoder.encode — returns the parity symbols */
export function rsEncode(msg: number[], ecBytes: number, gf: GF, fcr: number): number[] {
  // generator poly
  let gen = [1];
  for (let i = 0; i < ecBytes; i++) {
    const a = gf.exp[(fcr + i) % (gf.size - 1)];
    const ng = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) { ng[j] ^= gen[j]; ng[j + 1] ^= mul(gf, gen[j], a); }
    gen = ng;
  }
  const res = msg.concat(new Array(ecBytes).fill(0));
  for (let i = 0; i < msg.length; i++) {
    const c = res[i];
    if (c !== 0) for (let j = 1; j < gen.length; j++) res[i + j] ^= mul(gf, gen[j], c);
  }
  return res.slice(msg.length);
}
