/**
 * Experiment 2 - mutation-based validation of the model-validation rules.
 *
 * A mutation operator injects exactly one known defect (the ground truth) into a defect-free corpus
 * model, or - for the negative controls - rewrites a name into a legitimate one that a heuristic could
 * wrongly flag. Per rule: TP = injected defect reported on the mutated element, FN = not reported,
 * FP = a finding that is neither an injected defect, a declared consequence of the mutation, nor an
 * annotated defect of the unmutated model (those are listed in INTENDED).
 *
 * THREAT TO VALIDITY: the operators, the negative controls, the name lists and the rules were all
 * written by the same author. Heuristic rules (R005-R007, R009, R010) are only as good as the
 * name lists on both sides; recall and precision here are measured against these operators, not
 * against a sample of real student or practitioner models.
 */
import { manifest, loadModel, validate } from '../lib/pipeline.mjs';
import { writeTable, writeLog, prng } from '../lib/report.mjs';

export const SEED = 20260101;
const PER_OPERATOR_PER_MODEL = 3;

/** Defects (or documented false positives) already present in the unmutated corpus models. */
const INTENDED = [
  { model: 'm03_hospital', rule: 'R005', element: 'phones', truth: 'TP' },
  { model: 'm07_music', rule: 'R005', element: 'genres', truth: 'TP' },
  { model: 'm03_hospital', rule: 'R006', element: 'Diagnosis', truth: 'FP' },
  { model: 'm04_airline', rule: 'CF001', element: 'crews', truth: 'TP' },
  { model: 'm10_hotel', rule: 'CF001', element: 'books', truth: 'TP' },
];

const RULES = ['R001', 'R002', 'R003', 'R004', 'R005', 'R006', 'R007', 'R008', 'R009', 'R010', 'R011', 'R012', 'C001', 'CF001'];
const HEURISTIC = new Set(['R005', 'R006', 'R007', 'R009', 'R010']);

const clone = (m) => structuredClone(m);
const nextId = (list) => list.reduce((n, e) => Math.max(n, e.id + 1), 0);
const isWeakEntity = (m, id) => m.relationships.some((r) => r.connections.some((c) => c.entityId === id && c.weak));
const isSubtype = (m, id) => (m.specializations || []).some((s) => s.genType !== 'U' && s.connections.some((c) => c.entityId === id && c.vertex !== 0));
const isCategoryMember = (m, id) => (m.specializations || []).some((s) => s.genType === 'U' && s.connections.some((c) => c.entityId === id && c.vertex === 0));
const keyAttrs = (m, id) => m.attributes.filter((a) => a.parentType === 'entity' && a.parentId === id && (a.primary || a.partialKey));

const PLURALS = [
  ['child', 'children'], ['person', 'people'], ['man', 'men'], ['woman', 'women'], ['mouse', 'mice'], ['tooth', 'teeth'], ['foot', 'feet'],
  ['criterion', 'criteria'], ['datum', 'data'], ['index', 'indices'], ['alumnus', 'alumni'], ['phenomenon', 'phenomena'], ['knife', 'knives'], ['leaf', 'leaves'], ['life', 'lives'],
];
const SINGULAR_WITH_S = ['Address', 'Status', 'Campus', 'Bus', 'Lens', 'Gas', 'Series', 'Species', 'Atlas', 'Axis', 'Basis', 'Class', 'Process', 'Business', 'Lapis', 'Pais', 'Onibus', 'Diagnosis', 'Analysis', 'Thesis', 'Crisis', 'Iris', 'Canvas', 'Bonus'];
const GENERIC_RELATIONSHIP = ['Rel', 'rel.', 'Relationship', 'Relacionamento', 'REL', ' relationship ', 'Relation', 'Link', 'Association', 'Connection', 'Rel1', 'Relacao', 'Relação', 'Has', 'Associa'];
const DEFAULT_ENTITY = ['Entidade', 'Entity', 'Nova Entidade', 'New Entity', 'Tabela', 'Table', 'Entidade1', 'Entidade 1', 'Entity1', 'Entidade2', 'New Entity 2', 'Nova entidade 3', 'Untitled', 'Sem título', 'Objeto'];
const DEFAULT_ATTRIBUTE = ['Atributo', 'Attribute', 'New Attribute', 'Novo Atributo', 'campo', 'Field', 'Coluna', 'Column', 'atributo1', 'Attribute 1', 'novo_atributo', 'field1', 'Derived', 'Multivalued', 'Propriedade', 'Prop', 'Valor'];
// Names that are legitimate domain vocabulary but coincide with the tool's default / generic-key labels.
const LEGIT_ENTITY_DEFAULTLIKE = ['Table', 'Tabela', 'Objeto', 'Entity', 'Nome'];
const LEGIT_ATTRIBUTE_DEFAULTLIKE = ['Field', 'Column', 'Code', 'Codigo', 'Id', 'Key', 'Campo', 'Coluna', 'Chave'];
const GOOD_RELATIONSHIP = ['employs', 'supervises', 'cites', 'attends', 'approves', 'schedules'];

