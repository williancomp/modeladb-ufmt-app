/**
 * Thin adapters over the four real database engines. Each adapter opens a fresh, empty database per
 * case, runs DDL statement by statement, introspects the system catalog into a common shape and
 * executes parameterised statements. Nothing here knows about ModelaDB.
 *
 * Catalog shape: { tables: { <name>: { columns: [{ name, type, columnType, nullable }], pk: [cols],
 *                 fks: [{ cols, ref, refCols }], uniques: [[cols]] } } }
 */
import pg from 'pg';
import mysql from 'mysql2/promise';
import { DatabaseSync } from 'node:sqlite';

let counter = 0;
const nextName = () => `eval_${process.pid}_${Date.now().toString(36)}_${counter++}`;

/** Splits generated DDL into statements. The generators never emit semicolons inside literals. */
export function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) => chunk.split(/\r?\n/).filter((line) => !/^\s*--/.test(line)).join('\n').trim())
    .filter(Boolean);
}

export async function runStatements(db, sql) {
  const errors = [];
  let executed = 0;
  for (const statement of splitStatements(sql)) {
    try {
      await db.exec(statement);
      executed++;
    } catch (error) {
      errors.push({ statement: statement.slice(0, 160).replace(/\s+/g, ' '), message: String(error.message).split('\n')[0] });
    }
  }
  return { executed, errors };
}

const group = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row[key])) map.set(row[key], []);
    map.get(row[key]).push(row);
  }
  return map;
};

function assemble(columns, pks, fks, uniques) {
  const tables = {};
  for (const c of columns) {
    tables[c.table] ??= { columns: [], pk: [], fks: [], uniques: [] };
    tables[c.table].columns.push({ name: c.name, type: c.type, columnType: c.columnType, nullable: c.nullable });
  }
  for (const [table, cols] of pks) if (tables[table]) tables[table].pk = cols;
  for (const f of fks) tables[f.table]?.fks.push({ cols: f.cols, ref: f.ref, refCols: f.refCols });
  for (const u of uniques) tables[u.table]?.uniques.push(u.cols);
  for (const t of Object.values(tables)) {
    t.fks.sort((a, b) => a.cols.join().localeCompare(b.cols.join()));
    t.uniques.sort((a, b) => a.join().localeCompare(b.join()));
  }
  return { tables };
}

async function postgres(cfg) {
  const admin = new pg.Client({ ...cfg, database: 'postgres' });
  await admin.connect();
  return {
    name: 'postgres',
    quote: (id) => `"${id}"`,
    param: (i) => `$${i + 1}`,
    async fresh() {
      const database = nextName();
      await admin.query(`CREATE DATABASE ${database}`);
      const client = new pg.Client({ ...cfg, database });
      await client.connect();
      return {
        exec: (sql) => client.query(sql),
        query: async (sql, params = []) => (await client.query(sql, params)).rows,
        async introspect() {
          const q = async (sql) => (await client.query(sql)).rows;
          const columns = (await q(`SELECT table_name AS "table", column_name AS name, data_type AS type, data_type AS "columnType", is_nullable = 'YES' AS nullable
            FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`));
          const pkRows = await q(`SELECT cl.relname AS "table", ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS cols
            FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE con.contype = 'p' AND n.nspname = 'public'`);
          const fkRows = await q(`SELECT cl.relname AS "table", fcl.relname AS ref,
            ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS cols,
            ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS "refCols"
            FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class fcl ON fcl.oid = con.confrelid
            JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE con.contype = 'f' AND n.nspname = 'public'`);
          const uqRows = await q(`SELECT cl.relname AS "table", ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS cols
            FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE con.contype = 'u' AND n.nspname = 'public'`);
          return assemble(columns, pkRows.map((r) => [r.table, r.cols]), fkRows, uqRows);
        },
        close: async () => {
          await client.end();
          await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
        },
      };
    },
    closeAll: () => admin.end(),
  };
}

