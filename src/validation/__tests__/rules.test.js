import { describe, it, expect } from 'vitest';
import { R001, R002, R003, R004, R005, R006, R008 } from '../rules/common/index.js';
import { R012 } from '../rules/common/R012_dependent_participation.js';
import { setLanguage } from '../../i18n/index.js';
import { C001 } from '../rules/chen/index.js';
import { CF001 } from '../rules/crowsfoot/index.js';
import { validateModel } from '../engine.js';
import { getRulesForNotation } from '../rules/index.js';
const connection = (entityId, weak = false, cardinality = '0,N') => ({
  entityId,
  weak,
  cardinality,
});
const relationship = (id, connections) => ({ id, name: 'possui', connections });
const entity = (id, name = 'Pessoa') => ({ id, name });
const key = (parentId, partial = false) => ({
  id: parentId,
  name: 'codigo',
  parentType: 'entity',
  parentId,
  primary: !partial,
  partialKey: partial,
});
describe('Regras de validação usadas pelo editor', () => {
  it('R001 entidade forte exige chave; chave parcial atende dependente e chave legada continua válida', () => {
    expect(R001.check({ entities: [entity(0)] })).toHaveLength(1);
    expect(R001.check({ entities: [entity(0)], attributes: [key(0)] })).toEqual([]);
    const m = {
      entities: [entity(0)],
      attributes: [key(0, true)],
      relationships: [relationship(0, [connection(0, true), connection(1)])],
    };
    expect(R001.check(m)).toEqual([]);
  });
  it('R001 subtipos herdam chave; membros de categoria não herdam a chave da categoria', () => {
    const m = {
      entities: [entity(0), entity(1), entity(2)],
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
    expect(R001.check(m).map((v) => v.elementId)).toEqual([1, 2]);
    m.specializations[0].genType = 'P,C';
    expect(R001.check(m).map((v) => v.elementId)).toEqual([0]);
  });
  it('R002 rejeita zero/um participante, ausência de cardinalidade e limites inválidos', () => {
    expect(R002.check({ relationships: [relationship(0, [])] })).toHaveLength(1);
    expect(R002.check({ relationships: [relationship(0, [connection(0)])] })).toHaveLength(1);
    const m = {
      relationships: [relationship(0, [connection(0, false, '5,2'), connection(1, false, '')])],
    };
    expect(R002.check(m)).toHaveLength(2);
    m.relationships[0].connections = [connection(0, false, '2,5'), connection(1, false, '(0,n)')];
    expect(R002.check(m)).toEqual([]);
  });
  it('R003 valida um ápice e subtipos ou categoria com dois membros', () => {
    const s = {
      id: 0,
      genType: 'P,C',
      connections: [
        { entityId: 0, vertex: 0 },
        { entityId: 1, vertex: 1 },
      ],
    };
    expect(R003.check({ specializations: [s] })).toEqual([]);
    s.genType = 'U';
    expect(R003.check({ specializations: [s] })).toHaveLength(1);
    s.connections.push({ entityId: 2, vertex: 2 });
    expect(R003.check({ specializations: [s] })).toEqual([]);
    s.connections.push({ entityId: 3, vertex: 0 });
    expect(R003.check({ specializations: [s] })).toHaveLength(1);
  });
  it('R004 requer proprietário não marcado como dependente no mesmo relacionamento', () => {
    const r = relationship(0, [connection(0, true), connection(1, true)]);
    expect(R004.check({ relationships: [r] })).toHaveLength(1);
    r.connections[1].weak = false;
    expect(R004.check({ relationships: [r] })).toEqual([]);
    expect(
      R004.check({ relationships: [r, relationship(1, [connection(1, true), connection(2)])] }),
    ).toEqual([]);
  });
  it('R012 aponta conexão dependente com mínimo 0 em relacionamentos e agregações', () => {
    const r = relationship(0, [connection(0), connection(1, true, '0,N')]);
    expect(R012.check({ relationships: [r] })).toEqual([
      expect.objectContaining({ elementId: 0, elementType: 'relationship' }),
    ]);
    r.connections[1].cardinality = '1,N';
    expect(R012.check({ relationships: [r] })).toEqual([]);
    r.connections[1].cardinality = '2,5';
    expect(R012.check({ relationships: [r] })).toEqual([]);
    expect(R012.check({ relationships: [relationship(1, [connection(1, true, '')])] })).toEqual([]);
    const agg = { id: 3, objType: 'aggregation', name: 'agg', connections: [connection(1, true, '0,1')] };
    expect(R012.check({ aggregations: [agg] })).toHaveLength(1);
    expect(R012.check({ aggregations: [agg] })[0].elementType).toBe('aggregation');
  });
  it('R012 chega ao engine com mensagens em português e inglês', () => {
    const model = { relationships: [relationship(0, [connection(0), connection(1, true, '0,1')])] };
    const found = () => validateModel(model).filter((v) => v.ruleId === 'R012');
    try {
      setLanguage('pt', { setItem() {} });
      expect(found()[0].message).toContain('cardinalidade mínima 0');
      setLanguage('en', { setItem() {} });
      expect(found()[0].message).toContain('minimum cardinality 0');
      expect(found()[0].name).toBe('Dependent connection with partial participation');
    } finally {
      setLanguage('pt', { setItem() {} });
    }
  });
  it('R005 avisa só atributos multivalorados, inclusive tipo legado', () => {
    expect(
      R005.check({
        attributes: [
          { id: 0, name: 'telefone', multivalued: true },
          { id: 1, name: 'email', objType: 'multivaluedAttribute' },
          { id: 2, name: 'cpf' },
        ],
      }).map((v) => v.elementId),
    ).toEqual([0, 1]);
  });
  it('R006 avisa plurais e respeita exceções singulares', () => {
    expect(
      R006.check({
        entities: [
          entity(0, 'Clientes'),
          entity(1, 'Status'),
          entity(2, 'Lápis'),
          entity(3, 'Pessoa'),
        ],
      }).map((v) => v.elementId),
    ).toEqual([0]);
  });
  it('R008 detecta ciclo de identificação e aceita dependência com raiz', () => {
    const m = {
      relationships: [
        relationship(0, [connection(0, true), connection(1)]),
        relationship(1, [connection(1, true), connection(0)]),
      ],
    };
    expect(R008.check(m).length).toBeGreaterThan(0);
    m.relationships[1].connections[1].entityId = 2;
    expect(R008.check(m)).toEqual([]);
  });
  it('C001 aceita pais existentes de todos os tipos e rejeita pais ausentes', () => {
    const m = {
      entities: [entity(0)],
      aggregations: [{ id: 0 }],
      attributes: [
        key(0),
        { id: 1, name: 'nota', parentType: 'aggregation', parentId: 0 },
        { id: 2, name: 'parte', parentType: 'attribute', parentId: 0 },
        { id: 3, name: 'solto', parentType: 'attribute', parentId: 99 },
      ],
    };
    expect(C001.check(m).map((v) => v.elementId)).toEqual([3]);
  });
  it('CF001 avisa limites numéricos não expressos pelos símbolos sem duplicar R002', () => {
    const m = {
      relationships: [
        relationship(0, [
          connection(0, false, ''),
          connection(1, false, '5,2'),
          connection(2, false, '2,5'),
        ]),
      ],
    };
    expect(CF001.check(m)).toHaveLength(1);
    const result = validateModel(m, 'crow');
    expect(result.filter((v) => v.ruleId === 'R002')).toHaveLength(2);
    expect(result.filter((v) => v.ruleId === 'CF001')).toHaveLength(1);
  });
});

describe('Proveniência das regras', () => {
  const all = [...new Map([...getRulesForNotation('chen'), ...getRulesForNotation('crow')].map((r) => [r.id, r])).values()];
  it('o campo notation usa a mesma chave que o seletor de notação', () => {
    expect(new Set(all.map((r) => r.notation))).toEqual(new Set(['common', 'chen', 'crow']));
    expect(CF001.notation).toBe('crow');
  });
  it('só Chen (1976) é citado, com seção, e apenas nas regras que ele sustenta', () => {
    for (const r of all) expect(r.literature, r.id).not.toMatch(/Elmasri|Navathe|Batra|Teorey|Martin|Barker|Hoffer/);
    const withChen = all.filter((r) => /Chen \(1976\), §/.test(r.literature)).map((r) => r.id);
    expect(withChen.sort()).toEqual(['C001', 'R002', 'R004', 'R012']);
    for (const r of all.filter((x) => !withChen.includes(x.id))) expect(r.literature, r.id).toMatch(/sem atribuição a fonte/);
  });
  it('mensagens de regras não atribuem a regra a autor', () => {
    const model = {
      entities: [entity(0, 'Clientes'), entity(1, 'Entidade'), entity(2, 'Entidade')],
      attributes: [
        { id: 0, name: 'x', parentType: 'entity', parentId: 9, multivalued: true },
        { id: 1, name: 'y', parentId: null },
      ],
      relationships: [relationship(0, [connection(0)]), relationship(1, [connection(0, true, '0,N'), connection(1)])],
      specializations: [{ id: 0, genType: 'U', connections: [{ entityId: 0, vertex: 0 }] }],
    };
    const msgs = validateModel(model, 'chen').map((v) => v.message);
    expect(msgs.length).toBeGreaterThan(5);
    for (const m of msgs) expect(m).not.toMatch(/Chen, 1976|Elmasri|Navathe|Cap\. \d/);
  });
});
