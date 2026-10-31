/**
 * Global application state — diagram data, counters and interaction flags.
 * All mutable state is exported as plain variables; consumers may import
 * and reassign using the helper setters below.
 */

// ─── Diagram arrays ───────────────────────────────────────────────────────────
export let entities = [];
export let attributes = [];
export let relationships = [];
export let specializations = [];
export let aggregations = [];
export let postits = [];

// ─── ID counters ──────────────────────────────────────────────────────────────
export let entityIdCounter = 0;
export let attributeIdCounter = 0;
export let relationshipIdCounter = 0;
export let specializationIdCounter = 0;
export let aggregationIdCounter = 0;
export let postitIdCounter = 0;

// ─── Viewport ─────────────────────────────────────────────────────────────────
export let zoom = 1;
export let panOffset = { x: 0, y: 0 };

// ─── Selection / connection ───────────────────────────────────────────────────
export let selectedConnection = null;
export let selectedSpecConnection = null;
export let selectedAggregationConnection = null;

// ─── Clipboard ───────────────────────────────────────────────────────────────
export let clipboard = null;

// ─── Undo / redo ─────────────────────────────────────────────────────────────
export let undoStack = [];
export let redoStack = [];

// ─── Misc ────────────────────────────────────────────────────────────────────
export let hasUnsavedChanges = false;
export let fontSize = 18;
export let fileMeta = {createdAt:new Date().toISOString()};
export let gridEnabled = false;
export const gridSize = 20;

// ─── Interaction flags ────────────────────────────────────────────────────────
export let isDraggingObject = false;
export let dragObject = null;
export let dragOffset = { x: 0, y: 0 };
export let isResizing = false;
export let resizingObject = null;
export let resizeHandleIndex = null;
export let resizingInitial = {};
export let isSelecting = false;
export let selectionStart = { x: 0, y: 0 };
export let selectionRect = null;
export let isDraggingBreakpoint = false;
export let activeBreakpoint = null;
export let draggingToolbarType = null;
export let draggingNewObj = null;
export let clickPlacementMode = false;
export let toolbarDrag = null;
export let isDraggingConnection = false;
export let draggingConnection = null;
export let draggingRelationFromMenu = false;
export let relationMenuSource = null;
export let relationClickMode = false;
export let submenu = null;
export let submenuRect = null;
export let submenuTimeout = null;
export let currentSubmenuCloseHandler = null;
export let inlineInput = null;
export let inlineSelect = null;
export let inlineSpecSelect = null;
export let isEditingInline = false;
export let pendingConnectionHit = null;
export let breakpointTimeout = null;
export let groupBreakpointsData = [];
export let isDraggingGroup = false;
export let groupDragData = [];
export let groupMouseStart = { x: 0, y: 0 };
export let isPinching = false;
export let pinchStartDist = 0;
export let pinchStartZoom = 1;
export let lastTapTime = 0;
export let lastTapPos = { x: 0, y: 0 };
export let lastTapHit = null;
export let touchMoved = false;
export let touchStartPos = null;
export let isCoarsePointer = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(pointer: coarse)').matches
  : false;
export let lastMousePos = { x: 0, y: 0 };
export let justSelectedConnection = false;
export let drawPending = false;
export let mainWidth = 0;
export let mainHeight = 0;
export let panStart = { x: 0, y: 0 };
export let panOffsetStart = { x: 0, y: 0 };

// ─── On-save callback (injected by main.js to avoid circular deps) ────────────
let _onSave = null;
export function setOnSave(fn) { _onSave = fn; }
export function getOnSave() { return _onSave; }

// ─── Batch setters ────────────────────────────────────────────────────────────
export function setEntities(v) { entities = v; }
export function setAttributes(v) { attributes = v; }
export function setRelationships(v) { relationships = v; }
export function setSpecializations(v) { specializations = v; }
export function setAggregations(v) { aggregations = v; }
export function setPostits(v) { postits = v; }

export function setEntityIdCounter(v) { entityIdCounter = v; }
export function setAttributeIdCounter(v) { attributeIdCounter = v; }
export function setRelationshipIdCounter(v) { relationshipIdCounter = v; }
export function setSpecializationIdCounter(v) { specializationIdCounter = v; }
export function setAggregationIdCounter(v) { aggregationIdCounter = v; }
export function setPostitIdCounter(v) { postitIdCounter = v; }

export function setZoom(v) { zoom = v; }
export function setPanOffset(v) { panOffset = v; }
export function setFontSize(v) { fontSize = v; }
export function setGridEnabled(v) { gridEnabled = v; }

