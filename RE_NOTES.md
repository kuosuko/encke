# App Clip Code RE Notes

逆向自 `/Library/Developer/AppClipCodeGenerator`（v1.3.6）與其內附的
`URLCompression.framework`。所有結論都以原生工具當 oracle 逐位驗證過，
驗證方式見 `scripts/gen-oracle.mjs` 與 `test/oracle.test.ts`。

## 狀態

| 模組 | 狀態 |
|---|---|
| URL 壓縮（Huffman / wordbook / TLD 表 / 三種 host format） | ✅ 790 組 URL 與原生逐位一致 |
| Codec（RS + scramble + 128-bit 置換） | ✅ 與原生一致 |
| Render（bits → 弧線幾何） | ✅ 52 組 fixture 逐弧一致 |
| 配色（18 組模板三元組） | ✅ 與原生完全相同 |
| 自訂配色的輔助色 | ⚠️ 近似：85 組取樣中 82% 完全相同，其餘都在一個 4-bit 級距內 |
| 配色可掃描性判定 | ⚠️ 近似：624 組取樣中 97.1% 與原生判定一致 |

## URL 壓縮

```
raw = [1 begin][template_type:1][subdomain:1][host_format][host bits][path/query bits]
限制：rawBits ≤ 128
```

**host format**（三種都算過再挑最短，長度相同時取編號大的）
- `0`  = 20 個高頻 TLD 的 Huffman code + domain
- `10` = 113 個固定 TLD 的 8-bit 索引 + domain（索引 1–113 連續；0 量不到，
        那格對應的 TLD 一定落在 Huffman 那 20 個裡，編碼端用不到）
- `11` = 整條 host 走 Huffman

host 內以最後一個 `.` 切 domain / tld；後面還有 path 或 query 時，字串尾端加 `|`。

**path / query**
- `template_type=1`：單一 path word（`0` + 8-bit 索引）+ query（key 必須是 `p`, `p1`, `p2`…）
- `template_type=0`：`0` = combined（CPQ 整串 Huffman），`1` = segmented，取短者
- segmented 的每個 component：`00` SPQ 文字 / `01` LEB128 / `10` fixed6 / `11` wordbook
- 只有 `/` 的 path 在後面有 query 時不佔位元

**tie-break（很重要，選錯就會編出不同的碼）**
- 候選長度相同時，偏好序是 `wordbook > leb128 > spq > fixed6`
- host format 長度相同時取編號大的
- template 與非 template 長度相同時取非 template

**trie 格式**（`data/{h,spq,cpq}.data`）
```
node_count = 1 + k + k²（深度 0..2），每個 node k 個 uint16 BE 頻率
child(node, sym) = k * node + 1 + sym
深度 ≥ 2 之後：prev = (node - 1) % k，下一個 node = child(1 + prev, sym)
```
k：host 39、spq 71、cpq 75。三張表都是稠密的，合計約 1.7 MB。

**Huffman**：min-heap；長度相同時比「子樹最左葉」的符號序（不是子樹裡字母序最小的
符號 —— 這兩者只在少數節點不同，但足以編出錯的碼）；先彈出的當左子樹（`0`）。

**常數表來源**：wordbook 與 TLD 表在 binary 裡是連續字串區塊，但短字串會被 linker
去重到別處，`strings` 讀出來會缺項 —— 必須再用原生工具逐項量索引才對得起來
（`scripts/extract-wordbook.mjs` 只負責印出可見區塊供人工核對）。

## Codec

```
輸入：rawBits（壓縮後的 URL）→ 右對齊補到 128 bit → 16 bytes

1. trimmed = payload 去前導 0x00
   ver = len(trimmed) ≤ 14 ? 0 : 1
   v0: A=9, B=4, C=5, D=2    v1: A=11, B=2, C=5, D=2    totalData = A + C
2. padded = 左補 0x00 到 totalData（保留尾端資料）
3. scrambled[i] = padded[totalData-1-i] XOR 0xA5
4. gaps_msg = scrambled[:A]
   gaps = gaps_msg + RS(gaps_msg, B)        GF(256), prim 0x11D, fcr 1
   gap_bits = 每 byte MSB-first → 104 bits
5. gap_bits 的 0 的個數 ≤ 51 → 整條反相，inv = 1
6. metadata = [ver >> 3, inv | ((ver & 7) << 1)]
   meta_bits = (metadata + RS(metadata, 2))  GF(16), prim 0x13, fcr 0，每 symbol 4 bit → 16 bits
7. arcs_msg = scrambled[totalData-C:]
   arcs = arcs_msg + RS(arcs_msg, D)        → 56 bits
8. prePerm = [meta 16][gaps 104][template 8]，template = 0x2A LSB-first = 01010100
9. output[LUT[i]] = prePerm[i]              LUT 見 src/codecRender.ts
10. final = permuted(128) + '0' + arcs(56) + gap_bits[:max(0, z128 - 56)]
```

RS 就是 ZXing 的 `GenericGF(primitive, size, fcr)`，exp/log 表標準構造。

## Render

```
128 個 slot 分 5 個 ring：[17, 23, 26, 29, 33]
半徑   [177.2016, 224.1012, 271.0008, 317.9004, 364.8]
rotate [-78, -85, -70, -63, -70]
halfGap[7.5, 5.6, 5.0, 4.2, 3.5]     stroke 23.5

gap bits     = final[0:128]   bit 0 = 可見（畫弧），bit 1 = 隱藏
color stream = final[128:]    0 = 前景色，1 = 輔助色
```

每個可見 slot 一條獨立的弧（同色相鄰不合併），向右吃掉後面連續的隱藏 slot，
**而且會繞過 0 度** —— 環上最後一條可見弧要一路吃到開頭的隱藏 slot 為止。

```
arc_start = P * step + halfGap
arc_end   = (P + K) * step - halfGap      K = 1 + 吃掉的隱藏 slot 數
```

原生用 `sweep=0` 反向畫，我們用 `sweep=1` 正向畫 —— 同一段弧，端點排序後可逐點比對。

畫布：`--logo none` 是 `viewBox="0 0 800 800"`、無位移；`--logo badge` 是
`viewBox="-50 -50 900 1100"` 並整體 `translate(-0.99 -3.8)`，下方留給 lockup。
中心識別區直徑約 210 units（原生相機圖示是 `scale(1.874)`）。

## 配色

18 組模板其實是**三色**：前景、背景、還有一個較淡的輔助色（`data-color="1"` 的弧）。
輔助色不是灰色 —— teal `00A6A1` 配的是 `88DDCC`。三個 channel 都落在 4-bit 調色盤上
（每個 byte 是重複的 nibble）。完整三元組見 `src/colors.ts`。

原生會拒絕對比不足的配色。從 624 組取樣擬合出來的界線是
`|Δluma(Rec.601)| ≥ 100` 且 `WCAG 對比 ≥ 2.8`，一致率 97.1%，且 18 組內建全部通過。

## 工具

```bash
node scripts/gen-oracle.mjs       # 重建 test/fixtures/oracle.json（需 macOS + 原生工具）
node scripts/extract-wordbook.mjs # 印出 binary 裡的 wordbook 字串區塊
npm run test:oracle               # 重建 fixture 後跑測試
```
