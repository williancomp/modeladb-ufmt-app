# Contributing

Issues and pull requests are welcome. This is research software maintained by one author, so please keep
changes small and include tests.

## Setup

```bash
npm ci
npm run dev          # http://localhost:5173
```

Node `^20.19.0 || >=22.12.0`. The evaluation also requires Docker (the database and ORM containers are
pinned in `evaluation/images.lock.json`).

## Checks before a pull request

```bash
npm run lint
npm test                 # Vitest unit tests
npm run build
npm run test:e2e         # Playwright; first run: npx playwright install chromium
                         # (or set E2E_CHANNEL=chrome to use installed Chrome)
npm run evaluate         # optional, needs Docker; regenerates evaluation/results
```

## Conventions

* Keep commits small and use conventional prefixes (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`).
* Include a regression test with every bug fix.
* Repository documentation is written in English; in-app copy has Portuguese keys with English translations in
  `src/i18n/en.json`. New user-visible text needs both.
* Diagram surface interactions (pointer, touch, drag threshold, selection, contextual submenu, inline editors and
  keyboard shortcuts) are specified in `docs/INTERACTION.md`; changes to `src/canvas/` or `src/app.js` must keep
  that contract and the Playwright suite in `e2e/` in sync.
* Do not weaken an oracle in `evaluation/oracles/` to make a result pass: a mismatch is a finding. See
  `evaluation/README.md`.
* The public build must not collect or transmit data. The e2e suite fails on any request leaving localhost.

## Reporting a problem

Include the browser, steps to reproduce, and, if possible, the `.merdb` file (remove anything private first).
