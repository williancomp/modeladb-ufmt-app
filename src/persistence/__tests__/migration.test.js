import { describe, it, expect } from 'vitest';
import { detectVersion, migrateV1ToV2, autoMigrate, flattenV2ToV1 } from '../migration.js';
import {
  toCanonicalIR,
  parseCardinality,
  parseGenType,
} from '../canonicalIR.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Sample v1 data — simulates a real .merdb v1.0 file
// ═══════════════════════════════════════════════════════════════════════════════
const SAMPLE_V1 = {
  version: '1.0',
  entities: [
    { id: 0, name: 'Cliente', x: 100, y: 200, width: 160, height: 80, objType: 'entity', selected: false },
    { id: 1, name: 'Pedido', x: 400, y: 200, width: 160, height: 80, objType: 'entity', selected: false },
  ],
  attributes: [
    { id: 0, name: 'CPF', x: 100, y: 100, objType: 'attribute', parentType: 'entity', parentId: 0, primary: true },
    { id: 1, name: 'Nome', x: 200, y: 100, objType: 'attribute', parentType: 'entity', parentId: 0, primary: false },
    { id: 2, name: 'Número', x: 400, y: 100, objType: 'attribute', parentType: 'entity', parentId: 1, primary: true },
    { id: 3, name: 'Data', x: 500, y: 100, objType: 'attribute', parentType: 'entity', parentId: 1, primary: false },
    { id: 4, name: 'Total', x: 550, y: 150, objType: 'derivedAttribute', parentType: 'entity', parentId: 1, derived: true },
    { id: 5, name: 'Telefones', x: 150, y: 300, objType: 'multivaluedAttribute', parentType: 'entity', parentId: 0, multivalued: true },
  ],
  relationships: [
    {
      id: 0, name: 'Realiza', x: 250, y: 200, size: 120, objType: 'relationship',
      connections: [
        { entityId: 0, cardinality: '1,N', breakpoints: [{ x: 150, y: 200 }] },
        { entityId: 1, cardinality: '0,1', breakpoints: [] },
      ],
    },
  ],
  specializations: [
    {
      id: 0, x: 300, y: 400, size: 100, objType: 'specialization', genType: 'T,C',
      connections: [
        { entityId: 0, isGeneralization: true },
        { entityId: 1, isGeneralization: false },
      ],
    },
  ],
  aggregations: [],
  postits: [
    { id: 0, x: 600, y: 50, width: 150, height: 100, text: 'TODO: validar', color: '#ffff88', objType: 'postit' },
  ],
  entityIdCounter: 2,
  attributeIdCounter: 6,
  relationshipIdCounter: 1,
  specializationIdCounter: 1,
  aggregationIdCounter: 0,
  postitIdCounter: 1,
  fontSize: 18,
  panOffset: { x: 10, y: 20 },
};

const SAMPLE_V1_WEAK = {
  version: '1.0',
  entities: [
    { id: 0, name: 'Departamento', x: 100, y: 100, width: 160, height: 80, objType: 'entity' },
    { id: 1, name: 'Projeto', x: 400, y: 100, width: 160, height: 80, objType: 'entity' },
  ],
  attributes: [
    { id: 0, name: 'Nome', x: 100, y: 50, objType: 'attribute', parentType: 'entity', parentId: 0, primary: true },
    { id: 1, name: 'Código', x: 400, y: 50, objType: 'attribute', parentType: 'entity', parentId: 1, primary: true },
  ],
  relationships: [
    {
      id: 0, name: 'Controla', x: 250, y: 100, size: 120, objType: 'relationship',
      connections: [
        { entityId: 0, cardinality: '1,1', weak: false },
        { entityId: 1, cardinality: '0,N', weak: true },
      ],
    },
  ],
  specializations: [],
  aggregations: [],
  postits: [],
  entityIdCounter: 2,
  attributeIdCounter: 2,
  relationshipIdCounter: 1,
  specializationIdCounter: 0,
  aggregationIdCounter: 0,
  postitIdCounter: 0,
  fontSize: 18,
  panOffset: { x: 0, y: 0 },
};

