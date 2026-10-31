import { t } from '../i18n/index.js';
import { mapToRelational } from './logicalMapper.js';

function genStrategyComment(ir, prefix = '//') {
  let out = '';
  (ir.generalizations || []).forEach(gen => {
    if (gen.isUnion) {
      out += `${prefix} ${t(`Categoria [U] ${gen.categoryEntityId || gen.superEntityId}: chave substituta; membros com FK opcional para a categoria.`)}\n`;
      return;
    }
    const typeLabel = `${gen.totality === 'total' ? 'T' : 'P'},${gen.disjointness === 'disjoint' ? 'D' : 'C'}`;
    const isTD = gen.totality === 'total' && gen.disjointness === 'disjoint';
    const strategy = isTD ? t('Single Table Inheritance (coluna "tipo" discriminadora)') : 'Table-per-Type (Joined Tables)';
    out += `${prefix} ${t(`Generalização [${typeLabel}] ${gen.superEntityId} → {${gen.subEntityIds.join(', ')}}: ${strategy}`)}\n`;
  });
  return out;
}

const pascal = (name) => name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const lowerFirst = (name) => name.charAt(0).toLowerCase() + name.slice(1);

/** Groups the per-column foreign keys of the logical schema into one entry per constraint. */
function foreignKeyGroups(table) {
  const groups = new Map();
  table.foreignKeys.forEach((fk) => {
    const key = `${fk.group ?? fk.column}|${fk.referencesTable}`;
    if (!groups.has(key)) groups.set(key, { table: fk.referencesTable, columns: [], references: [], cascade: fk.onDelete === 'CASCADE' });
    groups.get(key).columns.push(fk.column);
    groups.get(key).references.push(fk.referencesColumn);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    nullable: group.columns.every((name) => table.columns.find((col) => col.name === name)?.nullable),
    unique: (table.uniqueKeys || []).some((u) => u.length === group.columns.length && u.every((c) => group.columns.includes(c))),
  }));
}

export function exportLaravel(ir) {
  const schema = mapToRelational(ir);
  const strategyComment = genStrategyComment(ir, '//');
  let code = `<?php\n\nuse Illuminate\\Database\\Migrations\\Migration;\nuse Illuminate\\Database\\Schema\\Blueprint;\nuse Illuminate\\Support\\Facades\\Schema;\n\n`;
  if (strategyComment) code += `/*\n${strategyComment}*/\n\n`;

  schema.tables.forEach(table => {
    code += `return new class extends Migration {\n`;
    code += `    public function up()\n    {\n`;
    code += `        Schema::create('${table.name}', function (Blueprint $table) {\n`;

    table.columns.forEach(col => {
      if (col.isAutoIncrement) {
        code += `            $table->id();\n`;
      } else {
        const modifiers = col.nullable ? '->nullable()' : '';
        if (col.type === 'DECIMAL(10,2)') {
          code += `            $table->decimal('${col.name}', 10, 2)${modifiers};\n`;
        } else if (col.type === 'UUID') {
          code += `            $table->uuid('${col.name}')${modifiers};\n`;
        } else {
          let laravelType = 'string';
          if (col.type === 'INTEGER') laravelType = 'integer';
          else if (col.type === 'BOOLEAN') laravelType = 'boolean';
          else if (col.type === 'DATE') laravelType = 'date';
          else if (col.type === 'DATETIME') laravelType = 'dateTime';
          else if (col.type === 'TEXT') laravelType = 'text';
          code += `            $table->${laravelType}('${col.name}')${modifiers};\n`;
        }
      }
    });

    if (table.primaryKeys.length > 1) {
      code += `            $table->primary(['${table.primaryKeys.join("', '")}']);\n`;
    }

    (table.uniqueKeys || []).forEach(columns => {
      code += `            $table->unique(['${columns.join("', '")}']);\n`;
    });

    foreignKeyGroups(table).forEach(fk => {
      const list = names => (names.length === 1 ? `'${names[0]}'` : `['${names.join("', '")}']`);
      code += `            $table->foreign(${list(fk.columns)})->references(${list(fk.references)})->on('${fk.table}')->onDelete('${fk.cascade ? 'cascade' : 'no action'}');\n`;
    });

    code += `            $table->timestamps();\n`;
    code += `        });\n    }\n\n`;
    code += `    public function down()\n    {\n`;
    code += `        Schema::dropIfExists('${table.name}');\n    }\n};\n\n`;
  });

  return code;
}

