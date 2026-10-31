import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  ATTR_CIRCLE_RADIUS,
  ATTR_TEXT_PADDING,
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  RELATIONSHIP_SIZE,
  DEFAULT_SPECIALIZATION_SIZE,
} from '../domain/constants.js';
import { diagram } from '../domain/state.js';
import * as operations from '../domain/operations.js';
import { isIdentifyingRelationship, isWeakEntity } from '../domain/semantics.js';
import { trackPointerDrag } from './pointerDrag.js';
import { EntityNode } from './nodes/EntityNode.js';
import { RelationshipNode } from './nodes/RelationshipNode.js';
import { AttributeNode } from './nodes/AttributeNode.js';
import { SpecializationNode } from './nodes/SpecializationNode.js';
import { AggregationNode } from './nodes/AggregationNode.js';
import { PostitNode } from './nodes/PostitNode.js';
import { DiagramEdge } from './edges/DiagramEdge.js';
import {
  distanceToSegment,
  getAggregationConnectionPoints,
  getAttributeConnectionPoints,
  getCrowEntityDimensions,
  getSpecializationConnectionPoints,
  isAttributeOwnerWeak,
  relationshipConnectionGeometry,
  updateRelationshipConnectionRects,
} from './geometry.js';
import {
  closeInlineEditors,
  closeSubmenu,
  showAggregationConnectionSubmenu,
  showCardinalityEditor,
  showConnectionSubmenu,
  showInlineEditor,
  showPostitEditor,
  showSpecConnectionSubmenu,
  showSpecTypeEditor,
  showSubmenu,
} from './menus.js';

const h = React.createElement;

const nodeTypes = {
  entity: EntityNode,
  relationship: RelationshipNode,
  attribute: AttributeNode,
  specialization: SpecializationNode,
  aggregation: AggregationNode,
  postit: PostitNode,
};

const edgeTypes = {
  erEdge: DiagramEdge,
};

export function clientToWorld(clientX, clientY) {
  const canvasEl = document.getElementById('canvas');
  const rect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52 };
  return {
    x: (clientX - rect.left) / diagram.zoom - diagram.panOffset.x,
    y: (clientY - rect.top) / diagram.zoom - diagram.panOffset.y,
  };
}

/**
 * The diagram element under a world point, found through the DOM (the browser already knows which
 * node is on top) instead of re-implementing every shape's bounds.
 */
export function findDraggableAtWorld(x, y) {
  const frame = document.getElementById('canvas')?.getBoundingClientRect();
  if (!frame) return null;
  const px = frame.left + (x + diagram.panOffset.x) * diagram.zoom;
  const py = frame.top + (y + diagram.panOffset.y) * diagram.zoom;
  for (const el of document.elementsFromPoint(px, py)) {
    const node = el.closest?.('.react-flow__node');
    if (!node) continue;
    const holder = node.querySelector('[data-element-type]');
    const type = holder?.getAttribute('data-element-type');
    const id = holder?.getAttribute('data-element-id');
    const pool = {
      entity: diagram.entities,
      attribute: diagram.attributes,
      relationship: diagram.relationships,
      specialization: diagram.specializations,
      aggregation: diagram.aggregations,
      postit: diagram.postits,
    }[type];
    const element = pool?.find((o) => String(o.id) === id);
    if (!element) continue;
    return {
      type: type === 'attribute' ? (element.derived ? 'derivedAttribute' : element.multivalued ? 'multivaluedAttribute' : 'attribute') : type,
      element,
    };
  }
  return null;
}

