# Security

## Reporting

Email <suko@sz.ws>. Please do not open a public issue for a vulnerability.

Include what you can reproduce and the version. You will get a reply within a
week; if the report is valid, a fix and a note in the release.

## What is in scope

The parts of this package that handle input someone else controls:

- **`encke/handler`** — the HTTP endpoint. Anything that gets markup, a script,
  or an external reference into a served SVG; anything that makes the endpoint
  serve a response for a host outside a configured `allowedHosts`; resource
  exhaustion from a single request.
- **`generateAppClipCode`** — the `url`, `center` and `lockupSvg` options are
  written into the output SVG. `url` is escaped; `center` and `lockupSvg` are
  inserted as markup **by design**, because they are your own artwork. If you
  pass untrusted input to those two, sanitize it first — the playground's
  `sanitizeSvg` shows one way. A path where `url` escapes its attribute is a
  vulnerability; `center` rendering markup you handed it is not.
- **The CLI**, when given a URL or an SVG file from somewhere you do not trust.

## Two things to know before deploying the endpoint

Both are documented, and both are easy to get wrong:

- **Set `allowedHosts`.** Without it, a public endpoint will generate codes
  pointing at anyone's site, at your expense and under your domain.
- **Custom artwork is deliberately not exposed over HTTP.** `center` accepts
  only `disc` or `none`. Accepting SVG markup in a query parameter would let a
  caller place arbitrary markup inside a document served from your origin, and
  SVG is scriptable when opened directly. If you re-expose that yourself, you
  own the consequence.

## Out of scope

- The contents of `data/` — see [NOTICE.md](./NOTICE.md). Licensing questions
  are not security reports.
- Codes that do not scan. That is a bug; open an issue.
- Anything requiring an attacker to already control the machine running the
  generator.
