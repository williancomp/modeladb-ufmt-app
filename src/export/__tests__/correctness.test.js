import { describe, it, expect } from 'vitest';
import { toCanonicalIR, parseCardinality } from '../../persistence/canonicalIR.js';
import { mapToRelational } from '../logicalMapper.js';
import { exportCode } from '../index.js';
import { parseSQLToModel } from '../../import/sqlParser.js';
import { validateModel } from '../../validation/engine.js';
const e = (id, name) => ({ id, name });
const a = (id, parentId, name, dataType = 'Texto') => ({
  id,
  parentId,
  name,
  dataType,
  parentType: 'entity',
  primary: true,
});
const c = (entityId, cardinality, weak = false) => ({ entityId, cardinality, weak });
const base = () => ({
  entities: [e(0, 'Cliente'), e(1, 'Dependente')],
  attributes: [a(0, 0, 'cpf'), a(1, 1, 'nome')],
  relationships: [{ id: 0, name: 'possui', connections: [c(0, '1,1'), c(1, '0,N', true)] }],
});
const mapped = (model) => mapToRelational(toCanonicalIR(model)).tables;
describe('Defeitos da auditoria técnica', () => {
  it('D-02 materializa agregação e seus atributos', () => {
    const m = base();
    m.aggregations = [{ id: 0, name: 'Matricula', connections: [c(0, '0,N'), c(1, '0,N')] }];
    m.relationships = [];
    m.attributes.push({
      id: 2,
      name: 'nota',
      parentType: 'aggregation',
      parentId: 0,
      dataType: 'Numérico Real',
    });
    const t = mapped(m).find((t) => t.name === 'agg_matricula');
    expect(t).toBeDefined();
    expect(t.foreignKeys).toHaveLength(2);
    expect(t.columns.map((c) => c.name)).toContain('nota');
  });
  it('D-03 categoria tem chave substituta e FKs dos membros para a categoria', () => {
    const m = {
      entities: [e(0, 'Proprietario'), e(1, 'Pessoa'), e(2, 'Empresa')],
      attributes: [a(0, 0, 'k0'), a(1, 1, 'cpf'), a(2, 2, 'cnpj')],
      specializations: [
        {
          genType: 'U',
          connections: [
            { entityId: 0, vertex: 0 },
            { entityId: 1, vertex: 1 },
            { entityId: 2, vertex: 2 },
          ],
        },
      ],
    };
    expect(toCanonicalIR(m).generalizations[0].isUnion).toBe(true);
    const ts = mapped(m);
    expect(ts[0].primaryKeys).toEqual(['categoria_id']);
    expect(ts[1].primaryKeys).toEqual(['cpf']);
    expect(ts[1].foreignKeys[0].referencesTable).toBe('proprietario');
    expect(ts[2].primaryKeys).toEqual(['cnpj']);
  });
  it('D-04 copia o tipo da PK e torna toda FK identificadora NOT NULL', () => {
    const t = mapped(base())[1];
    expect(t.columns.find((c) => c.name === 'cliente_cpf')).toMatchObject({
      type: 'VARCHAR(255)',
      nullable: false,
    });
    expect(t.primaryKeys).toContain('cliente_cpf');
  });
  it('D-05 rejeita nomes duplicados e mantém entidades em tabelas distintas', () => {
    const m = {
      entities: [e(0, 'Item'), e(1, 'Item'), e(2, 'Item_2')],
      attributes: [a(0, 0, 'a'), a(1, 1, 'b')],
    };
    expect(validateModel(m).filter((v) => v.ruleId === 'R011')).toHaveLength(2);
    expect(validateModel(m).find((v) => v.ruleId === 'R011').severity).toBe('error');
    expect(new Set(mapped(m).map((t) => t.name)).size).toBe(3);
  });
  it('D-06 SQL → modelo → SQL conserva tipos e não cria associação espúria', () => {
    const m = parseSQLToModel(
      'CREATE TABLE cliente (cpf VARCHAR(14) PRIMARY KEY); CREATE TABLE pedido (codigo BIGINT PRIMARY KEY, cliente_cpf VARCHAR(14) NOT NULL, FOREIGN KEY (cliente_cpf) REFERENCES cliente(cpf));',
    );
    for (const el of [...m.entities, ...m.attributes, ...m.relationships]) {
      expect(typeof el.id).toBe('number');
      expect(el.objType).toBeDefined();
    }
    const ts = mapped(m);
    expect(ts).toHaveLength(2);
    expect(ts[1].columns.find((c) => c.name === 'cliente_cpf')).toMatchObject({
      type: 'VARCHAR(14)',
      nullable: false,
    });
    expect(ts[1].columns[0].type).toBe('BIGINT');
  });
  it('D-08 aceita pares legados e cardinalidades unitárias sem ambiguidades', () => {
    expect(parseCardinality('(1,1)')).toEqual({ min: 1, max: 1 });
    expect(parseCardinality('1')).toEqual({ min: 1, max: 1 });
    expect(parseCardinality('N')).toEqual({ min: 0, max: 'N' });
  });
  it('D-09 identifica o dependente mesmo no lado 1 de uma relação 1:1', () => {
    const m = base();
    m.relationships[0].connections = [c(0, '1,1'), c(1, '0,1', true)];
    const ir = toCanonicalIR(m);
    expect(ir.relationships[0].participants[1].weak).toBe(true);
    expect(mapped(m)[1].primaryKeys).toContain('cliente_cpf');
    expect(validateModel(m).filter((v) => v.ruleId === 'R004')).toEqual([]);
  });
  it.each(['postgres', 'mysql', 'mariadb', 'sqlite'])(
    'D-11 adapta DATETIME, UUID e BLOB ao dialeto %s',
    (dialect) => {
      const ir = toCanonicalIR({
        entities: [e(0, 'Arquivo')],
        attributes: [
          a(0, 0, 'chave', 'Identificador'),
          { ...a(1, 0, 'data', 'Data e Hora'), primary: false },
          { ...a(2, 0, 'bytes', 'blob'), primary: false },
        ],
      });
      const sql = exportCode(ir, dialect);
      if (dialect === 'postgres') {
        expect(sql).toContain('TIMESTAMP');
        expect(sql).toContain('BYTEA');
        expect(sql).not.toContain('DATETIME');
      }
      if (['mysql', 'mariadb'].includes(dialect)) {
        expect(sql).toContain('CHAR(36)');
        expect(sql).not.toContain(' UUID');
      }
      if (dialect === 'sqlite') {
        expect(sql).toContain('chave TEXT');
        expect(sql).toContain('bytes BLOB');
      }
    },
  );
  it('D-12 cardinalidade ausente gera apenas R002 no Crow’s Foot', () => {
    const m = base();
    m.relationships[0].connections[0].cardinality = '';
    expect(
      validateModel(m, 'crow').filter((v) => ['R002', 'CF001'].includes(v.ruleId)),
    ).toHaveLength(1);
  });
  it('cardinalidades arbitrárias são validadas e limites finitos > 1 mapeiam muitos', () => {
    expect(parseCardinality('2,5')).toEqual({ min: 2, max: 5 });
    expect(() => parseCardinality('5,2')).toThrow();
    expect(() => parseCardinality('-1,N')).toThrow();
    const m = base();
    m.relationships[0].connections = [c(0, '2,5'), c(1, '0,3')];
    expect(mapped(m)).toHaveLength(3);
  });
  it('chave parcial explícita vira discriminante na PK e preserva chave legada', () => {
    const m = base();
    m.attributes[1].primary = false;
    m.attributes[1].partialKey = true;
    expect(toCanonicalIR(m).entities[1].attributes[0].partialKey).toBe(true);
    expect(mapped(m)[1].primaryKeys).toEqual(['nome', 'cliente_cpf']);
    expect(validateModel(m).filter((v) => v.ruleId === 'R001')).toEqual([]);
  });
});
it('limite máximo finito maior que um também é lista no GraphQL', () => {
  const m = base();
  m.relationships[0].connections[1].cardinality = '0,5';
  expect(exportCode(toCanonicalIR(m), 'graphql')).toContain('dependente: [Dependente]');
});

