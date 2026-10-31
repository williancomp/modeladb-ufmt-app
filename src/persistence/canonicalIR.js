import {
  parseCardinality,
  isIdentifyingRelationship,
  attributeKeyKind,
  toIdentifier,
} from '../domain/semantics.js';
import { schemaId } from '../config.js';
export { parseCardinality } from '../domain/semantics.js';
/**
 * MerDB-IR: Canonical Intermediate Representation.
 *
 * Transforms a v2.0 .merdb domain section into a framework-neutral,
 * tool-agnostic EER representation. Zero visual data.
 *
 * Key transformations:
 *   - Integer IDs → stable slug strings
 *   - String cardinalities "0,N" → { min: 0, max: "N" }
 *   - GenType "T,C" → { totality: "total", disjointness: "disjoint" }
 *   - Attributes grouped under their parent entity/relationship
 *   - Sub-attributes nested under parent attribute
 */

/**
 * Convert a string to a URL-safe slug.
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
  return (str || 'unnamed')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Parse cardinality string "0,N" into canonical object { min, max }.
 * @param {string} card - e.g. "0,N", "1,1", "0,1", "1,N"
 * @returns {{ min: number, max: number|string }}
 */

/**
 * Parse genType string "T,C" into explicit totality/disjointness.
 * @param {string} gt - e.g. "T,C", "T,D", "P,C", "P,D"
 * @returns {{ totality: string, disjointness: string }}
 */
export function parseGenType(gt) {
  // T/P = Total/Parcial (participação)
  // D = Disjunta (disjoint: entidade pertence a NO MÁXIMO um subtipo)
  // C = Com Sobreposição (overlapping: entidade pode pertencer a vários subtipos)
  const map = {
    'T,D': { totality: 'total', disjointness: 'disjoint' }, // Total Disjunta
    'T,C': { totality: 'total', disjointness: 'overlapping' }, // Total com Sobreposição
    'P,D': { totality: 'partial', disjointness: 'disjoint' }, // Parcial Disjunta
    'P,C': { totality: 'partial', disjointness: 'overlapping' }, // Parcial com Sobreposição
    U: { totality: 'partial', disjointness: 'overlapping', isUnion: true },
  };
  return map[gt] || { totality: 'partial', disjointness: 'overlapping' };
}

/**
 * Determine attribute type from v1/v2 data.
 * @param {Object} attr
 * @returns {'simple'|'derived'|'multivalued'|'composite'}
 */
function classifyAttribute(attr, allAttrs) {
  if (attr.derived || attr.objType === 'derivedAttribute') return 'derived';
  if (attr.multivalued || attr.objType === 'multivaluedAttribute') return 'multivalued';
  // Check if this attribute has children (composite)
  const hasChildren = allAttrs.some((a) => a.parentType === 'attribute' && a.parentId === attr.id);
  if (hasChildren) return 'composite';
  return 'simple';
}

/**
 * Build nested attribute tree for an attribute and its sub-attributes.
 * @param {Object} attr
 * @param {Array} allAttrs
 * @param {string} parentSlug - slug prefix for generating IDs
 * @returns {Object} IR attribute
 */
function buildIRAttribute(attr, allAttrs, parentSlug) {
  const slug = `${parentSlug}.${slugify(attr.name)}`;
  const type = classifyAttribute(attr, allAttrs);

  const irAttr = {
    id: slug,
    name: attr.name,
    type,
    dataType: attr.dataType || 'unknown',
    primaryKey: !!attr.primary || !!attr.partialKey,
    ...(attr.partialKey ? { partialKey: true } : {}),
    ...(attr.sqlType ? { sqlType: attr.sqlType } : {}),
    ...(attr.nullable !== undefined ? { nullable: attr.nullable } : {}),
    ...(attr.isAutoIncrement ? { isAutoIncrement: true } : {}),
  };

  // Recursively add sub-attributes
  if (type === 'composite') {
    irAttr.subAttributes = allAttrs
      .filter((a) => a.parentType === 'attribute' && a.parentId === attr.id)
      .map((sub) => buildIRAttribute(sub, allAttrs, slug));
  }

  return irAttr;
}

/**
 * Convert a v2.0 domain section (or flat v1 data) into MerDB-IR.
 *
 * @param {Object} domainOrFlat - v2.domain section, or flat v1 data with .entities etc.
 * @returns {Object} MerDB-IR canonical representation
 */