async function mysqlFamily(name, cfg) {
  const admin = await mysql.createConnection({ ...cfg, multipleStatements: false });
  return {
    name,
    quote: (id) => `\`${id}\``,
    param: () => '?',
    async fresh() {
      const database = nextName();
      await admin.query(`CREATE DATABASE ${database}`);
      const conn = await mysql.createConnection({ ...cfg, database });
      return {
        exec: (sql) => conn.query(sql),
        query: async (sql, params = []) => (await conn.query(sql, params))[0],
        async introspect() {
          const q = async (sql) => (await conn.query(sql))[0];
          const columns = (await q(`SELECT TABLE_NAME AS \`table\`, COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_TYPE AS columnType, IS_NULLABLE = 'YES' AS nullable
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`)).map((r) => ({ ...r, nullable: !!Number(r.nullable) }));
          const pkRows = await q(`SELECT TABLE_NAME AS \`table\`, COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY TABLE_NAME, ORDINAL_POSITION`);
          const pks = [...group(pkRows, 'table')].map(([table, rows]) => [table, rows.map((r) => r.col)]);
          const fkRows = await q(`SELECT TABLE_NAME AS \`table\`, CONSTRAINT_NAME AS cname, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS ref, REFERENCED_COLUMN_NAME AS refCol
            FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`);
          const fks = [...group(fkRows.map((r) => ({ ...r, key: `${r.table}.${r.cname}` })), 'key')].map(([, rows]) => ({
            table: rows[0].table, ref: rows[0].ref, cols: rows.map((r) => r.col), refCols: rows.map((r) => r.refCol),
          }));
          const uqRows = await q(`SELECT TABLE_NAME AS \`table\`, INDEX_NAME AS iname, COLUMN_NAME AS col FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
          const uniques = [...group(uqRows.map((r) => ({ ...r, key: `${r.table}.${r.iname}` })), 'key')].map(([, rows]) => ({ table: rows[0].table, cols: rows.map((r) => r.col) }));
          return assemble(columns, pks, fks, uniques);
        },
        close: async () => {
          await conn.end();
          await admin.query(`DROP DATABASE ${database}`);
        },
      };
    },
    closeAll: () => admin.end(),
  };
}

async function sqlite() {
  return {
    name: 'sqlite',
    quote: (id) => `"${id}"`,
    param: () => '?',
    async fresh() {
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys = ON');
      return {
        exec: async (sql) => db.exec(sql),
        query: async (sql, params = []) => db.prepare(sql).all(...params),
        async introspect() {
          const names = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((r) => r.name);
          const columns = [];
          const pks = [];
          const fks = [];
          const uniques = [];
          for (const table of names) {
            const info = db.prepare(`PRAGMA table_info("${table}")`).all();
            for (const c of info) columns.push({ table, name: c.name, type: String(c.type).replace(/\(.*\)/, '').trim().toUpperCase(), columnType: c.type, nullable: !c.notnull && !c.pk });
            pks.push([table, info.filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => c.name)]);
            const fkRows = db.prepare(`PRAGMA foreign_key_list("${table}")`).all();
            for (const [, rows] of group(fkRows, 'id')) {
              rows.sort((a, b) => a.seq - b.seq);
              fks.push({ table, ref: rows[0].table, cols: rows.map((r) => r.from), refCols: rows.map((r) => r.to) });
            }
            for (const index of db.prepare(`PRAGMA index_list("${table}")`).all()) {
              if (!index.unique || index.origin === 'pk') continue;
              uniques.push({ table, cols: db.prepare(`PRAGMA index_info("${index.name}")`).all().sort((a, b) => a.seqno - b.seqno).map((c) => c.name) });
            }
          }
          return assemble(columns, pks, fks, uniques);
        },
        close: async () => db.close(),
      };
    },
    closeAll: async () => {},
  };
}

/** `config`: { postgres: {host,port,user,password}, mysql: {...}, mariadb: {...} } for the server engines. */
export async function openDialect(name, config) {
  if (name === 'postgres') return postgres(config.postgres);
  if (name === 'mysql') return mysqlFamily('mysql', config.mysql);
  if (name === 'mariadb') return mysqlFamily('mariadb', config.mariadb);
  if (name === 'sqlite') return sqlite();
  throw new Error(`unknown dialect ${name}`);
}

export const DIALECTS = ['postgres', 'mysql', 'mariadb', 'sqlite'];
