import { t } from '../i18n/index.js';
import { mapToRelational } from './logicalMapper.js';

// Palavras reservadas de PostgreSQL, MySQL/MariaDB e SQLite: nomes iguais a elas são citados no DDL.
const RESERVED_WORDS = new Set(
  'abort accessible add all alter analyse analyze and any array as asc asensitive asymmetric authorization autoincrement before between bigint binary blob both by call cascade case cast change char character check collate collation column commit concurrently condition constraint continue convert create cross cube cume_dist current_catalog current_date current_role current_schema current_time current_timestamp current_user cursor database databases day_hour day_microsecond day_minute day_second dec decimal declare default deferrable delayed delete dense_rank desc describe deterministic distinct distinctrow div do double drop dual each else elseif empty enclosed end escape escaped except exists exit explain false fetch first_value float float4 float8 for force foreign freeze from full fulltext function generated get grant group grouping groups having high_priority hour_microsecond hour_minute hour_second if ignore ilike in index infile initially inner inout insensitive insert int int1 int2 int3 int4 int8 integer intersect interval into io_after_gtids io_before_gtids is isnull iterate join json_table key keys kill lag last_value lateral lead leading leave left like limit linear lines load localtime localtimestamp lock long longblob longtext loop low_priority master_bind master_ssl_verify_server_cert match maxvalue mediumblob mediumint mediumtext middleint minute_microsecond minute_second mod modifies natural no_write_to_binlog not notnull nth_value ntile null numeric of offset on only optimize optimizer_costs option optionally or order out outer outfile over overlaps partition percent_rank placing precision primary procedure purge range rank read read_write reads real recursive references regexp release rename repeat replace require resignal restrict return returning revoke right rlike row row_number rows schema schemas second_microsecond select sensitive separator session_user set show signal similar smallint some spatial specific sql sql_big_result sql_calc_found_rows sql_small_result sqlexception sqlstate sqlwarning ssl starting stored straight_join symmetric system system_user table tablesample terminated then tinyblob tinyint tinytext to trailing transaction trigger true undo union unique unlock unsigned update usage use user using utc_date utc_time utc_timestamp values varbinary varchar varcharacter variadic varying verbose virtual when where while window with write xor year_month zerofill'.split(
    ' ',
  ),
);

export function quoteIdentifier(name, dialect) {
  if (!RESERVED_WORDS.has(name.toLowerCase())) return name;
  return dialect === 'mysql' || dialect === 'mariadb' ? `\`${name}\`` : `"${name}"`;
}

export function sqlTypeForDialect(type, dialect) {
  const name = type.toUpperCase();
  if (dialect === 'postgres') {
    if (/^DATETIME(?:\(\d+\))?$/.test(name)) return name.replace('DATETIME', 'TIMESTAMP');
    if (
      /^(?:BLOB|LONGBLOB|MEDIUMBLOB|TINYBLOB|BINARY(?:\(\d+\))?|VARBINARY(?:\(\d+\))?)$/.test(name)
    )
      return 'BYTEA';
    if (name === 'DOUBLE') return 'DOUBLE PRECISION';
  }
  if (dialect === 'mysql' || dialect === 'mariadb') {
    if (name === 'UUID') return 'CHAR(36)';
    if (name === 'BYTEA') return 'BLOB';
    if (/^TIMESTAMP(?:\(\d+\))?(?: WITH(?:OUT)? TIME ZONE)?$/.test(name)) return 'DATETIME';
  }
  if (dialect === 'sqlite') {
    if (/^(UUID|DATE|DATETIME|TIMESTAMP)/.test(name)) return 'TEXT';
    if (name === 'BYTEA') return 'BLOB';
    if (name === 'BOOLEAN' || name === 'BOOL') return 'INTEGER';
  }
  return type;
}