/**
 * Each operator: { id, rule, notation, kind: 'defect'|'control', candidates(model) -> [ctx], apply(model, ctx, rng) -> { expected, allowed, description } }
 * `expected`: [{rule, elementType, elementId}] findings that must appear (defects); `allowed`: predicate for consequence findings.
 */
const OPERATORS = [
  {
    id: 'R001-remove-key', rule: 'R001', kind: 'defect', notation: 'chen',
    candidates: (m) => m.entities.filter((e) => !isSubtype(m, e.id) && !isCategoryMember(m, e.id) && keyAttrs(m, e.id).length),
    apply(m, e) {
      keyAttrs(m, e.id).forEach((a) => { a.primary = false; a.partialKey = false; });
      return { expected: [{ rule: 'R001', elementType: 'entity', elementId: e.id }], description: `remove all key attributes of ${e.name}` };
    },
  },
  {
    id: 'R002-drop-participant', rule: 'R002', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships.filter((r) => r.connections.length === 2),
    apply(m, r) {
      r.connections.pop();
      // Consequence: a former weak entity or subtype may now be a strong entity without a key.
      return { expected: [{ rule: 'R002', elementType: 'relationship', elementId: r.id }], allowed: (v) => v.ruleId === 'R001', description: `drop a participant of ${r.name}` };
    },
  },
  {
    id: 'R002-invalid-cardinality', rule: 'R002', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships.filter((r) => r.connections.length >= 2),
    apply(m, r, rng) {
      const bad = ['5,2', '', 'x,y', '-1,N', '1,'][Math.floor(rng() * 5)];
      r.connections[Math.floor(rng() * r.connections.length)].cardinality = bad;
      return { expected: [{ rule: 'R002', elementType: 'relationship', elementId: r.id }], description: `cardinality "${bad}" on ${r.name}` };
    },
  },
  {
    id: 'R003-remove-supertype', rule: 'R003', kind: 'defect', notation: 'chen',
    candidates: (m) => (m.specializations || []).filter((s) => s.connections.some((c) => c.vertex === 0)),
    apply(m, s) {
      s.connections = s.connections.filter((c) => c.vertex !== 0);
      return { expected: [{ rule: 'R003', elementType: 'specialization', elementId: s.id }], allowed: (v) => v.ruleId === 'R001', description: `remove the supertype of specialization ${s.id}` };
    },
  },
  {
    id: 'R003-remove-subtypes', rule: 'R003', kind: 'defect', notation: 'chen',
    candidates: (m) => (m.specializations || []).filter((s) => s.genType !== 'U'),
    apply(m, s) {
      s.connections = s.connections.filter((c) => c.vertex === 0);
      return { expected: [{ rule: 'R003', elementType: 'specialization', elementId: s.id }], allowed: (v) => v.ruleId === 'R001', description: `remove the subtypes of specialization ${s.id}` };
    },
  },
  {
    id: 'R004-all-dependent', rule: 'R004', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships.filter((r) => r.connections.length >= 2 && !r.connections.some((c) => c.weak)),
    apply(m, r) {
      r.connections.forEach((c) => { c.weak = true; if (!/^[1-9]/.test(c.cardinality || '')) c.cardinality = '1,1'; });
      const entityIds = r.connections.map((c) => c.entityId);
      return {
        expected: [{ rule: 'R004', elementType: 'relationship', elementId: r.id }],
        // Consequences: the entities became weak without a partial key; a dependent role may close a cycle.
        allowed: (v) => (v.ruleId === 'R001' && entityIds.includes(v.elementId)) || (v.ruleId === 'R008' && entityIds.includes(v.elementId)),
        description: `mark every participant of ${r.name} dependent`,
      };
    },
  },
  {
    id: 'R005-add-multivalued', rule: 'R005', kind: 'defect', notation: 'chen',
    candidates: (m) => m.entities,
    apply(m, e, rng) {
      const id = nextId(m.attributes);
      const names = ['hobbies', 'tags', 'emails', 'languages', 'nicknames'];
      m.attributes.push({ id, objType: 'attribute', type: 'attribute', name: names[Math.floor(rng() * names.length)], parentType: 'entity', parentId: e.id, multivalued: true, primary: false, x: e.x, y: e.y - 70 });
      return { expected: [{ rule: 'R005', elementType: 'attribute', elementId: id }], description: `add multivalued attribute to ${e.name}` };
    },
  },
  {
    id: 'R006-plural-name', rule: 'R006', kind: 'defect', notation: 'chen',
    candidates: (m) => m.entities.filter((e) => !isWeakEntity(m, e.id)),
    apply(m, e, rng) {
      const irregular = rng() < 0.5;
      let name;
      if (irregular) name = PLURALS[Math.floor(rng() * PLURALS.length)][1];
      else name = /(s|x|ch|sh)$/i.test(e.name) ? `${e.name}es` : `${e.name}s`;
      const hit = m.entities.find((x) => x.id === e.id);
      hit.name = name;
      return { expected: [{ rule: 'R006', elementType: 'entity', elementId: e.id }], allowed: (v) => v.ruleId === 'R011', description: `rename ${e.name} to plural "${name}"${irregular ? ' (irregular)' : ''}` };
    },
  },
  {
    id: 'R006-singular-ending-s', rule: 'R006', kind: 'control', notation: 'chen',
    candidates: (m) => m.entities,
    apply(m, e, rng) {
      const name = SINGULAR_WITH_S[Math.floor(rng() * SINGULAR_WITH_S.length)];
      m.entities.find((x) => x.id === e.id).name = name;
      return { expected: [], forbidden: [{ rule: 'R006', elementType: 'entity', elementId: e.id }], allowed: (v) => v.ruleId === 'R011', description: `rename ${e.name} to singular "${name}"` };
    },
  },
  {
    id: 'R007-generic-relationship', rule: 'R007', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships,
    apply(m, r, rng) {
      const name = GENERIC_RELATIONSHIP[Math.floor(rng() * GENERIC_RELATIONSHIP.length)];
      m.relationships.find((x) => x.id === r.id).name = name;
      return { expected: [{ rule: 'R007', elementType: 'relationship', elementId: r.id }], description: `rename ${r.name} to generic "${name}"` };
    },
  },
  {
    id: 'R007-meaningful-relationship', rule: 'R007', kind: 'control', notation: 'chen',
    candidates: (m) => m.relationships,
    apply(m, r, rng) {
      const name = GOOD_RELATIONSHIP[Math.floor(rng() * GOOD_RELATIONSHIP.length)];
      m.relationships.find((x) => x.id === r.id).name = name;
      return { expected: [], forbidden: [{ rule: 'R007', elementType: 'relationship', elementId: r.id }], description: `rename ${r.name} to "${name}"` };
    },
  },
  {
    id: 'R008-identification-cycle', rule: 'R008', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships.filter((r) => r.connections.some((c) => c.weak) && r.connections.some((c) => !c.weak && !isWeakEntity(m, c.entityId))),
    apply(m, r) {
      const weakConn = r.connections.find((c) => c.weak);
      const owner = r.connections.find((c) => !c.weak);
      const id = nextId(m.relationships);
      // The owner now depends on the weak entity as well: W -> O (existing) and O -> W (added).
      m.relationships.push({ id, objType: 'relationship', type: 'relationship', name: 'is identified by', x: 0, y: 0, size: 80, connections: [{ entityId: owner.entityId, cardinality: '1,1', weak: true }, { entityId: weakConn.entityId, cardinality: '0,N', weak: false }] });
      return {
        expected: [{ rule: 'R008', elementType: 'entity', elementId: weakConn.entityId, alternatives: [owner.entityId] }],
        allowed: (v) => v.ruleId === 'R001' || v.ruleId === 'R008',
        description: `make entity ${owner.entityId} depend on weak entity ${weakConn.entityId}`,
      };
    },
  },
  {
    id: 'R008-three-entity-cycle', rule: 'R008', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships.filter((r) => r.connections.some((c) => c.weak) && r.connections.some((c) => !c.weak && !isWeakEntity(m, c.entityId))),
    apply(m, r) {
      const weakConn = r.connections.find((c) => c.weak);
      const owner = r.connections.find((c) => !c.weak);
      const third = m.entities.find((e) => e.id !== weakConn.entityId && e.id !== owner.entityId && !isWeakEntity(m, e.id) && !isSubtype(m, e.id));
      if (!third) return { expected: [], skipped: true, description: 'no third entity available' };
      const base = nextId(m.relationships);
      const link = (id, dependent, ownerId) => ({ id, objType: 'relationship', type: 'relationship', name: 'is identified by', x: 0, y: 0, size: 80, connections: [{ entityId: dependent, cardinality: '1,1', weak: true }, { entityId: ownerId, cardinality: '0,N', weak: false }] });
      // W -> O (existing), O -> P and P -> W (added): a cycle of length three.
      m.relationships.push(link(base, owner.entityId, third.id), link(base + 1, third.id, weakConn.entityId));
      return {
        expected: [{ rule: 'R008', elementType: 'entity', elementId: weakConn.entityId, alternatives: [owner.entityId, third.id] }],
        allowed: (v) => v.ruleId === 'R001' || v.ruleId === 'R008',
        description: `identification cycle ${weakConn.entityId} -> ${owner.entityId} -> ${third.id} -> ${weakConn.entityId}`,
      };
    },
  },
  {
    id: 'R009-default-entity-name', rule: 'R009', kind: 'defect', notation: 'chen',
    candidates: (m) => m.entities,
    apply(m, e, rng) {
      const name = DEFAULT_ENTITY[Math.floor(rng() * DEFAULT_ENTITY.length)];
      m.entities.find((x) => x.id === e.id).name = name;
      return { expected: [{ rule: 'R009', elementType: 'entity', elementId: e.id }], allowed: (v) => v.ruleId === 'R011', description: `rename ${e.name} to default "${name}"` };
    },
  },
  {
    id: 'R009-domain-word-as-entity', rule: 'R009', kind: 'control', notation: 'chen',
    candidates: (m) => m.entities,
    apply(m, e, rng) {
      const name = LEGIT_ENTITY_DEFAULTLIKE[Math.floor(rng() * LEGIT_ENTITY_DEFAULTLIKE.length)];
      m.entities.find((x) => x.id === e.id).name = name;
      return { expected: [], forbidden: [{ rule: 'R009', elementType: 'entity', elementId: e.id }], allowed: (v) => v.ruleId === 'R011', description: `rename ${e.name} to the legitimate domain word "${name}"` };
    },
  },
  {
    id: 'R010-default-attribute-name', rule: 'R010', kind: 'defect', notation: 'chen',
    candidates: (m) => m.attributes.filter((a) => a.parentType === 'entity'),
    apply(m, a, rng) {
      const name = DEFAULT_ATTRIBUTE[Math.floor(rng() * DEFAULT_ATTRIBUTE.length)];
      m.attributes.find((x) => x.id === a.id).name = name;
      return { expected: [{ rule: 'R010', elementType: 'attribute', elementId: a.id }], description: `rename attribute ${a.name} to default "${name}"` };
    },
  },
  {
    id: 'R010-domain-word-as-attribute', rule: 'R010', kind: 'control', notation: 'chen',
    candidates: (m) => m.attributes.filter((a) => a.parentType === 'entity'),
    apply(m, a, rng) {
      const name = LEGIT_ATTRIBUTE_DEFAULTLIKE[Math.floor(rng() * LEGIT_ATTRIBUTE_DEFAULTLIKE.length)];
      m.attributes.find((x) => x.id === a.id).name = name;
      return { expected: [], forbidden: [{ rule: 'R010', elementType: 'attribute', elementId: a.id }], description: `rename attribute ${a.name} to the legitimate word "${name}"` };
    },
  },
  {
    id: 'R011-duplicate-entity-name', rule: 'R011', kind: 'defect', notation: 'chen',
    candidates: (m) => m.entities.length >= 2 ? m.entities.slice(1) : [],
    apply(m, e, rng, model) {
      const other = model.entities[0];
      const variants = [other.name, other.name.toUpperCase(), other.name.toLowerCase(), `${other.name} `, other.name.normalize('NFD').replace(/[̀-ͯ]/g, '')];
      const name = variants[Math.floor(rng() * variants.length)];
      m.entities.find((x) => x.id === e.id).name = name;
      return { expected: [{ rule: 'R011', elementType: 'entity', elementId: e.id }], allowed: (v) => ['R011', 'R006', 'R009'].includes(v.ruleId), description: `rename ${e.name} to duplicate "${name}"` };
    },
  },
  {
    id: 'R012-dependent-partial', rule: 'R012', kind: 'defect', notation: 'chen',
    candidates: (m) => m.relationships.flatMap((r) => r.connections.filter((c) => c.weak).map((c) => ({ r, c }))),
    apply(m, { r, c }, rng) {
      const card = ['0,N', '0,1'][Math.floor(rng() * 2)];
      m.relationships.find((x) => x.id === r.id).connections.find((x) => x.entityId === c.entityId).cardinality = card;
      return { expected: [{ rule: 'R012', elementType: 'relationship', elementId: r.id }], description: `dependent connection of ${r.name} set to ${card}` };
    },
  },
  {
    id: 'C001-floating-attribute', rule: 'C001', kind: 'defect', notation: 'chen',
    candidates: (m) => m.attributes.filter((a) => a.parentType === 'entity'),
    apply(m, a, rng) {
      const hit = m.attributes.find((x) => x.id === a.id);
      if (rng() < 0.5) hit.parentId = 99999;
      else { hit.parentType = 'entity'; hit.parentId = -1; }
      return { expected: [{ rule: 'C001', elementType: 'attribute', elementId: a.id }], allowed: (v) => v.ruleId === 'R001', description: `detach attribute ${a.name}` };
    },
  },
  {
    id: 'CF001-arbitrary-cardinality', rule: 'CF001', kind: 'defect', notation: 'crow',
    candidates: (m) => m.relationships.filter((r) => r.connections.length >= 2),
    apply(m, r, rng) {
      const card = ['2,5', '0,3', '1,4', '3,3', '2,N'][Math.floor(rng() * 5)];
      m.relationships.find((x) => x.id === r.id).connections[0].cardinality = card;
      return { expected: [{ rule: 'CF001', elementType: 'relationship', elementId: r.id }], description: `cardinality ${card} on ${r.name}` };
    },
  },
  {
    id: 'CF001-standard-cardinality', rule: 'CF001', kind: 'control', notation: 'crow',
    // Only relationships whose other connections are already standard, so the control isolates the rewritten one.
    candidates: (m) => m.relationships.filter((r) => r.connections.length >= 2 && r.connections.every((c) => /^[01],[1N]$/.test(c.cardinality))),
    apply(m, r, rng) {
      const card = ['0,1', '1,1', '0,N', '1,N'][Math.floor(rng() * 4)];
      m.relationships.find((x) => x.id === r.id).connections[0].cardinality = card;
      return { expected: [], forbidden: [{ rule: 'CF001', elementType: 'relationship', elementId: r.id }], allowed: (v) => v.ruleId === 'CF001', description: `cardinality ${card} on ${r.name}` };
    },
  },
];

