import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { serializeDiagram, parseDiagram } from '../file.js';
import { toCanonicalIR } from '../canonicalIR.js';
import { packToV2, detectVersion } from '../migration.js';
const schema = JSON.parse(readFileSync(new URL('../../../schemas/merdb-v2.schema.json', import.meta.url)));
const irSchema = JSON.parse(readFileSync(new URL('../../../schemas/merdb-ir.schema.json', import.meta.url)));
const ajv = addFormats(new Ajv({allErrors:true}));
const validate = ajv.compile(schema), validateIR = ajv.compile(irSchema);
const legacy = JSON.parse(readFileSync(new URL('./fixtures/production-v1.merdb', import.meta.url)));

describe('formato de produção', () => {
  it('migra o arquivo da versão publicada sem perder semântica nem layout', () => {
    const loaded = parseDiagram(JSON.stringify(legacy));
    expect(loaded.entities).toEqual(legacy.entities);
    expect(loaded.attributes).toEqual(legacy.attributes);
    expect(loaded.relationships).toEqual(legacy.relationships);
    expect(loaded.notation).toBe(legacy.notation);
    expect(loaded.panOffset).toEqual(legacy.panOffset);
    expect(loaded.entityIdCounter).toBeGreaterThan(Math.max(...loaded.entities.map(e => e.id)));
  });
  it('grava somente v2 válido no schema e faz ida e volta', () => {
    const flat = parseDiagram(JSON.stringify(legacy));
    const written = JSON.parse(serializeDiagram(flat));
    expect(written.version).toBe('2.0');
    expect(validate(written), JSON.stringify(validate.errors)).toBe(true);
    expect(validateIR(toCanonicalIR(flat)), JSON.stringify(validateIR.errors)).toBe(true);
    const reloaded = parseDiagram(JSON.stringify(written));
    expect(reloaded).toEqual(flat);
  });
  it('aplica posições e pontos de controle v2, sem depender da cópia no domínio', () => {
    const v2 = packToV2(legacy);
    delete v2.domain.entities[0].x;
    v2.view.positions.entity_0.x = 123;
    v2.view.breakpoints.rel_0_conn_0 = [{x: 99, y: 88}];
    const loaded = parseDiagram(JSON.stringify(v2));
    expect(loaded.entities[0].x).toBe(123);
    expect(loaded.relationships[0].connections[0].breakpoints).toEqual([{x: 99, y: 88}]);
  });
  it('rejeita versões futuras e objetos malformados sem alterar dados', () => {
    expect(detectVersion({...legacy, version:'99.0'})).toBe('unknown');
    for (const input of ['null', '{', '{}', '{"entities":[null]}', JSON.stringify({...legacy,version:'99.0'})]) {
      expect(() => parseDiagram(input)).toThrow();
    }
  });
});

it('valida a saída dos comandos reais de criação, incluindo atributo solto e categoria U', async () => {
 const state = await import('../../domain/state.js');
 const operations = await import('../../domain/operations.js');
 for (const key of ['entities','attributes','relationships','specializations','aggregations','postits']) state.diagram[key]=[];
 for (const key of ['entity','attribute','relationship','specialization','aggregation','postit']) state.diagram[key+'IdCounter']=0;
 for (const type of ['entity','relationship','specialization','aggregation','postit']) operations.createObjectAt(type,100,100);
 for (const type of ['attribute','derivedAttribute','multivaluedAttribute']) operations.createObjectAt(type,100,100,{type:'entity',element:state.entities[0]});
 operations.createElementFromKeyboard('attribute',100,100);
 state.specializations[0].genType='U';
 const written=JSON.parse(serializeDiagram(state.diagram));
 expect(validate(written),JSON.stringify(validate.errors)).toBe(true);
 expect(parseDiagram(JSON.stringify(written)).attributes).toHaveLength(4);
});

it('grava geometria somente em view e restaura todos os campos legados', () => {
 const flat=parseDiagram(JSON.stringify(legacy));
 const written=JSON.parse(serializeDiagram(flat));
 expect(written.domain.entities[0]).not.toHaveProperty('x');
 expect(written.domain.relationships[0].connections[0]).not.toHaveProperty('breakpoints');
 expect(written.view.positions.entity_0.x).toBe(flat.entities[0].x);
 expect(parseDiagram(JSON.stringify(written))).toEqual(flat);
});

it('abre o fixture v2 documentado e confirma equivalência com a produção anterior', () => {
 const v2=readFileSync(new URL('./fixtures/current-v2.merdb',import.meta.url),'utf8');
 expect(validate(JSON.parse(v2)),JSON.stringify(validate.errors)).toBe(true);
 expect(toCanonicalIR(parseDiagram(v2))).toEqual(toCanonicalIR(parseDiagram(JSON.stringify(legacy))));
});

it('preserva data de criação e versão de origem em cargas e gravações sucessivas', () => {
 const loaded=parseDiagram(JSON.stringify(legacy));
 const first=JSON.parse(serializeDiagram(loaded));
 expect(first.meta.sourceAppVersion).toBe(legacy.appVersion);
 const second=JSON.parse(serializeDiagram(parseDiagram(first)));
 expect(second.meta.createdAt).toBe(first.meta.createdAt);
 expect(second.meta.sourceAppVersion).toBe(first.meta.sourceAppVersion);
 expect(second.meta.toolVersion).toBe(JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url))).version);
});

it('mantém o afastamento inicial do editor para arquivos legados sem zoom gravado', () => {
 const withoutZoom={...legacy};delete withoutZoom.zoom;
 expect(parseDiagram(JSON.stringify(withoutZoom)).zoom).toBe(0.8);
});