export function setSelectedConnection(v) { selectedConnection = v; }
export function setSelectedSpecConnection(v) { selectedSpecConnection = v; }
export function setSelectedAggregationConnection(v) { selectedAggregationConnection = v; }
export function setClipboard(v) { clipboard = v; }
export function setUndoStack(v) { undoStack = v; }
export function setRedoStack(v) { redoStack = v; }
export function setHasUnsavedChanges(v) { hasUnsavedChanges = v; }

export function setIsDraggingObject(v) { isDraggingObject = v; }
export function setDragObject(v) { dragObject = v; }
export function setDragOffset(v) { dragOffset = v; }
export function setIsResizing(v) { isResizing = v; }
export function setResizingObject(v) { resizingObject = v; }
export function setResizeHandleIndex(v) { resizeHandleIndex = v; }
export function setResizingInitial(v) { resizingInitial = v; }
export function setIsSelecting(v) { isSelecting = v; }
export function setSelectionStart(v) { selectionStart = v; }
export function setSelectionRect(v) { selectionRect = v; }
export function setIsDraggingBreakpoint(v) { isDraggingBreakpoint = v; }
export function setActiveBreakpoint(v) { activeBreakpoint = v; }
export function setDraggingToolbarType(v) { draggingToolbarType = v; }
export function setDraggingNewObj(v) { draggingNewObj = v; }
export function setClickPlacementMode(v) { clickPlacementMode = v; }
export function setToolbarDrag(v) { toolbarDrag = v; }
export function setIsDraggingConnection(v) { isDraggingConnection = v; }
export function setDraggingConnection(v) { draggingConnection = v; }
export function setDraggingRelationFromMenu(v) { draggingRelationFromMenu = v; }
export function setRelationMenuSource(v) { relationMenuSource = v; }
export function setRelationClickMode(v) { relationClickMode = v; }
export function setSubmenu(v) { submenu = v; }
export function setSubmenuRect(v) { submenuRect = v; }
export function setSubmenuTimeout(v) { submenuTimeout = v; }
export function setCurrentSubmenuCloseHandler(v) { currentSubmenuCloseHandler = v; }
export function setInlineInput(v) { inlineInput = v; }
export function setInlineSelect(v) { inlineSelect = v; }
export function setInlineSpecSelect(v) { inlineSpecSelect = v; }
export function setIsEditingInline(v) { isEditingInline = v; }
export function setPendingConnectionHit(v) { pendingConnectionHit = v; }
export function setBreakpointTimeout(v) { breakpointTimeout = v; }
export function setGroupBreakpointsData(v) { groupBreakpointsData = v; }
export function setIsDraggingGroup(v) { isDraggingGroup = v; }
export function setGroupDragData(v) { groupDragData = v; }
export function setGroupMouseStart(v) { groupMouseStart = v; }
export function setIsPinching(v) { isPinching = v; }
export function setPinchStartDist(v) { pinchStartDist = v; }
export function setPinchStartZoom(v) { pinchStartZoom = v; }
export function setLastTapTime(v) { lastTapTime = v; }
export function setLastTapPos(v) { lastTapPos = v; }
export function setLastTapHit(v) { lastTapHit = v; }
export function setTouchMoved(v) { touchMoved = v; }
export function setTouchStartPos(v) { touchStartPos = v; }
export function setLastMousePos(v) { lastMousePos = v; }
export function setJustSelectedConnection(v) { justSelectedConnection = v; }
export function setDrawPending(v) { drawPending = v; }
export function setMainWidth(v) { mainWidth = v; }
export function setMainHeight(v) { mainHeight = v; }
export function setPanStart(v) { panStart = v; }
export function setPanOffsetStart(v) { panOffsetStart = v; }

const collections = ['entities', 'attributes', 'relationships', 'specializations', 'aggregations', 'postits'];
const clone = value => JSON.parse(JSON.stringify(value));
let committedState = null;

/** Snapshot excludes counters: IDs stay monotonic across undo/redo. */
export function snapshot() {
  return Object.fromEntries(collections.map(key => [key, clone(diagram[key])]));
}

export function resetUndoBaseline() {
  committedState = snapshot();
  undoStack = [];
  redoStack = [];
}

export function restoreState(saved) {
  for (const key of collections) diagram[key] = clone(saved[key] || []);
}

