import {
  ATTR_CIRCLE_RADIUS,
  ATTR_TEXT_PADDING,
  ATTR_TEXT_OFFSET_Y,
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  RELATIONSHIP_SIZE,
  DEFAULT_SPECIALIZATION_SIZE,
} from '../domain/constants.js';
import {
  formatCardinality,
  isWeakEntity,
  participationPaths,
} from '../domain/semantics.js';
import { t } from '../i18n/index.js';

export function cardinalityLabel(value) {
  try {
    return formatCardinality(value);
  } catch {
    return String(value || '');
  }
}

export function isAttributeOwnerWeak(attribute, relationships = [], aggregations = [], attributes = []) {
  if (!attribute) return false;
  if (attribute.parentType === 'entity') {
    return isWeakEntity(attribute.parentId, [...relationships, ...aggregations]);
  }
  if (attribute.parentType === 'attribute') {
    const parent = attributes.find((a) => a.id === attribute.parentId);
    return parent && parent !== attribute
      ? isAttributeOwnerWeak(parent, relationships, aggregations, attributes)
      : false;
  }
  return false;
}

export function collectCrowEntityRows(entity, attributes = []) {
  const rows = [];
  const collect = (parentType, parentId, indent) => {
    attributes
      .filter((a) => a.parentType === parentType && a.parentId === parentId)
      .forEach((a) => {
        rows.push({ attr: a, indent });
        if (!a.collapsed) {
          collect('attribute', a.id, indent + 1);
        }
      });
  };
  collect('entity', entity.id, 0);
  return rows;
}

export function getCrowEntityDimensions(
  entity,
  attributes = [],
  relationships = [],
  aggregations = [],
  fontSize = 14
) {
  const margin = 16;
  const lineHeight = fontSize * 1.2;
  const baseW = entity._preCrowWidth !== undefined ? entity._preCrowWidth : (entity.width || DEFAULT_ENTITY_WIDTH);
  const baseH = entity._preCrowHeight !== undefined ? entity._preCrowHeight : (entity.height || DEFAULT_ENTITY_HEIGHT);
  const rows = collectCrowEntityRows(entity, attributes);
  const deleteColW = 22;

  let neededW = Math.max((entity.name || '').length * (fontSize * 0.62) + margin, baseW);
  rows.forEach(({ attr: a, indent }) => {
    const isWeakOwner = isAttributeOwnerWeak(a, relationships, aggregations, attributes);
    let label =
      (a.partialKey || (a.primary && isWeakOwner) ? `${t('CP')} ` : a.primary ? 'PK ' : '') +
      (a.name || '');
    if (a.dataType) label += ` : ${t(a.dataType)}`;
    const aw = label.length * (fontSize * 0.58) + indent * 12;
    neededW = Math.max(neededW, aw + margin + deleteColW);
  });

  const neededH = lineHeight + margin + rows.length * lineHeight + 10;
  return {
    width: Math.max(baseW, Math.ceil(neededW)),
    height: Math.max(baseH, Math.ceil(neededH)),
  };
}

export function getRectBorderPoint(rectCenterX, rectCenterY, width, height, targetX, targetY) {
  const dx = targetX - rectCenterX;
  const dy = targetY - rectCenterY;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: rectCenterX, y: rectCenterY };
  }
  const halfW = width / 2;
  const halfH = height / 2;
  const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return {
    x: rectCenterX + dx * scale,
    y: rectCenterY + dy * scale,
  };
}

export function getDiamondBorderPoint(diamondCenterX, diamondCenterY, width, height, targetX, targetY) {
  const dx = targetX - diamondCenterX;
  const dy = targetY - diamondCenterY;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: diamondCenterX, y: diamondCenterY };
  }
  const halfW = width / 2;
  const halfH = height / 2;
  const denom = Math.abs(dx) / halfW + Math.abs(dy) / halfH;
  if (denom < 0.001) {
    return { x: diamondCenterX, y: diamondCenterY };
  }
  const tVal = 1 / denom;
  return {
    x: diamondCenterX + dx * tVal,
    y: diamondCenterY + dy * tVal,
  };
}

