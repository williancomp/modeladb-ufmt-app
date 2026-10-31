import React from 'react';
import { NORMAL_COLORS } from '../../domain/constants.js';
import {
  renderLockBadge,
  renderResizeHandle,
} from './nodeHelpers.js';

const h = React.createElement;

export function PostitNode({ data }) {
  const { element: postit, selected, fontSize = 14, onResizeStart } = data;
  const w = postit.width || 200;
  const hgt = postit.height || 120;
  const bg = postit.color || NORMAL_COLORS.postit.fill;
  const strokeColor = selected ? '#60a5fa' : NORMAL_COLORS.postit.stroke;

  return h(
    'div',
    {
      className: 'er-node er-postit-node',
      'data-element-type': 'postit',
      'data-element-id': String(postit.id),
      style: {
        width: w,
        height: hgt,
        position: 'relative',
        userSelect: 'none',
        backgroundColor: bg,
        border: `${selected ? 3 : 1}px solid ${strokeColor}`,
        borderRadius: 8,
        boxShadow: '2px 2px 5px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        boxSizing: 'border-box',
      },
    },
    h(
      'div',
      {
        style: {
          fontFamily: 'Poppins, sans-serif',
          fontSize,
          color: '#000000',
          lineHeight: 1.25,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textAlign: 'left',
          overflow: 'hidden',
          maxHeight: hgt - 16,
        },
      },
      postit.text || ''
    ),
    renderLockBadge(postit.locked, { left: 4, top: 4 }),
    renderResizeHandle(selected && !postit.locked, onResizeStart)
  );
}