describe('identificadores ASCII', () => {
  it('translitera acentos em colunas em vez de substituí-los por sublinhado', () => {
    const m = {
      entities: [e(0, 'Aluno')],
      attributes: [
        a(0, 0, 'matrícula', 'Numérico Inteiro'),
        { ...a(1, 0, 'carga_horária'), primary: false },
        { ...a(2, 0, 'Endereço'), primary: false, multivalued: true },
      ],
    };
    const tables = mapped(m);
    expect(tables[0].columns.map((col) => col.name)).toEqual(['matricula', 'carga_horaria']);
    expect(tables[0].primaryKeys).toEqual(['matricula']);
    expect(tables.map((table) => table.name)).toContain('aluno_endereco');
  });
});

describe('herança em tabela única', () => {
  it('não leva a chave substituta do subtipo para o supertipo', () => {
    const m = {
      entities: [e(0, 'Pagamento'), e(1, 'Cartao'), e(2, 'Dinheiro')],
      attributes: [
        a(0, 0, 'numero', 'Numérico Inteiro'),
        { ...a(1, 1, 'final'), primary: false },
        { ...a(2, 2, 'caixa'), primary: false },
      ],
      specializations: [
        {
          genType: 'T,D',
          connections: [
            { entityId: 0, vertex: 0 },
            { entityId: 1, vertex: 1 },
            { entityId: 2, vertex: 2 },
          ],
        },
      ],
    };
    const tables = mapped(m);
    expect(tables).toHaveLength(1);
    expect(tables[0].columns.map((col) => col.name)).toEqual(['numero', 'tipo', 'final', 'caixa']);
    expect(tables[0].columns.some((col) => col.isAutoIncrement)).toBe(false);
  });
});

