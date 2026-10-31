// Divide definições sem quebrar tipos DECIMAL(p,s), chaves compostas ou literais.
function splitDefinitions(body) {
  const parts = [];
  let start = 0,
    depth = 0,
    quote = null;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (quote) {
      if (char === quote) {
        if (body[i + 1] === quote) i++;
        else quote = null;
      }
      continue;
    }
    if ('\'"`'.includes(char)) quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(body.slice(start).trim());
  return parts.filter(Boolean);
}
const identifiers = (text) => text.split(',').map((s) => s.trim().replace(/["`]/g, ''));

/** IDs numéricos e contadores aceitam o estado atual: a importação é aditiva no editor. */
export function parseSQLToModel(sql, counters = {}) {
  const model = {
    entities: [],
    attributes: [],
    relationships: [],
    specializations: [],
    aggregations: [],
  };
  let entityIdCounter = counters.entityIdCounter || 0;
  let attributeIdCounter = counters.attributeIdCounter || 0;
  let relationshipIdCounter = counters.relationshipIdCounter || 0;
  const clean = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const tables = [];
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(/gi;
  let match;
  const parseForeignKey = (line) => {
    const m = line.match(
      /^(?:CONSTRAINT\s+["`]?\w+["`]?\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+["`]?(\w+)["`]?\s*\(([^)]+)\)/i,
    );
    return m
      ? { columns: identifiers(m[1]), referencesTable: m[2], referencedColumns: identifiers(m[3]) }
      : null;
  };
  while ((match = tableRegex.exec(clean))) {
    let end = tableRegex.lastIndex,
      depth = 1,
      quote = null;
    for (; end < clean.length && depth; end++) {
      const char = clean[end];
      if (quote) {
        if (char === quote) {
          if (clean[end + 1] === quote) end++;
          else quote = null;
        }
        continue;
      }
      if ('\'"`'.includes(char)) quote = char;
      else if (char === '(') depth++;
      else if (char === ')') depth--;
    }
    if (depth) throw new Error('CREATE TABLE incompleto.');
    const table = { name: match[1], columns: [], pks: [], fks: [], uniques: [] };
    for (const definition of splitDefinitions(clean.slice(tableRegex.lastIndex, end - 1))) {
      const line = definition.replace(/^CONSTRAINT\s+["`]?\w+["`]?\s+/i, '');
      const pk = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pk) {
        table.pks.push(...identifiers(pk[1]));
        continue;
      }
      const unique = line.match(/^UNIQUE(?:\s+(?:KEY|INDEX))?(?:\s+["`]?\w+["`]?)?\s*\(([^)]+)\)/i);
      if (unique) {
        table.uniques.push(identifiers(unique[1]));
        continue;
      }
      const fk = parseForeignKey(line);
      if (fk) {
        table.fks.push(fk);
        continue;
      }
      if (/^(UNIQUE|CHECK|KEY|INDEX)\b/i.test(line)) continue;
      const column = line.match(/^["`]?(\w+)["`]?\s+(.+)$/s);
      if (!column) continue;
      const type = column[2]
        .split(
          /\s+(?=NOT\s+NULL|NULL\b|PRIMARY\b|UNIQUE\b|DEFAULT\b|CHECK\b|REFERENCES\b|AUTO_INCREMENT\b|AUTOINCREMENT\b|GENERATED\b|COLLATE\b)/i,
        )[0]
        .trim()
        .toUpperCase();
      const isPk = /PRIMARY\s+KEY/i.test(line);
      if (isPk) table.pks.push(column[1]);
      if (/\bUNIQUE\b/i.test(line)) table.uniques.push([column[1]]);
      table.columns.push({
        name: column[1],
        type,
        nullable: !isPk && !/NOT\s+NULL/i.test(line),
        isAuto: /AUTO_INCREMENT|AUTOINCREMENT|\b(?:BIG)?SERIAL\b|GENERATED\s+.*IDENTITY/i.test(
          line,
        ),
      });
      const inline = line.match(/REFERENCES\s+["`]?(\w+)["`]?\s*\(([^)]+)\)/i);
      if (inline)
        table.fks.push({
          columns: [column[1]],
          referencesTable: inline[1],
          referencedColumns: identifiers(inline[2]),
        });
    }
    table.pks = [...new Set(table.pks)];
    tables.push(table);
    tableRegex.lastIndex = end;
  }
  // FKs emitidas após CREATE TABLE permitem ciclos de dependência nos dialetos de servidor.
  for (const alter of clean.matchAll(/ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+([^;]+);/gi)) {
    const fk = parseForeignKey(alter[2]);
    if (fk) tables.find((t) => t.name === alter[1])?.fks.push(fk);
  }
  // Uma associação que é alvo de FK tem identidade própria no DDL: mantenha-a como entidade.
  const referencedTables = new Set(tables.flatMap((t) => t.fks.map((fk) => fk.referencesTable)));
  const isJoin = (t) =>
    !referencedTables.has(t.name) &&
    t.fks.length >= 2 &&
    t.pks.length >= 2 &&
    t.pks.every((pk) => t.fks.some((f) => f.columns.includes(pk))) &&
    t.fks.every((f) => f.columns.every((col) => t.pks.includes(col))) &&
    t.fks.every((f) => tables.some((other) => other.name === f.referencesTable && other !== t));
  const joins = tables.filter(isJoin),
    normal = tables.filter((t) => !isJoin(t));
  const entityMap = new Map();
  normal.forEach((t, i) => {
    const entity = {
      id: entityIdCounter++,
      objType: 'entity',
      type: 'entity',
      name: t.name,
      x: 120 + (i % 4) * 230,
      y: 180 + Math.floor(i / 4) * 240,
      width: 120,
      height: 60,
    };
    model.entities.push(entity);
    entityMap.set(t.name, entity);
  });
  const addAttribute = (col, parent, parentType, index, primary) => {
    const serialType = { SERIAL: 'INTEGER', BIGSERIAL: 'BIGINT', SMALLSERIAL: 'SMALLINT' };
    model.attributes.push({
      id: attributeIdCounter++,
      objType: 'attribute',
      type: 'attribute',
      name: col.name,
      parentType,
      parentId: parent.id,
      primary,
      dataType: serialType[col.type] || col.type,
      sqlType: serialType[col.type] || col.type,
      nullable: primary ? false : col.nullable,
      isAutoIncrement: col.isAuto,
      derived: false,
      multivalued: false,
      x: parent.x + index * 55,
      y: parent.y - 70,
    });
  };
  normal.forEach((t) =>
    t.columns.forEach((col, i) =>
      addAttribute(col, entityMap.get(t.name), 'entity', i, t.pks.includes(col.name)),
    ),
  );
  joins.forEach((t, i) => {
    const rel = {
      id: relationshipIdCounter++,
      objType: 'relationship',
      type: 'relationship',
      name: t.name,
      sqlTableName: t.name,
      x: 250 + i * 100,
      y: 340,
      size: 80,
      connections: [],
    };
    t.fks.forEach((fk) => {
      const target = entityMap.get(fk.referencesTable);
      if (!target)
        throw new Error(`Tabela referenciada não suportada na associação: ${fk.referencesTable}`);
      rel.connections.push({
        entityId: target.id,
        cardinality: '0,N',
        weak: false,
        role: '',
        foreignKeyColumns: fk.columns,
        referencedColumns: fk.referencedColumns,
      });
    });
    t.columns
      .filter((col) => !t.fks.some((fk) => fk.columns.includes(col.name)))
      .forEach((col, i) => addAttribute(col, rel, 'relationship', i, false));
    model.relationships.push(rel);
  });
  normal.forEach((t) =>
    t.fks.forEach((fk) => {
      const source = entityMap.get(t.name),
        target = entityMap.get(fk.referencesTable);
      if (!target) throw new Error(`Tabela referenciada não encontrada: ${fk.referencesTable}`);
      const weak = fk.columns.every((col) => t.pks.includes(col));
      const unique = [t.pks, ...t.uniques].some(
        (group) => group.length > 0 && group.every((name) => fk.columns.includes(name)),
      );
      const required =
        weak || fk.columns.every((name) => !t.columns.find((col) => col.name === name)?.nullable);
      model.relationships.push({
        id: relationshipIdCounter++,
        objType: 'relationship',
        type: 'relationship',
        name: `rel_${source.name}_${target.name}`,
        x: (source.x + target.x) / 2,
        y: source.y + 130,
        size: 80,
        connections: [
          {
            entityId: source.id,
            cardinality: `${required ? 1 : 0},${unique ? 1 : 'N'}`,
            weak,
            role: '',
            foreignKeyColumns: fk.columns,
            referencedColumns: fk.referencedColumns,
          },
          { entityId: target.id, cardinality: '0,1', weak: false, role: '' },
        ],
      });
    }),
  );
  model.entityIdCounter = entityIdCounter;
  model.attributeIdCounter = attributeIdCounter;
  model.relationshipIdCounter = relationshipIdCounter;
  return model;
}
