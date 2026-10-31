import {
  ATTR_CIRCLE_RADIUS,
  ATTR_TEXT_PADDING,
  ATTR_TEXT_OFFSET_Y,
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  RELATIONSHIP_SIZE,
  DEFAULT_SPECIALIZATION_SIZE,
  NORMAL_COLORS,
} from '../domain/constants.js';
import {
  parseCardinality,
  isMany,
  attributePresentation,
  isIdentifyingRelationship,
  isWeakEntity,
  participationPaths,
} from '../domain/semantics.js';
import {
  calculateDiagramBounds,
  cardinalityLabel,
  collectCrowEntityRows,
  getCrowEntityDimensions,
  getDiamondBorderPoint,
  getPolylineMidpoint,
  getRectBorderPoint,
  getRelationshipPillDimensions,
  getSpecializationVertices,
  isAttributeOwnerWeak,
  relationshipConnectionGeometry,
  relationshipLabelPoint,
  relationshipRolePoint,
} from './geometry.js';
import { researchMode } from '../research/config.js';
import { getParticipantName, slugifyName } from '../research/participant.js';
import { t, getLocale, displayGenType } from '../i18n/index.js';
import { showNotification } from '../ui/notifications.js';
import { diagram as stateDiagram } from '../domain/state.js';

function resolveDiagramInput(arg) {
  if (arg && typeof arg === 'object' && Array.isArray(arg.entities)) {
    return arg;
  }
  return {
    ...stateDiagram,
    currentNotation:
      typeof arg === 'string'
        ? arg
        : stateDiagram.currentNotation || stateDiagram.notation || 'chen',
  };
}

export function buildExportFilename(ext) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const who = researchMode() ? `${slugifyName(getParticipantName())}_` : '';
  return `diagrama_er_${who}${dateStr}_${timeStr}.${ext}`;
}

export function drawExportFooter(context, minX, maxY) {
  if (!researchMode()) return;
  const nome = getParticipantName();
  const quando = new Date().toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const texto = `${nome || t('sem identificação')} · ${quando}`;
  context.save();
  context.font = '13px Poppins, sans-serif';
  context.fillStyle = '#6b7280';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(texto, minX + 16, maxY - 12);
  context.restore();
}

