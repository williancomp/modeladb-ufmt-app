import { describe, it, expect, beforeEach } from 'vitest';
import { entities, setEntities, attributes, setAttributes, relationships, setRelationships, specializations, setSpecializations, aggregations, setAggregations, postits, setPostits, setEntityIdCounter, setAttributeIdCounter, setRelationshipIdCounter, setSpecializationIdCounter, setAggregationIdCounter, setPostitIdCounter, undoStack, setUndoStack, redoStack, setRedoStack, saveState, undo, redo, restoreState, resetUndoBaseline } from '../state.js';

import { clearSelection, createObjectAt, deleteSelectedObjects, copySelection, pasteClipboard, hasChildrenAttribute, isAttributeVisible, isRelationshipWeak, isEntityWeak, moveSelectionBy, alignSelectedLeft, toggleLockOnSelection } from '../operations.js';

import {
  ATTR_CIRCLE_RADIUS,
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  RELATIONSHIP_SIZE,
  DEFAULT_SPECIALIZATION_SIZE,
  NORMAL_COLORS,
} from '../constants.js';

function resetState() {
  setEntities([]);
  setAttributes([]);
  setRelationships([]);
  setSpecializations([]);
  setAggregations([]);
  setPostits([]);
  setEntityIdCounter(0);
  setAttributeIdCounter(0);
  setRelationshipIdCounter(0);
  setSpecializationIdCounter(0);
  setAggregationIdCounter(0);
  setPostitIdCounter(0);
  setUndoStack([]);
  setRedoStack([]);
  resetUndoBaseline();
}

// ─── Constants ────────────────────────────────────────────────────────────────
describe('constants', () => {
  it('exports expected visual constants', () => {
    expect(ATTR_CIRCLE_RADIUS).toBe(12);
    expect(DEFAULT_ENTITY_WIDTH).toBe(160);
    expect(DEFAULT_ENTITY_HEIGHT).toBe(80);
    expect(RELATIONSHIP_SIZE).toBe(120);
    expect(DEFAULT_SPECIALIZATION_SIZE).toBe(100);
  });

  it('exports color palette', () => {
    expect(NORMAL_COLORS.entity.fill).toBe('#3b82f6');
    expect(NORMAL_COLORS.relationship.stroke).toBe('#7e22ce');
    expect(NORMAL_COLORS.aggregation.fill).toBe('#8b5cf6');
  });
});

// ─── State ────────────────────────────────────────────────────────────────────
describe('state', () => {
  beforeEach(resetState);

  it('starts with empty arrays', () => {
    expect(entities).toEqual([]);
    expect(attributes).toEqual([]);
    expect(relationships).toEqual([]);
  });

  it('setters update arrays', () => {
    setEntities([{ id: 0 }]);
    expect(entities.length).toBe(1);
    setEntities([]);
    expect(entities.length).toBe(0);
  });

  it('saveState pushes to undoStack', () => {
    setEntities([{ id: 0, name: 'A' }]);
    saveState();
    expect(undoStack.length).toBe(1);
  });

  it('saveState clears redoStack', () => {
    setEntities([{ id: 0, name: 'A' }]);
    setRedoStack([{ entities: [], attributes: [], relationships: [], specializations: [], aggregations: [], postits: [] }]);
    saveState();
    expect(redoStack.length).toBe(0);
  });

  it('saveState skips empty initial state', () => {
    saveState();
    expect(undoStack.length).toBe(0);
  });

  it('undo/redo cycle works', () => {
    setEntities([{ id: 0, name: 'A' }]);
    setAttributes([]);
    setRelationships([]);
    setSpecializations([]);
    setAggregations([]);
    setPostits([]);
    saveState();

    setEntities([{ id: 0, name: 'A' }, { id: 1, name: 'B' }]);
    saveState();

    // After undo, redo stack should have one entry, undo stack should have one
    undo();
    expect(undoStack.length).toBe(1);
    expect(redoStack.length).toBe(1);

    // After redo, the redo stack should be empty again
    redo();
    expect(redoStack.length).toBe(0);
    expect(undoStack.length).toBe(2);
  });

  it('restoreState deep clones', () => {
    const snap = {
      entities: [{ id: 0, name: 'X' }],
      attributes: [],
      relationships: [],
      specializations: [],
      aggregations: [],
      postits: [],
    };
    restoreState(snap);
    expect(entities[0].name).toBe('X');
    snap.entities[0].name = 'Y';
    expect(entities[0].name).toBe('X'); // no mutation
  });
});

