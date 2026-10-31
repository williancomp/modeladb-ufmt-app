import { describe, it, expect } from 'vitest';
import * as stateModule from '../state.js';
import { beforeEach } from 'vitest';
const state = stateModule.diagram;
beforeEach(() => {
  for (const key of ['entities', 'attributes', 'relationships', 'specializations', 'aggregations', 'postits']) state[key] = [];
  for (const key of ['entity', 'attribute', 'relationship', 'specialization', 'aggregation', 'postit']) state[key + 'IdCounter'] = 0;
  stateModule.resetUndoBaseline();
});
import { createObjectAt, connectObjects } from '../operations.js';
import * as operations from '../operations.js';

describe('estado usado pelo editor', () => {
  it('aloca ids independentes por tipo', () => {
    const state = stateModule.diagram;
    createObjectAt('entity', 200, 150);
    createObjectAt('entity', 400, 150);
    createObjectAt('relationship', 300, 150);
    expect(state.entities.map(e => e.id)).toEqual([0, 1]);
    expect(state.relationships[0].id).toBe(0);
    expect(state.entities[0]).toMatchObject({x: 120, y: 110, objType: 'entity'});
    expect(state.entityIdCounter).toBe(2);
  });
  it('recusa atributos soltos e preserva pai e tipo ao criar derivados', () => {
    const state = stateModule.diagram;
    expect(createObjectAt('attribute', 10, 10)).toBe(false);
    createObjectAt('entity', 200, 150);
    expect(createObjectAt('derivedAttribute', 0, 0, {type: 'entity', element: state.entities[0]})).toBe(true);
    expect(state.attributes[0]).toMatchObject({parentId: 0, parentType: 'entity', derived: true, objType: 'attribute'});
  });
  it('conecta sem duplicar e aloca vértices na especialização', () => {
    const state = stateModule.diagram;
    createObjectAt('entity', 200, 150);
    createObjectAt('relationship', 300, 150);
    createObjectAt('specialization', 300, 250);
    const entity = state.entities[0], rel = state.relationships[0], spec = state.specializations[0];
    expect(connectObjects(entity, rel)).toBe(true);
    expect(connectObjects(rel, entity)).toBe(false);
    expect(rel.connections[0]).toMatchObject({entityId: 0, cardinality: '0,N'});
    expect(connectObjects(spec, entity)).toBe(true);
    expect(spec.connections[0].vertex).toBe(0);
    expect(connectObjects(entity, entity)).toBe(false);
  });
  it('desfaz a primeira criação, refaz e descarta redo após nova edição', () => {
    const state = stateModule.diagram, history = stateModule;
    createObjectAt('entity', 200, 150); history.saveState();
    history.undo(); expect(state.entities).toHaveLength(0);
    history.redo(); expect(state.entities).toHaveLength(1);
    history.undo(); createObjectAt('entity', 400, 150); history.saveState();
    history.redo(); expect(state.entities[0].x).toBe(320);
  });
  it('desfaz limpar sem reutilizar ids e reancora após carregar', () => {
    const state = stateModule.diagram, history = stateModule;
    createObjectAt('entity', 200, 150); history.saveState();
    state.entities = []; history.saveState(); history.undo();
    expect(state.entities).toHaveLength(1);
    expect(state.entityIdCounter).toBe(1);
    history.resetUndoBaseline(); history.undo(); expect(state.entities).toHaveLength(1);
  });
});

it('cria pelo teclado e pelo menu sem depender de canvas', () => {
  const s = stateModule.diagram;
  stateModule.restoreState({entities:[],attributes:[],relationships:[],specializations:[],aggregations:[],postits:[]});
  s.entityIdCounter = 0; s.attributeIdCounter = 0;
  operations.createElementFromKeyboard('entity', 200, 150);
  operations.addAttribute(s.entities[0], {name:'cpf', primary:true}, {x:420,y:150});
  expect(s.attributes[0]).toMatchObject({name:'cpf', primary:true, parentType:'entity', parentId:0});
  operations.createElementFromKeyboard('attribute', 100, 20);
  expect(s.attributes[1]).toMatchObject({parentType:null, parentId:null, selected:true});
});

it('converte relacionamento/agregação preservando participantes com id zero, chaves e papéis', () => {
  const s = stateModule.diagram;
  s.relationships = [{id:0,objType:'relationship',name:'possui',x:10,y:20,connections:[{entityId:0,cardinality:'1,1',weak:true,role:'owner'}]}];
  s.attributes = [{id:0,name:'nota',parentType:'relationship',parentId:0}];
  s.aggregations=[]; s.aggregationIdCounter=0; s.relationshipIdCounter=1;
  const agg = operations.convertRelationship(s.relationships[0], 'aggregation');
  expect(s.relationships).toHaveLength(0);
  expect(s.attributes[0].parentType).toBe('aggregation');
  const rel = operations.convertRelationship(agg, 'relationship');
  expect(rel.connections[0]).toEqual({entityId:0,cardinality:'1,1',weak:true,role:'owner'});
  expect(s.attributes[0]).toMatchObject({parentType:'relationship',parentId:1});
});

it('aplica regras de arraste e de conexão rápida pela mesma operação', () => {
  const s = stateModule.diagram;
  operations.createElementFromKeyboard('entity',100,100);
  operations.createElementFromKeyboard('entity',500,100);
  operations.handleConnectionDrop({type:'entity',element:s.entities[0]}, {type:'entity',element:s.entities[1]});
  expect(s.relationships[0].connections).toEqual([0, 1].map(entityId => ({entityId,cardinality:'0,N',role:'',weak:false,breakpoints:[]})));
  expect(operations.connectObjects(s.entities[0],s.relationships[0])).toBe(false);
  operations.handleConnectionDrop({type:'entity',element:s.entities[0]}, {type:'relationship',element:s.relationships[0]});
  expect(s.relationships[0].connections).toHaveLength(3); // Unary roles remain possible by drag.
  operations.createObjectAt('aggregation',300,300);
  operations.handleConnectionDrop({type:'aggregation',element:s.aggregations[0]}, {type:'entity',element:s.entities[0]});
  operations.handleConnectionDrop({type:'entity',element:s.entities[0]}, {type:'aggregation',element:s.aggregations[0]});
  expect(s.aggregations[0].connections).toHaveLength(1);
});

it('deriva entidade fraca também de conexões identificadoras em agregações', () => {
 const s=stateModule.diagram;
 s.relationships=[];
 s.aggregations=[{id:0,connections:[{entityId:0,weak:true}]}];
 expect(operations.isEntityWeak({id:0})).toBe(true);
 expect(operations.isEntityWeak({id:1})).toBe(false);
});