function DiagramSurfaceInner({ appCallbacks, registerRefresh }) {
  const [, setTick] = useState(0);
  // Touch pans with one finger; a mouse drags a marquee (pan: Space+drag, middle or right button).
  const [isTouch, setIsTouch] = useState(false);
  const marqueeActiveRef = useRef(false);
  const dragInitialPositionsRef = useRef(null);
  const pointerDownInfoRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const lastTapInfoRef = useRef(null);

  // The node and edge arrays are rebuilt only when something other than the viewport changed: a wheel
  // notch or a pan re-renders the surface with the cached arrays, so React Flow and the node
  // components do not re-render per element.
  const dirtyRef = useRef(true);
  const graphCacheRef = useRef(null);

  const triggerRender = useCallback(() => {
    dirtyRef.current = true;
    setTick((t) => t + 1);
  }, []);

  // Nodes are rebuilt from the diagram on every render; without their last measured size React Flow
  // hides them (visibility:hidden) until its ResizeObserver runs again, so a click right after a
  // re-render would fall through to the pane.
  const measuredRef = useRef({});
  const nodeElementsRef = useRef({});
  const onNodesChange = useCallback((changes) => {
    let changed = false;
    for (const c of changes) {
      if (c.type === 'select' && marqueeActiveRef.current) {
        const el = nodeElementsRef.current[c.id];
        if (el && Boolean(el.selected) !== c.selected) {
          el.selected = c.selected;
          changed = true;
        }
        continue;
      }
      if (c.type !== 'dimensions' || !c.dimensions) continue;
      const prev = measuredRef.current[c.id];
      if (prev?.width === c.dimensions.width && prev?.height === c.dimensions.height) continue;
      measuredRef.current[c.id] = c.dimensions;
      changed = true;
    }
    if (changed) triggerRender();
  }, [triggerRender]);

  useEffect(() => {
    registerRefresh(() => {
      dirtyRef.current = true;
      try {
        flushSync(() => {
          setTick((t) => t + 1);
        });
      } catch {
        setTick((t) => t + 1);
      }
    });
  }, [registerRefresh]);

  const currentNotation = appCallbacks.getCurrentNotation();
  const currentViolations = appCallbacks.getCurrentViolations();
  const fontSize = diagram.fontSize || 14;

  // Map violations by elementType:elementId
  const violationMap = {};
  currentViolations.forEach((v) => {
    const key = `${v.elementType}:${v.elementId}`;
    const rank = { error: 0, warning: 1, info: 2 };
    if (!violationMap[key] || (rank[v.severity] ?? 3) < (rank[violationMap[key].severity] ?? 3)) {
      violationMap[key] = v;
    }
  });

  const menuCallbacks = {
    getCurrentNotation: appCallbacks.getCurrentNotation,
    saveState: appCallbacks.saveState,
    clearSelection: operations.clearSelection,
    draw: appCallbacks.draw,
    startClickRelationMode: appCallbacks.startClickRelationMode,
    startRelationDragFromMenu: appCallbacks.startRelationDragFromMenu,
  };

  const startResize = (element, kind, evt) => {
    if (element.locked) return;
    closeSubmenu();
    const startWorld = clientToWorld(evt.clientX, evt.clientY);
    const initW = element.width || DEFAULT_ENTITY_WIDTH;
    const initH = element.height || DEFAULT_ENTITY_HEIGHT;
    const initSize = element.size || RELATIONSHIP_SIZE;
    const raw = { width: element.width, height: element.height, size: element.size };
    const initPreW = element._preCrowWidth;
    const initPreH = element._preCrowHeight;

    const restore = () => {
      Object.assign(element, raw);
      if (element._preCrowWidth !== undefined) {
        element._preCrowWidth = initPreW;
        element._preCrowHeight = initPreH;
      }
    };
    const changed = () =>
      element.width !== raw.width || element.height !== raw.height || element.size !== raw.size;

    trackPointerDrag({
      onMove: (moveEvt) => {
        const curWorld = clientToWorld(moveEvt.clientX, moveEvt.clientY);
        const dx = curWorld.x - startWorld.x;
        const dy = curWorld.y - startWorld.y;
        if (kind === 'rect') {
          element.width = Math.max(80, Math.round(initW + dx));
          element.height = Math.max(40, Math.round(initH + dy));
          if (element._preCrowWidth !== undefined) {
            element._preCrowWidth = element.width;
            element._preCrowHeight = element.height;
          }
        } else {
          const delta = Math.max(dx, dy);
          element.size = Math.max(50, Math.round(initSize + delta));
        }
        appCallbacks.draw();
      },
      onEnd: () => {
        // A click on the handle without movement is not an edit and must not take an undo step.
        if (changed()) appCallbacks.saveState();
        appCallbacks.draw();
      },
      onCancel: () => {
        restore();
        appCallbacks.draw();
      },
    });
  };

  const buildGraph = () => {
    // Update conn.labelRect on every render so DOM & E2E tests always see fresh rects
    updateRelationshipConnectionRects(
      diagram.relationships,
      diagram.entities,
      diagram.aggregations,
      diagram.attributes,
      currentNotation,
      fontSize
    );

    // Build nodes
    const nodes = [];
    const allRelAndAgg = [...diagram.relationships, ...diagram.aggregations];

    diagram.postits.forEach((p) => {
      nodes.push({
        id: `postit_${p.id}`,
        type: 'postit',
        position: { x: p.x, y: p.y },
        draggable: !p.locked,
        selected: Boolean(p.selected),
        data: {
          element: p,
          kind: 'postit',
          selected: Boolean(p.selected),
          fontSize,
          onResizeStart: (e) => startResize(p, 'rect', e),
        },
      });
    });

    diagram.aggregations.forEach((agg) => {
      const size = agg.size || RELATIONSHIP_SIZE;
      const rectSize = (size / 2) * 1.2;
      const w = rectSize * 2;
      const hgt = rectSize * 2;
      nodes.push({
        id: `aggregation_${agg.id}`,
        type: 'aggregation',
        position: { x: agg.x - w / 2, y: agg.y - hgt / 2 },
        draggable: !agg.locked,
        selected: Boolean(agg.selected),
        data: {
          element: agg,
          kind: 'aggregation',
          selected: Boolean(agg.selected),
          isWeak: isIdentifyingRelationship(agg),
          isRelateSource:
            diagram.isDraggingConnection &&
            diagram.draggingConnection?.element === agg,
          fontSize,
          validationIssue: violationMap[`aggregation:${agg.id}`],
          onResizeStart: (e) => startResize(agg, 'size', e),
        },
      });
    });

    diagram.entities.forEach((e) => {
      if (currentNotation !== 'chen') {
        const dims = getCrowEntityDimensions(
          e,
          diagram.attributes,
          diagram.relationships,
          diagram.aggregations,
          fontSize
        );
        if (e._preCrowWidth === undefined) {
          e._preCrowWidth = e.width || DEFAULT_ENTITY_WIDTH;
          e._preCrowHeight = e.height || DEFAULT_ENTITY_HEIGHT;
        }
        e.width = dims.width;
        e.height = dims.height;
      } else if (e._preCrowWidth !== undefined) {
        e.width = Math.max(e._preCrowWidth, (e.name || '').length * 9 + 16);
        e.height = e._preCrowHeight;
      }
      nodes.push({
        id: `entity_${e.id}`,
        type: 'entity',
        position: { x: e.x, y: e.y },
        draggable: !e.locked,
        selected: Boolean(e.selected),
        data: {
          element: e,
          kind: 'entity',
          selected: Boolean(e.selected),
          isWeak: isWeakEntity(e.id, allRelAndAgg),
          isRelateSource:
            diagram.isDraggingConnection &&
            diagram.draggingConnection?.element === e,
          currentNotation,
          fontSize,
          attributes: diagram.attributes,
          relationships: diagram.relationships,
          aggregations: diagram.aggregations,
          validationIssue: violationMap[`entity:${e.id}`],
          onResizeStart: (ev) => startResize(e, 'rect', ev),
          onInlineAttributeClick: (attr, ev) => {
            // A row belongs to its entity: placement and connect modes act as on the entity itself.
            if (handleModeClick(ev, e)) return;
            if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
              attr.selected = !attr.selected;
              closeSubmenu();
              appCallbacks.draw();
              return;
            }
            operations.clearSelection();
            attr.selected = true;
            showSubmenu(attr, menuCallbacks);
            appCallbacks.draw();
          },
          onInlineAttributeContextMenu: (attr) => {
            operations.clearSelection();
            attr.selected = true;
            showSubmenu(attr, menuCallbacks);
            appCallbacks.draw();
          },
          onInlineAttributeDoubleClick: (attr) => {
            showInlineEditor(attr, menuCallbacks);
          },
          onInlineAttributeDelete: (attr) => {
            const toDelete = new Set([attr.id]);
            const collectChildren = (pid) => {
              diagram.attributes
                .filter((ca) => ca.parentType === 'attribute' && ca.parentId === pid)
                .forEach((ca) => {
                  toDelete.add(ca.id);
                  collectChildren(ca.id);
                });
            };
            collectChildren(attr.id);
            diagram.attributes = diagram.attributes.filter((ca) => !toDelete.has(ca.id));
            appCallbacks.saveState();
            appCallbacks.draw();
          },
        },
      });
    });

    diagram.relationships.forEach((r) => {
      const size = r.size || RELATIONSHIP_SIZE;
      nodes.push({
        id: `relationship_${r.id}`,
        type: 'relationship',
        position: { x: r.x - size / 2, y: r.y - size / 2 },
        draggable: !r.locked,
        selected: Boolean(r.selected),
        data: {
          element: r,
          kind: 'relationship',
          selected: Boolean(r.selected),
          isWeak: isIdentifyingRelationship(r),
          isRelateSource:
            diagram.isDraggingConnection &&
            diagram.draggingConnection?.element === r,
          currentNotation,
          fontSize,
          validationIssue: violationMap[`relationship:${r.id}`],
          onResizeStart: (ev) => startResize(r, 'size', ev),
        },
      });
    });

    diagram.specializations.forEach((s) => {
      const size = s.size || DEFAULT_SPECIALIZATION_SIZE;
      nodes.push({
        id: `specialization_${s.id}`,
        type: 'specialization',
        position: { x: s.x - size / 2, y: s.y - size / 2 },
        draggable: !s.locked,
        selected: Boolean(s.selected),
        data: {
          element: s,
          kind: 'specialization',
          selected: Boolean(s.selected),
          isRelateSource:
            diagram.isDraggingConnection &&
            diagram.draggingConnection?.element === s,
          fontSize,
          validationIssue: violationMap[`specialization:${s.id}`],
          onResizeStart: (ev) => startResize(s, 'size', ev),
        },
      });
    });

    diagram.attributes.forEach((a) => {
      if (!operations.isAttributeVisible(a)) return;
      if (currentNotation !== 'chen' && a.parentType !== null) return;
      const textW = Math.max((a.name || '').length * 9, 40);
      a.hitBox = {
        x: a.x - ATTR_CIRCLE_RADIUS,
        y: a.y - ATTR_CIRCLE_RADIUS,
        width: ATTR_CIRCLE_RADIUS * 2 + ATTR_TEXT_PADDING + textW,
        height: Math.max(ATTR_CIRCLE_RADIUS * 2, fontSize),
      };
      nodes.push({
        id: `attribute_${a.id}`,
        type: 'attribute',
        position: { x: a.x - ATTR_CIRCLE_RADIUS, y: a.y - ATTR_CIRCLE_RADIUS },
        draggable: !a.locked,
        selected: Boolean(a.selected),
        data: {
          element: a,
          kind: 'attribute',
          selected: Boolean(a.selected),
          isOwnerWeak: isAttributeOwnerWeak(
            a,
            diagram.relationships,
            diagram.aggregations,
            diagram.attributes
          ),
          hasChildren: operations.hasChildrenAttribute(a),
          fontSize,
          validationIssue: violationMap[`attribute:${a.id}`],
          onToggleCollapse: (attr) => {
            attr.collapsed = !attr.collapsed;
            appCallbacks.saveState();
            appCallbacks.draw();
          },
        },
      });
    });

    // Build edges
    const edges = [];

    const handleBreakpointPointerDown = (evt, edgeData, bpIdx) => {
      closeSubmenu();
      const targetConn = edgeData.conn || edgeData.attr;
      if (!targetConn || !targetConn.breakpoints) return;
      const initial = { ...targetConn.breakpoints[bpIdx] };
      trackPointerDrag({
        onMove: (moveEvt) => {
          const wPos = clientToWorld(moveEvt.clientX, moveEvt.clientY);
          targetConn.breakpoints[bpIdx] = { x: wPos.x, y: wPos.y };
          appCallbacks.draw();
        },
        onEnd: () => {
          const now = targetConn.breakpoints[bpIdx];
          // Pressing a bend point without moving it is not an edit and must not take an undo step.
          if (now && (now.x !== initial.x || now.y !== initial.y)) appCallbacks.saveState();
          appCallbacks.draw();
        },
        onCancel: () => {
          if (targetConn.breakpoints[bpIdx]) targetConn.breakpoints[bpIdx] = initial;
          appCallbacks.draw();
        },
      });
    };

    const handleBreakpointDoubleClick = (_evt, edgeData, bpIdx) => {
      const targetConn = edgeData.conn || edgeData.attr;
      if (!targetConn || !targetConn.breakpoints) return;
      targetConn.breakpoints.splice(bpIdx, 1);
      appCallbacks.saveState();
      appCallbacks.draw();
    };

    const insertBreakpointAtEvent = (evt, points, targetConn) => {
      if (!targetConn) return;
      const pos = clientToWorld(evt.clientX, evt.clientY);
      targetConn.breakpoints = targetConn.breakpoints || [];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const d = distanceToSegment(pos.x, pos.y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      targetConn.breakpoints.splice(bestIdx, 0, { x: pos.x, y: pos.y });
      appCallbacks.saveState();
      appCallbacks.draw();
    };

    diagram.attributes.forEach((a) => {
      const pts = getAttributeConnectionPoints(
        a,
        diagram.entities,
        diagram.relationships,
        diagram.aggregations,
        diagram.attributes,
        currentNotation
      );
      if (!pts) return;
      edges.push({
        id: `attr_edge_${a.id}`,
        type: 'erEdge',
        source: `${a.parentType}_${a.parentId}`,
        target: `attribute_${a.id}`,
        data: {
          kind: 'attribute',
          attr: a,
          points: pts,
          currentNotation,
          fontSize,
          onBreakpointPointerDown: handleBreakpointPointerDown,
          onBreakpointDoubleClick: handleBreakpointDoubleClick,
        },
      });
    });

    diagram.relationships.forEach((r) => {
      (r.connections || []).forEach((conn, idx) => {
        const geom = relationshipConnectionGeometry(
          r,
          conn,
          diagram.entities,
          diagram.aggregations,
          diagram.attributes,
          currentNotation
        );
        if (!geom) return;
        const isSelected = Boolean(
          diagram.selectedConnection &&
            diagram.selectedConnection.relationshipId === r.id &&
            diagram.selectedConnection.entityId === conn.entityId
        );
        edges.push({
          id: `rel_${r.id}_conn_${idx}`,
          type: 'erEdge',
          source: `relationship_${r.id}`,
          target: `${conn.targetType === 'aggregation' ? 'aggregation' : 'entity'}_${conn.entityId}`,
          data: {
            kind: 'relationship',
            rel: r,
            conn,
            points: geom.points,
            side: geom.side,
            selected: isSelected,
            currentNotation,
            fontSize,
            onEdgeClick: (evt) => {
              const wPos = clientToWorld(evt.clientX, evt.clientY);
              operations.clearSelection();
              diagram.selectedConnection = { relationshipId: r.id, entityId: conn.entityId };
              showConnectionSubmenu(
                { relationshipId: r.id, entityId: conn.entityId, conn },
                wPos.x,
                wPos.y,
                menuCallbacks
              );
              appCallbacks.draw();
            },
            onEdgeContextMenu: (evt) => {
              const wPos = clientToWorld(evt.clientX, evt.clientY);
              operations.clearSelection();
              diagram.selectedConnection = { relationshipId: r.id, entityId: conn.entityId };
              showConnectionSubmenu(
                { relationshipId: r.id, entityId: conn.entityId, conn },
                wPos.x,
                wPos.y,
                menuCallbacks
              );
              appCallbacks.draw();
            },
            onEdgeDoubleClick: (evt) => insertBreakpointAtEvent(evt, geom.points, conn),
            onCardinalityDoubleClick: (_evt, _d, labelPos) => {
              showCardinalityEditor(conn, labelPos.x, labelPos.y, menuCallbacks);
            },
            onBreakpointPointerDown: handleBreakpointPointerDown,
            onBreakpointDoubleClick: handleBreakpointDoubleClick,
          },
        });
      });
    });

    diagram.specializations.forEach((s) => {
      (s.connections || []).forEach((conn, idx) => {
        const pts = getSpecializationConnectionPoints(
          s,
          conn,
          idx,
          diagram.entities,
          diagram.attributes,
          currentNotation
        );
        if (!pts) return;
        const isSelected = Boolean(
          diagram.selectedSpecConnection &&
            diagram.selectedSpecConnection.specializationId === s.id &&
            diagram.selectedSpecConnection.entityId === conn.entityId &&
            diagram.selectedSpecConnection.vertex === conn.vertex
        );
        edges.push({
          id: `spec_${s.id}_conn_${idx}`,
          type: 'erEdge',
          source: `specialization_${s.id}`,
          target: `entity_${conn.entityId}`,
          data: {
            kind: 'specialization',
            spec: s,
            conn,
            points: pts,
            selected: isSelected,
            currentNotation,
            fontSize,
            onEdgeClick: (evt) => {
              const wPos = clientToWorld(evt.clientX, evt.clientY);
              operations.clearSelection();
              diagram.selectedSpecConnection = {
                specializationId: s.id,
                entityId: conn.entityId,
                vertex: conn.vertex,
              };
              showSpecConnectionSubmenu(
                diagram.selectedSpecConnection,
                wPos.x,
                wPos.y,
                menuCallbacks
              );
              appCallbacks.draw();
            },
            onEdgeContextMenu: (evt) => {
              const wPos = clientToWorld(evt.clientX, evt.clientY);
              operations.clearSelection();
              diagram.selectedSpecConnection = {
                specializationId: s.id,
                entityId: conn.entityId,
                vertex: conn.vertex,
              };
              showSpecConnectionSubmenu(
                diagram.selectedSpecConnection,
                wPos.x,
                wPos.y,
                menuCallbacks
              );
              appCallbacks.draw();
            },
            onEdgeDoubleClick: (evt) => insertBreakpointAtEvent(evt, pts, conn),
            onBreakpointPointerDown: handleBreakpointPointerDown,
            onBreakpointDoubleClick: handleBreakpointDoubleClick,
          },
        });
      });
    });

    diagram.aggregations.forEach((agg) => {
      (agg.connections || []).forEach((conn, idx) => {
        const pts = getAggregationConnectionPoints(
          agg,
          conn,
          diagram.entities,
          diagram.relationships,
          diagram.attributes,
          currentNotation
        );
        if (!pts) return;
        const isEnt = conn.entityId !== undefined || conn.targetType === 'entity';
        const targetId = conn.entityId ?? conn.relationshipId ?? conn.targetId;
        edges.push({
          id: `agg_${agg.id}_conn_${idx}`,
          type: 'erEdge',
          source: `aggregation_${agg.id}`,
          target: `${isEnt ? 'entity' : 'relationship'}_${targetId}`,
          data: {
            kind: 'aggregation',
            agg,
            conn,
            points: pts,
            currentNotation,
            fontSize,
            onEdgeClick: (evt) => {
              const wPos = clientToWorld(evt.clientX, evt.clientY);
              operations.clearSelection();
              diagram.selectedAggregationConnection = {
                aggregationId: agg.id,
                entityId: conn.entityId,
                relationshipId: conn.relationshipId,
              };
              showAggregationConnectionSubmenu(
                diagram.selectedAggregationConnection,
                wPos.x,
                wPos.y,
                menuCallbacks
              );
              appCallbacks.draw();
            },
            onEdgeContextMenu: (evt) => {
              const wPos = clientToWorld(evt.clientX, evt.clientY);
              operations.clearSelection();
              diagram.selectedAggregationConnection = {
                aggregationId: agg.id,
                entityId: conn.entityId,
                relationshipId: conn.relationshipId,
              };
              showAggregationConnectionSubmenu(
                diagram.selectedAggregationConnection,
                wPos.x,
                wPos.y,
                menuCallbacks
              );
              appCallbacks.draw();
            },
            onEdgeDoubleClick: (evt) => insertBreakpointAtEvent(evt, pts, conn),
            onBreakpointPointerDown: handleBreakpointPointerDown,
            onBreakpointDoubleClick: handleBreakpointDoubleClick,
          },
        });
      });
    });

    const measured = measuredRef.current;
    const mapped = nodes.map((n) => (measured[n.id] ? { ...n, measured: measured[n.id] } : n));
    nodeElementsRef.current = Object.fromEntries(nodes.map((n) => [n.id, n.data?.element]));
    return { nodes: mapped, edges };
  };

  if (dirtyRef.current || !graphCacheRef.current) {
    graphCacheRef.current = buildGraph();
    dirtyRef.current = false;
  }
  const { nodes, edges } = graphCacheRef.current;

  // Temporary connection line while relating
  const relatingLine =
    diagram.isDraggingConnection &&
    diagram.draggingConnection &&
    diagram.draggingConnection.start &&
    diagram.draggingConnection.current
      ? {
          x1: diagram.draggingConnection.start.x,
          y1: diagram.draggingConnection.start.y,
          x2: diagram.draggingConnection.current.x,
          y2: diagram.draggingConnection.current.y,
        }
      : null;

  const viewport = {
    x: diagram.panOffset.x * diagram.zoom,
    y: diagram.panOffset.y * diagram.zoom,
    zoom: diagram.zoom,
  };

  const onViewportChange = useCallback(
    (nextVp) => {
      if (!nextVp || !nextVp.zoom) return;
      const changed =
        Math.abs(nextVp.zoom - diagram.zoom) > 1e-4 ||
        Math.abs(nextVp.x / nextVp.zoom - diagram.panOffset.x) > 0.1 ||
        Math.abs(nextVp.y / nextVp.zoom - diagram.panOffset.y) > 0.1;
      diagram.zoom = nextVp.zoom;
      diagram.panOffset.x = nextVp.x / nextVp.zoom;
      diagram.panOffset.y = nextVp.y / nextVp.zoom;
      if (changed) {
        closeSubmenu();
        appCallbacks.onViewportUpdated();
        setTick((t) => t + 1);
      }
    },
    [appCallbacks]
  );

  const openEditorForElement = (elem, evt) => {
    if (diagram.isEditingInline && Date.now() - (diagram.inlineOpenedAt || 0) < 250) {
      return;
    }
    diagram.inlineOpenedAt = Date.now();
    const wPos = evt ? clientToWorld(evt.clientX, evt.clientY) : { x: elem.x, y: elem.y };
    if (elem.objType === 'specialization') {
      showSpecTypeEditor(elem, wPos.x, wPos.y, menuCallbacks);
    } else if (elem.objType === 'postit') {
      showPostitEditor(elem, menuCallbacks);
    } else {
      showInlineEditor(elem, menuCallbacks);
    }
  };

  /**
   * Click while the toolbar placement mode or the connect mode is armed: the click places a new
   * object or completes the connection instead of selecting. Returns true when it did so.
   */
  const handleModeClick = (evt, elem) => {
    const wPos = clientToWorld(evt.clientX, evt.clientY);
    if (diagram.clickPlacementMode && diagram.draggingToolbarType) {
      appCallbacks.createObjectAt(diagram.draggingToolbarType, wPos.x, wPos.y);
      return true;
    }
    if (diagram.isDraggingConnection && diagram.draggingConnection) {
      diagram.draggingConnection.current = wPos;
      appCallbacks.completeRelationToTarget({ type: elem.objType, element: elem });
      return true;
    }
    return false;
  };

  const onNodeClick = (evt, node) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const elem = node.data?.element;
    if (!elem) return;

    // Double-click / double-tap detection across mouse and touch
    const now = Date.now();
    const prev = lastTapInfoRef.current;
    // A mouse double-click arrives as `onNodeDoubleClick`; only touch needs the tap-pair timer.
    if (
      evt.pointerType === 'touch' &&
      prev &&
      prev.nodeId === node.id &&
      now - prev.time <= 350 &&
      Math.hypot(evt.clientX - prev.x, evt.clientY - prev.y) < 20
    ) {
      lastTapInfoRef.current = null;
      closeSubmenu();
      openEditorForElement(elem, evt);
      return;
    }
    lastTapInfoRef.current = { nodeId: node.id, time: now, x: evt.clientX, y: evt.clientY };

    if (handleModeClick(evt, elem)) return;

    // Multi-selection modifier (Shift, Cmd, or Ctrl on non-Mac)
    const isMacCtrlClick =
      evt.ctrlKey &&
      !evt.metaKey &&
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    if (isMacCtrlClick) {
      operations.clearSelection();
      elem.selected = true;
      showSubmenu(elem, menuCallbacks);
      triggerRender();
      return;
    }

    if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
      elem.selected = !elem.selected;
      closeSubmenu();
      triggerRender();
      return;
    }

    // Standard deterministic primary click: select element and open submenu
    operations.clearSelection();
    elem.selected = true;
    showSubmenu(elem, menuCallbacks);
    triggerRender();
  };

  const onNodeContextMenu = (evt, node) => {
    evt.preventDefault();
    evt.stopPropagation();
    const elem = node.data?.element;
    if (!elem) return;
    operations.clearSelection();
    elem.selected = true;
    showSubmenu(elem, menuCallbacks);
    triggerRender();
  };

  const onNodeDoubleClick = (evt, node) => {
    evt.stopPropagation();
    const elem = node.data?.element;
    if (!elem) return;
    lastTapInfoRef.current = null;
    closeSubmenu();
    openEditorForElement(elem, evt);
  };

  const onNodeDragStart = (_evt, node) => {
    const elem = node.data?.element;
    if (!elem || elem.locked) return;
    closeSubmenu();

    if (!elem.selected) {
      operations.clearSelection();
      elem.selected = true;
    }

    const allElements = [
      ...diagram.entities,
      ...diagram.attributes,
      ...diagram.relationships,
      ...diagram.specializations,
      ...diagram.aggregations,
      ...diagram.postits,
    ];
    const selectedElems = allElements.filter((o) => o.selected && !o.locked);

    dragInitialPositionsRef.current = {
      draggedNodeId: node.id,
      draggedStartPos: { ...node.position },
      elements: selectedElems.map((o) => ({
        obj: o,
        startX: o.x,
        startY: o.y,
      })),
      bends: operations.collectFollowingBreakpoints().map((bp) => ({ bp, startX: bp.x, startY: bp.y })),
    };
  };

  const onNodeDrag = (_evt, node) => {
    const info = dragInitialPositionsRef.current;
    if (!info || info.draggedNodeId !== node.id) return;
    closeSubmenu();

    const dx = node.position.x - info.draggedStartPos.x;
    const dy = node.position.y - info.draggedStartPos.y;

    info.elements.forEach(({ obj, startX, startY }) => {
      obj.x = startX + dx;
      obj.y = startY + dy;
    });
    info.bends.forEach(({ bp, startX, startY }) => {
      bp.x = startX + dx;
      bp.y = startY + dy;
    });
    triggerRender();
  };

  const onNodeDragStop = (_evt, node) => {
    const info = dragInitialPositionsRef.current;
    dragInitialPositionsRef.current = null;
    if (!info) return;

    const dx = node.position.x - info.draggedStartPos.x;
    const dy = node.position.y - info.draggedStartPos.y;
    if (Math.hypot(dx, dy) >= 1) {
      appCallbacks.saveState();
      appCallbacks.draw();
    }
  };

  const onPaneClick = (evt) => {
    // A click on empty space ends any pending double-tap on an object.
    lastTapInfoRef.current = null;
    const wPos = clientToWorld(evt.clientX, evt.clientY);
    diagram.lastMousePos = wPos;

    if (diagram.clickPlacementMode && diagram.draggingToolbarType) {
      appCallbacks.createObjectAt(diagram.draggingToolbarType, wPos.x, wPos.y);
      return;
    }

    if (diagram.isDraggingConnection) {
      appCallbacks.exitClickRelationMode();
    }

    closeSubmenu();
    closeInlineEditors();
    operations.clearSelection();
    triggerRender();
  };

  const onWrapperPointerDown = (evt) => {
    const touch = evt.pointerType === 'touch';
    if (touch !== isTouch) setIsTouch(touch);
    const wPos = clientToWorld(evt.clientX, evt.clientY);
    diagram.lastMousePos = wPos;

    clearTimeout(longPressTimerRef.current);
    longPressTriggeredRef.current = false;

    const nodeEl = evt.target.closest?.('.er-node');
    const attrRowEl = evt.target.closest?.('.crow-attr-row');

    if (evt.pointerType === 'touch' && (nodeEl || attrRowEl)) {
      const targetEl = attrRowEl || nodeEl;
      const elemType = targetEl.getAttribute('data-element-type');
      const elemId = Number(targetEl.getAttribute('data-element-id'));
      const startX = evt.clientX;
      const startY = evt.clientY;
      pointerDownInfoRef.current = { startX, startY, isTouch: true };

      longPressTimerRef.current = setTimeout(() => {
        const found = appCallbacks.findElementById(elemId, elemType);
        if (found) {
          longPressTriggeredRef.current = true;
          operations.clearSelection();
          found.selected = true;
          showSubmenu(found, menuCallbacks);
          triggerRender();
        }
      }, 400);
      return;
    }
  };

  const onWrapperPointerMove = (evt) => {
    const wPos = clientToWorld(evt.clientX, evt.clientY);
    diagram.lastMousePos = wPos;

    if (pointerDownInfoRef.current?.isTouch) {
      const dist = Math.hypot(
        evt.clientX - pointerDownInfoRef.current.startX,
        evt.clientY - pointerDownInfoRef.current.startY
      );
      if (dist >= 5) {
        clearTimeout(longPressTimerRef.current);
      }
    }

    if (diagram.isDraggingConnection && diagram.draggingConnection) {
      diagram.draggingConnection.current = wPos;
      triggerRender();
    }
  };

  const onWrapperPointerEnd = () => {
    clearTimeout(longPressTimerRef.current);
    pointerDownInfoRef.current = null;
  };



  return h(
    'div',
    {
      className: 'er-diagram-surface-wrapper',
      style: { width: '100%', height: '100%', position: 'relative' },
      onPointerDownCapture: onWrapperPointerDown,
      onPointerMoveCapture: onWrapperPointerMove,
      onPointerUpCapture: onWrapperPointerEnd,
      onPointerCancelCapture: onWrapperPointerEnd,
    },
    h(
      ReactFlow,
      {
        nodes,
        onNodesChange,
        edges,
        nodeTypes,
        edgeTypes,
        viewport,
        onViewportChange,
        onNodeClick,
        onNodeContextMenu,
        onNodeDoubleClick,
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop,
        onEdgeClick: (evt, edge) => edge.data?.onEdgeClick?.(evt, edge.data),
        onEdgeContextMenu: (evt, edge) => edge.data?.onEdgeContextMenu?.(evt, edge.data),
        onEdgeDoubleClick: (evt, edge) => edge.data?.onEdgeDoubleClick?.(evt, edge.data),
        onPaneClick,
        nodeDragThreshold: 5,
        nodeClickDistance: 5,
        paneClickDistance: 5,
        minZoom: 0.25,
        maxZoom: 3,
        panOnDrag: isTouch ? true : [1, 2],
        panActivationKeyCode: 'Space',
        selectionOnDrag: !isTouch,
        selectionMode: SelectionMode.Partial,
        onSelectionStart: () => {
          marqueeActiveRef.current = true;
          closeSubmenu();
        },
        onSelectionEnd: () => {
          marqueeActiveRef.current = false;
        },
        onMoveStart: (evt) => {
          if (evt) closeSubmenu();
        },
        panOnScroll: false,
        zoomOnScroll: true,
        zoomOnPinch: true,
        zoomOnDoubleClick: false,
        selectNodesOnDrag: false,
        deleteKeyCode: null,
        multiSelectionKeyCode: null,
        fitView: false,
      },
      diagram.gridEnabled
        ? h(Background, {
            variant: BackgroundVariant.Lines,
            gap: 20,
            color: '#e5e7eb',
            lineWidth: 1,
          })
        : null,
      h(MiniMap, {
        pannable: true,
        zoomable: true,
        onClick: (_evt, pos) => {
          diagram.panOffset.x = diagram.mainWidth / (2 * diagram.zoom) - pos.x;
          diagram.panOffset.y = diagram.mainHeight / (2 * diagram.zoom) - pos.y;
          appCallbacks.onViewportUpdated();
          triggerRender();
        },
        position: 'bottom-left',
        className: 'er-minimap',
        ariaLabel: 'Miniatura do diagrama — clique ou arraste para navegar',
        nodeColor: '#60a5fa',
        maskColor: 'rgba(17, 24, 39, 0.6)',
        style: { background: '#111827', border: '1px solid #374151', borderRadius: 6, width: 160, height: 100, margin: '0 0 44px 12px' },
      })
    ),
    relatingLine
      ? h(
          'svg',
          {
            style: {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 30,
            },
          },
          h(
            'g',
            {
              transform: `translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`,
            },
            relatingLine
              ? h('line', {
                  x1: relatingLine.x1,
                  y1: relatingLine.y1,
                  x2: relatingLine.x2,
                  y2: relatingLine.y2,
                  stroke: '#3b82f6',
                  strokeWidth: 2,
                  strokeDasharray: '6,4',
                })
              : null
          )
        )
      : null
  );
}

export function mountDiagramSurface(container, appCallbacks) {
  let refreshFn = () => {};
  const registerRefresh = (fn) => {
    refreshFn = fn;
  };
  const root = createRoot(container);
  root.render(
    h(
      ReactFlowProvider,
      null,
      h(DiagramSurfaceInner, { appCallbacks, registerRefresh })
    )
  );
  return {
    refresh() {
      refreshFn();
    },
  };
}
