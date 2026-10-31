import React from 'react';
import {
  RELATIONSHIP_SIZE,
  NORMAL_COLORS,
} from '../../domain/constants.js';
import {
  renderNodeHandles,
  renderValidationBadge,
  renderLockBadge,
  renderResizeHandle,
} from './nodeHelpers.js';

const h = React.createElement;

export function AggregationNode({ data }) {
  const {
    element: agg,
    selected,
    isWeak,
    isRelateSource,
    isRelateCandidate,
    fontSize = 14,
    validationIssue,
    onResizeStart,
  } = data;

  const size = agg.size || agg.width || RELATIONSHIP_SIZE;
  const half = size / 2;
  const rectSize = half * 1.2;
  const w = agg.width || rectSize * 2;
  const hgt = agg.height || rectSize * 2;

  const fill = NORMAL_COLORS.aggregation.fill;
  const strokeColor =
    selected || isRelateSource || isRelateCandidate
      ? '#60a5fa'
      : NORMAL_COLORS.aggregation.stroke;
  const strokeWidth = selected || isRelateSource || isRelateCandidate ? 3 : 2;

  const cx = w / 2;
  const cy = hgt / 2;
  const diamondPoints = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
  const innerHalf = half - 6;
  const innerDiamondPoints = `${cx},${cy - innerHalf} ${cx + innerHalf},${cy} ${cx},${cy + innerHalf} ${cx - innerHalf},${cy}`;

  return h(
    'div',
    {
      className: 'er-node er-aggregation-node',
      'data-element-type': 'aggregation',
      'data-element-id': String(agg.id),
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
      h('rect', {
        x: 1,
        y: 1,
        width: w - 2,
        height: hgt - 2,
        fill: 'none',
        stroke: strokeColor,
        strokeWidth,
      }),
      h('polygon', {
        points: diamondPoints,
        fill,
        stroke: strokeColor,
        strokeWidth,
        strokeLinejoin: 'round',
      }),
      isWeak
        ? h('polygon', {
            points: innerDiamondPoints,
            fill: 'none',
            stroke: strokeColor,
            strokeWidth: 2,
            strokeLinejoin: 'round',
          })
        : null,
      h(
        'text',
        {
          x: cx,
          y: cy,
          textAnchor: 'middle',
          dominantBaseline: 'central',
          fill: '#ffffff',
          fontFamily: 'Poppins, sans-serif',
          fontWeight: 500,
          fontSize,
        },
        agg.name || ''
      )
    ),
    renderLockBadge(agg.locked, { left: 6, top: 6 }),
    renderValidationBadge(validationIssue, 'aggregation', agg.id, {
      right: -9,
      top: hgt / 2 - 9,
    }),
    renderResizeHandle(selected && !agg.locked, onResizeStart)
  );
}
