import React from 'react';
import {
  RELATIONSHIP_SIZE,
  NORMAL_COLORS,
} from '../../domain/constants.js';
import { getRelationshipPillDimensions } from '../geometry.js';
import {
  renderNodeHandles,
  renderValidationBadge,
  renderLockBadge,
  renderResizeHandle,
} from './nodeHelpers.js';

const h = React.createElement;

export function RelationshipNode({ data }) {
  const {
    element: rel,
    selected,
    isWeak,
    isRelateSource,
    isRelateCandidate,
    currentNotation = 'chen',
    fontSize = 14,
    validationIssue,
    onResizeStart,
  } = data;

  const isCrow = currentNotation !== 'chen';
  const size = rel.size || rel.width || RELATIONSHIP_SIZE;
  const w = rel.width || size;
  const hgt = rel.height || size;

  if (isCrow) {
    const { width: pillW, height: pillH } = getRelationshipPillDimensions(rel, fontSize);
    const strokeColor = selected || isRelateSource ? '#60a5fa' : '#d1d5db';
    return h(
      'div',
      {
        className: 'er-node er-relationship-node er-relationship-crow',
        'data-element-type': 'relationship',
        'data-element-id': String(rel.id),
        style: {
          width: w,
          height: hgt,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          userSelect: 'none',
        },
      },
      renderNodeHandles(),
      h(
        'svg',
        {
          width: pillW,
          height: pillH,
          viewBox: `0 0 ${pillW} ${pillH}`,
          style: { overflow: 'visible' },
        },
        h('rect', {
          x: 0.5,
          y: 0.5,
          width: pillW - 1,
          height: pillH - 1,
          rx: 12,
          ry: 12,
          fill: selected ? '#f0fdf4' : '#ffffff',
          stroke: strokeColor,
          strokeWidth: 1,
        }),
        h(
          'text',
          {
            x: pillW / 2,
            y: pillH / 2,
            textAnchor: 'middle',
            dominantBaseline: 'central',
            fill: '#374151',
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 400,
            fontSize,
          },
          rel.name || ''
        )
      ),
      renderLockBadge(rel.locked, { left: 4, top: 4 }),
      renderValidationBadge(validationIssue, 'relationship', rel.id, {
        right: -9,
        top: hgt / 2 - 9,
      })
    );
  }

  const fill = NORMAL_COLORS.relationship.fill;
  const strokeColor =
    selected || isRelateSource || isRelateCandidate
      ? '#60a5fa'
      : NORMAL_COLORS.relationship.stroke;
  const strokeWidth = selected || isRelateSource || isRelateCandidate ? 3 : 2;
  const isDouble = Boolean(isWeak || rel.isWeak || rel.isAssociative);

  const outerPoints = `${w / 2},1 ${w - 1},${hgt / 2} ${w / 2},${hgt - 1} 1,${hgt / 2}`;
  const inset = 6;
  const innerPoints = `${w / 2},${inset} ${w - inset},${hgt / 2} ${w / 2},${hgt - inset} ${inset},${hgt / 2}`;

  return h(
    'div',
    {
      className: 'er-node er-relationship-node',
      'data-element-type': 'relationship',
      'data-element-id': String(rel.id),
      style: {
        width: w,
        height: hgt,
        position: 'relative',
        userSelect: 'none',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
      },
    },
    renderNodeHandles(),
    h(
      'svg',
      {
        width: w,
        height: hgt,
        viewBox: `0 0 ${w} ${hgt}`,
        style: { display: 'block', overflow: 'visible' },
      },
      h('polygon', {
        points: outerPoints,
        fill,
        stroke: strokeColor,
        strokeWidth,
        strokeLinejoin: 'round',
      }),
      isDouble
        ? h('polygon', {
            points: innerPoints,
            fill: 'none',
            stroke: strokeColor,
            strokeWidth: 2,
            strokeLinejoin: 'round',
          })
        : null,
      h(
        'text',
        {
          x: w / 2,
          y: hgt / 2,
          textAnchor: 'middle',
          dominantBaseline: 'central',
          fill: '#ffffff',
          fontFamily: 'Poppins, sans-serif',
          fontWeight: 500,
          fontSize,
        },
        rel.name || ''
      )
    ),
    renderLockBadge(rel.locked, { left: w / 2 - 6, top: 2 }),
    renderValidationBadge(validationIssue, 'relationship', rel.id, {
      right: -9,
      top: hgt / 2 - 9,
    }),
    renderResizeHandle(selected && !rel.locked, onResizeStart)
  );
}
