/**
 * Data-level tests of key and foreign-key behaviour, driven by the introspected catalog plus the
 * oracle's expectations (which foreign keys must be unique). Every accepted test row is removed again.
 */
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function valueFor(dialect, column, n) {
  const type = String(column.type).toLowerCase();
  const full = String(column.columnType).toLowerCase();
  if (/int|serial/.test(type) && !/tinyint\(1\)/.test(full)) return n + 1;
  if (/tinyint\(1\)|boolean/.test(full) || type === 'boolean') return dialect === 'postgres' ? n % 2 === 0 : n % 2;
  if (type === 'uuid' || full === 'char(36)') return UUID(n);
  if (/decimal|numeric|real|float|double/.test(type)) return n + 0.5;
  if (type === 'date') return `2024-01-${String((n % 27) + 1).padStart(2, '0')}`;
  if (/timestamp|datetime/.test(type)) return `2024-01-${String((n % 27) + 1).padStart(2, '0')} 03:04:05`;
  return `v${n}_${column.name}`.slice(0, 120);
}

const missingValue = (dialect, column) => {
  const type = String(column.type).toLowerCase();
  if (/int|serial|decimal|numeric|real/.test(type)) return 987654321;
  if (type === 'uuid' || String(column.columnType).toLowerCase() === 'char(36)') return UUID(987654321);
  if (type === 'date') return '1999-12-31';
  return 'no-such-key';
};