// ─── Operations ───────────────────────────────────────────────────────────────
describe('operations', () => {
  beforeEach(resetState);

  describe('clearSelection', () => {
    it('deselects all objects', () => {
      setEntities([{ id: 0, selected: true }]);
      setAttributes([{ id: 0, selected: true }]);
      setRelationships([{ id: 0, selected: true }]);
      clearSelection();
      expect(entities[0].selected).toBe(false);
      expect(attributes[0].selected).toBe(false);
      expect(relationships[0].selected).toBe(false);
    });
  });

  describe('createObjectAt', () => {
    it('creates an entity', () => {
      const result = createObjectAt('entity', 200, 200);
      expect(result).toBe(true);
      expect(entities.length).toBe(1);
      expect(entities[0].name).toBe('Entidade');
      expect(entities[0].objType).toBe('entity');
    });

    it('creates a relationship', () => {
      createObjectAt('relationship', 300, 300);
      expect(relationships.length).toBe(1);
      expect(relationships[0].name).toBe('Rel.');
      expect(relationships[0].connections).toEqual([]);
    });

    it('creates a specialization', () => {
      createObjectAt('specialization', 400, 400);
      expect(specializations.length).toBe(1);
      expect(specializations[0].genType).toBe('T,C');
    });

    it('creates a postit', () => {
      createObjectAt('postit', 100, 100);
      expect(postits.length).toBe(1);
      expect(postits[0].text).toContain('Clique');
    });

    it('creates an aggregation', () => {
      createObjectAt('aggregation', 500, 500);
      expect(aggregations.length).toBe(1);
      expect(aggregations[0].objType).toBe('aggregation');
    });

    it('refuses attribute without valid drop target', () => {
      const result = createObjectAt('attribute', 200, 200, null);
      expect(result).toBe(false);
      expect(attributes.length).toBe(0);
    });

    it('creates attribute when dropped on entity', () => {
      createObjectAt('entity', 200, 200);
      const dropTarget = { type: 'entity', element: entities[0] };
      const result = createObjectAt('attribute', 200, 200, dropTarget);
      expect(result).toBe(true);
      expect(attributes.length).toBe(1);
      expect(attributes[0].parentType).toBe('entity');
      expect(attributes[0].parentId).toBe(0);
    });

    it('increments ID counters', () => {
      createObjectAt('entity', 100, 100);
      createObjectAt('entity', 200, 200);
      expect(entities[0].id).toBe(0);
      expect(entities[1].id).toBe(1);
    });
  });

  describe('deleteSelectedObjects', () => {
    it('removes selected entities and orphaned attributes', () => {
      createObjectAt('entity', 200, 200);
      entities[0].selected = true;
      const dropTarget = { type: 'entity', element: entities[0] };
      createObjectAt('attribute', 200, 200, dropTarget);

      deleteSelectedObjects();
      expect(entities.length).toBe(0);
      expect(attributes.length).toBe(0);
    });

    it('keeps unselected elements', () => {
      createObjectAt('entity', 100, 100);
      createObjectAt('entity', 200, 200);
      entities[0].selected = true;

      deleteSelectedObjects();
      expect(entities.length).toBe(1);
      expect(entities[0].id).toBe(1);
    });
  });

  describe('hasChildrenAttribute', () => {
    it('returns true when attribute has sub-attributes', () => {
      setAttributes([
        { id: 0, parentType: 'entity', parentId: 0 },
        { id: 1, parentType: 'attribute', parentId: 0 },
      ]);
      expect(hasChildrenAttribute(attributes[0])).toBe(true);
    });

    it('returns false when attribute has no children', () => {
      setAttributes([{ id: 0, parentType: 'entity', parentId: 0 }]);
      expect(hasChildrenAttribute(attributes[0])).toBe(false);
    });
  });

  describe('isAttributeVisible', () => {
    it('hides attribute when parent is collapsed', () => {
      setAttributes([
        { id: 0, parentType: 'entity', parentId: 0, collapsed: true },
        { id: 1, parentType: 'attribute', parentId: 0 },
      ]);
      expect(isAttributeVisible(attributes[1])).toBe(false);
    });

    it('shows attribute when parent is not collapsed', () => {
      setAttributes([
        { id: 0, parentType: 'entity', parentId: 0, collapsed: false },
        { id: 1, parentType: 'attribute', parentId: 0 },
      ]);
      expect(isAttributeVisible(attributes[1])).toBe(true);
    });
  });

  describe('isRelationshipWeak / isEntityWeak', () => {
    it('detects weak relationship', () => {
      setRelationships([{
        id: 0,
        connections: [
          { entityId: 0, weak: true },
          { entityId: 1, weak: true },
        ],
      }]);
      expect(isRelationshipWeak(relationships[0])).toBe(true);
    });

    it('detects entity involved in weak connection', () => {
      setRelationships([{
        id: 0,
        connections: [{ entityId: 5, weak: true }],
      }]);
      expect(isEntityWeak({ id: 5 })).toBe(true);
      expect(isEntityWeak({ id: 99 })).toBe(false);
    });
  });

  describe('moveSelectionBy', () => {
    it('moves selected objects', () => {
      createObjectAt('entity', 100, 100);
      entities[0].selected = true;
      moveSelectionBy(50, 30);
      expect(entities[0].x).toBeCloseTo(100 - DEFAULT_ENTITY_WIDTH / 2 + 50);
      expect(entities[0].y).toBeCloseTo(100 - DEFAULT_ENTITY_HEIGHT / 2 + 30);
    });

    it('skips locked objects', () => {
      createObjectAt('entity', 100, 100);
      entities[0].selected = true;
      entities[0].locked = true;
      const origX = entities[0].x;
      moveSelectionBy(50, 30);
      expect(entities[0].x).toBe(origX);
    });
  });

  describe('alignSelectedLeft', () => {
    it('aligns to leftmost x', () => {
      createObjectAt('entity', 100, 100);
      createObjectAt('entity', 300, 200);
      entities[0].selected = true;
      entities[1].selected = true;
      alignSelectedLeft();
      expect(entities[0].x).toBe(entities[1].x);
    });
  });

  describe('copySelection / pasteClipboard', () => {
    it('copies and pastes entities', () => {
      createObjectAt('entity', 200, 200);
      entities[0].selected = true;
      copySelection();
      pasteClipboard();
      expect(entities.length).toBe(2);
      expect(entities[1].id).not.toBe(entities[0].id);
    });
  });

  describe('toggleLockOnSelection', () => {
    it('locks and unlocks selection', () => {
      createObjectAt('entity', 200, 200);
      entities[0].selected = true;
      toggleLockOnSelection();
      expect(entities[0].locked).toBe(true);
      toggleLockOnSelection();
      expect(entities[0].locked).toBe(false);
    });
  });
});
