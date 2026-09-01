# Notice

## Not affiliated with Apple

This project is an independent reimplementation. It is not made by, endorsed by,
or affiliated with Apple Inc. "Apple", "App Clip", and "App Clip Code" are
trademarks of Apple Inc., used here only to describe what this software is
compatible with — a use this project believes to be nominative fair use.

## What is and is not covered by the MIT license

The MIT license in [LICENSE](./LICENSE) covers the source code in this
repository: the compressor, the Reed-Solomon implementation, the renderer, the
CLI, the React components, the HTTP handler, the tests, and the playground.
All of it was written from scratch.

**It does not cover the three files in `data/`.** Those are described below,
and the author makes no copyright claim over them and cannot grant you a
license to them.

## The compression tables in `data/`

| File | Size | What it is |
|---|---|---|
| `data/h.data` | 122 KB | Huffman frequency model for host names |
| `data/spq.data` | 726 KB | Order-2 frequency model for path and query segments |
| `data/cpq.data` | 855 KB | Order-2 frequency model for path and query characters |

These are byte-for-byte extracts of static data structures found in Apple's
`URLCompression.framework`, which ships as part of the macOS
AppClipCodeGenerator tool. They were not authored here, and they were not
reverse-engineered into an equivalent form — they are the original bytes.

**Why they are here.** An App Clip Code is only useful if an iPhone can scan it,
and the phone decompresses the URL using exactly these frequency models. A
different table — even a statistically similar one built from scratch — produces
a bitstream the phone decodes into a different URL, or into nothing. There is no
way to interoperate without the identical data.

**The legal position this project takes.** Extracting and using an interface
specification for the purpose of interoperability is protected in several
jurisdictions: in the EU by Article 6 of Directive 2009/24/EC, and in the US by
the interoperability exemption at 17 U.S.C. § 1201(f) together with the fair-use
reasoning in *Sega Enterprises v. Accolade* (9th Cir. 1992) and *Sony Computer
Entertainment v. Connectix* (9th Cir. 2000). Those authorities are strongest
when applied to *analysing* a work in order to interoperate with it. They are
less settled when applied to *redistributing* the extracted data itself, which
is what this repository does.

**What that means for you.** This is a genuine and unresolved legal question,
not a solved one. If you are shipping this in a commercial product, in a
jurisdiction with different rules, or anywhere the answer matters to you, get
your own legal advice rather than relying on this file. You can also avoid the
question entirely: nothing here requires the bundled copies. Point `loadTables`
at tables you extract yourself from your own licensed copy of Apple's tool —
see `setDataDir()` and `loadTables({ baseUrl })`.

If Apple would prefer these files not be redistributed, contact
<suko@sz.ws> and they will be removed.

## `RE_NOTES.md`

[RE_NOTES.md](./RE_NOTES.md) documents how the format was worked out, and names
the specific version of Apple's tool it was checked against. It is published so
the implementation can be audited and corrected rather than taken on trust.
Apple's developer tool license terms contain restrictions on reverse
engineering; this project's position is that the interoperability authorities
above apply, with the same caveat as the section above.

## What this project does not contain

No Apple source code, no Apple artwork, no Apple icons, no Apple fonts. The
center of a generated code is a plain disc, or whatever artwork you supply —
Apple's camera glyph is a trademark and is not reproduced here. The ring
geometry is computed, not copied.