const key = (v) => `${v.ruleId}|${v.elementType}|${v.elementId}`;
const nameOf = (model, v) => [...model.entities, ...model.attributes, ...model.relationships, ...(model.specializations || []), ...(model.aggregations || [])].find((e) => e.id === v.elementId && e.objType === v.elementType)?.name ?? `#${v.elementId}`;

export function runMutationExperiment({ log }) {
  const stats = Object.fromEntries(RULES.map((r) => [r, { tp: 0, fn: 0, fp: 0, cleanFp: 0, cleanTp: 0, controls: 0, mutants: 0 }]));
  const cases = [];
  const rng = prng(SEED);

  // 1. Unmutated models: every finding is either an annotated true defect or a false positive.
  const baselines = {};
  for (const m of manifest.models) {
    const model = loadModel(m.file);
    const counted = new Set();
    for (const notation of ['chen', 'crow']) {
      const findings = validate(model, notation);
      baselines[`${m.id}|${notation}`] = new Set(findings.map(key));
      for (const v of findings) {
        // Common rules report identically under both notations: count each finding once.
        if (counted.has(key(v))) continue;
        counted.add(key(v));
        const name = nameOf(model, v);
        const annotation = INTENDED.find((i) => i.model === m.id && i.rule === v.ruleId && i.element === name);
        const truth = annotation ? annotation.truth : 'FP';
        if (truth === 'FP') stats[v.ruleId].cleanFp++;
        else stats[v.ruleId].cleanTp++;
        cases.push({ model: m.id, operator: '(unmutated)', notation, kind: 'baseline', description: `${v.ruleId} on ${v.elementType} "${name}"`, outcome: `${truth === 'FP' ? 'FP' : 'intended-TP'}` });
      }
    }
  }

  // 2. Mutants.
  for (const op of OPERATORS) {
    for (const m of manifest.models) {
      const original = loadModel(m.file);
      const candidates = op.candidates(original);
      // Seeded Fisher-Yates so the sample is reproducible.
      const order = candidates.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (const index of order.slice(0, PER_OPERATOR_PER_MODEL)) {
        // Candidates are recomputed on the clone (same order) so the operator mutates the copy, never the original.
        const model = clone(original);
        const result = op.apply(model, op.candidates(model)[index], rng, model);
        if (result.skipped) continue;
        const findings = validate(model, op.notation);
        const baseline = baselines[`${m.id}|${op.notation}`];
        const keys = new Set(findings.map(key));
        const stat = stats[op.rule];
        stat.mutants++;
        let outcome;
        if (op.kind === 'defect') {
          const hit = result.expected.every((exp) => [exp.elementId, ...(exp.alternatives || [])].some((id) => keys.has(`${exp.rule}|${exp.elementType}|${id}`)));
          if (hit) { stat.tp++; outcome = 'TP'; } else { stat.fn++; outcome = 'FN'; }
        } else {
          stat.controls++;
          const fired = result.forbidden.some((f) => keys.has(`${f.rule}|${f.elementType}|${f.elementId}`));
          outcome = fired ? 'FP(control)' : 'TN';
          if (fired) stat.fp++;
        }
        // Collateral: findings that are new relative to the unmutated model and neither expected nor declared consequences.
        const expectedKeys = new Set((result.expected || []).flatMap((e) => [e.elementId, ...(e.alternatives || [])].map((id) => `${e.rule}|${e.elementType}|${id}`)));
        const forbiddenKeys = new Set((result.forbidden || []).map((f) => `${f.rule}|${f.elementType}|${f.elementId}`));
        const collateral = [];
        for (const v of findings) {
          const k = key(v);
          if (baseline.has(k) || expectedKeys.has(k) || forbiddenKeys.has(k)) continue;
          if (result.allowed?.(v)) continue;
          collateral.push(v);
          stats[v.ruleId].fp++;
        }
        cases.push({ model: m.id, operator: op.id, notation: op.notation, kind: op.kind, description: result.description, outcome: collateral.length ? `${outcome}; unexplained new findings: ${collateral.map((v) => `${v.ruleId}@${v.elementType}${v.elementId}`).join(' ')}` : outcome });
      }
    }
  }

  const pct = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');
  const rows = RULES.map((rule) => {
    const s = stats[rule];
    const fp = s.fp + s.cleanFp;
    const tp = s.tp;
    return {
      rule,
      type: HEURISTIC.has(rule) ? 'heuristic (name list)' : 'structural',
      mutants: s.mutants - s.controls,
      controls: s.controls,
      TP: tp,
      FN: s.fn,
      FP: fp,
      FP_clean_models: s.cleanFp,
      precision: pct(tp + fp === 0 ? NaN : tp / (tp + fp)),
      recall: pct(tp + s.fn === 0 ? NaN : tp / (tp + s.fn)),
    };
  });
  writeTable('mutation_rules', rows, [
    { key: 'rule', header: 'Rule' },
    { key: 'type', header: 'Type' },
    { key: 'mutants', header: 'Defect mutants', align: 'r' },
    { key: 'controls', header: 'Negative controls', align: 'r' },
    { key: 'TP', header: 'TP', align: 'r' },
    { key: 'FN', header: 'FN', align: 'r' },
    { key: 'FP', header: 'FP', align: 'r' },
    { key: 'FP_clean_models', header: 'of which on unmutated models', align: 'r' },
    { key: 'precision', header: 'Precision', align: 'r' },
    { key: 'recall', header: 'Recall', align: 'r' },
  ]);
  const perOperator = OPERATORS.map((op) => {
    const own = cases.filter((c) => c.operator === op.id);
    return { operator: op.id, rule: op.rule, kind: op.kind, notation: op.notation, mutants: own.length, caught_or_clean: own.filter((c) => c.outcome === 'TP' || c.outcome === 'TN').length };
  });
  writeTable('mutation_operators', perOperator, [
    { key: 'operator', header: 'Operator' },
    { key: 'rule', header: 'Rule' },
    { key: 'kind', header: 'Kind' },
    { key: 'notation', header: 'Notation' },
    { key: 'mutants', header: 'Mutants', align: 'r' },
    { key: 'caught_or_clean', header: 'TP or TN', align: 'r' },
  ]);
  writeLog('mutation_cases.tsv', ['model\toperator\tnotation\tkind\toutcome\tdescription', ...cases.map((c) => `${c.model}\t${c.operator}\t${c.notation}\t${c.kind}\t${c.outcome}\t${c.description}`)].join('\n'));
  writeLog('mutation_seed.txt', `seed=${SEED}\nper operator per model=${PER_OPERATOR_PER_MODEL}\nPRNG=mulberry32\nmodels=${manifest.models.length}\noperators=${OPERATORS.length}`);
  log(`mutation: seed ${SEED}, ${cases.length} cases`);
  return { rows, perOperator, cases, seed: SEED };
}
