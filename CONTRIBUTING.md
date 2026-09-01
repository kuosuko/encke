# Contributing

## Setup

```bash
npm install
```

`npm install` runs `prepare`, which builds `dist/` and regenerates
`src/trie-data.generated.ts` — a 1.5 MB gzip+base64 copy of the compression
tables. That file is gitignored and will not exist in a fresh checkout until
you install. If typecheck complains it cannot find it, you skipped the install.

```bash
npm test              # 173 tests
npm run typecheck
npm run build
npm run playground    # the demo site on :5199
```

## Before opening a PR

```bash
npm run typecheck && npm test && npm run test:pack
```

`test:pack` is the one that catches what the others cannot. The unit tests run
against the source tree through a vitest alias, so they never exercise the
`exports` map, the `bin` entry, `dist/`'s relative path to `data/`, or the
self-referencing `import("@sz.ws/encke/tables")`. `test:pack` builds a tarball,
installs it into a scratch project, and imports through every entry point. It
takes about a minute and it has caught real bugs that shipped-looking code hid.

The playground is not in `tsconfig.json`'s `include`, so `npm run typecheck`
does not cover it. If you touched it:

```bash
npx tsc --noEmit -p playground/tsconfig.json && npm run playground:build
```

## The oracle tests

`test/fixtures/oracle.json` holds outputs from Apple's real
`AppClipCodeGenerator`, and the compressor is checked bit-for-bit against them.
The fixtures are committed, so the tests run anywhere.

Regenerating them is different: `npm run test:oracle` shells out to the native
tool and therefore needs macOS with Apple's AppClipCodeGenerator installed. If
you do not have it, do not regenerate — a fixture file rebuilt from anything
other than the real tool is worse than useless, because it makes wrong output
look verified.

If you change the compressor and the oracle tests fail, the compressor is
wrong. That is the whole point of them.

## Things worth knowing

- **The tables in `data/` are not ours.** See [NOTICE.md](./NOTICE.md) before
  proposing anything that changes how they are sourced or distributed.
- **Numbers taken from native output are specs, not preferences.** The
  identification circle is 213.4486 units because that is what the camera
  expects; a comment above each such constant records how it was measured.
  If you change one, show the measurement.
- **Comments explain why.** Several record findings that took a long time to
  pin down, or failure modes that are invisible from the code. Keep that habit;
  a comment restating the line below it is worse than none.
- Comments and documentation are in English.

## Commit messages

```
<type>: <description>
```

`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. Explain what
broke and why the change is right, not just what you touched.
