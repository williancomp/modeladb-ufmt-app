import React from 'react';
import {
  ATTR_CIRCLE_RADIUS,
  ATTR_TEXT_PADDING,
  NORMAL_COLORS,
} from '../../domain/constants.js';
import { attributePresentation } from '../../domain/semantics.js';
import {
  renderNodeHandles,
  renderValidationBadge,
  renderLockBadge,
} from './nodeHelpers.js';

const h = React.createElement;

export function AttributeNode({ data }) {
  const {
    element: attr,
    selected,
    isOwnerWeak = false,
    isRelateSource,
    isRelateCandidate,
    hasChildren = false,
    fontSize = 14,
    validationIssue,
    onToggleCollapse,
  } = data;

  const isDerived = Boolean(attr.derived || attr.isDerived);
  const isMulti = Boolean(attr.multivalued || attr.isMultivalued);
  const keyPres = attributePresentation(attr, isOwnerWeak);

  const strokeColor =
    selected || isRelateSource || isRelateCandidate
      ? '#60a5fa'
      : isDerived
        ? NORMAL_COLORS.derived.stroke
        : isMulti
          ? NORMAL_COLORS.multivalued.stroke
          : NORMAL_COLORS.attribute.stroke;
  const strokeWidth = selected || isRelateSource || isRelateCandidate ? 3 : 2;

  const circleFill = keyPres.filled
    ? isDerived
      ? NORMAL_COLORS.derived.fill
      : NORMAL_COLORS.attribute.fill
    : '#ffffff';

  const r = ATTR_CIRCLE_RADIUS; // 12
  const boxSize = r * 2; // 24

  return h(
    'div',
    {
      className: 'er-node er-attribute-node',
      'data-element-type': 'attribute',
      'data-element-id': String(attr.id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        height: boxSize,
        minWidth: boxSize,
        position: 'relative',
        userSelect: 'none',
        paddingRight: 6,
      },
    },
    renderNodeHandles(),
    h(
      'svg',
      {
        width: boxSize,
        height: boxSize,
        viewBox: `0 0 ${boxSize} ${boxSize}`,
        style: {
          flexShrink: 0,
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        },
      },
      h('circle', {
        cx: r,
        cy: r,
        r,
        fill: circleFill,
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: isDerived ? '4,2' : undefined,
      }),
      isMulti
        ? h('circle', {
            cx: r,
            cy: r,
            r: r * 0.7,
            fill: 'none',
            stroke: strokeColor,
            strokeWidth,
            strokeDasharray: isDerived ? '4,2' : undefined,
          })
        : null,
      hasChildren
        ? h('circle', {
            cx: r * 2 + 6,
            cy: 6,
            r: 4,
            fill: attr.collapsed ? '#ef4444' : '#10b981',
            style: { cursor: 'pointer' },
            onClick: (e) => {
              e.stopPropagation();
              if (onToggleCollapse) onToggleCollapse(attr);
            },
          })
        : null
    ),
    h(
      'div',
      {
        style: {
          marginLeft: ATTR_TEXT_PADDING,
          display: 'inline-flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          fontFamily: 'Poppins, sans-serif',
          fontSize,
          fontWeight: 400,
          color: '#000000',
          lineHeight: 1.2,
        },
      },
      h(
        'span',
        {
          style: {
            borderBottom:
              keyPres.underline === 'solid'
                ? '1.5px solid #000000'
                : keyPres.underline === 'dashed'
                  ? '1.5px dashed #000000'
                  : 'none',
            paddingBottom: 1,
          },
        },
        attr.name || ''
      )
    ),
    renderLockBadge(attr.locked, { left: -6, top: -6 }),
    renderValidationBadge(validationIssue, 'attribute', attr.id, {
      left: r * 2 - 9,
      top: r - 9,
    })
  );
}
