import { it, expect } from 'vitest';
import { toCanonicalIR } from '../../persistence/canonicalIR.js';
import { mapToRelational } from '../logicalMapper.js';
import { exportCode } from '../index.js';
import { parseSQLToModel } from '../../import/sqlParser.js';
const entity = (id, attributes = []) => ({ id, name: id, attributes });
const key = (name, type = 'uuid') => ({ name, dataType: type, type: 'simple', primaryKey: true });
it('D-04 herança copia tipo e FK mesmo quando o subtipo já possui coluna homônima', () => {
  const ir = {
    entities: [entity('pessoa', [key('codigo')]), entity('aluno', [key('codigo', 'integer')])],
    generalizations: [
      {
        superEntityId: 'pessoa',
        subEntityIds: ['aluno'],
        totality: 'partial',
        disjointness: 'overlapping',
      },
    ],
  };
  const t = mapToRelational(ir).tables[1];
  expect(t.columns[0].type).toBe('UUID');
  expect(t.foreignKeys[0]).toMatchObject({ column: 'codigo', referencesTable: 'pessoa' });
});
it('D-04 tabelas N:M e multivaloradas copiam domínios compostos da PK', () => {
  const ir = {
    entities: [
      entity('pessoa', [
        key('cpf', 'string'),
        key('pais', 'string'),
        { name: 'fone', type: 'multivalued', dataType: 'string' },
      ]),
      entity('grupo', [key('codigo')]),
    ],
    relationships: [
      {
        id: 'membro',
        participants: [
          { entityId: 'pessoa', cardinality: { min: 0, max: 'N' } },
          { entityId: 'grupo', cardinality: { min: 0, max: 'N' } },
        ],
      },
    ],
  };
  const tables = mapToRelational(ir).tables;
  expect(tables.find((t) => t.name === 'membro').columns.map((c) => c.type)).toEqual([
    'VARCHAR(255)',
    'VARCHAR(255)',
    'UUID',
  ]);
  expect(exportCode(ir, 'sqlite')).toContain(
    'FOREIGN KEY (pessoa_cpf, pessoa_pais) REFERENCES pessoa(cpf, pais)',
  );
  const mv = tables.find((t) => t.name === 'pessoa_fone');
  expect(mv.columns[0].type).toBe('VARCHAR(255)');
});
it('D-02 agrega relacionamento materializado sem perder participantes e atributo composto', () => {
  const ir = {
    entities: [
      entity('aluno', [key('codigo')]),
      entity('curso', [key('codigo')]),
      entity('professor', [key('codigo')]),
    ],
    relationships: [
      {
        id: 'matricula',
        participants: [
          { entityId: 'aluno', cardinality: { min: 0, max: 'N' } },
          { entityId: 'curso', cardinality: { min: 1, max: 1 } },
        ],
      },
    ],
    aggregations: [
      {
        id: 'avalia',
        participants: [{ relationshipId: 'matricula' }, { entityId: 'professor' }],
        attributes: [{ name: 'nota', type: 'simple', dataType: 'decimal' }],
      },
    ],
  };
  const ts = mapToRelational(ir).tables;
  expect(ts.find((t) => t.name === 'matricula').foreignKeys).toHaveLength(2);
  expect(ts.find((t) => t.name === 'avalia').foreignKeys).toHaveLength(3);
  expect(ts.find((t) => t.name === 'avalia').columns.map((c) => c.name)).toContain('nota');
});
it('D-06 reversa conserva tipos com parâmetros, grupos de FK, IDs e contadores aditivos', () => {
  const model = parseSQLToModel(
    'CREATE TABLE pai (a VARCHAR(12), b DECIMAL(12, 2), PRIMARY KEY(a,b)); CREATE TABLE filho (codigo BIGINT PRIMARY KEY, x VARCHAR(12), y DECIMAL(12, 2), FOREIGN KEY(x,y) REFERENCES pai(a,b));',
    { entityIdCounter: 20, attributeIdCounter: 30, relationshipIdCounter: 40 },
  );
  expect(model.entities.map((e) => e.id)).toEqual([20, 21]);
  expect(model.entityIdCounter).toBe(22);
  expect(model.relationshipIdCounter).toBe(41);
  expect(model.attributes[0].id).toBe(30);
  const sql = exportCode(toCanonicalIR(model), 'postgres');
  expect(sql).toContain('b DECIMAL(12, 2)');
  expect(sql).toContain('FOREIGN KEY (x, y) REFERENCES pai(a, b)');
  expect(mapToRelational(toCanonicalIR(model)).tables).toHaveLength(2);
});
it('relacionamentos de subtipo T,D continuam exportáveis após fusão de tabelas', () => {
  const ir = {
    entities: [
      entity('pessoa', [key('codigo')]),
      entity('aluno'),
      entity('curso', [key('codigo')]),
    ],
    generalizations: [
      {
        superEntityId: 'pessoa',
        subEntityIds: ['aluno'],
        totality: 'total',
        disjointness: 'disjoint',
      },
    ],
    relationships: [
      {
        id: 'matricula',
        participants: [
          { entityId: 'aluno', cardinality: { min: 0, max: 'N' } },
          { entityId: 'curso', cardinality: { min: 0, max: 1 } },
        ],
      },
    ],
  };
  expect(
    mapToRelational(ir).tables.find((t) => t.name === 'pessoa').foreignKeys[0].referencesTable,
  ).toBe('curso');
});
it('D-09 identificador com atributos ainda incorpora a PK dos proprietários no dependente', () => {
  const ir = {
    entities: [
      entity('pessoa', [key('cpf', 'string')]),
      { ...entity('dependente', [key('numero', 'integer')]), weak: true },
    ],
    relationships: [
      {
        id: 'possui',
        identifying: true,
        attributes: [{ name: 'desde', type: 'simple', dataType: 'date' }],
        participants: [
          { entityId: 'pessoa', weak: false, cardinality: { min: 1, max: 1 } },
          { entityId: 'dependente', weak: true, cardinality: { min: 1, max: 'N' } },
        ],
      },
    ],
  };
  expect(mapToRelational(ir).tables.find((t) => t.name === 'dependente').primaryKeys).toEqual([
    'numero',
    'pessoa_cpf',
  ]);
});
it('D-02 conversão de identificador em agregação conserva dependência e chave parcial', () => {
  const m = {
    entities: [
      { id: 0, name: 'Pessoa' },
      { id: 1, name: 'Dependente' },
    ],
    attributes: [
      { id: 0, name: 'cpf', parentType: 'entity', parentId: 0, primary: true, dataType: 'Texto' },
      {
        id: 1,
        name: 'numero',
        parentType: 'entity',
        parentId: 1,
        partialKey: true,
        dataType: 'Numérico Inteiro',
      },
    ],
    aggregations: [
      {
        id: 0,
        name: 'possui',
        connections: [
          { entityId: 0, cardinality: '1,1', weak: false },
          { entityId: 1, cardinality: '1,N', weak: true },
        ],
      },
    ],
  };
  const ir = toCanonicalIR(m);
  expect(ir.entities[1].weak).toBe(true);
  expect(mapToRelational(ir).tables.find((t) => t.name === 'dependente').primaryKeys).toEqual([
    'numero',
    'pessoa_cpf',
  ]);
});
it('D-02/D-06 reversa mantém associação referenciada por agregação', () => {
  const ir = {
    entities: [
      entity('aluno', [key('codigo', 'integer')]),
      entity('curso', [key('codigo', 'integer')]),
      entity('professor', [key('codigo', 'integer')]),
    ],
    relationships: [
      {
        id: 'matricula',
        participants: [
          { entityId: 'aluno', cardinality: { min: 0, max: 'N' } },
          { entityId: 'curso', cardinality: { min: 1, max: 1 } },
        ],
      },
    ],
    aggregations: [
      { id: 'avalia', participants: [{ relationshipId: 'matricula' }, { entityId: 'professor' }] },
    ],
  };
  const sql = exportCode(ir, 'postgres');
  const roundtrip = toCanonicalIR(parseSQLToModel(sql));
  expect(
    mapToRelational(roundtrip)
      .tables.map((t) => t.name)
      .sort(),
  ).toEqual(
    mapToRelational(ir)
      .tables.map((t) => t.name)
      .sort(),
  );
  expect(exportCode(roundtrip, 'postgres')).toContain('REFERENCES matricula(');
});
it('D-06 normaliza referências SQL em maiúsculas com os nomes das colunas', () => {
  const sql =
    'CREATE TABLE Parent (ID INTEGER PRIMARY KEY); CREATE TABLE Child (ID INTEGER PRIMARY KEY, PARENT_ID INTEGER, FOREIGN KEY(PARENT_ID) REFERENCES Parent(ID));';
  const ddl = exportCode(toCanonicalIR(parseSQLToModel(sql)), 'postgres');
  expect(ddl).toContain('FOREIGN KEY (parent_id) REFERENCES parent(id)');
});
it('D-02/D-09 associações recebem a PK completa de entidade identificada por agregação', () => {
  const ir = {
    entities: [
      entity('pai', [key('cpf', 'string')]),
      { ...entity('filho', [key('numero', 'integer')]), weak: true },
      entity('grupo', [key('codigo', 'integer')]),
    ],
    aggregations: [
      {
        id: 'possui',
        identifying: true,
        participants: [
          { entityId: 'pai', cardinality: { min: 1, max: 1 } },
          { entityId: 'filho', weak: true, cardinality: { min: 1, max: 'N' } },
        ],
      },
    ],
    relationships: [
      {
        id: 'membro',
        participants: [
          { entityId: 'filho', cardinality: { min: 0, max: 'N' } },
          { entityId: 'grupo', cardinality: { min: 0, max: 'N' } },
        ],
      },
    ],
  };
  const t = mapToRelational(ir).tables.find((t) => t.name === 'membro');
  expect(t.columns.find((c) => c.name === 'filho_pai_cpf')).toMatchObject({
    type: 'VARCHAR(255)',
    nullable: false,
  });
  expect(exportCode(ir, 'sqlite')).toContain('REFERENCES filho(numero, pai_cpf)');
});
it('D-04/D-09 subtipos herdam a PK completa de supertipo fraco', () => {
  const ir = {
    entities: [
      entity('pai', [key('cpf', 'string')]),
      { ...entity('filho', [key('numero', 'integer')]), weak: true },
      entity('sub'),
    ],
    generalizations: [
      {
        superEntityId: 'filho',
        subEntityIds: ['sub'],
        totality: 'partial',
        disjointness: 'overlapping',
      },
    ],
    relationships: [
      {
        id: 'possui',
        identifying: true,
        participants: [
          { entityId: 'pai', cardinality: { min: 1, max: 1 } },
          { entityId: 'filho', weak: true, cardinality: { min: 1, max: 'N' } },
        ],
      },
    ],
  };
  const sub = mapToRelational(ir).tables.find((t) => t.name === 'sub');
  expect(sub.primaryKeys).toEqual(['numero', 'pai_cpf']);
  expect(exportCode(ir, 'sqlite')).toContain('REFERENCES filho(numero, pai_cpf)');
});
it('D-09 unicidade 1:1 acompanha a chave composta após estabilização', () => {
  const ir = {
    entities: [
      entity('pai', [key('codigo', 'integer')]),
      { ...entity('filho', [key('numero', 'integer')]), weak: true },
      entity('sub'),
      entity('outro', [key('codigo', 'integer')]),
    ],
    generalizations: [
      {
        superEntityId: 'filho',
        subEntityIds: ['sub'],
        totality: 'partial',
        disjointness: 'overlapping',
      },
    ],
    relationships: [
      {
        id: 'possui',
        identifying: true,
        participants: [
          { entityId: 'pai', cardinality: { min: 1, max: 1 } },
          { entityId: 'filho', weak: true, cardinality: { min: 1, max: 'N' } },
        ],
      },
      {
        id: 'um',
        participants: [
          { entityId: 'outro', cardinality: { min: 1, max: 1 } },
          { entityId: 'sub', cardinality: { min: 0, max: 1 } },
        ],
      },
    ],
  };
  const t = mapToRelational(ir).tables.find((t) => t.name === 'outro');
  expect(t.columns.find((c) => c.name === 'sub_numero').unique).not.toBe(true);
  expect(t.uniqueKeys).toContainEqual(['sub_numero', 'sub_pai_codigo']);
  expect(exportCode(ir, 'sqlite')).toContain('UNIQUE (sub_numero, sub_pai_codigo)');
});
it('D-06 reversa infere cardinalidade 1:1 de FK com UNIQUE simples ou composta', () => {
  const model = parseSQLToModel(
    'CREATE TABLE pai (a INTEGER,b INTEGER,PRIMARY KEY(a,b));CREATE TABLE filho(codigo INTEGER PRIMARY KEY,x INTEGER,y INTEGER,UNIQUE(x,y),FOREIGN KEY(x,y) REFERENCES pai(a,b));',
  );
  expect(model.relationships[0].connections[0].cardinality).toBe('0,1');
  expect(exportCode(toCanonicalIR(model), 'sqlite')).toContain('UNIQUE (x, y)');
});