export async function runBehaviour({ db, adapter, catalog, oracle, resolved, dialect }) {
  const out = [];
  const add = (id, pass, detail = '') => out.push({ id, pass: pass === null ? null : !!pass, detail: pass ? '' : detail });
  const q = adapter.quote;
  let counter = 1;
  const log = [];
  const tables = catalog.tables;
  const colOf = (table, name) => tables[table].columns.find((c) => c.name === name);

  async function insert(table, row, record = true) {
    const cols = Object.keys(row);
    const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${cols.map((_, i) => adapter.param(i)).join(', ')})`;
    await db.query(sql, cols.map((c) => row[c]));
    if (record) log.push({ table, row });
  }
  async function cleanup() {
    while (log.length) {
      const { table, row } = log.pop();
      const keys = tables[table].pk.length ? tables[table].pk : Object.keys(row);
      const sql = `DELETE FROM ${q(table)} WHERE ${keys.map((k, i) => `${q(k)} = ${adapter.param(i)}`).join(' AND ')}`;
      await db.query(sql, keys.map((k) => row[k]));
    }
  }

  /** Builds a row with fresh values; `fkValues` maps an FK index to the parent row to reference (or an override object). */
  async function buildRow(table, { fkParents = {}, orphan = null } = {}) {
    const row = {};
    const n = counter++;
    const fks = tables[table].fks;
    const fkCols = new Set(fks.flatMap((f) => f.cols));
    for (const col of tables[table].columns) if (!fkCols.has(col.name)) row[col.name] = valueFor(dialect, col, n);
    for (let i = 0; i < fks.length; i++) {
      const fk = fks[i];
      if (orphan === i) {
        fk.cols.forEach((c) => (row[c] = missingValue(dialect, colOf(table, c))));
        continue;
      }
      if (fk.ref === table) {
        // self reference: NULL when allowed, otherwise point at the row's own key
        if (fk.cols.every((c) => colOf(table, c).nullable)) fk.cols.forEach((c) => (row[c] = null));
        else fk.cols.forEach((c, j) => (row[c] = row[fk.refCols[j]] ?? valueFor(dialect, colOf(table, c), n)));
        continue;
      }
      const parentRow = fkParents[i] ?? (await buildAndInsert(fk.ref));
      fk.cols.forEach((c, j) => (row[c] = parentRow[fk.refCols[j]]));
    }
    return row;
  }
  async function buildAndInsert(table, options) {
    const row = await buildRow(table, options);
    await insert(table, row);
    return row;
  }
  const rejects = async (fn) => {
    try {
      await fn();
      return null;
    } catch (error) {
      return String(error.message).split('\n')[0];
    }
  };

  // Baseline rows in dependency order (memoised parents so 1:1 and category relations stay consistent).
  const base = {};
  const order = [];
  const visit = (table, stack = []) => {
    if (order.includes(table) || stack.includes(table)) return;
    for (const fk of tables[table].fks) if (fk.ref !== table && tables[fk.ref]) visit(fk.ref, [...stack, table]);
    order.push(table);
  };
  Object.keys(tables).forEach((t) => visit(t));
  for (const table of order) {
    if (!oracle[table]) continue;
    const fkParents = {};
    let blocked = false;
    tables[table].fks.forEach((fk, i) => {
      if (fk.ref === table) return;
      if (!base[fk.ref]) blocked = true;
      fkParents[i] = base[fk.ref];
    });
    if (blocked) {
      add(`B:${table}:insert-valid-row`, false, 'skipped: a referenced table has no valid baseline row');
      continue;
    }
    try {
      base[table] = await buildRow(table, { fkParents });
      await insert(table, base[table], false);
      add(`B:${table}:insert-valid-row`, true);
    } catch (error) {
      add(`B:${table}:insert-valid-row`, false, String(error.message).split('\n')[0]);
    }
  }

  for (const table of order) {
    if (!base[table] || !oracle[table]) continue;
    const t = tables[table];
    if (t.pk.length) {
      const error = await rejects(() => insert(table, base[table], false));
      add(`B:${table}:duplicate-pk-rejected`, error, 'duplicate primary key was accepted');
      await cleanup();
    }
    for (const col of t.columns.filter((c) => !c.nullable)) {
      // SQLite: a lone INTEGER PRIMARY KEY column is the rowid; inserting NULL auto-numbers it by design.
      if (dialect === 'sqlite' && t.pk.length === 1 && t.pk[0] === col.name && String(col.type).toUpperCase() === 'INTEGER') {
        add(`B:${table}:null-in-${col.name}-rejected`, null, 'not applicable: SQLite rowid alias auto-numbers NULL');
        continue;
      }
      const error = await rejects(async () => {
        const row = await buildRow(table);
        row[col.name] = null;
        await insert(table, row);
      });
      add(`B:${table}:null-in-${col.name}-rejected`, error, 'NULL accepted in a NOT NULL column');
      await cleanup();
    }
    for (let i = 0; i < t.fks.length; i++) {
      const fk = t.fks[i];
      if (fk.ref === table) continue;
      const label = `${fk.cols.join('+')}->${fk.ref}`;
      const error = await rejects(async () => {
        const row = await buildRow(table, { orphan: i });
        await insert(table, row);
      });
      add(`B:${table}:orphan-${label}-rejected`, error, 'row referencing a non-existent parent was accepted');
      await cleanup();
    }
    // Cardinality of the FK: oracle says unique (1:1) -> second child of the same parent rejected; otherwise accepted.
    for (const entry of resolved[table]?.fkMap || []) {
      if (!entry.act) continue;
      const i = t.fks.findIndex((f) => f.cols.join() === entry.act.cols.join() && f.ref === entry.act.ref);
      const fk = t.fks[i];
      const label = `${fk.cols.join('+')}->${fk.ref}`;
      const parent = fk.ref === table ? base[table] : base[fk.ref];
      if (!parent) continue;
      const error = await rejects(async () => {
        const row = await buildRow(table, { fkParents: { [i]: parent } });
        await insert(table, row);
      });
      // A subtype table whose whole PK is the FK to its supertype is 1:1 by construction.
      const oneToOne = entry.exp.unique || (oracle[table].pk.length === 1 && oracle[table].pk[0] === `fk:${entry.exp.to}`);
      if (oneToOne) add(`B:${table}:second-child-${label}-rejected(1:1)`, error, 'a second row for the same parent was accepted although the relationship is 1:1');
      else add(`B:${table}:second-child-${label}-accepted(1:N)`, !error, `a second row for the same parent was rejected: ${error}`);
      await cleanup();
    }
  }
  return out;
}