const SAMPLE_V1_AGGREGATION = {
  version: '1.0',
  entities: [
    { id: 0, name: 'Funcionário', x: 100, y: 100, width: 160, height: 80, objType: 'entity' },
    { id: 1, name: 'Projeto', x: 400, y: 100, width: 160, height: 80, objType: 'entity' },
  ],
  attributes: [
    { id: 0, name: 'Horas', x: 250, y: 300, objType: 'attribute', parentType: 'aggregation', parentId: 0 },
  ],
  relationships: [
    { id: 0, name: 'Trabalha', x: 250, y: 100, size: 120, objType: 'relationship', connections: [{ entityId: 0, cardinality: '1,N' }, { entityId: 1, cardinality: '0,N' }] },
  ],
  specializations: [],
  aggregations: [
    {
      id: 0, name: 'Alocação', x: 250, y: 250, size: 120, objType: 'aggregation',
      connections: [
        { entityId: 0, cardinality: '1,N' },
        { relationshipId: 0, cardinality: '0,1' },
      ],
    },
  ],
  postits: [],
  entityIdCounter: 2,
  attributeIdCounter: 1,
  relationshipIdCounter: 1,
  specializationIdCounter: 0,
  aggregationIdCounter: 1,
  postitIdCounter: 0,
  fontSize: 18,
  panOffset: { x: 0, y: 0 },
};

const SAMPLE_V1_COMPOSITE = {
  version: '1.0',
  entities: [
    { id: 0, name: 'Pessoa', x: 100, y: 100, width: 160, height: 80, objType: 'entity' },
  ],
  attributes: [
    { id: 0, name: 'Endereço', x: 100, y: 50, objType: 'attribute', parentType: 'entity', parentId: 0 },
    { id: 1, name: 'Rua', x: 50, y: 20, objType: 'attribute', parentType: 'attribute', parentId: 0 },
    { id: 2, name: 'Cidade', x: 150, y: 20, objType: 'attribute', parentType: 'attribute', parentId: 0 },
  ],
  relationships: [],
  specializations: [],
  aggregations: [],
  postits: [],
  entityIdCounter: 1,
  attributeIdCounter: 3,
  relationshipIdCounter: 0,
  specializationIdCounter: 0,
  aggregationIdCounter: 0,
  postitIdCounter: 0,
  fontSize: 18,
  panOffset: { x: 0, y: 0 },
};

const SAMPLE_V1_EMPTY = {
  entities: [],
  attributes: [],
  relationships: [],
  specializations: [],
  aggregations: [],
  postits: [],
  entityIdCounter: 0,
  attributeIdCounter: 0,
  relationshipIdCounter: 0,
  specializationIdCounter: 0,
  aggregationIdCounter: 0,
  postitIdCounter: 0,
  fontSize: 18,
  panOffset: { x: 0, y: 0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: Version Detection
// ═══════════════════════════════════════════════════════════════════════════════
describe('detectVersion', () => {
  it('detects v1.0', () => {
    expect(detectVersion(SAMPLE_V1)).toBe('1.0');
  });

  it('detects v2.0', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(detectVersion(v2)).toBe('2.0');
  });

  it('returns unknown for garbage', () => {
    expect(detectVersion(null)).toBe('unknown');
    expect(detectVersion({})).toBe('unknown');
    expect(detectVersion({ version: '3.0' })).toBe('unknown');
  });

  it('detects v1.0 even without version field', () => {
    expect(detectVersion(SAMPLE_V1_EMPTY)).toBe('1.0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: v1 → v2 Migration
// ═══════════════════════════════════════════════════════════════════════════════
describe('migrateV1ToV2', () => {
  it('sets version to 2.0', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.version).toBe('2.0');
  });

  it('creates meta section', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.meta.tool).toBe('ModelaDB');
    expect(v2.meta.createdAt).toBeDefined();
    expect(v2.meta.lastModifiedAt).toBeDefined();
    expect(v2.meta.toolVersion).toBeDefined();
  });

  it('preserves all entities', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.domain.entities.length).toBe(2);
    expect(v2.domain.entities[0].name).toBe('Cliente');
    expect(v2.domain.entities[1].name).toBe('Pedido');
  });

  it('preserves all attributes', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.domain.attributes.length).toBe(6);
    expect(v2.domain.attributes[0].primary).toBe(true);
  });

  it('preserves all relationships with connections', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.domain.relationships.length).toBe(1);
    expect(v2.domain.relationships[0].connections.length).toBe(2);
    expect(v2.domain.relationships[0].connections[0].cardinality).toBe('1,N');
  });

  it('preserves specializations', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.domain.specializations.length).toBe(1);
    expect(v2.domain.specializations[0].genType).toBe('T,C');
  });

  it('preserves postits', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.domain.postits.length).toBe(1);
    expect(v2.domain.postits[0].text).toBe('TODO: validar');
  });

  it('extracts positions into view.positions', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.view.positions['entity_0']).toEqual({ x: 100, y: 200, width: 160, height: 80 });
    expect(v2.view.positions['entity_1']).toBeDefined();
    expect(v2.view.positions['attr_0']).toBeDefined();
    expect(v2.view.positions['rel_0']).toBeDefined();
  });

  it('extracts breakpoints into view.breakpoints', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.view.breakpoints['rel_0_conn_0']).toEqual([{ x: 150, y: 200 }]);
  });

  it('preserves panOffset and fontSize in view', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.view.panOffset).toEqual({ x: 10, y: 20 });
    expect(v2.view.fontSize).toBe(18);
  });

  it('moves counters into domain.counters', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    expect(v2.domain.counters.entityIdCounter).toBe(2);
    expect(v2.domain.counters.attributeIdCounter).toBe(6);
    expect(v2.domain.counters.relationshipIdCounter).toBe(1);
  });

  it('handles empty v1 data gracefully', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1_EMPTY);
    expect(v2.version).toBe('2.0');
    expect(v2.domain.entities).toEqual([]);
    expect(v2.domain.counters.entityIdCounter).toBe(0);
  });

  it('handles aggregations correctly', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1_AGGREGATION);
    expect(v2.domain.aggregations.length).toBe(1);
    expect(v2.domain.aggregations[0].name).toBe('Alocação');
    expect(v2.view.positions['agg_0']).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: autoMigrate
