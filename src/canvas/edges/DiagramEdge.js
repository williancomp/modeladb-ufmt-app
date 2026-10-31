import React from 'react';
import {
  participationPaths,
  relationshipLabelPoint,
  relationshipRolePoint,
  cardinalityLabel,
} from '../geometry.js';
import { parseCardinality, isMany } from '../../domain/semantics.js';

const h = React.createElement;

function pointsToSvgPath(pts) {
  if (!pts || pts.length < 2) return '';
  return pts
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
}

function renderCrowsFootMarker(endPoint, prevPoint, cardinality) {
  if (!endPoint || !prevPoint) return null;
  const angle = (Math.atan2(endPoint.y - prevPoint.y, endPoint.x - prevPoint.x) * 180) / Math.PI;
  let card;
  try {
    card = parseCardinality(cardinality);
  } catch {
    card = { min: 0, max: 'N' };
  }
  const many = isMany(card.max);
  const isOptional = card.min === 0;

  return h(
    'g',
    {
      className: 'crows-foot-marker',
      transform: `translate(${endPoint.x}, ${endPoint.y}) rotate(${angle})`,
      style: { pointerEvents: 'none' },
    },
    many
      ? h(
          React.Fragment,
          null,
          h('line', {
            x1: 0,
            y1: 0,
            x2: -15,
            y2: -10,
            stroke: '#000000',
            strokeWidth: 2,
          }),
          h('line', {
            x1: 0,
            y1: 0,
            x2: -15,
            y2: 10,
            stroke: '#000000',
            strokeWidth: 2,
          }),
          h('line', {
            x1: 0,
            y1: 0,
            x2: -15,
            y2: 0,
            stroke: '#000000',
            strokeWidth: 2,
          })
        )
      : h(
          React.Fragment,
          null,
          h('line', {
            x1: -10,
            y1: -10,
            x2: -10,
            y2: 10,
            stroke: '#000000',
            strokeWidth: 2,
          }),
          h('line', {
            x1: 0,
            y1: 0,
            x2: -15,
            y2: 0,
            stroke: '#000000',
            strokeWidth: 2,
          })
        ),
    isOptional
      ? h('circle', {
          cx: -20,
          cy: 0,
          r: 5,
          fill: '#ffffff',
          stroke: '#000000',
          strokeWidth: 2,
        })
      : h('line', {
          x1: -20,
          y1: -10,
          x2: -20,
          y2: 10,
          stroke: '#000000',
          strokeWidth: 2,
        })
  );
}

