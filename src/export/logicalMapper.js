import { t } from '../i18n/index.js';
import { isMany, toIdentifier } from '../domain/semantics.js';
/**
 * Mapeia o MerDB-IR (Modelo Conceitual) para um Esquema Lógico Relacional (Tabelas, Colunas, Chaves).
 */

export function mapToRelational(ir) {
  const tables = Object.create(null);
  const aliases = Object.create(null);
  const findTable = (id) => {
    const seen = new Set();
    while (aliases[id] && !seen.has(id)) {
      seen.add(id);
      id = aliases[id];
    }
    return tables[id];
  }; // map by table name

  const getTable = (name) => {
    if (!tables[name]) {
      tables[name] = { name, columns: [], primaryKeys: [], foreignKeys: [] };
    }
    return tables[name];
  };

  const getColType = (attr) => {
    const mapping = {
      // Conceptual types (user-facing)
      Texto: 'VARCHAR(255)',
      'Numérico Inteiro': 'INTEGER',
      'Numérico Real': 'DECIMAL(10,2)',
      Data: 'DATE',
      'Data e Hora': 'DATETIME',
      Booleano: 'BOOLEAN',
      Identificador: 'UUID',
      // Legacy internal keys (kept for backwards compat)
      string: 'VARCHAR(255)',
      integer: 'INTEGER',
      decimal: 'DECIMAL(10,2)',
      date: 'DATE',
      datetime: 'DATETIME',
      boolean: 'BOOLEAN',
      blob: 'BLOB',
      text: 'TEXT',
      uuid: 'UUID',
    };
    if (attr.sqlType) return attr.sqlType;
    return mapping[attr.dataType] || 'VARCHAR(255)';
  };

  const keyCopies = [];
  const copyKey = (
    table,
    ref,
    {
      prefix = `${ref.name}_`,
      columns,
      referenced,
      primary = false,
      nullable = true,
      group,
      unique = false,
      record = true,
      cascade = false,
    } = {},
  ) => {
    if (record && !columns && group) {
      // Dois relacionamentos distintos entre as mesmas tabelas, sem papéis, não podem compartilhar a coluna FK.
      const firstKeys = referenced || ref.primaryKeys;
      const owner = (value) => String(value).split(':')[0]; // o mesmo relacionamento pode copiar a chave por dois caminhos
      const taken = firstKeys.some((pk) =>
        table.foreignKeys.some((f) => f.column === `${prefix}${pk}` && owner(f.group) !== owner(group)),
      );
      if (taken) prefix = `${toIdentifier(String(group).replace(/^rel_/, ''))}_${prefix}`;
    }
    if (record)
      keyCopies.push({
        table,
        ref,
        options: { prefix, columns, referenced, primary, nullable, group, unique, record: false, cascade },
      });
    const keys = referenced || ref.primaryKeys;
    if (!keys.length) throw new Error(t(`A tabela ${ref.name} não tem chave para ser referenciada.`));
    keys.forEach((pk, i) => {
      const source = ref.columns.find((c) => c.name === pk);
      if (!source) throw new Error(t(`Chave ${ref.name}.${pk} não encontrada.`));
      const name = columns?.[i] || `${prefix}${pk}`;
      let col = table.columns.find((c) => c.name === name);
      if (!col) {
        col = { name, type: source.type, nullable: primary ? false : nullable };
        table.columns.push(col);
      }
      // Uma FK usa o domínio da chave referenciada, sem herdar auto incremento.
      col.type = source.type;
      if (primary || !nullable) col.nullable = false;
      if (primary && !table.primaryKeys.includes(name)) table.primaryKeys.push(name);
      if (
        !table.foreignKeys.some(
          (f) => f.column === name && f.referencesTable === ref.name && f.referencesColumn === pk,
        )
      ) {
        table.foreignKeys.push({
          column: name,
          referencesTable: ref.name,
          referencesColumn: pk,
          group: group || `${ref.name}:${prefix}`,
          // Só a conexão dependente de uma entidade fraca remove os dependentes junto com o proprietário.
          onDelete: cascade ? 'CASCADE' : 'NO ACTION',
        });
      }
    });
  };

  // 1. Entidades (Fortes e Fracas)
  (ir.entities || []).forEach((ent) => {
    const table = getTable(ent.id);

    // Default PK se não tiver nenhuma definida e não for fraca
    let hasPk = false;

    // Achatamento de atributos (composite -> subcolumns)
    const processAttributes = (attributes, prefix = '') => {
      attributes.forEach((attr) => {
        if (attr.type === 'derived') return; // ignora derivados
        if (attr.type === 'multivalued') return; // tratado depois

        const colName = prefix + toIdentifier(attr.name);

        if (attr.type === 'composite' && attr.subAttributes) {
          processAttributes(attr.subAttributes, colName + '_');
        } else {
          table.columns.push({
            name: colName,
            type: getColType(attr),
            nullable: attr.primaryKey ? false : (attr.nullable ?? true),
            ...(attr.isAutoIncrement ? { isAutoIncrement: true } : {}),
          });
          if (attr.primaryKey) {
            table.primaryKeys.push(colName);
            hasPk = true;
          }
        }
      });
    };

    processAttributes(ent.attributes || []);

    if (!hasPk && !ent.weak) {
      // Adiciona um surrogate key se for forte e não tiver PK explícita
      table.columns.unshift({
        name: 'id',
        type: 'INTEGER',
        isAutoIncrement: true,
        nullable: false,
      });
      table.primaryKeys.push('id');
    }
  });

  // 4. Generalizações
  // T,D (Total Disjunta)  → Tabela Única (Single Table Inheritance) com discriminador
  // T,C / P,D / P,C       → Tabela por Tipo (Table-per-Type / Joined Tables)
  (ir.generalizations || []).forEach((gen) => {
    const superTable = tables[gen.superEntityId];
    if (!superTable) return;

    if (gen.isUnion) {
      // O vértice 0 é a categoria, não um supertipo. As chaves dos membros não são herdadas.
      const declared = ir.entities.find(
        (e) => e.id === (gen.categoryEntityId || gen.superEntityId),
      );
      if (!(declared?.attributes || []).some((a) => a.primaryKey)) {
        superTable.columns = superTable.columns.filter(
          (c) => !(c.name === 'id' && c.isAutoIncrement),
        );
      }
      superTable.columns.forEach((c) => {
        delete c.isAutoIncrement;
      });
      let key = 'categoria_id';
      while (superTable.columns.some((c) => c.name === key)) key = `_${key}`;
      superTable.columns.unshift({
        name: key,
        type: 'INTEGER',
        isAutoIncrement: true,
        nullable: false,
      });
      superTable.primaryKeys = [key];
      (gen.memberEntityIds || gen.subEntityIds || []).forEach((id) => {
        const member = tables[id];
        if (member) copyKey(member, superTable, { nullable: true, unique: true });
      });
      return;
    }

    if (gen.totality === 'total' && gen.disjointness === 'disjoint') {
      // ── Total Disjunta: Single Table Inheritance ──────────────────────────────
      // Todos os subtipos são fundidos na tabela do supertipo.
      // Uma coluna discriminadora ('tipo') identifica o subtipo de cada linha.
      if (!superTable.columns.find((c) => c.name === 'tipo')) {
        superTable.columns.push({ name: 'tipo', type: 'VARCHAR(100)', nullable: false });
      }

      const mergedSubIds = new Set();
      (gen.subEntityIds || []).forEach((subId) => {
        const subTable = tables[subId];
        if (!subTable) return;

        // Move colunas específicas do subtipo para a supertabela (nullable)
        subTable.columns.forEach((col) => {
          if (superTable.primaryKeys.includes(col.name)) return; // não duplica PK
          // A chave substituta gerada para um subtipo sem chave própria não pertence à tabela única.
          if (col.isAutoIncrement && subTable.primaryKeys.length === 1 && subTable.primaryKeys[0] === col.name) return;
          if (!superTable.columns.find((c) => c.name === col.name)) {
            superTable.columns.push({ ...col, nullable: true });
          }
        });

        // Herda FKs de relacionamentos do subtipo
        subTable.foreignKeys.forEach((fk) => {
          if (!superTable.foreignKeys.find((f) => f.column === fk.column)) {
            superTable.foreignKeys.push({ ...fk });
          }
        });

        mergedSubIds.add(subId);
        aliases[subId] = superTable.name;
        delete tables[subId];
      });

      // Redireciona FKs de outras tabelas que apontavam para os subtipos removidos
      Object.values(tables).forEach((t) => {
        t.foreignKeys.forEach((fk) => {
          if (mergedSubIds.has(fk.referencesTable)) {
            fk.referencesTable = superTable.name;
          }
        });
      });
    } else {
      // ── TC / PD / PC: Table-per-Type (Joined Tables) ─────────────────────────
      // Supertabela mantida; cada subtipo tem sua própria tabela.
      // A PK do subtipo É a FK para o supertipo (chave primária compartilhada —
      // o subtipo NÃO tem ID próprio, herda o ID do supertipo).
      (gen.subEntityIds || []).forEach((subId) => {
        const subTable = tables[subId];
        if (!subTable) return;

        // Remove o surrogate 'id' gerado automaticamente para o subtipo:
        // sua PK será a FK herdada do supertipo, não um ID próprio.
        const surrogateIdx = subTable.columns.findIndex(
          (c) => c.name === 'id' && c.isAutoIncrement,
        );
        if (surrogateIdx !== -1) {
          subTable.columns.splice(surrogateIdx, 1);
          const pkIdx = subTable.primaryKeys.indexOf('id');
          if (pkIdx !== -1) subTable.primaryKeys.splice(pkIdx, 1);
        }

        copyKey(subTable, superTable, {
          prefix: '',
          primary: true,
          nullable: false,
          group: `heranca:${superTable.name}`,
        });
      });
    }
  });

  // Relacionamentos identificadores são processados antes das associações que usam suas PKs.
  const materialized = new Set(
    (ir.aggregations || []).flatMap((a) =>
      a.participants.map((p) => p.relationshipId).filter(Boolean),
    ),
  );
  const pending = [
    ...(ir.relationships || []),
    ...(ir.aggregations || []).map((agg) => ({
      ...agg,
      forceTable: true,
      participants: agg.participants.map((p) => ({
        ...p,
        entityId: p.entityId || p.relationshipId,
        cardinality: p.cardinality || { min: 0, max: 'N' },
      })),
    })),
  ];
  const ordered = [];
  const visit = (rel, stack = new Set()) => {
    if (ordered.includes(rel)) return;
    if (stack.has(rel))
      throw new Error(t('Ciclo de identificação: corrija o modelo antes de exportar.'));
    stack.add(rel);
    for (const participant of rel.participants || []) {
      const materializedRelation = pending.find(
        (candidate) => candidate !== rel && candidate.id === participant.entityId,
      );
      if (materializedRelation) visit(materializedRelation, stack);
    }
    for (const owner of (rel.participants || []).filter((p) => !p.weak)) {
      for (const dependency of pending.filter(
        (r) =>
          r !== rel &&
          r.identifying &&
          r.participants.some((p) => p.weak && p.entityId === owner.entityId),
      ))
        visit(dependency, stack);
    }
    stack.delete(rel);
    ordered.push(rel);
  };
  pending.filter((r) => r.identifying).forEach((r) => visit(r));
  pending.forEach((r) => visit(r));
  const associations = ordered;
  associations.forEach((rel) => {
    const parts = rel.participants || [];
    if (rel.identifying && parts.some((p) => p.weak)) {
      const owners = parts.filter((p) => !p.weak);
      if (!owners.length)
        throw new Error(
          t(`O relacionamento identificador ${rel.name} precisa de um proprietário não marcado como dependente.`),
        );
      for (const dependent of parts.filter((p) => p.weak)) {
        const table = findTable(dependent.entityId);
        for (const owner of owners) {
          if (owner.entityId === dependent.entityId)
            throw new Error(
              t('Ciclo de identificação: uma entidade não pode ser proprietária de si mesma.'),
            );
          const ref = findTable(owner.entityId);
          if (!table || !ref) throw new Error(t(`Participante de ${rel.name} não encontrado.`));
          const prefix = `${owner.role ? owner.role.toLowerCase() + '_' : ''}${ref.name}_`;
          copyKey(table, ref, {
            prefix,
            columns: dependent.foreignKeyColumns,
            referenced: dependent.referencedColumns,
            primary: true,
            nullable: false,
            group: `${rel.id}:${owner.entityId}`,
            cascade: true,
          });
        }
      }
    }
    const manyCount = parts.filter((p) => isMany(p.cardinality.max)).length;
    const associative =
      rel.forceTable ||
      materialized.has(rel.id) ||
      manyCount > 1 ||
      parts.length > 2 ||
      rel.attributes?.length > 0;
    if (associative) {
      const table = getTable(rel.id);
      if (parts.length < 2)
        throw new Error(
          t(`A associação ${rel.name} precisa de pelo menos dois participantes para ser exportada.`),
        );
      parts.forEach((p, index) => {
        const ref = findTable(p.entityId);
        if (!ref) throw new Error(t(`Participante de ${rel.name} não encontrado: ${p.entityId}`));
        const repeated = parts.filter((other) => other.entityId === p.entityId).length > 1;
        const prefix = p.role
          ? `${p.role.toLowerCase()}_${p.entityId}_`
          : `${p.entityId}_${repeated ? `${index + 1}_` : ''}`;
        copyKey(table, ref, {
          prefix,
          columns: p.foreignKeyColumns,
          referenced: p.referencedColumns,
          primary: true,
          group: `${rel.id}:${index}`,
        });
      });
      const addAttributes = (attrs, prefix = '') =>
        (attrs || []).forEach((attr) => {
          if (attr.type === 'derived' || attr.type === 'multivalued') return;
          const name = prefix + toIdentifier(attr.name);
          if (attr.type === 'composite') addAttributes(attr.subAttributes, `${name}_`);
          else
            table.columns.push({ name, type: getColType(attr), nullable: attr.nullable ?? true });
        });
      addAttributes(rel.attributes);
    } else {
      if (parts.length < 2)
        throw new Error(t(`O relacionamento ${rel.name} precisa de pelo menos dois participantes.`));
      const dependent = parts.find((p) => p.weak);
      const nSide =
        dependent ||
        parts.find((p) => p.foreignKeyColumns) ||
        parts.find((p) => isMany(p.cardinality.max)) ||
        parts.find((p) => p.cardinality.min >= 1) ||
        parts[0];
      const oneSide = parts.find((p) => p !== nSide);
      const table = findTable(nSide.entityId),
        ref = findTable(oneSide.entityId);
      if (!table || !ref) throw new Error(t(`Participante de ${rel.name} não encontrado.`));
      const primary = !!(
        rel.identifying &&
        (nSide.weak ||
          (!parts.some((p) => p.weak) && ir.entities.find((e) => e.id === nSide.entityId)?.weak))
      );
      const prefix = `${oneSide.role ? oneSide.role.toLowerCase() + '_' : ''}${ref.name}_`;
      copyKey(table, ref, {
        prefix,
        columns: nSide.foreignKeyColumns,
        referenced: nSide.referencedColumns,
        primary,
        nullable: nSide.cardinality.min === 0,
        group: rel.id,
        unique: !isMany(nSide.cardinality.max),
        cascade: primary,
      });
    }
  });

  // 3. Atributos Multivalorados
  (ir.entities || []).forEach((ent) => {
    const processMultivalued = (attributes, parentTableId) => {
      attributes.forEach((attr) => {
        if (attr.type === 'multivalued') {
          const parentTable = findTable(parentTableId);
          if (!parentTable) return;

          const mvTable = getTable(
            `${parentTableId}_${toIdentifier(attr.name)}`,
          );

          copyKey(mvTable, parentTable, {
            prefix: `${parentTableId}_`,
            primary: true,
            nullable: false,
          });

          // Value column
          mvTable.columns.push({ name: 'value', type: getColType(attr), nullable: false });
          mvTable.primaryKeys.push('value');
        } else if (attr.type === 'composite' && attr.subAttributes) {
          processMultivalued(attr.subAttributes, parentTableId);
        }
      });
    };
    processMultivalued(ent.attributes || [], ent.id);
  });

  // Uma PK pode crescer por identificação depois de ter sido herdada ou referenciada.
  // Reaplica as cópias até estabilizar, para todas as FKs referenciarem a chave completa.
  for (let pass = 0; ; pass++) {
    const before = JSON.stringify(Object.values(tables));
    for (const copy of keyCopies) {
      if (tables[copy.table.name])
        copyKey(copy.table, findTable(copy.ref.name) || copy.ref, copy.options);
    }
    if (before === JSON.stringify(Object.values(tables))) break;
    if (pass > keyCopies.length + Object.keys(tables).length)
      throw new Error(t('Ciclo de identificação: não foi possível estabilizar as chaves.'));
  }

  // Unicidade 1:1 pertence ao grupo final da FK, nunca a um prefixo de uma PK composta.
  for (const copy of keyCopies.filter((copy) => copy.options.unique && tables[copy.table.name])) {
    const ref = findTable(copy.ref.name) || copy.ref;
    const keys = copy.options.referenced || ref.primaryKeys;
    const names = keys.map((key, i) => copy.options.columns?.[i] || `${copy.options.prefix}${key}`);
    copy.table.uniqueKeys ||= [];
    if (!copy.table.uniqueKeys.some((group) => JSON.stringify(group) === JSON.stringify(names)))
      copy.table.uniqueKeys.push(names);
  }

  Object.values(tables).forEach((t) =>
    t.columns.forEach((c) => {
      if (t.primaryKeys.includes(c.name)) c.nullable = false;
    }),
  );
  return { tables: Object.values(tables) };
}
