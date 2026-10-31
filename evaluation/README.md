# Evaluation

`npm run evaluate` (requires Docker, Node 24 for `node:sqlite`, and Chrome or Chromium for the performance step)
regenerates `evaluation/results/`: every table as CSV and as a LaTeX `tabular` fragment, raw logs in
`results/logs/`, and `environment.json` (tool and database versions, image digests). Everything except
`performance.*` and `performance_machine.json` is deterministic.

Database servers are started with `docker run` from the digests in `images.lock.json`; if `EVAL_POSTGRES_PORT`,
`EVAL_MYSQL_PORT` and `EVAL_MARIADB_PORT` are set (CI service containers), those servers on 127.0.0.1 are used.
Pass experiment names to run a subset: `node evaluation/run.mjs ddl targets mutation roundtrip performance`.

## 1. Corpus, oracles and DDL execution (`experiments/ddl.mjs`, `experiments/targets.mjs`)

* `corpus/`: 14 original ER/EER models (`.merdb`, authored in `models.mjs`, written by `build.mjs`) covering every
  construct; `manifest.json` lists the constructs of each model.
* `oracles/oracles.mjs`: for each model, the relational schema expected from the standard ER/EER-to-relational
  mapping rules (listed in the file header), written by hand before any output was generated and not edited to
  match output. The tool's source was read for its naming conventions and documented strategy choices, not for its
  output. A mismatch is a result.
* For each model x {PostgreSQL, MySQL, MariaDB, SQLite}: the generated DDL is executed on a fresh database, the
  catalog is introspected and compared with the oracle (tables, columns and kinds, nullability, primary keys,
  foreign keys, uniqueness of 1:1 keys), and data tests check that duplicate keys, NULLs in NOT NULL columns
  and orphan foreign keys are rejected and that 1:N allows several children where 1:1 allows one. Where an
  assertion cannot apply (SQLite rowid aliases auto-number NULL) it is reported as not applicable.
* `harness_sensitivity.*`: faults injected into the DDL (drop NOT NULL, foreign keys, primary keys, UNIQUE,
  widen types) must make the checks fail; equivalent mutants (same catalog) are discarded.
* Targets (`targets_*.csv`): Prisma `validate`, Django `check` + `makemigrations --dry-run`, Laravel
  (`illuminate/database` migrations run on SQLite, tables and columns compared with the oracle), GraphQL
  `buildSchema`, and Ajv strict compile, all in pinned images and labelled with the check performed.

## 2. Mutation-based validation of the rules (`experiments/mutation.mjs`)

Seeded (mulberry32, seed 20260101) operators inject one known defect per mutant into corpus models (up to 3
per operator per model), plus negative controls that rewrite a name into a legitimate one. Per rule: TP =
injected defect reported on the mutated element, FN = not reported, FP = a finding that is not an injected
defect, not a declared consequence of the mutation, and not an annotated defect of the unmutated model (the
unmutated models are validated too; the annotations are in the source). Precision = TP/(TP+FP),
recall = TP/(TP+FN).

Threat to validity: the operators, the negative controls, the name lists inside the rules and the rules
themselves were all written by the same author, so results for structural rules (which the operators were
designed from) are optimistic and say little about real student models; name-heuristic rules show how much the
word lists matter in both directions. No real-user model is involved.

## 3. Round trip (`experiments/roundtrip.mjs`)

Generated DDL for every corpus model and dialect, and 8 hand-written dialect-neutral DDL files
(`roundtrip/*.sql`, written before any output was seen) are executed, reverse-engineered by the importer,
exported again for the same dialect, executed again, and the catalogs compared. Tables report per-case verdicts,
a per-construct inventory, the constructs that changed, SQL features that do not survive, and which conceptual
constructs the importer recovers from the DDL of the corpus models.

## 4. Performance (`experiments/performance.mjs`)

Synthetic diagrams of 50, 200 and 1000 elements (entities, attributes, relationships), headless Chrome, 30 samples
after 5 warm-ups, mean and standard deviation. Two measurements:

- Validation: time of `validateModel`, measured in the page against the Vite dev server. The editor validates on
  every `draw()`, not on wheel zoom.
- Wheel-to-frame latency: time from a wheel event to two animation frames after the first style mutation of the
  surface (the zoomed viewport is painted), measured against the production build served by `vite preview`
  (the React development build is about three times slower). It includes frame waits, so its floor is about
  20–35 ms. It is not comparable with the earlier "full draw" values, which measured CPU time of a Canvas 2D redraw
  inside a `requestAnimationFrame` callback without paint; the series changed with the React Flow surface.

Machine details are recorded in `results/logs/performance_machine.json`. Timings vary between runs and machines.

## History of failures

`history/` keeps the initial results of the experiments before the exporter bugs they exposed were fixed: four
DDL failures (reserved words, single-table surrogate key, duplicate foreign keys, accent handling) and
30 of 70 ORM/schema target outputs rejected by their tools (all Prisma and Django outputs, 2 GraphQL).

## Other scripts

`figures/figures.mjs` (`npm run figures`) regenerates the five screenshots (English, Chen unless noted, 2x).
