import React from 'react';
import { Handle, Position } from '@xyflow/react';

const h = React.createElement;

export function renderNodeHandles() {
  const hiddenStyle = {
    opacity: 0,
    width: 8,
    height: 8,
    pointerEvents: 'none',
    border: 'none',
    background: 'transparent',
  };
  return h(
    React.Fragment,
    null,
    h(Handle, {
      type: 'source',
      position: Position.Top,
      id: 'source',
      style: { ...hiddenStyle, top: '50%', left: '50%' },
    }),
    h(Handle, {
      type: 'target',
      position: Position.Bottom,
      id: 'target',
      style: { ...hiddenStyle, top: '50%', left: '50%' },
    })
  );
}

export function renderValidationBadge(issue, type, id, stylePos = {}) {
  if (!issue) return null;
  const isError = issue.severity === 'error';
  const bg = isError ? '#ef4444' : '#f59e0b';
  return h(
    'div',
    {
      className: 'validation-badge nodrag',
      'data-severity': issue.severity,
      'data-element-type': type,
      'data-element-id': String(id),
      title: issue.message || issue.code || '',
      style: {
        position: 'absolute',
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: bg,
        border: '1.5px solid #ffffff',
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 700,
        fontFamily: 'Poppins, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        zIndex: 20,
        pointerEvents: 'auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        ...stylePos,
      },
    },
    '!'
  );
}

export function renderLockBadge(locked, stylePos = { left: 4, top: 4 }) {
  if (!locked) return null;
  return h(
    'div',
    {
      className: 'lock-badge',
      style: {
        position: 'absolute',
        fontSize: '10px',
        lineHeight: 1,
        zIndex: 15,
        pointerEvents: 'none',
        ...stylePos,
      },
    },
    '🔒'
  );
}

export function renderResizeHandle(visible, onResizePointerDown) {
  if (!visible || !onResizePointerDown) return null;
  return h('div', {
    className: 'resize-handle nodrag nopan',
    'data-testid': 'resize-handle',
    onPointerDown: (e) => {
      e.stopPropagation();
      onResizePointerDown(e);
    },
    style: {
      position: 'absolute',
      right: -5,
      bottom: -5,
      width: 10,
      height: 10,
      backgroundColor: '#4f46e5',
      border: '1.5px solid #ffffff',
      borderRadius: 2,
      cursor: 'nwse-resize',
      zIndex: 25,
    },
  });
}