function generateGenericSQL(ir, dialect = 'postgres') {
  const schema = mapToRelational(ir);
  const q = (name) => quoteIdentifier(name, dialect);
  const list = (names) => names.map(q).join(', ');
  let ddl = t(`-- Exportado para ${dialect.toUpperCase()}\n\n`);

  // Documenta estratégia de mapeamento de cada generalização
  if ((ir.generalizations || []).length > 0) {
    ddl += `-- ═══════════════════════════════════════════════════════\n`;
    ddl += t(`-- GENERALIZAÇÕES / ESPECIALIZAÇÕES\n`);
    ir.generalizations.forEach((gen) => {
      if (gen.isUnion) {
        ddl += `-- ${t(`[U] Categoria ${gen.categoryEntityId || gen.superEntityId}: chave substituta; membros com FK opcional para a categoria.`)}\n`;
        return;
      }
      const typeLabel = `${gen.totality === 'total' ? 'T' : 'P'},${gen.disjointness === 'disjoint' ? 'D' : 'C'}`;
      const isTD = gen.totality === 'total' && gen.disjointness === 'disjoint';
      const strategy = isTD
        ? t(
            'Tabela Única (Single Table Inheritance) — coluna discriminadora "tipo" adicionada ao supertipo',
          )
        : t(
            'Tabela por Tipo (Table-per-Type) — cada subtipo tem tabela própria com PK = FK para supertipo',
          );
      ddl += `-- [${typeLabel}] ${gen.superEntityId} → {${gen.subEntityIds.join(', ')}}\n`;
      ddl += t(`--   Estratégia: ${strategy}\n`);
    });
    ddl += `-- ═══════════════════════════════════════════════════════\n\n`;
  }

  const deferredForeignKeys = [];
  schema.tables.forEach((table) => {
    ddl += `CREATE TABLE ${q(table.name)} (\n`;

    const lines = [];
    table.columns.forEach((col) => {
      let type = sqlTypeForDialect(col.type, dialect);

      // Dialect specific type adjustments
      if (dialect === 'postgres') {
        if (col.isAutoIncrement) type = col.type === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
      } else if (dialect === 'mysql' || dialect === 'mariadb') {
        if (col.isAutoIncrement) type = `${type} AUTO_INCREMENT`;
      } else if (dialect === 'sqlite') {
        if (col.isAutoIncrement) type = 'INTEGER'; // SQLite AUTOINCREMENT is special
      }

      let line = `  ${q(col.name)} ${type}`;
      if (
        dialect === 'sqlite' &&
        col.isAutoIncrement &&
        table.primaryKeys.length === 1 &&
        table.primaryKeys[0] === col.name
      ) {
        line += ' PRIMARY KEY AUTOINCREMENT';
      } else {
        if (!col.nullable) line += ' NOT NULL';
      }
      if (col.unique) line += ' UNIQUE';
      lines.push(line);
    });

    if (
      !(
        dialect === 'sqlite' &&
        table.columns.some((c) => c.isAutoIncrement) &&
        table.primaryKeys.length === 1
      )
    ) {
      if (table.primaryKeys.length > 0) {
        lines.push(`  PRIMARY KEY (${list(table.primaryKeys)})`);
      }
    }

    for (const unique of table.uniqueKeys || []) lines.push(`  UNIQUE (${list(unique)})`);

    const groups = new Map();
    table.foreignKeys.forEach((fk, i) => {
      const key = fk.group || `single:${i}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(fk);
    });
    for (const group of groups.values()) {
      const clause = `FOREIGN KEY (${list(group.map((f) => f.column))}) REFERENCES ${q(group[0].referencesTable)}(${list(group.map((f) => f.referencesColumn))}) ON DELETE CASCADE`;
      if (dialect === 'sqlite') lines.push(`  ${clause}`);
      else deferredForeignKeys.push(`ALTER TABLE ${q(table.name)} ADD ${clause};`);
    }

    ddl += lines.join(',\n');
    ddl += `\n);\n\n`;
  });

  if (deferredForeignKeys.length) ddl += deferredForeignKeys.join('\n') + '\n';
  return ddl;
}

export function exportPostgres(ir) {
  return generateGenericSQL(ir, 'postgres');
}
export function exportMysql(ir) {
  return generateGenericSQL(ir, 'mysql');
}
export function exportMariadb(ir) {
  return generateGenericSQL(ir, 'mariadb');
}
export function exportSqlite(ir) {
  return generateGenericSQL(ir, 'sqlite');
}
