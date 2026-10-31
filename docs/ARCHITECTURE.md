# Architecture

ModelaDB is a static single-page application: Vite builds `index.html` and `src/` into `dist/`; there is no
server component. Source layout:

```
index.html            page, toolbars, menus (Tailwind + local Poppins font)
src/app.js            application shell: toolbars, modals, panels, keyboard shortcuts, layout, persistence wiring
src/canvas/           React Flow (@xyflow/react) diagram island, custom nodes/edges, geometry, menus, image export
  DiagramSurface.js   React Flow surface mounted in #canvas; pointer/touch/drag/zoom/selection lifecycle;
                      minimap via React Flow's MiniMap
  nodes/              EntityNode.js, RelationshipNode.js, AttributeNode.js, SpecializationNode.js,
                      AggregationNode.js, PostitNode.js, nodeHelpers.js
  edges/              DiagramEdge.js (custom SVG paths, double lines, Crow's Foot markers, cardinality/role pills)
  geometry.js         boundary intersections, participation paths, label placement, diagram bounds
  menus.js            contextual submenu (.submenu) and inline editors (text input, cardinality input, post-it textarea)
  pointerDrag.js      window-level pointer drags (resize, bend point, connect) with pointercancel handling
  imageExport.js      PNG, SVG and PDF export of the diagram
src/config.js         BASE_URL and schemaId() used for schema identifiers
src/domain/           state.js, constants.js, semantics.js, operations.js
src/validation/       engine.js and rules/{common,chen,crowsfoot,uml}/
src/export/           logicalMapper.js, sql.js, orm.js, schema.js, index.js
src/import/           sqlParser.js (reverse engineering of CREATE TABLE)
src/persistence/      file.js (.merdb), canonicalIR.js, localStorage.js, migration.js
src/research/         config.js, participant.js, processLog.js (research build only)
src/i18n/             index.js, pt.json, en.json
src/ui/               notifications.js
schemas/              merdb-v2.schema.json, merdb-ir.schema.json
e2e/                  Playwright suite (+ V8 coverage report)
evaluation/           corpus, oracles, experiments, results (see evaluation/README.md)
```

`src/app.js` coordinates the surrounding shell (toolbars, file/export/import modals, validation panel, auto-layout)
and mounts the React Flow island (`mountDiagramSurface` in `src/canvas/DiagramSurface.js`) inside `#canvas`. Both
read and mutate the shared `diagram` state object (`src/domain/state.js`); see `docs/INTERACTION.md` for the
pointer, touch and keyboard interaction contract. The modules outside `src/app.js` and `src/canvas/` hold the
domain, validation, persistence and code-generation logic and run without a DOM.

## Data flow

1. Editing: mutates the diagram arrays (entities, attributes, relationships, specializations,
   aggregations, post-its). Every change calls `saveState()` for undo/redo and schedules an autosave to
   `localStorage` (`modeladb:diagramData`).
2. Validation: each `draw()` calls `validateModel()` (`src/validation/engine.js`), which runs the rules
   registered in `rules/index.js` for the active notation and returns violations for the panel.
3. Persistence: `file.js` packs the diagram into a `.merdb` v2 document (`version`, `meta`, `domain`,
   `view`) and `parseDiagram()` unpacks it, also reading v1 files. `migration.js` upgrades older files.
4. Export: `canonicalIR.js` turns the domain into MerDB-IR (a visual-free, slug-identified
   representation). `logicalMapper.js` maps the IR to a relational schema (tables, columns, keys, foreign keys,
   unique keys); `sql.js`, `orm.js` and `schema.js` render PostgreSQL/MySQL/MariaDB/SQLite DDL, Laravel
   migrations, Prisma, Django, GraphQL and JSON Schema. `exportCode(ir, target)` in `index.js` dispatches.
5. Import: `sqlParser.js` reads `CREATE TABLE` and `ALTER TABLE ... ADD FOREIGN KEY` statements and builds a model
   (join tables become relationships; foreign keys inside the primary key become dependent connections).
6. Images: `src/canvas/imageExport.js` renders PNG, SVG and PDF exports from the diagram state using the
   shared geometry helpers in `src/canvas/geometry.js`.

## Mapping decisions (`logicalMapper.js`)

Strong and weak entities become tables (weak: owner key in the primary key); 1:1 gives a unique foreign key;
1:N puts the foreign key on the N side; N:M and n-ary relationships get a relationship table named
`rel_<name>`; multivalued attributes get `<owner>_<attribute>`; aggregations get `agg_<name>`; total+disjoint
specializations use one table with a `tipo` discriminator column, other specializations use one table per subtype
keyed by the supertype key; categories get a surrogate key. Identifiers are lower-case ASCII snake_case and
reserved words are quoted per dialect.

## Research build

`VITE_RESEARCH_MODE=true` at build time enables a participant-name prompt and a local process log embedded in
saved files. The default build omits this and makes no network requests in `src/`.

## Testing layers

* `npm test`: Vitest unit tests (`src/**/__tests__`) for the domain, validation, persistence and export modules.
* `npm run test:e2e`: Playwright against the production build; `test:e2e:coverage` adds V8 coverage of
  `src/app.js` from the Vite dev server (reported separately; not comparable to Vitest statement coverage).
* `npm run evaluate`: the evaluation suite described in `evaluation/README.md`.