export function getEllipseBorderPoint(cx, cy, rx, ry, targetX, targetY) {
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy };
  }
  const angle = Math.atan2(dy, dx);
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
  };
}

export function getSpecializationVertices(spec) {
  const size = spec.size || spec.width || DEFAULT_SPECIALIZATION_SIZE;
  const half = size / 2;
  return [
    { x: spec.x, y: spec.y - half },
    { x: spec.x - half, y: spec.y + half },
    { x: spec.x + half, y: spec.y + half },
  ];
}

export function getRelationshipPillDimensions(rel, fontSize = 14) {
  const textWidth = Math.max((rel.name || '').length * (fontSize * 0.6), 24) + 16;
  return { width: textWidth, height: 24 };
}

export function getRelationshipBorderPoint(rel, targetX, targetY, currentNotation = 'chen') {
  const size = rel.size || rel.width || RELATIONSHIP_SIZE;
  const w = rel.width || size;
  const h = rel.height || size;
  if (currentNotation !== 'chen') {
    const { width, height } = getRelationshipPillDimensions(rel);
    return getRectBorderPoint(rel.x, rel.y, width, height, targetX, targetY);
  }
  return getDiamondBorderPoint(rel.x, rel.y, w, h, targetX, targetY);
}

export function relationshipConnectionGeometry(
  rel,
  conn,
  entities = [],
  aggregations = [],
  attributes = [],
  currentNotation = 'chen'
) {
  let e = entities.find((en) => en.id === conn.entityId);
  let isAggTarget = false;
  if (!e && conn.targetType === 'aggregation') {
    e = aggregations.find((ag) => ag.id === conn.entityId);
    isAggTarget = true;
  }
  if (!e) return null;

  const isCrow = currentNotation !== 'chen';
  let ew, eh, eLeft, eTop;
  if (isAggTarget) {
    const halfAgg = (e.size || e.width || RELATIONSHIP_SIZE) / 2;
    const rectSize = halfAgg * 1.2;
    ew = rectSize * 2;
    eh = rectSize * 2;
    eLeft = e.x - rectSize;
    eTop = e.y - rectSize;
  } else {
    const dims = isCrow
      ? getCrowEntityDimensions(e, attributes, [], aggregations)
      : { width: e.width || DEFAULT_ENTITY_WIDTH, height: e.height || DEFAULT_ENTITY_HEIGHT };
    ew = dims.width;
    eh = dims.height;
    eLeft = e.x;
    eTop = e.y;
  }

  let eCenter = { x: eLeft + ew / 2, y: eTop + eh / 2 };
  const hasBreakpoints = Boolean(conn.breakpoints && conn.breakpoints.length > 0);
  const same = (rel.connections || []).filter((c) => c.entityId === conn.entityId);
  let side = 0;

  if (same.length > 1 && !hasBreakpoints) {
    const idx = same.indexOf(conn);
    const ax = rel.x - eCenter.x;
    const ay = rel.y - eCenter.y;
    const len = Math.hypot(ax, ay) || 1;
    const px = -ay / len;
    const py = ax / len;
    const reach =
      0.75 *
      Math.min(
        ew / 2 / (Math.abs(px) || 1e-9),
        eh / 2 / (Math.abs(py) || 1e-9)
      );
    side = (idx / (same.length - 1)) * 2 - 1;
    eCenter = {
      x: eCenter.x + px * side * reach,
      y: eCenter.y + py * side * reach,
    };
  }

  const firstTarget = hasBreakpoints ? conn.breakpoints[0] : eCenter;
  const rBorder = getRelationshipBorderPoint(rel, firstTarget.x, firstTarget.y, currentNotation);
  const lastSource = hasBreakpoints
    ? conn.breakpoints[conn.breakpoints.length - 1]
    : rBorder;

  let eBorder;
  if (side === 0) {
    eBorder = getRectBorderPoint(
      eLeft + ew / 2,
      eTop + eh / 2,
      ew,
      eh,
      lastSource.x,
      lastSource.y
    );
  } else {
    const dx = lastSource.x - eCenter.x;
    const dy = lastSource.y - eCenter.y;
    const tx =
      dx > 0
        ? (eLeft + ew - eCenter.x) / dx
        : dx < 0
          ? (eLeft - eCenter.x) / dx
          : Infinity;
    const ty =
      dy > 0
        ? (eTop + eh - eCenter.y) / dy
        : dy < 0
          ? (eTop - eCenter.y) / dy
          : Infinity;
    const tVal = Math.min(tx, ty);
    eBorder = {
      x: eCenter.x + dx * tVal,
      y: eCenter.y + dy * tVal,
    };
  }

  const points = [rBorder];
  if (hasBreakpoints) points.push(...conn.breakpoints);
  points.push(eBorder);
  return { points, side };
}