// ═══════════════════════════════════════════════════════════════════════════════
describe('autoMigrate', () => {
  it('passes v2 through unchanged', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    const result = autoMigrate(v2);
    expect(result).toBe(v2); // same reference
  });

  it('migrates v1 to v2', () => {
    const result = autoMigrate(SAMPLE_V1);
    expect(result.version).toBe('2.0');
    expect(result.domain.entities.length).toBe(2);
  });

  it('throws on unknown format', () => {
    expect(() => autoMigrate({ version: '99' })).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: flattenV2ToV1
// ═══════════════════════════════════════════════════════════════════════════════
describe('flattenV2ToV1', () => {
  it('round-trips v1 → v2 → v1', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    const flat = flattenV2ToV1(v2);
    expect(flat.entities.length).toBe(2);
    expect(flat.attributes.length).toBe(6);
    expect(flat.relationships.length).toBe(1);
    expect(flat.entityIdCounter).toBe(2);
    expect(flat.fontSize).toBe(18);
    expect(flat.panOffset).toEqual({ x: 10, y: 20 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: parseCardinality
// ═══════════════════════════════════════════════════════════════════════════════
describe('parseCardinality', () => {
  it('parses "0,N"', () => {
    expect(parseCardinality('0,N')).toEqual({ min: 0, max: 'N' });
  });

  it('parses "1,1"', () => {
    expect(parseCardinality('1,1')).toEqual({ min: 1, max: 1 });
  });

  it('parses "0,1"', () => {
    expect(parseCardinality('0,1')).toEqual({ min: 0, max: 1 });
  });

  it('parses "1,N"', () => {
    expect(parseCardinality('1,N')).toEqual({ min: 1, max: 'N' });
  });

  it('handles null/undefined gracefully', () => {
    expect(parseCardinality(null)).toEqual({ min: 0, max: 'N' });
    expect(parseCardinality(undefined)).toEqual({ min: 0, max: 'N' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: parseGenType
// ═══════════════════════════════════════════════════════════════════════════════
describe('parseGenType', () => {
  it('parses "T,C" as total + overlapping (C = Com Sobreposição)', () => {
    expect(parseGenType('T,C')).toEqual({ totality: 'total', disjointness: 'overlapping' });
  });

  it('parses "T,D" as total + disjoint (D = Disjunta)', () => {
    expect(parseGenType('T,D')).toEqual({ totality: 'total', disjointness: 'disjoint' });
  });

  it('parses "P,C" as partial + overlapping (C = Com Sobreposição)', () => {
    expect(parseGenType('P,C')).toEqual({ totality: 'partial', disjointness: 'overlapping' });
  });

  it('parses "P,D" as partial + disjoint (D = Disjunta)', () => {
    expect(parseGenType('P,D')).toEqual({ totality: 'partial', disjointness: 'disjoint' });
  });

  it('defaults unknown to partial + overlapping', () => {
    expect(parseGenType('X,Y')).toEqual({ totality: 'partial', disjointness: 'overlapping' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: toCanonicalIR
// ═══════════════════════════════════════════════════════════════════════════════
describe('toCanonicalIR', () => {
  it('produces valid IR from v1 data', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    expect(ir.$schema).toContain('merdb-ir');
    expect(ir.entities.length).toBe(2);
    expect(ir.relationships.length).toBe(1);
    expect(ir.generalizations.length).toBe(1);
  });

  it('uses slug-based IDs', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    expect(ir.entities[0].id).toBe('cliente');
    expect(ir.entities[1].id).toBe('pedido');
    expect(ir.relationships[0].id).toBe('rel_realiza');
  });

  it('attaches attributes to their parent entity', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    const cliente = ir.entities.find(e => e.id === 'cliente');
    expect(cliente.attributes.length).toBe(3); // CPF, Nome, Telefones
    const cpf = cliente.attributes.find(a => a.id === 'cliente.cpf');
    expect(cpf.primaryKey).toBe(true);
    expect(cpf.type).toBe('simple');
  });

  it('classifies derived attributes', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    const pedido = ir.entities.find(e => e.id === 'pedido');
    const total = pedido.attributes.find(a => a.name === 'Total');
    expect(total.type).toBe('derived');
  });

  it('classifies multivalued attributes', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    const cliente = ir.entities.find(e => e.id === 'cliente');
    const telefones = cliente.attributes.find(a => a.name === 'Telefones');
    expect(telefones.type).toBe('multivalued');
  });

  it('converts cardinalities to canonical format', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    const rel = ir.relationships[0];
    expect(rel.participants[0].cardinality).toEqual({ min: 1, max: 'N' });
    expect(rel.participants[1].cardinality).toEqual({ min: 0, max: 1 });
  });

  it('converts generalization types', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    const gen = ir.generalizations[0];
    // SAMPLE_V1 has genType 'T,C' → Total + Com Sobreposição (overlapping)
    expect(gen.totality).toBe('total');
    expect(gen.disjointness).toBe('overlapping');
    expect(gen.superEntityId).toBe('cliente');
    expect(gen.subEntityIds).toContain('pedido');
  });

  it('detects weak entities', () => {
    const ir = toCanonicalIR(SAMPLE_V1_WEAK);
    const projeto = ir.entities.find(e => e.id === 'projeto');
    expect(projeto.weak).toBe(true);
    const depto = ir.entities.find(e => e.id === 'departamento');
    expect(depto.weak).toBe(false);
  });

  it('marks identifying relationships', () => {
    const ir = toCanonicalIR(SAMPLE_V1_WEAK);
    expect(ir.relationships[0].identifying).toBe(true);
  });

  it('handles aggregations', () => {
    const ir = toCanonicalIR(SAMPLE_V1_AGGREGATION);
    expect(ir.aggregations).toBeDefined();
    expect(ir.aggregations.length).toBe(1);
    expect(ir.aggregations[0].id).toBe('agg_alocacao');
    expect(ir.aggregations[0].participants.length).toBe(2);
    expect(ir.aggregations[0].attributes).toBeDefined();
    expect(ir.aggregations[0].attributes.length).toBe(1);
    expect(ir.aggregations[0].attributes[0].name).toBe('Horas');
  });

  it('builds composite attributes with sub-attributes', () => {
    const ir = toCanonicalIR(SAMPLE_V1_COMPOSITE);
    const pessoa = ir.entities.find(e => e.id === 'pessoa');
    expect(pessoa.attributes.length).toBe(1);
    const endereco = pessoa.attributes[0];
    expect(endereco.type).toBe('composite');
    expect(endereco.subAttributes.length).toBe(2);
    expect(endereco.subAttributes.map(a => a.name)).toContain('Rua');
    expect(endereco.subAttributes.map(a => a.name)).toContain('Cidade');
  });

  it('produces no visual data', () => {
    const ir = toCanonicalIR(SAMPLE_V1);
    const json = JSON.stringify(ir);
    expect(json).not.toContain('"x"');
    expect(json).not.toContain('"y"');
    expect(json).not.toContain('"width"');
    expect(json).not.toContain('"panOffset"');
    expect(json).not.toContain('"zoom"');
  });

  it('handles empty data', () => {
    const ir = toCanonicalIR(SAMPLE_V1_EMPTY);
    expect(ir.entities).toEqual([]);
    expect(ir.relationships).toEqual([]);
    expect(ir.generalizations).toEqual([]);
  });

  it('works from v2 domain section', () => {
    const v2 = migrateV1ToV2(SAMPLE_V1);
    const ir = toCanonicalIR(v2);
    expect(ir.entities.length).toBe(2);
    expect(ir.relationships.length).toBe(1);
  });
});
