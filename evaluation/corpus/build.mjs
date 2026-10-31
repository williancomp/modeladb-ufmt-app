/**
 * Generates the committed corpus (`*.merdb` + `manifest.json`) from `models.mjs`.
 *   node evaluation/corpus/build.mjs          rewrite the files
 *   node evaluation/corpus/build.mjs --check  fail if the committed files differ
 * Output is deterministic (fixed timestamps, no randomness).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { models } from './models.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8'));
const TYPES = { Text: 'Texto', Int: 'Numérico Inteiro', Real: 'Numérico Real', Date: 'Data', DateTime: 'Data e Hora', Bool: 'Booleano', Uuid: 'Identificador' };
export const REQUIRED_CONSTRUCTS = [
  'entity-strong', 'entity-weak', 'attr-simple', 'attr-key', 'attr-key-composite', 'attr-key-filled', 'attr-partial-key', 'attr-composite',
  'attr-composite-nested', 'attr-derived', 'attr-multivalued', 'rel-1-1', 'rel-1-n', 'rel-n-m', 'rel-ternary', 'rel-recursive', 'rel-attributes',
  'rel-identifying', 'rel-roles', 'participation-total', 'participation-partial', 'cardinality-arbitrary', 'spec-TD', 'spec-TC', 'spec-PD', 'spec-PC',
  'category-U', 'aggregation', 'postit', ...Object.keys(TYPES).map((t) => `datatype-${t}`),
];

const GX = 430;
const GY = 340;
const EW = 160;
const EH = 80;

function parseAttr(spec) {
  if (typeof spec !== 'string') return { name: spec.name, comp: spec.comp.map(parseAttr), flags: [] };
  const [head, ...flags] = spec.split(' ');
  const [name, type] = head.split(':');
  if (!TYPES[type]) throw new Error(`unknown type in ${spec}`);
  return { name, type, flags };
}

export function buildDocument(model) {
  const entityIndex = new Map();
  const relIndex = new Map();
  const positions = {};
  const entities = model.entities.map((e, id) => {
    entityIndex.set(e.k, id);
    positions[`entity_${id}`] = { x: 120 + e.at[0] * GX, y: 120 + e.at[1] * GY, width: EW, height: EH };
    return { id, objType: 'entity', name: e.name, resizeHandles: [], selected: false };
  });
  const center = (id) => ({ x: positions[`entity_${id}`].x + EW / 2, y: positions[`entity_${id}`].y + EH / 2 });

  const relationships = (model.rels || []).map((r, id) => {
    relIndex.set(r.k, id);
    const ids = r.parts.map((p) => entityIndex.get(p.e));
    const mid = r.at
      ? { x: 120 + r.at[0] * GX + EW / 2, y: 120 + r.at[1] * GY + EH / 2 }
      : { x: (center(ids[0]).x + center(ids[1]).x) / 2, y: (center(ids[0]).y + center(ids[1]).y) / 2 };
    positions[`rel_${id}`] = { x: Math.round(mid.x), y: Math.round(mid.y), size: 120 };
    return {
      id, objType: 'relationship', name: r.name, selected: false, locked: false, resizeHandles: [],
      connections: r.parts.map((p, i) => ({ entityId: ids[i], cardinality: p.card, weak: !!p.weak, ...(p.role ? { role: p.role } : {}) })),
    };
  });

  const specializations = (model.specs || []).map((s, id) => {
    const sup = entityIndex.get(s.sup);
    const at = s.at ? { x: 120 + s.at[0] * GX + EW / 2, y: 120 + s.at[1] * GY + EH / 2 } : { x: center(sup).x, y: center(sup).y + 150 };
    positions[`spec_${id}`] = { x: Math.round(at.x), y: Math.round(at.y), size: 100 };
    return {
      id, objType: 'specialization', genType: s.genType, selected: false, locked: false, resizeHandles: [],
      connections: [{ entityId: sup, vertex: 0, breakpoints: [] }, ...s.subs.map((k, i) => ({ entityId: entityIndex.get(k), vertex: i + 1, breakpoints: [] }))],
    };
  });

  const aggregations = (model.aggs || []).map((a, id) => {
    const at = { x: 120 + a.at[0] * GX + EW / 2, y: 120 + a.at[1] * GY + EH / 2 };
    positions[`agg_${id}`] = { x: Math.round(at.x), y: Math.round(at.y), size: 120 };
    return {
      id, objType: 'aggregation', name: a.name, selected: false, locked: false, resizeHandles: [],
      connections: a.parts.map((p) => (p.e ? { entityId: entityIndex.get(p.e), weak: false } : { relationshipId: relIndex.get(p.r), weak: false })),
    };
  });

  const postits = (model.postits || []).map((p, id) => {
    positions[`postit_${id}`] = { x: 120 + p.at[0] * GX, y: 120 + p.at[1] * GY, width: 200, height: 120 };
    return { id, objType: 'postit', text: p.text, color: '#ffff88', selected: false, locked: false, resizeHandles: [] };
  });

  // Attributes: placed on an ellipse around the owner, away from the directions of its connections.
  const attributes = [];
  const placeAround = (owner, parentType, parentId, specs, origin, avoid, radius) => {
    const n = specs.length;
    // Labels extend to the right of the circle, so keep attributes off the left side of their owner.
    const candidates = Array.from({ length: 36 }, (_, i) => (i * 360) / 36).filter((c) => Math.cos((c * Math.PI) / 180) >= -0.3);
    const chosen = [];
    const dist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    for (let i = 0; i < n; i++) {
      let best = null;
      for (const c of candidates) {
        if (chosen.includes(c)) continue;
        const score = Math.min(...[...avoid, ...chosen].map((a) => dist(a, c)), 180);
        if (!best || score > best.score) best = { c, score };
      }
      chosen.push(best.c);
    }
    chosen.sort((a, b) => a - b);
    specs.forEach((spec, i) => {
      const angle = (chosen[i] * Math.PI) / 180;
      const stagger = n > 4 && i % 2 ? 1.45 : 1;
      const x = Math.round(origin.x + Math.cos(angle) * radius.x * stagger);
      const y = Math.round(origin.y + Math.sin(angle) * radius.y * stagger);
      const id = attributes.length;
      const a = {
        id, objType: 'attribute', name: spec.name, parentType, parentId, selected: false, collapsed: false, resizeHandles: [],
        dataType: spec.type ? TYPES[spec.type] : null,
        primary: spec.flags.includes('key'), derived: spec.flags.includes('derived'), multivalued: spec.flags.includes('multi'),
      };
      if (spec.flags.includes('partial')) {
        a.partialKey = true;
        a.primary = false;
      }
      if (spec.flags.includes('filled')) a.keyStyle = 'filled';
      attributes.push(a);
      positions[`attr_${id}`] = { x, y };
      if (spec.comp) placeAround(null, 'attribute', id, spec.comp, { x, y }, [chosen[i] + 180], { x: 150, y: 70 });
    });
  };
  const angleTo = (from, to) => ((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 360) % 360;
  entities.forEach((e) => {
    const c = center(e.id);
    const avoid = [
      ...relationships.filter((r) => r.connections.some((x) => x.entityId === e.id)).map((r) => angleTo(c, positions[`rel_${r.id}`])),
      ...specializations.filter((s) => s.connections.some((x) => x.entityId === e.id)).map((s) => angleTo(c, positions[`spec_${s.id}`])),
    ];
    const specs = model.entities[e.id].attrs.map(parseAttr);
    placeAround(e, 'entity', e.id, specs, c, avoid, { x: 175 + 20 * Math.max(0, specs.length - 4), y: 105 + 12 * Math.max(0, specs.length - 4) });
  });
  relationships.forEach((r) => {
    const specs = (model.rels[r.id].attrs || []).map(parseAttr);
    if (!specs.length) return;
    const c = positions[`rel_${r.id}`];
    const avoid = r.connections.map((x) => angleTo(c, center(x.entityId)));
    placeAround(r, 'relationship', r.id, specs, c, avoid, { x: 140, y: 110 });
  });
  aggregations.forEach((g) => {
    const specs = (model.aggs[g.id].attrs || []).map(parseAttr);
    if (!specs.length) return;
    placeAround(g, 'aggregation', g.id, specs, positions[`agg_${g.id}`], [], { x: 160, y: 120 });
  });

  return {
    version: '2.0',
    meta: { createdAt: '2026-10-30T00:00:00.000Z', lastModifiedAt: '2026-10-30T00:00:00.000Z', tool: 'ModelaDB', toolVersion: pkg.version, notation: 'chen' },
    domain: {
      entities, attributes, relationships, specializations, aggregations, postits,
      counters: {
        entityIdCounter: entities.length, attributeIdCounter: attributes.length, relationshipIdCounter: relationships.length,
        specializationIdCounter: specializations.length, aggregationIdCounter: aggregations.length, postitIdCounter: postits.length,
      },
    },
    view: { positions, breakpoints: {}, panOffset: { x: 0, y: 0 }, zoom: 0.8, fontSize: 18 },
  };
}

const parse = (card) => {
  const [min, max] = card.split(',');
  return { min: Number(min), max: max === 'N' ? Infinity : Number(max) };
};

/** Constructs are derived from the authored model, not hand-listed. */
export function constructsOf(model) {
  const found = new Set();
  const weak = new Set();
  (model.rels || []).forEach((r) => {
    r.parts.forEach((p) => p.weak && weak.add(p.e));
    const cards = r.parts.map((p) => parse(p.card));
    const many = cards.filter((c) => c.max > 1).length;
    if (r.parts.length > 2) found.add('rel-ternary');
    else if (many === 0) found.add('rel-1-1');
    else if (many === 1) found.add('rel-1-n');
    else found.add('rel-n-m');
    if (new Set(r.parts.map((p) => p.e)).size < r.parts.length) found.add('rel-recursive');
    if (r.attrs?.length) found.add('rel-attributes');
    if (r.parts.some((p) => p.weak)) found.add('rel-identifying');
    if (r.parts.some((p) => p.role)) found.add('rel-roles');
    cards.forEach((c) => {
      found.add(c.min >= 1 ? 'participation-total' : 'participation-partial');
      if (c.min > 1 || (c.max > 1 && c.max !== Infinity)) found.add('cardinality-arbitrary');
    });
  });
  model.entities.forEach((e) => {
    found.add(weak.has(e.k) ? 'entity-weak' : 'entity-strong');
    const attrs = e.attrs.map(parseAttr);
    if (attrs.filter((a) => a.flags.includes('key')).length > 1) found.add('attr-key-composite');
    const walk = (list, depth) =>
      list.forEach((a) => {
        if (a.comp) {
          found.add('attr-composite');
          if (depth > 0) found.add('attr-composite-nested');
          walk(a.comp, depth + 1);
          return;
        }
        found.add(`datatype-${a.type}`);
        if (a.flags.includes('key')) found.add('attr-key');
        if (a.flags.includes('filled')) found.add('attr-key-filled');
        if (a.flags.includes('partial')) found.add('attr-partial-key');
        if (a.flags.includes('derived')) found.add('attr-derived');
        if (a.flags.includes('multi')) found.add('attr-multivalued');
        if (!a.flags.length) found.add('attr-simple');
      });
    walk(attrs, 0);
  });
  (model.specs || []).forEach((s) => found.add(s.genType === 'U' ? 'category-U' : `spec-${s.genType.replace(',', '')}`));
  if (model.aggs?.length) found.add('aggregation');
  if (model.postits?.length) found.add('postit');
  return [...found].sort();
}