export function relationshipConnectionPoints(
  rel,
  conn,
  entities = [],
  aggregations = [],
  attributes = [],
  currentNotation = 'chen'
) {
  const geom = relationshipConnectionGeometry(
    rel,
    conn,
    entities,
    aggregations,
    attributes,
    currentNotation
  );
  return geom ? geom.points : null;
}

export function getPolylineMidpoint(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (acc + seg >= half) {
      const ratio = seg > 0 ? (half - acc) / seg : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
      };
    }
    acc += seg;
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

export const polylineMidpoint = getPolylineMidpoint;

export function relationshipLabelPoint(points, side = 0) {
  if (!side) return getPolylineMidpoint(points);
  const a = points[0];
  const b = points[points.length - 1];
  return { x: a.x + (b.x - a.x) * 0.62, y: a.y + (b.y - a.y) * 0.62 };
}

export function relationshipRolePoint(labelPos, radius, roleWidth, side = 0) {
  if (!side) return { x: labelPos.x, y: labelPos.y + radius + 10 };
  return {
    x: labelPos.x + Math.sign(side) * (radius + roleWidth / 2 + 4),
    y: labelPos.y,
  };
}

export function updateRelationshipConnectionRects(
  relationships = [],
  entities = [],
  aggregations = [],
  attributes = [],
  currentNotation = 'chen',
  fontSize = 14
) {
  for (const rel of relationships) {
    if (!rel.connections) continue;
    for (const conn of rel.connections) {
      const geom = relationshipConnectionGeometry(
        rel,
        conn,
        entities,
        aggregations,
        attributes,
        currentNotation
      );
      if (!geom) continue;
      const { points, side } = geom;
      const labelPos = relationshipLabelPoint(points, side);
      const text = cardinalityLabel(conn.cardinality);
      const textWidth = text.length * (fontSize * 0.58) + 16;
      const radius = Math.max(textWidth / 2, fontSize / 2) + 8;
      const textCenterX = labelPos.x;
      const textCenterY = labelPos.y - 1;
      conn.labelRect = {
        x: textCenterX - radius,
        y: textCenterY - radius,
        width: radius * 2,
        height: radius * 2,
      };
    }
  }
}

export function getSpecializationConnectionPoints(
  spec,
  conn,
  connIndex,
  entities = [],
  attributes = [],
  currentNotation = 'chen'
) {
  const e = entities.find((en) => en.id === conn.entityId);
  if (!e) return null;

  const isCrow = currentNotation !== 'chen';
  const dims = isCrow
    ? getCrowEntityDimensions(e, attributes)
    : { width: e.width || DEFAULT_ENTITY_WIDTH, height: e.height || DEFAULT_ENTITY_HEIGHT };
  const eCenter = { x: e.x + dims.width / 2, y: e.y + dims.height / 2 };

  const vertices = getSpecializationVertices(spec);
  let vertexIndex = conn.vertex;
  if (vertexIndex === undefined || vertexIndex === null) {
    if (conn.role === 'supertype') vertexIndex = 0;
    else vertexIndex = connIndex === 0 ? 0 : connIndex === 1 ? 1 : 2;
  }
  const vertex = vertices[vertexIndex] || vertices[0];

  const points = [vertex];
  if (conn.breakpoints && conn.breakpoints.length > 0) {
    points.push(...conn.breakpoints);
  }
  const lastPoint = points[points.length - 1];
  const eBoundary = getRectBorderPoint(
    eCenter.x,
    eCenter.y,
    dims.width,
    dims.height,
    lastPoint.x,
    lastPoint.y
  );
  points.push(eBoundary);
  return points;
}