export function DiagramEdge({ id, data }) {
  if (!data || !data.points || data.points.length < 2) return null;

  const {
    kind,
    points,
    side = 0,
    conn,
    rel,
    selected,
    currentNotation = 'chen',
    fontSize = 14,
    onEdgeClick,
    onEdgeContextMenu,
    onEdgeDoubleClick,
    onCardinalityDoubleClick,
    onBreakpointPointerDown,
    onBreakpointDoubleClick,
  } = data;

  const isCrow = currentNotation === 'crow' || currentNotation !== 'chen';
  const isWeak = Boolean(kind === 'relationship' && conn && conn.weak);
  const strokeWidth = selected ? 4 : 2;

  const pathList =
    kind === 'relationship'
      ? participationPaths(points, isWeak, currentNotation)
      : [points];
  const hitPath = pointsToSvgPath(points);

  const labelPos =
    kind === 'relationship' && rel && conn
      ? relationshipLabelPoint(points, side)
      : null;

  const text = conn ? cardinalityLabel(conn.cardinality) : '';
  const textWidth = text.length * (fontSize * 0.58) + 16;
  const radius = Math.max(textWidth / 2, fontSize / 2) + 8;
  const textCenterX = labelPos ? labelPos.x : 0;
  const textCenterY = labelPos ? labelPos.y - 1 : 0;

  const roleSize = Math.max(10, fontSize - 2);
  const roleWidth = conn && conn.role ? conn.role.length * (roleSize * 0.55) : 0;
  const rolePos =
    kind === 'relationship' && labelPos && conn && conn.role
      ? relationshipRolePoint({ x: textCenterX, y: textCenterY }, radius, roleWidth, side)
      : null;

  const breakpoints = points.slice(1, -1);

  return h(
    'g',
    {
      className: `er-edge er-edge-${kind}${isWeak ? ' er-edge-weak' : ''}`,
      'data-edge-id': id,
      'data-edge-kind': kind,
      'data-weak': isWeak ? 'true' : 'false',
      style: { pointerEvents: 'all' },
    },
    h('path', {
      d: hitPath,
      fill: 'none',
      stroke: 'transparent',
      strokeWidth: 16,
      className: 'react-flow__edge-interaction',
      style: { cursor: 'pointer', pointerEvents: 'stroke' },
      onClick: (e) => {
        e.stopPropagation();
        if (onEdgeClick) onEdgeClick(e, data);
      },
      onContextMenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onEdgeContextMenu) onEdgeContextMenu(e, data);
      },
      onDoubleClick: (e) => {
        e.stopPropagation();
        if (onEdgeDoubleClick) onEdgeDoubleClick(e, data);
      },
    }),
    pathList.map((pts, idx) =>
      h('path', {
        key: idx,
        d: pointsToSvgPath(pts),
        fill: 'none',
        stroke: '#000000',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: 'er-edge-line',
        style: { pointerEvents: 'none' },
      })
    ),
    kind === 'relationship' && isCrow && conn
      ? renderCrowsFootMarker(
          points[points.length - 1],
          points[points.length - 2],
          conn.cardinality
        )
      : null,
    kind === 'relationship' && labelPos && conn
      ? h(
          'g',
          {
            className: 'er-cardinality-pill',
            'data-testid': `cardinality-${rel.id}-${conn.entityId}`,
            transform: `translate(${textCenterX}, ${textCenterY})`,
            style: { cursor: 'pointer', pointerEvents: 'all' },
            onClick: (e) => {
              e.stopPropagation();
              if (e.detail >= 2) {
                if (onCardinalityDoubleClick) {
                  onCardinalityDoubleClick(e, data, { x: textCenterX, y: textCenterY });
                }
                return;
              }
              if (onEdgeClick) onEdgeClick(e, data);
            },
            onContextMenu: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onEdgeContextMenu) onEdgeContextMenu(e, data);
            },
            onDoubleClick: (e) => {
              e.stopPropagation();
              if (onCardinalityDoubleClick) {
                onCardinalityDoubleClick(e, data, { x: textCenterX, y: textCenterY });
              }
            },
          },
          h('circle', {
            cx: 0,
            cy: 0,
            r: radius,
            fill: '#ffffff',
          }),
          h(
            'text',
            {
              x: 0,
              y: 0,
              textAnchor: 'middle',
              dominantBaseline: 'central',
              fill: isCrow ? 'rgba(0,0,0,0.5)' : '#000000',
              fontFamily: 'Poppins, sans-serif',
              fontSize,
            },
            text
          )
        )
      : null,
    kind === 'relationship' && rolePos && conn && conn.role
      ? h(
          'text',
          {
            className: 'er-role-label',
            x: rolePos.x,
            y: rolePos.y,
            textAnchor: 'middle',
            dominantBaseline: 'central',
            fill: '#666666',
            fontFamily: 'Poppins, sans-serif',
            fontStyle: 'italic',
            fontSize: roleSize,
            style: { pointerEvents: 'none' },
          },
          conn.role
        )
      : null,
    breakpoints.map((bp, bpIdx) =>
      h('circle', {
        key: bpIdx,
        cx: bp.x,
        cy: bp.y,
        r: 5,
        fill: '#000000',
        className: 'er-breakpoint nodrag nopan',
        style: { cursor: 'move', pointerEvents: 'all' },
        onPointerDown: (e) => {
          e.stopPropagation();
          if (onBreakpointPointerDown) onBreakpointPointerDown(e, data, bpIdx);
        },
        onDoubleClick: (e) => {
          e.stopPropagation();
          if (onBreakpointDoubleClick) onBreakpointDoubleClick(e, data, bpIdx);
        },
      })
    )
  );
}