export function buildAll() {
  const files = {};
  const manifest = { generatedBy: 'evaluation/corpus/build.mjs', requiredConstructs: REQUIRED_CONSTRUCTS, models: [] };
  for (const model of models) {
    const doc = buildDocument(model);
    files[`${model.id}.merdb`] = JSON.stringify(doc, null, 2) + '\n';
    manifest.models.push({
      id: model.id, file: `${model.id}.merdb`, domain: model.domain, notation: 'chen',
      counts: { entities: doc.domain.entities.length, attributes: doc.domain.attributes.length, relationships: doc.domain.relationships.length, specializations: doc.domain.specializations.length, aggregations: doc.domain.aggregations.length, postits: doc.domain.postits.length },
      constructs: constructsOf(model),
    });
  }
  const covered = new Set(manifest.models.flatMap((m) => m.constructs));
  manifest.uncoveredConstructs = REQUIRED_CONSTRUCTS.filter((c) => !covered.has(c));
  files['manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = buildAll();
  let stale = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = join(here, name);
    if (process.argv.includes('--check')) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
        console.error(`stale: ${name}`);
        stale++;
      }
    } else writeFileSync(path, text);
  }
  const manifest = JSON.parse(files['manifest.json']);
  if (manifest.uncoveredConstructs.length) {
    console.error(`constructs not covered: ${manifest.uncoveredConstructs.join(', ')}`);
    process.exit(1);
  }
  process.exit(stale ? 1 : 0);
}
