# Third-party notices

ModelaDB itself is released under the MIT License (see `LICENSE`). The
production bundle produced by `npm run build` includes the third-party
fonts, styles, and runtime JavaScript packages (`dependencies` in
`package.json` and their transitive runtime dependencies in `node_modules/`)
listed below, except the `@types/*` packages, which are type declarations only
and are not bundled. The build writes the full licence text of every bundled
component to `dist/THIRD_PARTY_LICENSES.txt`, which the About dialog links to.

## Bundled fonts and build-time styles

| Component | Where it appears | Licence | Licence text |
|---|---|---|---|
| Poppins typeface (Copyright 2020 The Poppins Project Authors, <https://github.com/itfoundry/Poppins>) | `fonts/*.woff2`, referenced by `fonts.css` and copied into `dist/assets/` | SIL Open Font License 1.1 | `licenses/Poppins-OFL.txt` |
| Tailwind CSS 4.3.3 (Copyright (c) Tailwind Labs, Inc.) | Utility CSS generated at build time by `@tailwindcss/vite` into `dist/assets/*.css` (including Tailwind's preflight reset) | MIT | `licenses/Tailwind-MIT.txt` |

## Runtime JavaScript dependencies (`dependencies` and transitive runtime packages)

The diagram surface (`src/canvas/`) uses React and React Flow (`@xyflow/react`).
The direct runtime dependencies declared in `package.json` and all transitive
runtime packages installed under `node_modules/` are listed below with their
licences as recorded in each package's `package.json` and `LICENSE` file in
`node_modules/`:

| Package | Version in `node_modules` | Role | Licence | Copyright / Notice (`node_modules/<pkg>/LICENSE`) |
|---|---|---|---|---|
| `react` | 19.3.1 | Direct runtime dependency | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-dom` | 19.3.1 | Direct runtime dependency | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `scheduler` | 0.28.0 | Transitive (`react-dom`) | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `@xyflow/react` | 12.12.0 | Direct runtime dependency | MIT | Copyright (c) 2019-2025 webkid GmbH |
| `@xyflow/system` | 0.0.83 | Transitive (`@xyflow/react`) | MIT | Copyright (c) 2019-2025 webkid GmbH |
| `classcat` | 5.0.5 | Transitive (`@xyflow/react`) | MIT | Copyright © Jorge Bucaran |
| `zustand` | 4.5.7 | Transitive (`@xyflow/react`) | MIT | Copyright (c) 2019 Paul Henschel |
| `use-sync-external-store` | 1.7.0 | Transitive (`zustand`) | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `d3-color` | 3.1.0 | Transitive (`@xyflow/system` via `d3-interpolate`, `d3-transition`) | ISC | Copyright 2010-2022 Mike Bostock |
| `d3-dispatch` | 3.0.1 | Transitive (`@xyflow/system` via `d3-drag`, `d3-transition`, `d3-zoom`) | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-drag` | 3.0.0 | Transitive (`@xyflow/system`) | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-ease` | 3.0.1 | Transitive (`@xyflow/system` via `d3-transition`) | BSD-3-Clause | Copyright 2010-2021 Mike Bostock; Copyright 2001 Robert Penner |
| `d3-interpolate` | 3.0.1 | Transitive (`@xyflow/system`) | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-selection` | 3.0.0 | Transitive (`@xyflow/system`) | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-timer` | 3.0.1 | Transitive (`@xyflow/system` via `d3-transition`) | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-transition` | 3.0.1 | Transitive (`@xyflow/system` via `d3-zoom`) | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-zoom` | 3.0.0 | Transitive (`@xyflow/system`) | ISC | Copyright 2010-2021 Mike Bostock |
| `@types/d3-color` | 3.1.3 | Transitive (`@xyflow/system` via `@types/d3-interpolate`) | MIT | Copyright (c) Microsoft Corporation. |
| `@types/d3-drag` | 3.0.7 | Transitive (`@xyflow/system`) | MIT | Copyright (c) Microsoft Corporation. |
| `@types/d3-interpolate` | 3.0.4 | Transitive (`@xyflow/system`) | MIT | Copyright (c) Microsoft Corporation. |
| `@types/d3-selection` | 3.0.12 | Transitive (`@xyflow/system`) | MIT | Copyright (c) Microsoft Corporation. |
| `@types/d3-transition` | 3.0.9 | Transitive (`@xyflow/system`) | MIT | Copyright (c) Microsoft Corporation. |
| `@types/d3-zoom` | 3.0.9 | Transitive (`@xyflow/system`) | MIT | Copyright (c) Microsoft Corporation. |

## Provenance of the licence files

- `licenses/Poppins-OFL.txt` is a verbatim copy of `ofl/poppins/OFL.txt` from
  <https://github.com/google/fonts>, the source of the woff2 subsets served by
  Google Fonts that are bundled here. It was compared byte for byte with the
  upstream file when the release was prepared.
- `licenses/Tailwind-MIT.txt` is a verbatim copy of `LICENSE` from
  <https://github.com/tailwindlabs/tailwindcss> and of the `LICENSE` file shipped
  in the installed `tailwindcss@4.3.3` package.

The font files are redistributed unmodified and are not sold by themselves, as
the OFL requires. The Reserved Font Name clause does not apply because no
modified version of the font is distributed.

## Attribution of React Flow

React Flow's documentation asks that its attribution link stay visible unless the project subscribes to React Flow
Pro. ModelaDB keeps it visible, in the application and in the figures generated by `npm run figures`.

## Development-only tools

The following packages are installed by `npm ci` for development, testing and
evaluation only. They are not part of the distributed bundle and keep their own
licences (see each package in `node_modules/` after installation):
Vite, `@tailwindcss/vite`, Vitest, `@vitest/coverage-v8`, ESLint, `@eslint/js`, `globals`, Prettier, Playwright, AJV,
`ajv-formats`, `graphql`, `pg` and `mysql2`.
The evaluation additionally pulls Docker images (PostgreSQL, MySQL, MariaDB,
Node, Python, PHP, Prisma); these are used as external programs and are not
redistributed by this repository.