export function saveState() {
  const empty = saved => collections.every(key => !(saved[key] || []).length);
  const current = snapshot();
  if (!undoStack.length && empty(current) && (!committedState || empty(committedState))) return;
  undoStack.push(committedState || Object.fromEntries(collections.map(key => [key, []])));
  committedState = current;
  redoStack = [];
  hasUnsavedChanges = true;
  if (_onSave) _onSave();
}

function travel(from, to, drawFn) {
  if (!from.length) return;
  to.push(committedState || snapshot());
  committedState = from.pop();
  restoreState(committedState);
  hasUnsavedChanges = true;
  if (_onSave) _onSave();
  if (drawFn) drawFn();
}

export function undo(drawFn) { travel(undoStack, redoStack, drawFn); }
export function redo(drawFn) { travel(redoStack, undoStack, drawFn); }

/** Writable facade over the same bindings used by domain operations. */
export const diagram = {
  get fileMeta() { return fileMeta; }, set fileMeta(value) { fileMeta = value; },
  get entities() { return entities; }, set entities(value) { entities = value; },
  get attributes() { return attributes; }, set attributes(value) { attributes = value; },
  get relationships() { return relationships; }, set relationships(value) { relationships = value; },
  get specializations() { return specializations; }, set specializations(value) { specializations = value; },
  get aggregations() { return aggregations; }, set aggregations(value) { aggregations = value; },
  get postits() { return postits; }, set postits(value) { postits = value; },
  get entityIdCounter() { return entityIdCounter; }, set entityIdCounter(value) { entityIdCounter = value; },
  get attributeIdCounter() { return attributeIdCounter; }, set attributeIdCounter(value) { attributeIdCounter = value; },
  get relationshipIdCounter() { return relationshipIdCounter; }, set relationshipIdCounter(value) { relationshipIdCounter = value; },
  get specializationIdCounter() { return specializationIdCounter; }, set specializationIdCounter(value) { specializationIdCounter = value; },
  get aggregationIdCounter() { return aggregationIdCounter; }, set aggregationIdCounter(value) { aggregationIdCounter = value; },
  get postitIdCounter() { return postitIdCounter; }, set postitIdCounter(value) { postitIdCounter = value; },
  get zoom() { return zoom; }, set zoom(value) { zoom = value; },
  get panOffset() { return panOffset; }, set panOffset(value) { panOffset = value; },
  get selectedConnection() { return selectedConnection; }, set selectedConnection(value) { selectedConnection = value; },
  get selectedSpecConnection() { return selectedSpecConnection; }, set selectedSpecConnection(value) { selectedSpecConnection = value; },
  get selectedAggregationConnection() { return selectedAggregationConnection; }, set selectedAggregationConnection(value) { selectedAggregationConnection = value; },
  get clipboard() { return clipboard; }, set clipboard(value) { clipboard = value; },
  get undoStack() { return undoStack; }, set undoStack(value) { undoStack = value; },
  get redoStack() { return redoStack; }, set redoStack(value) { redoStack = value; },
  get hasUnsavedChanges() { return hasUnsavedChanges; }, set hasUnsavedChanges(value) { hasUnsavedChanges = value; },
  get fontSize() { return fontSize; }, set fontSize(value) { fontSize = value; },
  get gridEnabled() { return gridEnabled; }, set gridEnabled(value) { gridEnabled = value; },
  get isDraggingObject() { return isDraggingObject; }, set isDraggingObject(value) { isDraggingObject = value; },
  get dragObject() { return dragObject; }, set dragObject(value) { dragObject = value; },
  get dragOffset() { return dragOffset; }, set dragOffset(value) { dragOffset = value; },
  get isResizing() { return isResizing; }, set isResizing(value) { isResizing = value; },
  get resizingObject() { return resizingObject; }, set resizingObject(value) { resizingObject = value; },
  get resizeHandleIndex() { return resizeHandleIndex; }, set resizeHandleIndex(value) { resizeHandleIndex = value; },
  get resizingInitial() { return resizingInitial; }, set resizingInitial(value) { resizingInitial = value; },
  get isSelecting() { return isSelecting; }, set isSelecting(value) { isSelecting = value; },
  get selectionStart() { return selectionStart; }, set selectionStart(value) { selectionStart = value; },
  get selectionRect() { return selectionRect; }, set selectionRect(value) { selectionRect = value; },
  get isDraggingBreakpoint() { return isDraggingBreakpoint; }, set isDraggingBreakpoint(value) { isDraggingBreakpoint = value; },
  get activeBreakpoint() { return activeBreakpoint; }, set activeBreakpoint(value) { activeBreakpoint = value; },
  get draggingToolbarType() { return draggingToolbarType; }, set draggingToolbarType(value) { draggingToolbarType = value; },
  get draggingNewObj() { return draggingNewObj; }, set draggingNewObj(value) { draggingNewObj = value; },
  get clickPlacementMode() { return clickPlacementMode; }, set clickPlacementMode(value) { clickPlacementMode = value; },
  get toolbarDrag() { return toolbarDrag; }, set toolbarDrag(value) { toolbarDrag = value; },
  get isDraggingConnection() { return isDraggingConnection; }, set isDraggingConnection(value) { isDraggingConnection = value; },
  get draggingConnection() { return draggingConnection; }, set draggingConnection(value) { draggingConnection = value; },
  get draggingRelationFromMenu() { return draggingRelationFromMenu; }, set draggingRelationFromMenu(value) { draggingRelationFromMenu = value; },
  get relationMenuSource() { return relationMenuSource; }, set relationMenuSource(value) { relationMenuSource = value; },
  get relationClickMode() { return relationClickMode; }, set relationClickMode(value) { relationClickMode = value; },
  get submenu() { return submenu; }, set submenu(value) { submenu = value; },
  get submenuRect() { return submenuRect; }, set submenuRect(value) { submenuRect = value; },
  get submenuTimeout() { return submenuTimeout; }, set submenuTimeout(value) { submenuTimeout = value; },
  get currentSubmenuCloseHandler() { return currentSubmenuCloseHandler; }, set currentSubmenuCloseHandler(value) { currentSubmenuCloseHandler = value; },
  get inlineInput() { return inlineInput; }, set inlineInput(value) { inlineInput = value; },
  get inlineSelect() { return inlineSelect; }, set inlineSelect(value) { inlineSelect = value; },
  get inlineSpecSelect() { return inlineSpecSelect; }, set inlineSpecSelect(value) { inlineSpecSelect = value; },
  get isEditingInline() { return isEditingInline; }, set isEditingInline(value) { isEditingInline = value; },
  get pendingConnectionHit() { return pendingConnectionHit; }, set pendingConnectionHit(value) { pendingConnectionHit = value; },
  get breakpointTimeout() { return breakpointTimeout; }, set breakpointTimeout(value) { breakpointTimeout = value; },
  get groupBreakpointsData() { return groupBreakpointsData; }, set groupBreakpointsData(value) { groupBreakpointsData = value; },
  get isDraggingGroup() { return isDraggingGroup; }, set isDraggingGroup(value) { isDraggingGroup = value; },
  get groupDragData() { return groupDragData; }, set groupDragData(value) { groupDragData = value; },
  get groupMouseStart() { return groupMouseStart; }, set groupMouseStart(value) { groupMouseStart = value; },
  get isPinching() { return isPinching; }, set isPinching(value) { isPinching = value; },
  get pinchStartDist() { return pinchStartDist; }, set pinchStartDist(value) { pinchStartDist = value; },
  get pinchStartZoom() { return pinchStartZoom; }, set pinchStartZoom(value) { pinchStartZoom = value; },
  get lastTapTime() { return lastTapTime; }, set lastTapTime(value) { lastTapTime = value; },
  get lastTapPos() { return lastTapPos; }, set lastTapPos(value) { lastTapPos = value; },
  get lastTapHit() { return lastTapHit; }, set lastTapHit(value) { lastTapHit = value; },
  get touchMoved() { return touchMoved; }, set touchMoved(value) { touchMoved = value; },
  get touchStartPos() { return touchStartPos; }, set touchStartPos(value) { touchStartPos = value; },
  get isCoarsePointer() { return isCoarsePointer; }, set isCoarsePointer(value) { isCoarsePointer = value; },
  get lastMousePos() { return lastMousePos; }, set lastMousePos(value) { lastMousePos = value; },
  get justSelectedConnection() { return justSelectedConnection; }, set justSelectedConnection(value) { justSelectedConnection = value; },
  get drawPending() { return drawPending; }, set drawPending(value) { drawPending = value; },
  get mainWidth() { return mainWidth; }, set mainWidth(value) { mainWidth = value; },
  get mainHeight() { return mainHeight; }, set mainHeight(value) { mainHeight = value; },
  get panStart() { return panStart; }, set panStart(value) { panStart = value; },
  get panOffsetStart() { return panOffsetStart; }, set panOffsetStart(value) { panOffsetStart = value; },
};