describe('relacionamentos distintos entre as mesmas entidades', () => {
  it('geram uma FK para cada relacionamento mesmo sem papéis', () => {
    const m = {
      entities: [e(0, 'Time'), e(1, 'Jogo')],
      attributes: [a(0, 0, 'codigo'), a(1, 1, 'numero', 'Numérico Inteiro')],
      relationships: [
        { id: 0, name: 'manda', connections: [c(0, '0,1'), c(1, '1,N')] },
        { id: 1, name: 'visita', connections: [c(0, '0,1'), c(1, '1,N')] },
      ],
    };
    const jogo = mapped(m).find((table) => table.name === 'jogo');
    expect(jogo.foreignKeys).toHaveLength(2);
    expect(new Set(jogo.columns.map((col) => col.name)).size).toBe(jogo.columns.length);
    expect(jogo.columns.filter((col) => !col.nullable).map((col) => col.name)).toHaveLength(3);
  });
});

describe('palavras reservadas', () => {
  it('cita tabelas e colunas cujo nome é reservado, em cada dialeto', () => {
    const m = {
      entities: [e(0, 'Order'), e(1, 'Item')],
      attributes: [a(0, 0, 'number', 'Numérico Inteiro'), a(1, 1, 'group', 'Numérico Inteiro')],
      relationships: [{ id: 0, name: 'has', connections: [c(0, '0,1'), c(1, '1,N')] }],
    };
    const ir = toCanonicalIR(m);
    expect(exportCode(ir, 'postgres')).toContain('CREATE TABLE "order" (');
    expect(exportCode(ir, 'postgres')).toContain('"group" INTEGER NOT NULL');
    expect(exportCode(ir, 'mysql')).toContain('CREATE TABLE `order` (');
    expect(exportCode(ir, 'mariadb')).toContain('REFERENCES `order`(number)');
    expect(exportCode(ir, 'sqlite')).toContain('REFERENCES "order"(number)');
    // A saída citada continua sendo aceita pela reversa.
    const back = parseSQLToModel(exportCode(ir, 'sqlite'));
    expect(back.entities.map((entity) => entity.name)).toContain('order');
  });
});
