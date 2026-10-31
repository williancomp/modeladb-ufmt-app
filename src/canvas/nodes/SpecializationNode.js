import React from 'react';
import {
  DEFAULT_SPECIALIZATION_SIZE,
  NORMAL_COLORS,
} from '../../domain/constants.js';
import {
  renderNodeHandles,
  renderValidationBadge,
  renderLockBadge,
  renderResizeHandle,
} from './nodeHelpers.js';

const h = React.createElement;

export function SpecializationNode({ data }) {
  const {
    element: spec,
    selected,
    isRelateSource,
    isRelateCandidate,
    fontSize = 14,
    validationIssue,
    onResizeStart,
  } = data;

  const size = spec.size || spec.width || DEFAULT_SPECIALIZATION_SIZE;
  const w = spec.width || size;
  const hgt = spec.height || size;
  const isUnion = spec.genType === 'U';
  const fill = NORMAL_COLORS.specialization.fill;
  const strokeColor =
    selected || isRelateSource || isRelateCandidate
      ? '#60a5fa'
      : NORMAL_COLORS.specialization.stroke;
  const strokeWidth = selected || isRelateSource || isRelateCandidate ? 3 : 2;

  return h(
    'div',
    {
      className: 'er-node er-specialization-node',
      'data-element-type': 'specialization',
      'data-element-id': String(spec.id),
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
      isUnion
        ? h('circle', {
            cx: w / 2,
            cy: hgt / 2,
            r: Math.min(w, hgt) / 2 - 1,
            fill,
            stroke: strokeColor,
            strokeWidth,
          })
        : h('polygon', {
            points: `${w / 2},1 1,${hgt - 1} ${w - 1},${hgt - 1}`,
            fill,
            stroke: strokeColor,
            strokeWidth,
            strokeLinejoin: 'round',
          }),
      h(
        'text',
        {
          x: w / 2,
          y: isUnion ? hgt / 2 : hgt * 0.62,
          textAnchor: 'middle',
          dominantBaseline: 'central',
          fill: '#ffffff',
          fontFamily: 'Poppins, sans-serif',
          fontWeight: 500,
          fontSize,
        },
        spec.genType || 'T,C'
      )
    ),
    renderLockBadge(spec.locked, { left: 2, top: 2 }),
    renderValidationBadge(validationIssue, 'specialization', spec.id, {
      right: -9,
      top: hgt / 2 - 9,
    }),
    renderResizeHandle(selected && !spec.locked, onResizeStart)
  );
}
