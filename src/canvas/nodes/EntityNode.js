import React from 'react';
import {
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  NORMAL_COLORS,
} from '../../domain/constants.js';
import { t } from '../../i18n/index.js';
import {
  collectCrowEntityRows,
  getCrowEntityDimensions,
  isAttributeOwnerWeak,
} from '../geometry.js';
import {
  renderNodeHandles,
  renderValidationBadge,
  renderLockBadge,
  renderResizeHandle,
} from './nodeHelpers.js';

const h = React.createElement;

export function EntityNode({ data }) {
  const {
    element: entity,
    selected,
    isWeak,
    isRelateSource,
    isRelateCandidate,
    currentNotation = 'chen',
    fontSize = 14,
    attributes = [],
    relationships = [],
    aggregations = [],
    validationIssue,
    onResizeStart,
    onInlineAttributeClick,
    onInlineAttributeContextMenu,
    onInlineAttributeDoubleClick,
    onInlineAttributeDelete,
  } = data;

  const isCrow = currentNotation !== 'chen';
  const fill = NORMAL_COLORS.entity.fill;
  const strokeColor =
    selected || isRelateSource || isRelateCandidate
      ? '#60a5fa'
      : NORMAL_COLORS.entity.stroke;
  const strokeWidth = selected || isRelateSource || isRelateCandidate ? 3 : 2;

  if (!isCrow) {
    const w = entity.width || DEFAULT_ENTITY_WIDTH;
    const hgt = entity.height || DEFAULT_ENTITY_HEIGHT;
    const isDouble = Boolean(isWeak || entity.isWeak || entity.isAssociative);

    return h(
      'div',
      {
        className: 'er-node er-entity-node',
        'data-element-type': 'entity',
        'data-element-id': String(entity.id),
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
          rx: 8,
          ry: 8,
          fill,
          stroke: strokeColor,
          strokeWidth,
        }),
        isDouble
          ? h('rect', {
              x: 5,
              y: 5,
              width: Math.max(w - 10, 4),
              height: Math.max(hgt - 10, 4),
              rx: 4,
              ry: 4,
              fill: 'none',
              stroke: strokeColor,
              strokeWidth: 2,
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
          entity.name || ''
        )
      ),
      renderLockBadge(entity.locked, { left: 6, top: 6 }),
      renderValidationBadge(validationIssue, 'entity', entity.id, {
        right: -9,
        top: -9,
      }),
      renderResizeHandle(selected && !entity.locked, onResizeStart)
    );
  }

  // Crow's Foot (IE) table-style entity
  const { width: w, height: hgt } = getCrowEntityDimensions(
    entity,
    attributes,
    relationships,
    aggregations,
    fontSize
  );
  entity.width = w;
  entity.height = hgt;

  const lineHeight = fontSize * 1.2;
  const margin = 16;
  const headerH = lineHeight + margin / 2;
  const deleteColW = 22;
  const rows = collectCrowEntityRows(entity, attributes);

  rows.forEach(({ attr: a }, idx) => {
    const ty = entity.y + headerH + margin / 2 + 5 + idx * lineHeight;
    a.hitBox = {
      x: entity.x,
      y: ty - lineHeight / 2,
      width: w - deleteColW,
      height: lineHeight,
    };
    a.deleteBox = {
      x: entity.x + w - deleteColW,
      y: ty - lineHeight / 2,
      width: deleteColW,
      height: lineHeight,
    };
  });

  return h(
    'div',
    {
      className: 'er-node er-entity-node er-entity-crow',
      'data-element-type': 'entity',
      'data-element-id': String(entity.id),
      style: {
        width: w,
        minHeight: hgt,
        backgroundColor: fill,
        border: `${strokeWidth}px solid ${strokeColor}`,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        position: 'relative',
        userSelect: 'none',
        fontFamily: 'Poppins, sans-serif',
        color: '#ffffff',
      },
    },
    renderNodeHandles(),
    h(
      'div',
      {
        style: {
          height: headerH,
          borderBottom: `2px solid ${strokeColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 500,
          fontSize,
          color: '#ffffff',
          padding: '0 8px',
        },
      },
      entity.name || ''
    ),
    h(
      'div',
      {
        style: {
          padding: '4px 0',
        },
      },
      rows.map(({ attr: a, indent }) => {
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

        return h(
          'div',
          {
            key: a.id,
            className: 'crow-attr-row nodrag',
            'data-element-type': 'attribute',
            'data-element-id': String(a.id),
            onClick: (e) => {
              e.stopPropagation();
              if (onInlineAttributeClick) onInlineAttributeClick(a, e);
            },
            onContextMenu: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onInlineAttributeContextMenu) onInlineAttributeContextMenu(a, e);
            },
            onDoubleClick: (e) => {
              e.stopPropagation();
              if (onInlineAttributeDoubleClick) onInlineAttributeDoubleClick(a, e);
            },
            style: {
              height: lineHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 10 + indent * 12,
              paddingRight: 4,
              fontSize,
              fontWeight: a.primary ? 700 : 400,
              cursor: 'pointer',
              color: '#ffffff',
            },
          },
          h('span', { style: { whiteSpace: 'nowrap' } }, label),
          h(
            'button',
            {
              type: 'button',
              className: 'crow-attr-delete nodrag',
              title: t('Deletar'),
              onClick: (e) => {
                e.stopPropagation();
                if (onInlineAttributeDelete) onInlineAttributeDelete(a);
              },
              style: {
                border: 'none',
                background: 'transparent',
                color: 'rgba(255,255,255,0.45)',
                fontSize,
                cursor: 'pointer',
                width: deleteColW,
                textAlign: 'center',
                padding: 0,
                lineHeight: 1,
              },
            },
            '×'
          )
        );
      })
    ),
    renderLockBadge(entity.locked, { left: 6, top: 6 }),
    renderValidationBadge(validationIssue, 'entity', entity.id, {
      right: -9,
      top: -9,
    }),
    renderResizeHandle(selected && !entity.locked, onResizeStart)
  );
}