export function generateDiagramSVG(diagramInput) {
  const diagram = resolveDiagramInput(diagramInput);
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

  const bounds = calculateDiagramBounds(diagram);
  const margin = 50;
  const footerHeight = researchMode() ? 34 : 0;
  const minX = bounds.minX - margin;
  const minY = bounds.minY - margin;
  const maxX = bounds.maxX + margin;
  const maxY = bounds.maxY + margin + footerHeight;
  const diagramWidth = maxX - minX;
  const diagramHeight = maxY - minY;

  const parts = [];
  const connectorParts = [];
  const shapeParts = [];
  const labelParts = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diagramWidth}" height="${diagramHeight}" viewBox="0 0 ${diagramWidth} ${diagramHeight}">`
  );

  // Attribute connectors
  attributes.forEach((a) => {
    if (currentNotation !== 'chen' && a.parentType !== 'aggregation') return;
    if (a.parentType === 'attribute') {
      const parent = attributes.find((at) => at.id === a.parentId);
      if (parent && parent.collapsed) return;
    }
    let sx, sy;
    if (a.parentType === 'entity') {
      const e = entities.find((en) => en.id === a.parentId);
      if (e) {
        const w = e.width || DEFAULT_ENTITY_WIDTH;
        const h = e.height || DEFAULT_ENTITY_HEIGHT;
        sx = e.x + w / 2;
        sy = e.y + h / 2;
      }
    } else if (a.parentType === 'relationship') {
      const r = relationships.find((rr) => rr.id === a.parentId);
      if (r) {
        const size = r.size || r.width || RELATIONSHIP_SIZE;
        const border = getDiamondBorderPoint(r.x, r.y, size, size, a.x, a.y);
        sx = border.x;
        sy = border.y;
      }
    } else if (a.parentType === 'attribute') {
      const pA = attributes.find((at) => at.id === a.parentId);
      if (pA) {
        sx = pA.x;
        sy = pA.y;
      }
    } else if (a.parentType === 'aggregation') {
      const aggr = aggregations.find((ag) => ag.id === a.parentId);
      if (aggr) {
        const half = (aggr.size || aggr.width || RELATIONSHIP_SIZE) / 2;
        const rectSize = half * 1.2;
        const border = getRectBorderPoint(aggr.x, aggr.y, rectSize * 2, rectSize * 2, a.x, a.y);
        sx = border.x;
        sy = border.y;
      }
    }
    if (sx !== undefined) {
      connectorParts.push(
        `<line x1="${sx - minX}" y1="${sy - minY}" x2="${a.x - minX}" y2="${a.y - minY}" stroke="#000000" stroke-width="2"/>`
      );
    }
  });

  // Relationship connectors & labels
  relationships.forEach((r) => {
    (r.connections || []).forEach((conn) => {
      const geom = relationshipConnectionGeometry(
        r,
        conn,
        entities,
        aggregations,
        attributes,
        currentNotation
      );
      if (!geom) return;
      const { points: pts, side } = geom;
      for (const path of participationPaths(pts, conn.weak, currentNotation)) {
        for (let i = 0; i < path.length - 1; i++) {
          connectorParts.push(
            `<line x1="${path[i].x - minX}" y1="${path[i].y - minY}" x2="${path[i + 1].x - minX}" y2="${path[i + 1].y - minY}" stroke="#000000" stroke-width="2"/>`
          );
        }
      }
      if (conn.cardinality) {
        const mid = relationshipLabelPoint(pts, side);
        const text = cardinalityLabel(conn.cardinality);
        const textWidth = text.length * (fontSize * 0.58) + 10;
        const radius = Math.max(textWidth / 2, fontSize / 2) + 2;
        const cx = mid.x - minX;
        const cy = mid.y - 1 - minY;
        labelParts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#ffffff"/>`);
        labelParts.push(
          `<text x="${cx}" y="${cy}" fill="#000000" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${text}</text>`
        );
      }
      if (conn.role) {
        const roleSize = Math.max(10, fontSize - 2);
        const cardRadius =
          Math.max(
            (cardinalityLabel(conn.cardinality || '').length * (fontSize * 0.58) + 10) / 2,
            fontSize / 2
          ) + 2;
        const roleMid = relationshipLabelPoint(pts, side);
        const roleWidth = conn.role.length * (roleSize * 0.55);
        const rp = relationshipRolePoint(
          { x: roleMid.x - minX, y: roleMid.y - 1 - minY },
          cardRadius + 6,
          roleWidth,
          side
        );
        labelParts.push(
          `<text x="${rp.x}" y="${rp.y}" fill="#666666" font-family="Poppins" font-style="italic" font-size="${roleSize}" text-anchor="middle" dominant-baseline="middle">${conn.role.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
        );
      }
    });
  });

  // Specialization connectors
  specializations.forEach((spec) => {
    (spec.connections || []).forEach((conn, idx) => {
      const e = entities.find((en) => en.id === conn.entityId);
      if (!e) return;
      const vertices = getSpecializationVertices(spec);
      const vertex = vertices[conn.vertex ?? idx] || vertices[0];
      const ew = e.width || DEFAULT_ENTITY_WIDTH;
      const eh = e.height || DEFAULT_ENTITY_HEIGHT;
      const eCenter = { x: e.x + ew / 2, y: e.y + eh / 2 };
      const lastPoint =
        conn.breakpoints && conn.breakpoints.length > 0
          ? conn.breakpoints[conn.breakpoints.length - 1]
          : vertex;
      const eBoundary = getRectBorderPoint(eCenter.x, eCenter.y, ew, eh, lastPoint.x, lastPoint.y);
      const pts = [vertex];
      if (conn.breakpoints && conn.breakpoints.length > 0) pts.push(...conn.breakpoints);
      pts.push(eBoundary);
      for (const path of participationPaths(pts, conn.weak, currentNotation)) {
        for (let i = 0; i < path.length - 1; i++) {
          connectorParts.push(
            `<line x1="${path[i].x - minX}" y1="${path[i].y - minY}" x2="${path[i + 1].x - minX}" y2="${path[i + 1].y - minY}" stroke="#000000" stroke-width="2"/>`
          );
        }
      }
    });
  });

  // Aggregation connectors
  aggregations.forEach((agg) => {
    const half = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
    const rectSize2 = half * 1.2;
    (agg.connections || []).forEach((conn) => {
      const isEnt = conn.entityId !== undefined || conn.targetType === 'entity';
      const targetId = conn.entityId ?? conn.relationshipId ?? conn.targetId;
      const target = isEnt
        ? entities.find((e) => e.id === targetId)
        : relationships.find((r) => r.id === targetId);
      if (!target) return;
      const aggCenter = { x: agg.x, y: agg.y };
      const targetCenter = isEnt
        ? {
            x: target.x + (target.width || DEFAULT_ENTITY_WIDTH) / 2,
            y: target.y + (target.height || DEFAULT_ENTITY_HEIGHT) / 2,
          }
        : { x: target.x, y: target.y };
      const firstTarget =
        conn.breakpoints && conn.breakpoints.length > 0 ? conn.breakpoints[0] : targetCenter;
      const aggBorder = getRectBorderPoint(
        aggCenter.x,
        aggCenter.y,
        rectSize2 * 2,
        rectSize2 * 2,
        firstTarget.x,
        firstTarget.y
      );
      const lastSource =
        conn.breakpoints && conn.breakpoints.length > 0
          ? conn.breakpoints[conn.breakpoints.length - 1]
          : aggBorder;
      const targetBorder = isEnt
        ? getRectBorderPoint(
            targetCenter.x,
            targetCenter.y,
            target.width || DEFAULT_ENTITY_WIDTH,
            target.height || DEFAULT_ENTITY_HEIGHT,
            lastSource.x,
            lastSource.y
          )
        : getDiamondBorderPoint(
            target.x,
            target.y,
            target.size || RELATIONSHIP_SIZE,
            target.size || RELATIONSHIP_SIZE,
            lastSource.x,
            lastSource.y
          );
      const pts = [aggBorder];
      if (conn.breakpoints && conn.breakpoints.length > 0) pts.push(...conn.breakpoints);
      pts.push(targetBorder);
      for (const path of participationPaths(pts, conn.weak, currentNotation)) {
        for (let i = 0; i < path.length - 1; i++) {
          connectorParts.push(
            `<line x1="${path[i].x - minX}" y1="${path[i].y - minY}" x2="${path[i + 1].x - minX}" y2="${path[i + 1].y - minY}" stroke="#000000" stroke-width="2"/>`
          );
        }
      }
      if (conn.cardinality) {
        const mid = getPolylineMidpoint(pts);
        const text = cardinalityLabel(conn.cardinality);
        const radius = Math.max((text.length * 8 + 10) / 2, fontSize / 2) + 2;
        const cx = mid.x - minX;
        const cy = mid.y - 1 - minY;
        labelParts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#ffffff"/>`);
        labelParts.push(
          `<text x="${cx}" y="${cy}" fill="#000000" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${text}</text>`
        );
      }
    });
  });

  // Entities
  entities.forEach((e) => {
    const x = e.x - minX;
    const y = e.y - minY;
    const w = e.width || DEFAULT_ENTITY_WIDTH;
    const h = e.height || DEFAULT_ENTITY_HEIGHT;
    const fill = NORMAL_COLORS.entity.fill;
    const stroke = e.selected ? '#60a5fa' : NORMAL_COLORS.entity.stroke;
    shapeParts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
    );
    const weakEnt = isWeakEntity(e.id, [...relationships, ...aggregations]);
    if (currentNotation === 'chen' && weakEnt) {
      shapeParts.push(
        `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="4" ry="4" fill="none" stroke="${stroke}" stroke-width="2"/>`
      );
    }
    shapeParts.push(
      `<text x="${x + w / 2}" y="${y + h / 2}" fill="#ffffff" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${(e.name || '').replace(/&/g, '&amp;')}</text>`
    );
  });

  // Attributes
  attributes.forEach((a) => {
    if (currentNotation !== 'chen' && a.parentType !== null) return;
    if (a.parentType === 'attribute') {
      const parent = attributes.find((at) => at.id === a.parentId);
      if (parent && parent.collapsed) return;
    }
    const cx = a.x - minX;
    const cy = a.y - minY;
    const ownerWeak = isAttributeOwnerWeak(a, relationships, aggregations, attributes);
    const key = attributePresentation(a, ownerWeak);
    const stroke = a.selected
      ? '#60a5fa'
      : a.derived
        ? NORMAL_COLORS.derived.stroke
        : a.multivalued
          ? NORMAL_COLORS.multivalued.stroke
          : NORMAL_COLORS.attribute.stroke;
    const fill = key.filled
      ? a.derived
        ? NORMAL_COLORS.derived.fill
        : NORMAL_COLORS.attribute.fill
      : '#ffffff';
    shapeParts.push(
      `<circle cx="${cx}" cy="${cy}" r="${ATTR_CIRCLE_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
    );
    if (a.multivalued) {
      shapeParts.push(
        `<circle cx="${cx}" cy="${cy}" r="${ATTR_CIRCLE_RADIUS * 0.7}" fill="none" stroke="${stroke}" stroke-width="2"/>`
      );
    }
    const tx = cx + ATTR_CIRCLE_RADIUS + ATTR_TEXT_PADDING;
    const ty = cy + ATTR_TEXT_OFFSET_Y;
    shapeParts.push(
      `<text x="${tx}" y="${ty}" fill="#000000" font-family="Poppins" font-size="${fontSize}" text-anchor="start" dominant-baseline="middle">${(a.name || '').replace(/&/g, '&amp;')}</text>`
    );
    if (currentNotation === 'chen' && key.underline) {
      const tw = (a.name || '').length * (fontSize * 0.58);
      shapeParts.push(
        `<line x1="${tx}" y1="${ty + fontSize * 0.55}" x2="${tx + tw}" y2="${ty + fontSize * 0.55}" stroke="#000000" stroke-width="1" ${key.underline === 'dashed' ? 'stroke-dasharray="4 3"' : ''}/>`
      );
    }
  });

  // Relationships
  relationships.forEach((r) => {
    const half = (r.size || r.width || RELATIONSHIP_SIZE) / 2;
    const top = `${r.x - minX},${r.y - half - minY}`;
    const right = `${r.x + half - minX},${r.y - minY}`;
    const bottom = `${r.x - minX},${r.y + half - minY}`;
    const left = `${r.x - half - minX},${r.y - minY}`;
    const fill = NORMAL_COLORS.relationship.fill;
    const stroke = r.selected ? '#60a5fa' : NORMAL_COLORS.relationship.stroke;
    shapeParts.push(
      `<polygon points="${top} ${right} ${bottom} ${left}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
    );
    if (currentNotation === 'chen' && isIdentifyingRelationship(r)) {
      const h = half - 6;
      shapeParts.push(
        `<polygon points="${r.x - minX},${r.y - h - minY} ${r.x + h - minX},${r.y - minY} ${r.x - minX},${r.y + h - minY} ${r.x - h - minX},${r.y - minY}" fill="none" stroke="${stroke}" stroke-width="2"/>`
      );
    }
    shapeParts.push(
      `<text x="${r.x - minX}" y="${r.y - minY}" fill="#ffffff" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${(r.name || '').replace(/&/g, '&amp;')}</text>`
    );
  });

  // Specializations
  specializations.forEach((spec) => {
    const vertices = getSpecializationVertices(spec)
      .map((v) => `${v.x - minX},${v.y - minY}`)
      .join(' ');
    const fill = NORMAL_COLORS.specialization.fill;
    const stroke = spec.selected ? '#60a5fa' : NORMAL_COLORS.specialization.stroke;
    if (spec.genType === 'U') {
      const r = (spec.size || DEFAULT_SPECIALIZATION_SIZE) / 2;
      shapeParts.push(
        `<circle cx="${spec.x - minX}" cy="${spec.y - minY}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      );
    } else {
      shapeParts.push(
        `<polygon points="${vertices}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      );
    }
    shapeParts.push(
      `<text x="${spec.x - minX}" y="${spec.y - minY}" fill="#ffffff" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${displayGenType(spec.genType || '').replace(/&/g, '&amp;')}</text>`
    );
  });

  // Aggregations
  aggregations.forEach((agg) => {
    const half = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
    const rectSize = half * 1.2;
    const fill = NORMAL_COLORS.aggregation.fill;
    const stroke = agg.selected ? '#60a5fa' : NORMAL_COLORS.aggregation.stroke;
    shapeParts.push(
      `<rect x="${agg.x - rectSize - minX}" y="${agg.y - rectSize - minY}" width="${rectSize * 2}" height="${rectSize * 2}" fill="none" stroke="${stroke}" stroke-width="2"/>`
    );
    const top = `${agg.x - minX},${agg.y - half - minY}`;
    const right = `${agg.x + half - minX},${agg.y - minY}`;
    const bottom = `${agg.x - minX},${agg.y + half - minY}`;
    const left = `${agg.x - half - minX},${agg.y - minY}`;
    shapeParts.push(
      `<polygon points="${top} ${right} ${bottom} ${left}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
    );
    shapeParts.push(
      `<text x="${agg.x - minX}" y="${agg.y - minY}" fill="#ffffff" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${(agg.name || '').replace(/&/g, '&amp;')}</text>`
    );
  });

  // Post-its
  postits.forEach((p) => {
    const x = p.x - minX;
    const y = p.y - minY;
    const pw = p.width || 200;
    const ph = p.height || 120;
    shapeParts.push(
      `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="8" ry="8" fill="${p.color || NORMAL_COLORS.postit.fill}" stroke="${p.selected ? '#60a5fa' : NORMAL_COLORS.postit.stroke}" stroke-width="1"/>`
    );
    shapeParts.push(
      `<text x="${x + pw / 2}" y="${y + ph / 2}" fill="#000000" font-family="Poppins" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${(p.text || '').replace(/&/g, '&amp;')}</text>`
    );
  });

  if (researchMode()) {
    const nome = getParticipantName();
    const quando = new Date().toLocaleString(getLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const texto = `${nome || t('sem identificação')} · ${quando}`;
    labelParts.push(
      `<text x="16" y="${diagramHeight - 12}" fill="#6b7280" font-family="Poppins, sans-serif" font-size="13">${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    );
  }

  parts.push(...connectorParts);
  parts.push(...shapeParts);
  parts.push(...labelParts);
  parts.push('</svg>');
  return parts.join('');
}

export function renderDiagramToPNGDataURL(diagramInput) {
  const diagram = resolveDiagramInput(diagramInput);
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
  const isCrow = currentNotation !== 'chen';

  const bounds = calculateDiagramBounds(diagram);
  const margin = 50;
  const footerHeight = researchMode() ? 34 : 0;
  const minX = bounds.minX - margin;
  const minY = bounds.minY - margin;
  const maxX = bounds.maxX + margin;
  const maxY = bounds.maxY + margin + footerHeight;
  const diagramWidth = maxX - minX;
  const diagramHeight = maxY - minY;

  const exportScale = 2;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = diagramWidth * exportScale;
  exportCanvas.height = diagramHeight * exportScale;

  const ctx = exportCanvas.getContext('2d');
  ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
  ctx.scale(exportScale, exportScale);
  ctx.translate(-minX, -minY);
  ctx.font = `${fontSize}px Poppins`;

  // Attribute connectors
  attributes.forEach((a) => {
    if (isCrow && a.parentType !== 'aggregation') return;
    if (a.parentType === 'attribute') {
      const parent = attributes.find((at) => at.id === a.parentId);
      if (parent && parent.collapsed) return;
    }
    if (a.parentType && a.parentId != null) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      if (a.parentType === 'entity') {
        const e = entities.find((en) => en.id === a.parentId);
        if (e) {
          ctx.beginPath();
          ctx.moveTo(e.x + (e.width || DEFAULT_ENTITY_WIDTH) / 2, e.y + (e.height || DEFAULT_ENTITY_HEIGHT) / 2);
          ctx.lineTo(a.x, a.y);
          ctx.stroke();
        }
      } else if (a.parentType === 'relationship') {
        const r = relationships.find((rr) => rr.id === a.parentId);
        if (r) {
          const size = r.size || r.width || RELATIONSHIP_SIZE;
          const bp = getDiamondBorderPoint(r.x, r.y, size, size, a.x, a.y);
          ctx.beginPath();
          ctx.moveTo(bp.x, bp.y);
          ctx.lineTo(a.x, a.y);
          ctx.stroke();
        }
      } else if (a.parentType === 'attribute') {
        const pA = attributes.find((at) => at.id === a.parentId);
        if (pA) {
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(a.x, a.y);
          ctx.stroke();
        }
      } else if (a.parentType === 'aggregation') {
        const aggr = aggregations.find((ag) => ag.id === a.parentId);
        if (aggr) {
          const half = (aggr.size || aggr.width || RELATIONSHIP_SIZE) / 2;
          const rectSize = half * 1.2;
          const bp = getRectBorderPoint(aggr.x, aggr.y, rectSize * 2, rectSize * 2, a.x, a.y);
          ctx.beginPath();
          ctx.moveTo(bp.x, bp.y);
          ctx.lineTo(a.x, a.y);
          ctx.stroke();
        }
      }
    }
  });

  // Relationship connections
  relationships.forEach((r) => {
    (r.connections || []).forEach((conn) => {
      const geom = relationshipConnectionGeometry(
        r,
        conn,
        entities,
        aggregations,
        attributes,
        currentNotation
      );
      if (!geom) return;
      const { points, side } = geom;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      for (const path of participationPaths(points, conn.weak, currentNotation)) {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }
      if (isCrow) {
        const endP = points[points.length - 1];
        const prevP = points[points.length - 2];
        const angle = Math.atan2(endP.y - prevP.y, endP.x - prevP.x);
        ctx.save();
        ctx.translate(endP.x, endP.y);
        ctx.rotate(angle);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let card;
        try {
          card = parseCardinality(conn.cardinality);
        } catch {
          card = { min: 0, max: 'N' };
        }
        if (isMany(card.max)) {
          ctx.moveTo(0, 0);
          ctx.lineTo(-15, -10);
          ctx.moveTo(0, 0);
          ctx.lineTo(-15, 10);
          ctx.moveTo(0, 0);
          ctx.lineTo(-15, 0);
        } else {
          ctx.moveTo(-10, -10);
          ctx.lineTo(-10, 10);
          ctx.moveTo(0, 0);
          ctx.lineTo(-15, 0);
        }
        if (card.min === 0) {
          ctx.moveTo(-15, 0);
          ctx.arc(-20, 0, 5, 0, Math.PI * 2);
        } else {
          ctx.moveTo(-20, -10);
          ctx.lineTo(-20, 10);
        }
        ctx.stroke();
        ctx.restore();
      }
      const labelPos = relationshipLabelPoint(points, side);
      const text = cardinalityLabel(conn.cardinality);
      ctx.font = `${fontSize}px Poppins`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(text).width + 16;
      const radius = Math.max(textWidth / 2, fontSize / 2) + 8;
      ctx.beginPath();
      ctx.arc(labelPos.x, labelPos.y - 1, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = isCrow ? 'rgba(0,0,0,0.5)' : '#000000';
      ctx.fillText(text, labelPos.x, labelPos.y - 1);
      if (conn.role) {
        ctx.font = `italic ${Math.max(10, fontSize - 2)}px Poppins`;
        ctx.fillStyle = '#666666';
        const rolePos = relationshipRolePoint(
          { x: labelPos.x, y: labelPos.y - 1 },
          radius,
          ctx.measureText(conn.role).width,
          side
        );
        ctx.fillText(conn.role, rolePos.x, rolePos.y);
      }
    });
  });

  // Specialization connections
  specializations.forEach((spec) => {
    (spec.connections || []).forEach((conn, idx) => {
      const e = entities.find((en) => en.id === conn.entityId);
      if (!e) return;
      const vertices = getSpecializationVertices(spec);
      const vertex = vertices[conn.vertex ?? idx] || vertices[0];
      const ew = e.width || DEFAULT_ENTITY_WIDTH;
      const eh = e.height || DEFAULT_ENTITY_HEIGHT;
      const eCenter = { x: e.x + ew / 2, y: e.y + eh / 2 };
      const pts = [vertex];
      if (conn.breakpoints && conn.breakpoints.length > 0) pts.push(...conn.breakpoints);
      const lastPt = pts[pts.length - 1];
      pts.push(getRectBorderPoint(eCenter.x, eCenter.y, ew, eh, lastPt.x, lastPt.y));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    });
  });

  // Aggregations
  aggregations.forEach((agg) => {
    ctx.save();
    ctx.fillStyle = NORMAL_COLORS.aggregation.fill;
    ctx.strokeStyle = NORMAL_COLORS.aggregation.stroke;
    ctx.lineWidth = 2;
    const half = (agg.size || agg.width || RELATIONSHIP_SIZE) / 2;
    const rectSize = half * 1.2;
    ctx.strokeRect(agg.x - rectSize, agg.y - rectSize, rectSize * 2, rectSize * 2);
    ctx.beginPath();
    ctx.moveTo(agg.x, agg.y - half);
    ctx.lineTo(agg.x + half, agg.y);
    ctx.lineTo(agg.x, agg.y + half);
    ctx.lineTo(agg.x - half, agg.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(agg.name || '', agg.x, agg.y);
    ctx.restore();
  });

  // Entities
  entities.forEach((e) => {
    ctx.save();
    ctx.fillStyle = NORMAL_COLORS.entity.fill;
    ctx.strokeStyle = NORMAL_COLORS.entity.stroke;
    ctx.lineWidth = 2;
    const dims = isCrow
      ? getCrowEntityDimensions(e, attributes, relationships, aggregations, fontSize)
      : { width: e.width || DEFAULT_ENTITY_WIDTH, height: e.height || DEFAULT_ENTITY_HEIGHT };
    ctx.beginPath();
    ctx.roundRect(e.x, e.y, dims.width, dims.height, 8);
    ctx.fill();
    ctx.stroke();
    if (!isCrow && isWeakEntity(e.id, [...relationships, ...aggregations])) {
      ctx.beginPath();
      ctx.roundRect(e.x + 5, e.y + 5, dims.width - 10, dims.height - 10, 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!isCrow) {
      ctx.fillText(e.name || '', e.x + dims.width / 2, e.y + dims.height / 2);
    } else {
      const lineHeight = fontSize * 1.2;
      ctx.fillText(e.name || '', e.x + dims.width / 2, e.y + 8 + lineHeight / 2);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + lineHeight + 8);
      ctx.lineTo(e.x + dims.width, e.y + lineHeight + 8);
      ctx.stroke();
      ctx.textAlign = 'left';
      let ty = e.y + lineHeight + 21;
      collectCrowEntityRows(e, attributes).forEach(({ attr: a, indent }) => {
        const isWeakOwner = isAttributeOwnerWeak(a, relationships, aggregations, attributes);
        let prefix =
          a.partialKey || (a.primary && isWeakOwner)
            ? `${t('CP')} `
            : a.primary
              ? 'PK '
              : '';
        if (indent > 0) prefix = '↳ ';
        let label = prefix + (a.name || '');
        if (a.dataType) label += ` : ${t(a.dataType)}`;
        ctx.fillText(label, e.x + 10 + indent * 12, ty);
        ty += lineHeight;
      });
    }
    ctx.restore();
  });

  // Attributes
  attributes.forEach((a) => {
    if (isCrow && a.parentType !== null) return;
    if (a.parentType === 'attribute') {
      const parent = attributes.find((at) => at.id === a.parentId);
      if (parent && parent.collapsed) return;
    }
    ctx.save();
    ctx.strokeStyle = a.derived
      ? NORMAL_COLORS.derived.stroke
      : a.multivalued
        ? NORMAL_COLORS.multivalued.stroke
        : NORMAL_COLORS.attribute.stroke;
    ctx.lineWidth = 2;
    if (a.derived) ctx.setLineDash([4, 2]);
    const keyPres = attributePresentation(
      a,
      isAttributeOwnerWeak(a, relationships, aggregations, attributes)
    );
    ctx.fillStyle = keyPres.filled
      ? a.derived
        ? NORMAL_COLORS.derived.fill
        : NORMAL_COLORS.attribute.fill
      : '#ffffff';
    ctx.beginPath();
    ctx.arc(a.x, a.y, ATTR_CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (a.multivalued) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, ATTR_CIRCLE_RADIUS * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tx = a.x + ATTR_CIRCLE_RADIUS + ATTR_TEXT_PADDING;
    const ty = a.y + ATTR_TEXT_OFFSET_Y;
    ctx.fillText(a.name || '', tx, ty);
    if (keyPres.underline) {
      const tw = ctx.measureText(a.name || '').width;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.setLineDash(keyPres.underline === 'dashed' ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(tx, ty + fontSize * 0.55);
      ctx.lineTo(tx + tw, ty + fontSize * 0.55);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  });

  // Relationships
  relationships.forEach((r) => {
    ctx.save();
    const half = (r.size || r.width || RELATIONSHIP_SIZE) / 2;
    if (!isCrow) {
      ctx.fillStyle = NORMAL_COLORS.relationship.fill;
      ctx.strokeStyle = NORMAL_COLORS.relationship.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - half);
      ctx.lineTo(r.x + half, r.y);
      ctx.lineTo(r.x, r.y + half);
      ctx.lineTo(r.x - half, r.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (isIdentifyingRelationship(r)) {
        const inner = half - 6;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y - inner);
        ctx.lineTo(r.x + inner, r.y);
        ctx.lineTo(r.x, r.y + inner);
        ctx.lineTo(r.x - inner, r.y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.name || '', r.x, r.y);
    } else {
      const { width: pw, height: ph } = getRelationshipPillDimensions(r, fontSize);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(r.x - pw / 2, r.y - ph / 2, pw, ph, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.name || '', r.x, r.y);
    }
    ctx.restore();
  });

  // Specializations
  specializations.forEach((spec) => {
    ctx.save();
    ctx.fillStyle = NORMAL_COLORS.specialization.fill;
    ctx.strokeStyle = NORMAL_COLORS.specialization.stroke;
    ctx.lineWidth = 2;
    const vertices = getSpecializationVertices(spec);
    ctx.beginPath();
    if (spec.genType === 'U') {
      ctx.arc(spec.x, spec.y, (spec.size || DEFAULT_SPECIALIZATION_SIZE) / 2, 0, Math.PI * 2);
    } else {
      ctx.moveTo(vertices[0].x, vertices[0].y);
      ctx.lineTo(vertices[1].x, vertices[1].y);
      ctx.lineTo(vertices[2].x, vertices[2].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayGenType(spec.genType || ''), spec.x, spec.y);
    ctx.restore();
  });

  // Post-its
  postits.forEach((p) => {
    ctx.save();
    ctx.fillStyle = p.color || NORMAL_COLORS.postit.fill;
    ctx.strokeStyle = NORMAL_COLORS.postit.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.width || 200, p.height || 120, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text || '', p.x + (p.width || 200) / 2, p.y + (p.height || 120) / 2);
    ctx.restore();
  });

  drawExportFooter(ctx, minX, maxY);

  return exportCanvas.toDataURL('image/png');
}

export function exportDiagramPNG(diagram) {
  const dataUrl = renderDiagramToPNGDataURL(diagram);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = buildExportFilename('png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportDiagramSVG(diagram) {
  const svgContent = generateDiagramSVG(diagram);
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = buildExportFilename('svg');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showNotification('Exportado como SVG', 'success');
}

export function exportDiagramPDF(diagram) {
  const dataUrl = renderDiagramToPNGDataURL(diagram);
  const w = window.open('', '_blank');
  if (!w) {
    showNotification('Permita pop-ups neste site para exportar em PDF.', 'warning');
    return;
  }
  w.document.write(
    `<html lang="${getLocale()}"><head><title>${t('Diagrama ER')}</title><style>@page{size:A4 landscape;margin:1cm}body{margin:0}img{width:100%;height:auto}</style></head><body></body></html>`
  );
  w.document.close();
  const img = w.document.createElement('img');
  const openPrintDialog = () => {
    w.requestAnimationFrame(() =>
      w.requestAnimationFrame(() => {
        w.focus();
        w.print();
      })
    );
  };
  img.onload = () => {
    if (typeof img.decode === 'function') {
      img.decode().then(openPrintDialog, openPrintDialog);
    } else {
      openPrintDialog();
    }
  };
  img.onerror = () => showNotification('Falha ao gerar a imagem para o PDF.', 'error');
  img.src = dataUrl;
  w.document.body.appendChild(img);
}
