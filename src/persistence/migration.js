import { INITIAL_ZOOM } from '../domain/constants.js';
import { t } from '../i18n/index.js';
/**
 * Migration utilities for .merdb file format versions.
 *
 * v1.0 → v2.0: Separates domain data from view data.
 *   - v1 stores everything flat (entities with x,y mixed with name,id)
 *   - v2 separates into { domain: {...}, view: { positions, breakpoints, ... } }
 */

import packageInfo from '../../package.json' with {type:'json'};
const TOOL_VERSION = packageInfo.version;

/**
 * Detect the version of a parsed .merdb file.
 * @param {Object} data - parsed JSON from .merdb file
 * @returns {'1.0'|'2.0'|'unknown'}
 */
export function detectVersion(data) {
  if (!data || typeof data !== 'object') return 'unknown';
  if (data.version === '2.0' && data.domain && data.view) return '2.0';
  if ((!data.version || data.version === '1.0') && Array.isArray(data.entities)) return '1.0';
  return 'unknown';
}

/**
 * Migrate a v1.0 .merdb file to v2.0 format.
 *
 * Strategy:
 *   1. Extract positions (x, y, width, height) from each element into view.positions
 *   2. Extract breakpoints from connections into view.breakpoints
 *   3. Store geometry once in view; keep semantic fields in domain
 *   4. Add meta section with timestamps
 *   5. Move counters into domain.counters
 *
 * @param {Object} v1 - v1.0 diagram data
 * @returns {Object} v2.0 format
 */
export function migrateV1ToV2(v1) {
  const now = new Date().toISOString();
  const positions = {};
  const breakpoints = {};

  // --- Helper to extract position from an element ---
  function extractPosition(el, prefix) {
    const key = `${prefix}_${el.id}`;
    const pos = {};
    if (el.x !== undefined) pos.x = el.x;
    if (el.y !== undefined) pos.y = el.y;
    if (el.width !== undefined) pos.width = el.width;
    if (el.height !== undefined) pos.height = el.height;
    if (el.size !== undefined) pos.size = el.size;
    if (Object.keys(pos).length > 0) {
      positions[key] = pos;
    }
  }

  // --- Helper to extract breakpoints from connections ---
  function extractBreakpoints(connections, parentPrefix, parentId) {
    if (!connections) return;
    connections.forEach((conn, idx) => {
      if (conn.breakpoints && conn.breakpoints.length > 0) {
        const key = `${parentPrefix}_${parentId}_conn_${idx}`;
        breakpoints[key] = [...conn.breakpoints];
      }
    });
  }

  function domainElement(element) {
    const copy = {...element};
    for (const key of ['x', 'y', 'width', 'height', 'size']) delete copy[key];
    if (element.connections) copy.connections = element.connections.map(connection => {
      const semantic = {...connection};
      delete semantic.breakpoints;
      return semantic;
    });
    return copy;
  }

  // --- Process entities ---
  const entities = (v1.entities || []).map(e => {
    extractPosition(e, 'entity');
    return domainElement(e);
  });

  // --- Process attributes ---
  const attributes = (v1.attributes || []).map(a => {
    extractPosition(a, 'attr');
    return domainElement(a);
  });

  // --- Process relationships ---
  const relationships = (v1.relationships || []).map(r => {
    extractPosition(r, 'rel');
    extractBreakpoints(r.connections, 'rel', r.id);
    return domainElement(r);
  });

  // --- Process specializations ---
  const specializations = (v1.specializations || []).map(s => {
    extractPosition(s, 'spec');
    extractBreakpoints(s.connections, 'spec', s.id);
    return domainElement(s);
  });

  // --- Process aggregations ---
  const aggregations = (v1.aggregations || []).map(a => {
    extractPosition(a, 'agg');
    extractBreakpoints(a.connections, 'agg', a.id);
    return domainElement(a);
  });

  // --- Process postits ---
  const postits = (v1.postits || []).map(p => {
    extractPosition(p, 'postit');
    return domainElement(p);
  });

  return {
    version: '2.0',
    meta: {
      createdAt: v1.fileMeta?.createdAt || now,
      lastModifiedAt: now,
      tool: 'ModelaDB',
      toolVersion: TOOL_VERSION,
      notation: v1.notation || 'chen',
      ...((v1.appVersion || v1.fileMeta?.sourceAppVersion) ? {sourceAppVersion:v1.appVersion || v1.fileMeta.sourceAppVersion} : {}),
      ...(v1.student !== undefined ? {student: v1.student} : {}),
      ...(v1.processLog !== undefined ? {processLog: v1.processLog} : {}),
    },
    domain: {
      entities,
      attributes,
      relationships,
      specializations,
      aggregations,
      postits,
      counters: {
        entityIdCounter: v1.entityIdCounter || 0,
        attributeIdCounter: v1.attributeIdCounter || 0,
        relationshipIdCounter: v1.relationshipIdCounter || 0,
        specializationIdCounter: v1.specializationIdCounter || 0,
        aggregationIdCounter: v1.aggregationIdCounter || 0,
        postitIdCounter: v1.postitIdCounter || 0,
      },
    },
    view: {
      positions,
      breakpoints,
      panOffset: v1.panOffset || { x: 0, y: 0 },
      zoom: v1.zoom || INITIAL_ZOOM,
      fontSize: v1.fontSize || 18,
    },
  };
}