export function getAggregationConnectionPoints(
  agg,
  conn,
  entities = [],
  relationships = [],
  attributes = [],
  currentNotation = 'chen'
) {
  const isEntity = conn.entityId !== undefined || conn.targetType === 'entity';
  const targetId = conn.entityId !== undefined ? conn.entityId : (conn.relationshipId !== undefined ? conn.relationshipId : conn.targetId);
  const target = isEntity
    ? entities.find((e) => e.id === targetId)
    : relationships.find((r) => r.id === targetId);
  if (!target) return null;

  const isCrow = currentNotation !== 'chen';
  const halfAgg = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
  const rectSize = halfAgg * 1.2;
  const aggW = agg.width || rectSize * 2;
  const aggH = agg.height || rectSize * 2;

  let targetCenter;
  let getTargetBorder;
  if (isEntity) {
    const dims = isCrow
      ? getCrowEntityDimensions(target, attributes)
      : { width: target.width || DEFAULT_ENTITY_WIDTH, height: target.height || DEFAULT_ENTITY_HEIGHT };
    targetCenter = { x: target.x + dims.width / 2, y: target.y + dims.height / 2 };
    getTargetBorder = (rx, ry) => getRectBorderPoint(targetCenter.x, targetCenter.y, dims.width, dims.height, rx, ry);
  } else {
    targetCenter = { x: target.x, y: target.y };
    getTargetBorder = (rx, ry) => getRelationshipBorderPoint(target, rx, ry, currentNotation);
  }

  const hasBreakpoints = Boolean(conn.breakpoints && conn.breakpoints.length > 0);
  const firstTarget = hasBreakpoints ? conn.breakpoints[0] : targetCenter;
  const aggBorder = getRectBorderPoint(agg.x, agg.y, aggW, aggH, firstTarget.x, firstTarget.y);
  const lastSource = hasBreakpoints
    ? conn.breakpoints[conn.breakpoints.length - 1]
    : aggBorder;
  const targetBorder = getTargetBorder(lastSource.x, lastSource.y);

  const points = [aggBorder];
  if (hasBreakpoints) points.push(...conn.breakpoints);
  points.push(targetBorder);
  return points;
}

export function getAttributeConnectionPoints(
  attr,
  entities = [],
  relationships = [],
  aggregations = [],
  attributes = [],
  currentNotation = 'chen'
) {
  if (!attr.parentType || attr.parentId == null) return null;
  if (currentNotation !== 'chen' && attr.parentType !== 'aggregation') return null;
  if (attr.parentType === 'attribute') {
    const parent = attributes.find((a) => a.id === attr.parentId);
    if (!parent || parent.collapsed) return null;
  }

  const hasBreakpoints = Boolean(attr.breakpoints && attr.breakpoints.length > 0);
  const firstRef = hasBreakpoints ? attr.breakpoints[0] : { x: attr.x, y: attr.y };

  let startPoint = null;
  if (attr.parentType === 'entity') {
    const e = entities.find((en) => en.id === attr.parentId);
    if (!e) return null;
    const w = e.width || DEFAULT_ENTITY_WIDTH;
    const h = e.height || DEFAULT_ENTITY_HEIGHT;
    startPoint = getRectBorderPoint(e.x + w / 2, e.y + h / 2, w, h, firstRef.x, firstRef.y);
  } else if (attr.parentType === 'relationship') {
    const r = relationships.find((rr) => rr.id === attr.parentId);
    if (!r) return null;
    startPoint = getRelationshipBorderPoint(r, firstRef.x, firstRef.y, currentNotation);
  } else if (attr.parentType === 'aggregation') {
    const agg = aggregations.find((ag) => ag.id === attr.parentId);
    if (!agg) return null;
    const half = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
    const rectSize = half * 1.2;
    const w = agg.width || rectSize * 2;
    const h = agg.height || rectSize * 2;
    startPoint = getRectBorderPoint(agg.x, agg.y, w, h, firstRef.x, firstRef.y);
  } else if (attr.parentType === 'attribute') {
    const pA = attributes.find((at) => at.id === attr.parentId);
    if (!pA) return null;
    startPoint = getEllipseBorderPoint(
      pA.x,
      pA.y,
      ATTR_CIRCLE_RADIUS,
      ATTR_CIRCLE_RADIUS,
      firstRef.x,
      firstRef.y
    );
  } else {
    return null;
  }

  const lastRef = hasBreakpoints
    ? attr.breakpoints[attr.breakpoints.length - 1]
    : startPoint;
  const endPoint = getEllipseBorderPoint(
    attr.x,
    attr.y,
    ATTR_CIRCLE_RADIUS,
    ATTR_CIRCLE_RADIUS,
    lastRef.x,
    lastRef.y
  );

  const points = [startPoint];
  if (hasBreakpoints) points.push(...attr.breakpoints);
  points.push(endPoint);
  return points;
}

