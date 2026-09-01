# App Clip Code RE Notes

Reverse-engineered from `/Library/Developer/AppClipCodeGenerator` (v1.3.6) and
the `URLCompression.framework` it bundles. Every conclusion here was verified
bit-for-bit against the native tool used as an oracle — see
`scripts/gen-oracle.mjs` and `test/oracle.test.ts`.

## Status

| Module | Status |
|---|---|
| URL compression (Huffman / wordbook / TLD tables / three host formats) | ✅ bit-identical to native across 790 URLs |
| Codec (RS + scramble + 128-bit permutation) | ✅ identical to native |
| Render (bits → arc geometry) | ✅ arc-for-arc identical across 52 fixtures |
| Colors (the 18 template triples) | ✅ exactly native's values |
| Tint for custom colors | ⚠️ approximate: exact in 82% of an 85-pair sample, and always within one 4-bit step |
| Color scannability verdict | ⚠️ approximate: agrees with native on 97.1% of a 624-pair sample |

## URL compression

```
raw = [1 begin][template_type:1][subdomain:1][host_format][host bits][path/query bits]
constraint: rawBits ≤ 128
```

**host format** (all three are computed, the shortest wins; on a tie the higher-numbered one)
- `0`  = Huffman code for one of the 20 high-frequency TLDs + domain
- `10` = 8-bit index into the 113 fixed TLDs + domain (indices 1–113 are
        contiguous; 0 cannot be measured, because whatever TLD sits there is
        necessarily one of the Huffman 20 and the encoder never reaches it)
- `11` = the whole host through Huffman

The host splits into domain / tld at the last `.`; when a path or query follows,
a `|` is appended to the string.

**path / query**
- `template_type=1`: a single path word (`0` + 8-bit index) + query (keys must be `p`, `p1`, `p2`…)
- `template_type=0`: `0` = combined (the whole string through CPQ Huffman), `1` = segmented; shorter wins
- each component of a segmented path: `00` SPQ text / `01` LEB128 / `10` fixed6 / `11` wordbook
- a bare `/` path costs nothing when a query follows

**Tie-breaks (these matter — get one wrong and you encode a different code)**
- Equal-length candidates prefer `wordbook > leb128 > spq > fixed6`
- Equal-length host formats take the higher number
- Equal-length template vs non-template takes non-template

**trie format** (`data/{h,spq,cpq}.data`)
```
node_count = 1 + k + k² (depths 0..2), each node holding k uint16 BE frequencies
child(node, sym) = k * node + 1 + sym
past depth 2: prev = (node - 1) % k, next node = child(1 + prev, sym)
```
k is 39 for host, 71 for spq, 75 for cpq. All three tables are dense, ~1.7 MB together.

**Huffman**: a min-heap; ties compare the symbol order of the subtree's
**leftmost leaf** — not the alphabetically smallest symbol in the subtree. Those
two differ at only a handful of nodes, but that is enough to emit a wrong code.
The first node popped becomes the left subtree (`0`).

**Where the constant tables came from**: the wordbook and TLD tables sit in the
binary as contiguous string blocks, but the linker deduplicates short strings
elsewhere, so `strings` reads back with entries missing — every index has to be
measured against the native tool to line up. (`scripts/extract-wordbook.mjs`
only prints the visible blocks for manual cross-checking.)

## Codec

```
input: rawBits (the compressed URL) → right-aligned and padded to 128 bits → 16 bytes

1. trimmed = payload with leading 0x00 removed
   ver = len(trimmed) ≤ 14 ? 0 : 1
   v0: A=9, B=4, C=5, D=2    v1: A=11, B=2, C=5, D=2    totalData = A + C
2. padded = left-pad with 0x00 to totalData (keeping the trailing data)
3. scrambled[i] = padded[totalData-1-i] XOR 0xA5
4. gaps_msg = scrambled[:A]
   gaps = gaps_msg + RS(gaps_msg, B)        GF(256), prim 0x11D, fcr 1
   gap_bits = each byte MSB-first → 104 bits
5. if gap_bits has ≤ 51 zeros → invert the whole run, inv = 1
6. metadata = [ver >> 3, inv | ((ver & 7) << 1)]
   meta_bits = (metadata + RS(metadata, 2))  GF(16), prim 0x13, fcr 0, 4 bits per symbol → 16 bits
7. arcs_msg = scrambled[totalData-C:]
   arcs = arcs_msg + RS(arcs_msg, D)        → 56 bits
8. prePerm = [meta 16][gaps 104][template 8], where template = 0x2A LSB-first = 01010100
9. output[LUT[i]] = prePerm[i]              LUT is in src/codecRender.ts
10. final = permuted(128) + '0' + arcs(56) + gap_bits[:max(0, z128 - 56)]
```

The RS here is ZXing's `GenericGF(primitive, size, fcr)`, with the standard
exp/log table construction.

## Render

```
128 slots across 5 rings: [17, 23, 26, 29, 33]
radius  [177.2016, 224.1012, 271.0008, 317.9004, 364.8]
rotate  [-78, -85, -70, -63, -70]
halfGap [7.5, 5.6, 5.0, 4.2, 3.5]     stroke 23.5

gap bits     = final[0:128]   bit 0 = visible (draw an arc), bit 1 = hidden
color stream = final[128:]    0 = foreground, 1 = tint
```

Every visible slot gets its own arc (adjacent same-colour arcs are not merged).
Each arc extends rightwards over the run of hidden slots that follows it, **and
that run wraps past 0°** — the last visible arc on a ring has to extend all the
way to the first hidden slot at the start.

```
arc_start = P * step + halfGap
arc_end   = (P + K) * step - halfGap      K = 1 + the number of hidden slots absorbed
```

Native draws with `sweep=0` (reversed); we draw with `sweep=1` (forward) — the
same arc either way, and point-comparable once the endpoints are sorted.

Canvas: `--logo none` is `viewBox="0 0 800 800"` with no offset; `--logo badge`
is `viewBox="-50 -50 900 1100"` with an overall `translate(-0.99 -3.8)`, leaving
room for a lockup underneath.

The identification circle is 213.4486 units across. Native's centre group is
`<g id="Logo" transform="translate(293.275699 293.275699) scale(1.874)">`
wrapped around a shape 113.9000015 wide, giving a radius of 106.7243 — and
293.275699 + 213.4486/2 lands exactly on 400, confirming it. That size is a
scanning spec, not an aesthetic choice.

## Colors

The 18 templates are really **three** colors: foreground, background, and a
lighter tint (the arcs with `data-color="1"`). The tint is not grey — teal
`00A6A1` pairs with `88DDCC`. All three channels land on a 4-bit palette (each
byte is a repeated nibble). The full triples are in `src/colors.ts`.

Native refuses pairs with insufficient contrast. Fitted against a 624-pair
sample, that boundary is `|Δluma(Rec.601)| ≥ 100` **and** `WCAG contrast ≥ 2.8`,
which agrees 97.1% of the time and passes all 18 built-ins.

## Tools

```bash
node scripts/gen-oracle.mjs       # rebuild test/fixtures/oracle.json (needs macOS + the native tool)
node scripts/extract-wordbook.mjs # print the wordbook string blocks found in the binary
npm run test:oracle               # rebuild the fixtures, then run the tests
```