/**
 * Auto-migrate a loaded .merdb file to the latest version.
 * Returns the data in v2.0 format regardless of input version.
 *
 * @param {Object} data - parsed JSON from any .merdb version
 * @returns {Object} v2.0 format
 */
export function autoMigrate(data) {
  const version = detectVersion(data);
  switch (version) {
    case '2.0':
      return data;
    case '1.0':
      return migrateV1ToV2(data);
    default:
      throw new Error(t(`Formato de arquivo desconhecido (versão: ${data?.version || 'indefinida'})`));
  }
}

/**
 * Flatten a v2.0 file back to the v1-compatible format that app.js expects.
 * This is the inverse of migrateV1ToV2, used during the transition period
 * the canvas editor consumes flat data structures. View geometry is authoritative;
 * geometry in older experimental v2 domain objects is still accepted.
 *
 * @param {Object} v2 - v2.0 format data
 * @returns {Object} flat v1-style data
 */
export function flattenV2ToV1(v2) {
  const d = v2.domain;
  const v = v2.view;
  const c = d.counters || {};

  const flat = {
    ...Object.fromEntries(['entities', 'attributes', 'relationships', 'specializations', 'aggregations', 'postits'].map(key => [key, JSON.parse(JSON.stringify(d[key] || []))])),
    ...c,
    fontSize: v.fontSize || 18,
    panOffset: v.panOffset || { x: 0, y: 0 },
    zoom: v.zoom || 1,
    notation: v2.meta?.notation || 'chen',
    fileMeta: {createdAt:v2.meta?.createdAt, ...(v2.meta?.sourceAppVersion ? {sourceAppVersion:v2.meta.sourceAppVersion} : {})},
    ...(v2.meta?.student !== undefined ? {student: v2.meta.student} : {}),
    ...(v2.meta?.processLog !== undefined ? {processLog: v2.meta.processLog} : {}),
  };
  for (const [collection, prefix] of Object.entries({entities:'entity', attributes:'attr', relationships:'rel', specializations:'spec', aggregations:'agg', postits:'postit'})) {
    for (const element of flat[collection]) {
      Object.assign(element, v.positions?.[`${prefix}_${element.id}`]);
      for (const [index, connection] of (element.connections || []).entries()) {
        const points = v.breakpoints?.[`${prefix}_${element.id}_conn_${index}`];
        if (points) connection.breakpoints = JSON.parse(JSON.stringify(points));
      }
    }
    const counter = `${prefix === 'attr' ? 'attribute' : prefix === 'rel' ? 'relationship' : prefix === 'spec' ? 'specialization' : prefix === 'agg' ? 'aggregation' : prefix}IdCounter`;
    flat[counter] = Math.max(c[counter] || 0, ...flat[collection].map(e => e.id + 1), 0);
  }
  return flat;
}

/**
 * Create a v2.0 data structure from the current flat app state.
 * Used when saving — takes the flat arrays that app.js works with
 * and packages them into v2.0 format.
 *
 * @param {Object} flatData - flat v1-style data from app.js
 * @returns {Object} v2.0 format
 */
export function packToV2(flatData) {
  return migrateV1ToV2(flatData);
}