export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  return Math.hypot(px - xx, py - yy);
}

export function calculateDiagramBounds(diagram) {
  const {
    entities = [],
    relationships = [],
    attributes = [],
    specializations = [],
    aggregations = [],
    postits = [],
  } = diagram;
  const currentNotation = diagram.currentNotation || diagram.notation || 'chen';
  const fontSize = diagram.fontSize || 14;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  entities.forEach((e) => {
    const dims =
      currentNotation !== 'chen'
        ? getCrowEntityDimensions(e, attributes, relationships, aggregations, fontSize)
        : { width: e.width || DEFAULT_ENTITY_WIDTH, height: e.height || DEFAULT_ENTITY_HEIGHT };
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + dims.width);
    maxY = Math.max(maxY, e.y + dims.height);
  });

  attributes.forEach((a) => {
    if (currentNotation !== 'chen' && a.parentType !== null) return;
    if (a.parentType === 'attribute') {
      const parent = attributes.find((at) => at.id === a.parentId);
      if (parent && parent.collapsed) return;
    }
    const textWidth = (a.name || '').length * (fontSize * 0.62) + 8;
    const halfH = Math.max(ATTR_CIRCLE_RADIUS, fontSize * 0.7);
    minX = Math.min(minX, a.x - ATTR_CIRCLE_RADIUS);
    minY = Math.min(minY, a.y - halfH);
    maxX = Math.max(maxX, a.x + ATTR_CIRCLE_RADIUS + ATTR_TEXT_PADDING + textWidth);
    maxY = Math.max(maxY, a.y + ATTR_TEXT_OFFSET_Y + halfH);
  });

  relationships.forEach((r) => {
    const half = (r.size || r.width || RELATIONSHIP_SIZE) / 2;
    minX = Math.min(minX, r.x - half);
    minY = Math.min(minY, r.y - half);
    maxX = Math.max(maxX, r.x + half);
    maxY = Math.max(maxY, r.y + half);
    (r.connections || []).forEach((conn) => {
      (conn.breakpoints || []).forEach((bp) => {
        minX = Math.min(minX, bp.x);
        minY = Math.min(minY, bp.y);
        maxX = Math.max(maxX, bp.x);
        maxY = Math.max(maxY, bp.y);
      });
    });
  });

  specializations.forEach((s) => {
    getSpecializationVertices(s).forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    (s.connections || []).forEach((conn) => {
      (conn.breakpoints || []).forEach((bp) => {
        minX = Math.min(minX, bp.x);
        minY = Math.min(minY, bp.y);
        maxX = Math.max(maxX, bp.x);
        maxY = Math.max(maxY, bp.y);
      });
    });
  });

  aggregations.forEach((agg) => {
    const half = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
    const rectSize = half * 1.2;
    minX = Math.min(minX, agg.x - rectSize);
    minY = Math.min(minY, agg.y - rectSize);
    maxX = Math.max(maxX, agg.x + rectSize);
    maxY = Math.max(maxY, agg.y + rectSize);
    (agg.connections || []).forEach((conn) => {
      (conn.breakpoints || []).forEach((bp) => {
        minX = Math.min(minX, bp.x);
        minY = Math.min(minY, bp.y);
        maxX = Math.max(maxX, bp.x);
        maxY = Math.max(maxY, bp.y);
      });
    });
  });

  postits.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + (p.width || 200));
    maxY = Math.max(maxY, p.y + (p.height || 120));
  });

  if (minX === Infinity) {
    return { x: 0, y: 0, width: 800, height: 600, minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  return {
    x: minX,
    y: minY,
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 100),
    height: Math.max(maxY - minY, 100),
  };
}