export function toCanonicalIR(domainOrFlat) {
  // Accept either v2 domain section or flat v1
  const d = domainOrFlat.domain || domainOrFlat;
  const entities = d.entities || [];
  const attributes = d.attributes || [];
  const relationships = d.relationships || [];
  const specializations = d.specializations || [];
  const aggregations = d.aggregations || [];

  // Build entity ID map (integer → slug)
  const usedIds = new Set();
  const uniqueId = (base) => {
    let id = base,
      suffix = 2;
    while (usedIds.has(id)) id = `${base}_${suffix++}`;
    usedIds.add(id);
    return id;
  };
  const entitySlugMap = {};
  entities.forEach((e) => {
    entitySlugMap[e.id] = uniqueId(slugify(e.name));
  });

  // Build relationship ID map
  const relSlugMap = {};
  relationships.forEach((r) => {
    relSlugMap[r.id] = uniqueId(r.sqlTableName || `rel_${slugify(r.name).replace(/^rel_/, '')}`);
  });

  // Check if entity is weak
  const weakEntityIds = new Set();
  [...relationships, ...aggregations].forEach((r) => {
    if (r.connections) {
      r.connections.forEach((c) => {
        if (c.weak) weakEntityIds.add(c.entityId);
      });
    }
  });

  // --- Build IR Entities ---
  const irEntities = entities.map((e) => {
    const slug = entitySlugMap[e.id];
    // Get direct attributes of this entity
    const entityAttrs = attributes
      .filter((a) => a.parentType === 'entity' && a.parentId === e.id)
      .filter((a) => a.parentType !== 'attribute') // only top-level
      .map((a) => {
        const ir = buildIRAttribute(a, attributes, slug);
        if (attributeKeyKind(a, weakEntityIds.has(e.id)) === 'partial') ir.partialKey = true;
        return ir;
      });

    return {
      id: slug,
      name: e.name,
      weak: weakEntityIds.has(e.id),
      attributes: entityAttrs,
    };
  });

  // --- Build IR Relationships ---
  const irRelationships = relationships.map((r) => {
    const slug = relSlugMap[r.id];
    const isIdentifying = isIdentifyingRelationship(r);

    const participants = (r.connections || [])
      .filter((c) => entitySlugMap[c.entityId] !== undefined)
      .map((c) => {
        const p = {
          entityId: entitySlugMap[c.entityId],
          cardinality: parseCardinality(c.cardinality),
          weak: !!c.weak,
          ...(c.foreignKeyColumns
            ? {
                foreignKeyColumns: c.foreignKeyColumns.map(toIdentifier),
                referencedColumns: c.referencedColumns?.map(toIdentifier),
              }
            : {}),
        };
        if (c.role) p.role = c.role;
        return p;
      });

    // Get attributes of this relationship
    const relAttrs = attributes
      .filter((a) => a.parentType === 'relationship' && a.parentId === r.id)
      .filter((a) => a.parentType !== 'attribute')
      .map((a) => buildIRAttribute(a, attributes, slug));

    const irRel = {
      id: slug,
      name: r.name,
      identifying: isIdentifying,
      participants,
      ...(r.sqlTableName ? { sqlTableName: r.sqlTableName } : {}),
    };
    if (relAttrs.length > 0) irRel.attributes = relAttrs;
    return irRel;
  });

  // --- Build IR Generalizations ---
  const irGeneralizations = specializations.map((s, idx) => {
    // vertex === 0 is the apex (supertype); support legacy isGeneralization field
    const isSuperConn = (c) =>
      c.vertex === 0 || (c.vertex === undefined && c.isGeneralization === true);
    const superConn = (s.connections || []).find(isSuperConn);
    const subConns = (s.connections || []).filter((c) => !isSuperConn(c));
    const parsed = parseGenType(s.genType);

    return {
      id: `gen_${idx}`,
      superEntityId: superConn
        ? entitySlugMap[superConn.entityId] || `entity_${superConn.entityId}`
        : null,
      subEntityIds: subConns.map((c) => entitySlugMap[c.entityId] || `entity_${c.entityId}`),
      ...(parsed.isUnion
        ? {
            isUnion: true,
            categoryEntityId: superConn ? entitySlugMap[superConn.entityId] : null,
            memberEntityIds: subConns.map((c) => entitySlugMap[c.entityId]),
          }
        : {}),
      totality: parsed.totality,
      disjointness: parsed.disjointness,
    };
  });

  // --- Build IR Aggregations ---
  const irAggregations = aggregations.map((a) => {
    const slug = uniqueId(`agg_${slugify(a.name)}`);
    const participants = (a.connections || []).map((c) => {
      const p = { weak: !!c.weak };
      if (c.entityId !== undefined && entitySlugMap[c.entityId]) {
        p.entityId = entitySlugMap[c.entityId];
      }
      if (c.relationshipId !== undefined && relSlugMap[c.relationshipId]) {
        p.relationshipId = relSlugMap[c.relationshipId];
      }
      if (c.role) p.role = c.role;
      if (c.cardinality) {
        p.cardinality = parseCardinality(c.cardinality);
      }
      return p;
    });

    const aggAttrs = attributes
      .filter((at) => at.parentType === 'aggregation' && at.parentId === a.id)
      .map((at) => buildIRAttribute(at, attributes, slug));

    const irAgg = {
      id: slug,
      name: a.name,
      identifying: isIdentifyingRelationship(a),
      participants,
    };
    if (aggAttrs.length > 0) irAgg.attributes = aggAttrs;
    return irAgg;
  });

  return {
    $schema: schemaId('merdb-ir.schema.json'),
    entities: irEntities,
    relationships: irRelationships,
    generalizations: irGeneralizations,
    ...(irAggregations.length > 0 ? { aggregations: irAggregations } : {}),
  };
}
