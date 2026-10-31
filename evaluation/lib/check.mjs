/**
 * Structural comparison of an introspected catalog against a hand-written oracle
 * (see evaluation/oracles/oracles.mjs for the oracle notation).
 */
import { KIND_TYPES } from '../oracles/oracles.mjs';

const parseColumn = (spec) => ({ kind: spec.replace('!', ''), notNull: spec.endsWith('!') });

function kindMatches(dialect, kind, column) {
  const type = String(column.type).toLowerCase();
  const accepted = KIND_TYPES[dialect][kind].map((t) => t.toLowerCase());
  if (!accepted.includes(type)) return false;
  const full = String(column.columnType).toLowerCase();
  if ((dialect === 'mysql' || dialect === 'mariadb') && kind === 'bool') return full.startsWith('tinyint(1)');
  if ((dialect === 'mysql' || dialect === 'mariadb') && kind === 'uuid') return full === 'char(36)';
  if ((dialect === 'mysql' || dialect === 'mariadb') && kind === 'text') return type === 'varchar';
  return true;
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/** Returns { assertions: [{id, pass, detail}], resolved } */
export function checkStructure(oracle, catalog, dialect) {
  const assertions = [];
  const resolved = {};
  const add = (id, pass, detail = '') => assertions.push({ id, pass: !!pass, detail: pass ? '' : detail });
  const expectedTables = Object.keys(oracle);
  const actualTables = Object.keys(catalog.tables);
  const missingTables = expectedTables.filter((t) => !actualTables.includes(t));
  const extraTables = actualTables.filter((t) => !expectedTables.includes(t));
  add('tables:set', !missingTables.length && !extraTables.length, `missing: [${missingTables}] unexpected: [${extraTables}]`);

  for (const table of expectedTables) {
    const spec = oracle[table];
    const actual = catalog.tables[table];
    add(`${table}:exists`, !!actual, 'table not created');
    if (!actual) continue;
    const byName = new Map(actual.columns.map((c) => [c.name, c]));
    const used = new Set();

    // 1. match expected FKs to actual FKs
    const fkMap = [];
    const freeFks = [...actual.fks];
    (spec.fks || []).forEach((exp, i) => {
      const index = freeFks.findIndex((f) => f.ref === exp.to && (!exp.role || f.cols.every((c) => c.toLowerCase().includes(exp.role))));
      const act = index >= 0 ? freeFks.splice(index, 1)[0] : null;
      fkMap.push({ exp, act });
      const label = `${table}:fk${i}->${exp.to}${exp.role ? `(${exp.role})` : ''}`;
      if (!act) {
        add(`${label}:exists`, false, `no foreign key to ${exp.to}${exp.role ? ` with role ${exp.role}` : ''}`);
        return;
      }
      const parent = catalog.tables[exp.to];
      const refOk = parent && sameSet(act.refCols, parent.pk) && act.refCols.join() === parent.pk.join();
      add(`${label}:references-pk`, refOk, `references (${act.refCols}) but ${exp.to} PK is (${parent?.pk})`);
      const kindsOk = parent && act.cols.every((c, j) => {
        const child = byName.get(c);
        const referenced = parent.columns.find((p) => p.name === act.refCols[j]);
        return child && referenced && String(child.columnType).toLowerCase() === String(referenced.columnType).toLowerCase();
      });
      add(`${label}:type-compatible`, kindsOk, `FK column types differ from referenced columns`);
      const nullable = act.cols.map((c) => byName.get(c)?.nullable);
      const wantNullable = exp.nullable !== false;
      add(`${label}:nullability`, nullable.every((n) => n === wantNullable), `columns (${act.cols}) nullable=${nullable} expected ${wantNullable}`);
      if (exp.unique) {
        const unique = actual.uniques.some((u) => sameSet(u, act.cols)) || sameSet(actual.pk, act.cols);
        add(`${label}:unique`, unique, `no UNIQUE constraint over (${act.cols})`);
      }
      act.cols.forEach((c) => used.add(c));
    });
    add(`${table}:fks:no-extra`, !freeFks.length, `unexpected foreign keys: ${freeFks.map((f) => `(${f.cols})->${f.ref}`)}`);

    // 2. declared columns
    const declared = Object.entries(spec.columns);
    for (const [name, def] of declared) {
      const { kind, notNull } = parseColumn(def);
      const column = byName.get(name);
      if (!column) {
        add(`${table}:col:${name}`, false, 'missing column');
        continue;
      }
      used.add(name);
      const typeOk = kindMatches(dialect, kind, column);
      add(`${table}:col:${name}`, typeOk && column.nullable === !notNull, `type ${column.columnType} (expected ${kind}), nullable=${column.nullable} (expected ${!notNull})`);
    }

    // 3. extras (surrogate / discriminator) consume one otherwise-unexplained column each
    const leftover = actual.columns.filter((c) => !used.has(c.name));
    let surrogate = null;
    if (spec.extra === 'surrogate') {
      surrogate = leftover.find((c) => actual.pk.includes(c.name) && !c.nullable && kindMatches(dialect, 'int', c)) || null;
      add(`${table}:extra:surrogate`, surrogate, 'no integer NOT NULL primary-key column besides the declared ones');
    }
    let discriminator = null;
    if (spec.extra === 'discriminator') {
      discriminator = leftover.find((c) => !c.nullable && kindMatches(dialect, 'text', c) && !actual.pk.includes(c.name)) || null;
      add(`${table}:extra:discriminator`, discriminator, 'no NOT NULL text discriminator column');
    }
    const unexplained = leftover.filter((c) => c !== surrogate && c !== discriminator).map((c) => c.name);
    const missing = declared.map(([n]) => n).filter((n) => !byName.has(n));
    add(`${table}:columns:exact`, !unexplained.length && !missing.length, `unexpected columns: [${unexplained}] missing: [${missing}]`);

    // 4. primary key
    const expectedPk = [];
    for (const item of spec.pk) {
      if (item === 'surrogate') {
        if (surrogate) expectedPk.push(surrogate.name);
      } else if (item.startsWith('fk:')) {
        const entry = fkMap.find((m) => m.exp.to === item.slice(3));
        if (entry?.act) expectedPk.push(...entry.act.cols);
      } else expectedPk.push(item);
    }
    add(`${table}:pk`, sameSet(expectedPk, actual.pk) && expectedPk.length > 0, `PK is (${actual.pk}) expected (${expectedPk})`);

    resolved[table] = { fkMap, pk: actual.pk };
  }
  return { assertions, resolved };
}