export function exportDjango(ir) {
  const schema = mapToRelational(ir);
  const strategyComment = genStrategyComment(ir, '#');
  let code = `from django.db import models\n\n`;
  if (strategyComment) code += `# ${t('Generalizações:')}\n${strategyComment}\n`;

  const djangoType = (col) => {
    const type = { INTEGER: ['IntegerField', []], BOOLEAN: ['BooleanField', []], DATE: ['DateField', []], DATETIME: ['DateTimeField', []], TEXT: ['TextField', []], UUID: ['UUIDField', []], 'DECIMAL(10,2)': ['DecimalField', ['max_digits=10', 'decimal_places=2']] }[col.type];
    return type || ['CharField', ['max_length=255']];
  };

  schema.tables.forEach(table => {
    code += `class ${pascal(table.name)}(models.Model):\n`;
    const groups = foreignKeyGroups(table);
    const single = new Map(groups.filter(g => g.columns.length === 1).map(g => [g.columns[0], g]));
    const surrogateOnly = table.primaryKeys.length === 1 && table.primaryKeys[0] === 'id' && table.columns.find(c => c.name === 'id')?.isAutoIncrement;
    const uniqueSingles = new Set((table.uniqueKeys || []).filter(u => u.length === 1).map(u => u[0]));
    let hasFields = false;
    groups.filter(g => g.columns.length > 1).forEach(g => {
      code += `    # Composite foreign key (${g.columns.join(', ')}) -> ${g.table}(${g.references.join(', ')}) has no Django field; columns kept as plain fields.\n`;
    });
    table.columns.forEach(col => {
      // Django adds its own AutoField named id when no primary key is declared.
      if (surrogateOnly && col.name === 'id') return;
      const fk = single.get(col.name);
      const options = [];
      if (fk) {
        const refClass = pascal(fk.table);
        const target = schema.tables.find(x => x.name === fk.table);
        const toField = target && !(target.primaryKeys.length === 1 && target.primaryKeys[0] === 'id' && fk.references[0] === 'id') ? [`to_field='${fk.references[0]}'`] : [];
        options.push(`'${refClass}'`, `on_delete=models.${fk.cascade ? 'CASCADE' : 'DO_NOTHING'}`, ...toField, `db_column='${col.name}'`, "related_name='+'");
        if (col.nullable) options.push('null=True', 'blank=True');
        if (table.primaryKeys.length === 1 && table.primaryKeys[0] === col.name) options.push('primary_key=True');
        code += `    ${col.name} = models.${fk.unique ? 'OneToOneField' : 'ForeignKey'}(${options.join(', ')})\n`;
        hasFields = true;
        return;
      }
      const [type, args] = djangoType(col);
      options.push(...args);
      if (col.nullable) options.push('null=True', 'blank=True');
      if (table.primaryKeys.length === 1 && table.primaryKeys[0] === col.name) options.push('primary_key=True');
      else if (uniqueSingles.has(col.name)) options.push('unique=True');
      code += `    ${col.name} = models.${type}(${options.join(', ')})\n`;
      hasFields = true;
    });

    const composite = table.primaryKeys.length > 1;
    if (composite) {
      code += `    pk = models.CompositePrimaryKey(${table.primaryKeys.map(name => `'${name}'`).join(', ')})\n`;
      hasFields = true;
    }
    const multiUnique = (table.uniqueKeys || []).filter(u => u.length > 1);
    code += `\n    class Meta:\n        db_table = '${table.name}'\n`;
    if (multiUnique.length) {
      code += `        constraints = [\n${multiUnique.map((u, i) => `            models.UniqueConstraint(fields=[${u.map(name => `'${name}'`).join(', ')}], name='${table.name}_uq_${i}'),`).join('\n')}\n        ]\n`;
    }
    if (!hasFields) code += `    pass\n`;
    code += `\n`;
  });

  return code;
}

export function exportPrisma(ir) {
  const schema = mapToRelational(ir);
  const strategyComment = genStrategyComment(ir, '//');
  let code = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n`;
  if (strategyComment) code += `// ${t('Generalizações:')}\n${strategyComment}\n`;

  // Every foreign key becomes a named relation with a field on each side (Prisma requires both).
  const taken = new Map(schema.tables.map(table => [table.name, new Set(table.columns.map(col => col.name))]));
  const claim = (tableName, wanted) => {
    let name = wanted;
    while (taken.get(tableName).has(name)) name += '_rel';
    taken.get(tableName).add(name);
    return name;
  };
  const relationFields = new Map(schema.tables.map(table => [table.name, []]));
  schema.tables.forEach(table => {
    foreignKeyGroups(table).forEach(fk => {
      const relation = `${table.name}_${fk.columns.join('_')}`;
      const forward = claim(table.name, lowerFirst(pascal(fk.table)));
      const optional = fk.nullable ? '?' : '';
      relationFields.get(table.name).push(`  ${forward} ${pascal(fk.table)}${optional} @relation("${relation}", fields: [${fk.columns.join(', ')}], references: [${fk.references.join(', ')}], onDelete: ${fk.cascade ? 'Cascade' : 'NoAction'})`);
      const backward = claim(fk.table, lowerFirst(pascal(table.name)));
      relationFields.get(fk.table).push(`  ${backward} ${pascal(table.name)}${fk.unique ? '?' : '[]'} @relation("${relation}")`);
    });
  });

  schema.tables.forEach(table => {
    code += `model ${pascal(table.name)} {\n`;
    const uniqueSingles = new Set((table.uniqueKeys || []).filter(u => u.length === 1).map(u => u[0]));
    table.columns.forEach(col => {
      let prismaType = 'String';
      let native = '';
      if (col.type === 'INTEGER') prismaType = 'Int';
      else if (col.type === 'BOOLEAN') prismaType = 'Boolean';
      else if (col.type === 'DATE' || col.type === 'DATETIME') prismaType = 'DateTime';
      else if (col.type === 'DECIMAL(10,2)') prismaType = 'Decimal';
      else if (col.type === 'UUID') native = ' @db.Uuid';

      let modifiers = '';
      if (col.name === 'id' && col.isAutoIncrement) modifiers += ' @id @default(autoincrement())';
      else if (table.primaryKeys.includes(col.name) && table.primaryKeys.length === 1) modifiers += ' @id';
      else if (uniqueSingles.has(col.name)) modifiers += ' @unique';
      code += `  ${col.name} ${prismaType}${col.nullable ? '?' : ''}${native}${modifiers}\n`;
    });
    relationFields.get(table.name).forEach(line => { code += `${line}\n`; });
    if (table.primaryKeys.length > 1) {
      code += `  @@id([${table.primaryKeys.join(', ')}])\n`;
    }
    (table.uniqueKeys || []).filter(u => u.length > 1).forEach(u => { code += `  @@unique([${u.join(', ')}])\n`; });
    code += `  @@map("${table.name}")\n}\n\n`;
  });

  return code;
}
