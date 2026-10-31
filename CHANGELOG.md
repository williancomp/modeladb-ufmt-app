# Changelog

## 2.3.0

### Added
- `docs/INTERACTION.md`: pointer, touch and keyboard interaction contract for the diagram surface.
- `src/canvas/`: React Flow (`@xyflow/react`) diagram surface (`DiagramSurface.js`), custom node components
  (`src/canvas/nodes/`), custom edge component (`src/canvas/edges/DiagramEdge.js`), geometry helpers
  (`geometry.js`), contextual submenu and inline editors (`menus.js`), and PNG/SVG/PDF export (`imageExport.js`).
  The minimap uses React Flow's `MiniMap`.
- CI: a service-free `checks` matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`; lint, unit tests, build,
  Chromium end-to-end tests) and a Linux-only `evaluation` job that starts the database containers and runs
  `npm run evaluate`.
- `THIRD_PARTY_LICENSES.txt` in `dist/`: the full licence text of every bundled runtime package, Tailwind CSS and
  Poppins, generated at build time (`build/licensesPlugin.js`) and linked from the About dialog.
- `src/canvas/pointerDrag.js`: window-level pointer drags with `pointercancel` handling.
- A copy of the toolbar button follows the pointer while dragging a new object and while click placement is armed.
- `e2e/regressions.spec.js`: end-to-end tests for interaction edge cases.

### Fixed
- Dragging an element carries the bend points of its connections along (mouse and keyboard moves agree).
- After a marquee selection, clicking, shift-clicking, double-clicking or right-clicking a selected element works
  (the selection box no longer intercepts pointer events).
- A cancelled touch (`pointercancel`) no longer leaves a resize, bend-point drag or menu-connect drag attached to
  the pointer, and no longer fires a long-press menu 400 ms later.
- Pressing a resize handle or a bend point without moving it no longer consumes an undo step.
- Crow's Foot attribute rows respect click placement and connect mode.
- Long press on a post-it opens its menu; undo and redo close an open element menu.
- Wheel zoom and panning no longer rebuild every node and edge.

### Changed
- Performance evaluation: wheel-to-frame latency measured on the production build (`vite preview`), replacing the
  earlier Canvas 2D redraw CPU-time columns. The new series is not comparable with the old one.
- Figures keep the React Flow attribution visible.
- Firefox is not supported and its Playwright project was removed. Windows, Firefox and real devices (phones,
  tablets, touch screens) have not been tested; the end-to-end suite runs in Chromium on macOS and Linux.
- Replaced the HTML5 Canvas 2D editor surface in `src/app.js` with a React Flow (`@xyflow/react`, `react`,
  `react-dom`) island mounted in `#canvas`, while keeping the application shell, domain model, validation engine,
  `.merdb` persistence and code generators unchanged.
- Unified pointer and touch handling with a `5 px` drag threshold (`nodeDragThreshold={5}`) and synchronous
  contextual submenu activation on primary click/tap, right-click (`contextmenu`) and touch long-press.
- Updated `THIRD_PARTY_NOTICES.md` with runtime dependencies (`react`, `react-dom`, `@xyflow/react` and their
  transitive runtime dependencies).

## 2.2.0

First public release candidate (MIT licence).

### Added
- MIT `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CITATION.cff`, `.zenodo.json`, `README.md`, `docs/`.
- Playwright end-to-end suite (`npm run test:e2e`) and a V8 coverage report for `src/app.js`.
- `npm run evaluate`: corpus of 14 ER/EER models with hand-written oracles, DDL execution on PostgreSQL,
  MySQL, MariaDB and SQLite, ORM/schema target checks, mutation-based validation of the rules, SQL round
  trip, performance measurements; `npm run figures` for the screenshots.
- Rule R012: a dependent connection needs a minimum cardinality of at least 1.
- GitHub Actions workflow.

### Changed
- The default notation is named "Chen-style EER" (PT: "EER estilo Chen"): a Chen-inspired drawing with later
  EER constructs, not a reproduction of Chen (1976). Rule messages do not attribute rules to authors; each rule's
  `literature` field cites Chen (1976) with a section only where the paper supports it, otherwise it is marked as a
  modelling guideline of the tool. `docs/NOTATION.md` documents this mapping.
- Author and affiliation: Federal University of Mato Grosso (UFMT), Department of Computing and Technology.
- Chen notation: a single line is drawn for every connection; a double line marks only a dependent
  connection (together with the double rectangle and double diamond). Total participation is expressed by
  `min >= 1`. Marking a connection dependent sets a `min` of 0 to `1,1`.
- New connections start at `0,N` whether made by dragging or by the keyboard.
- Schema identifiers use `https://github.com/williancomp/modeladb-ufmt-app` through `src/config.js`
  (`VITE_MODELADB_BASE_URL` overrides it).
- `dist/` is no longer tracked.

### Fixed
- The cardinality editor's hint (`title`) was not translated; its labels now follow the interface language.
- Metadata of rule CF001 named the notation `crowsfoot` while the selector uses `crow`.
- English text of the connect hint said Shift+Click.
- Quick-connect hint said Shift+click; the editor uses Ctrl/Cmd+click.
- Uncaught exception when closing an already removed connection submenu.
- "1 problema" in the issues panel had no English translation.
- Validation panel named the wrong element when ids coincide across types.
- Export: accents are transliterated in identifiers (`Matrícula` -> `matricula`, not `matr_cula`);
  single-table inheritance no longer copies a subtype surrogate key; distinct relationships between the same
  tables yield distinct foreign keys; reserved words (`order`, `user`, etc.) are quoted in all four SQL
  dialects.
- Export: Prisma schemas, Django models and GraphQL SDL generated by earlier versions were rejected by their
  own tools (Prisma and Django for every corpus model); they now validate. See `evaluation/history/`.