export function getDiagramBounds(
  entities = [],
  attributes = [],
  relationships = [],
  specializations = [],
  aggregations = [],
  postits = [],
  currentNotation = 'chen',
  fontSize = 14
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  entities.forEach((e) => {
    const dims =
      currentNotation !== 'chen'
        ? getCrowEntityDimensions(e, attributes, relationships, aggregations, fontSize)
        : { width: e.width || DEFAULT_ENTITY_WIDTH, height: e.height || DEFAULT_ENTITY_HEIGHT };
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + dims.width);
    maxY = Math.max(maxY, e.y + dims.height);
  });

  attributes.forEach((a) => {
    if (currentNotation !== 'chen' && a.parentType !== null) return;
    if (a.parentType === 'attribute') {
      const parent = attributes.find((at) => at.id === a.parentId);
      if (parent && parent.collapsed) return;
    }
    const textWidth = (a.name || '').length * (fontSize * 0.62) + 8;
    const halfH = Math.max(ATTR_CIRCLE_RADIUS, fontSize * 0.7);
    minX = Math.min(minX, a.x - ATTR_CIRCLE_RADIUS);
    minY = Math.min(minY, a.y - halfH);
    maxX = Math.max(maxX, a.x + ATTR_CIRCLE_RADIUS + ATTR_TEXT_PADDING + textWidth);
    maxY = Math.max(maxY, a.y + ATTR_TEXT_OFFSET_Y + halfH);
  });

  relationships.forEach((r) => {
    const half = (r.size || r.width || RELATIONSHIP_SIZE) / 2;
    minX = Math.min(minX, r.x - half);
    minY = Math.min(minY, r.y - half);
    maxX = Math.max(maxX, r.x + half);
    maxY = Math.max(maxY, r.y + half);
    (r.connections || []).forEach((conn) => {
      (conn.breakpoints || []).forEach((bp) => {
        minX = Math.min(minX, bp.x);
        minY = Math.min(minY, bp.y);
        maxX = Math.max(maxX, bp.x);
        maxY = Math.max(maxY, bp.y);
      });
    });
  });

  specializations.forEach((s) => {
    getSpecializationVertices(s).forEach((v) => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    (s.connections || []).forEach((conn) => {
      (conn.breakpoints || []).forEach((bp) => {
        minX = Math.min(minX, bp.x);
        minY = Math.min(minY, bp.y);
        maxX = Math.max(maxX, bp.x);
        maxY = Math.max(maxY, bp.y);
      });
    });
  });

  aggregations.forEach((agg) => {
    const half = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
    const rectSize = half * 1.2;
    minX = Math.min(minX, agg.x - rectSize);
    minY = Math.min(minY, agg.y - rectSize);
    maxX = Math.max(maxX, agg.x + rectSize);
    maxY = Math.max(maxY, agg.y + rectSize);
    (agg.connections || []).forEach((conn) => {
      (conn.breakpoints || []).forEach((bp) => {
        minX = Math.min(minX, bp.x);
        minY = Math.min(minY, bp.y);
        maxX = Math.max(maxX, bp.x);
        maxY = Math.max(maxY, bp.y);
      });
    });
  });

  postits.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + (p.width || 200));
    maxY = Math.max(maxY, p.y + (p.height || 120));
  });

  if (!isFinite(minX) || !isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

export { participationPaths };
