# Test fixtures

All three files come from Apple's native `AppClipCodeGenerator` (v1.3.6) on macOS.
They are committed so the suite runs anywhere — the native tool is only needed to
regenerate them.

| File | What it holds | Regenerate |
|---|---|---|
| `oracle.json` | Arc geometry per ring for 52 URLs, plus the colour triple for all 18 templates and 4 custom pairs | `node scripts/gen-oracle.mjs` |
| `color-tints.txt` | `foreground background tint` — 85 sampled pairs, the accuracy baseline for `tintFor()` on custom colours | see below |
| `color-validity.txt` | `foreground background OK\|NO` — 624 sampled pairs, the source of the `checkColors()` thresholds | see below |

The two `.txt` files were produced by sweeping the native tool over colour pairs and
recording what it emitted or rejected. They change only if Apple ships a new generator,
so there is no script for them; the sweep is described in `RE_NOTES.md`.
