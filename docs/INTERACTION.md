# Interaction contract

This document specifies how the diagram surface (`src/canvas/DiagramSurface.js`, built on `@xyflow/react`) and
the editor (`src/app.js`) respond to pointer, touch and keyboard input, as tested by the Playwright suite in `e2e/`
(`navigation.spec.js`, `touch.spec.js`, `editor.spec.js`, `submenu.spec.js`, `history.spec.js`,
`regressions.spec.js`).

Terms: a *node* is an entity, attribute, relationship, specialization, aggregation or post-it; an *edge* is a
connection line (relationship participation, specialization or aggregation link, attribute link). In Crow's Foot
notation the attributes of an entity are rows inside the entity node.

## 1. Pointer model

- The surface uses React Flow's callbacks (`onNodeClick`, `onNodeContextMenu`, `onNodeDoubleClick`,
  `onNodeDrag*`, `onEdge*`, `onPaneClick`, selection callbacks) plus Pointer Event handlers on the wrapper
  (long press on touch) and `window` listeners for the three handle drags below.
- Movement thresholds (5 px): `nodeDragThreshold`, `nodeClickDistance` and `paneClickDistance` are 5 px. A
  press that moves less than that is a click or tap, regardless of how long it is held.
- `pointercancel`: dragging a resize handle, dragging a bend point and dragging a connection out of the
  menu each follow the pointer on `window` (`src/canvas/pointerDrag.js`). A cancelled pointer (touch taken by
  the system) removes the listeners and restores the previous size or bend point position, or abandons the
  connection. A cancelled press on a node also cancels the long-press timer.
- Undo steps: pressing a resize handle or a bend point without moving it saves no undo step.

## 2. Selection

| Action | Desktop | Touch | Result |
|---|---|---|---|
| Select one | Click a node (or a Crow's Foot attribute row) | Tap | Replaces the selection with that element and opens its menu. Clicking a member of a multi-selection collapses the selection to it. A locked element can be selected; its menu offers *Unlock*. |
| Toggle in selection | `Shift`, `Cmd` (macOS) or `Ctrl` + click | none | Adds or removes the element; the menu is not opened and any open menu closes. |
| Marquee | Left-drag from empty space (partial overlap selects) | none (one finger pans) | Selects every node the rectangle touches. The box React Flow draws around the result does not receive pointer events, so clicks and double-clicks reach the members. |
| Select all | `Cmd/Ctrl + A` | none | Selects every element, including locked ones. |
| Clear | Click or tap empty space | same | Clears the selection and any selected connection, leaves click-placement and connect modes, and closes the menu and inline editors. `Escape` does not clear the selection. |

On macOS, `Ctrl + click` behaves like a right click (single selection, menu open), not like a toggle.

## 3. Menus

The element menu (`.submenu`, items `.submenu-item`) opens synchronously from:

1. a plain click or tap on a node, a Crow's Foot attribute row, or an edge (outside connect and placement modes);
2. a right click (`contextmenu`), which selects the target first;
3. `Ctrl + click` on macOS;
4. a long press on touch: finger down on a node or attribute row, held for 400 ms with less than 5 px of
   movement (works for every node type, including post-its).

The menu closes when the user clicks empty space, presses `Escape`, starts dragging, panning or zooming,
clicks an item (except items that open a flyout), or undoes or redoes (preventing the menu from holding a
reference to a replaced element).

Edges have their own menus: a relationship participation (toggle dependent, set role, delete), a
specialization link, or an aggregation link. A role is entered with a browser `prompt()`; there is no
double-click role editor.

## 4. Editing in place

Double-click (mouse) or two taps on the same node within 350 ms and 20 px (touch) open an editor:

| Target | Editor |
|---|---|
| Entity, relationship, attribute, aggregation, Crow's Foot attribute row | A text input placed over the element. `Enter` or blur commits (one undo step); `Escape` cancels. |
| Post-it | A textarea; `Ctrl/Cmd + Enter` or clicking away commits (there is no cancel). |
| Specialization | A selector with `T,C`, `T,D`, `P,C`, `P,D` and `U`. |
| Cardinality pill on a connection | An input for the `min,max` pair, validated by `parseCardinality`. |
| Existing bend point | Removes the bend point. |
| A connection line (not the pill) | Inserts a bend point at that position. |

A mouse double-click is handled by `onNodeDoubleClick`; touch has no reliable `dblclick`, so `onNodeClick` times a
pair of taps on the same node. A 250 ms guard prevents the two paths from reopening an editor. The cardinality pill
has its own `onDoubleClick`.

## 5. Dragging

- Dragging a node (5 px threshold): selects it if it was not selected, closes the menu and moves it. If it
  belongs to a multi-selection, every selected, unlocked element moves by the same delta.
- Bend points follow: while one or several elements move, the bend points of every connection owned by a
  moving relationship, specialization or aggregation, and of every connection ending on a moving entity (or,
  for aggregations, a moving relationship), move with them. Keyboard moves use the same rule
  (`operations.collectFollowingBreakpoints`).
- Releasing records one undo step if the element moved at least 1 px. Locked elements do not drag.
- Empty space: on mouse, left-drag draws a marquee, and panning uses `Space` + left-drag, the middle button, or the
  right button. On touch, one finger pans.
- Resize handle (selected, unlocked elements): drag to resize; a cancelled pointer restores the size.
- Bend point handle: drag to move; double-click removes.
- Dragging from the toolbar: pressing a toolbar button and moving more than 5 px makes a copy of the button follow
  the pointer; releasing over the canvas creates the element there, while releasing elsewhere cancels. A press and
  release without movement arms click placement: the copy follows the pointer and the next click on the
  canvas (or on a node, or on a Crow's Foot attribute row) creates the element. `Escape` cancels.

## 6. Zoom and navigation

- Mouse wheel and trackpad pinch zoom around the pointer, between 0.25x and 3x; touch pinch zooms and pans.
  Double-click does not zoom.
- Buttons in `#viewControls`: `#btnZoomOut`, `#btnZoomLevel` (back to 100%), `#btnZoomIn`, `#btnZoomFit`.
  Keys: `Ctrl/Cmd + +`, `Ctrl/Cmd + -`, `Ctrl/Cmd + 0`, `Shift + F` (fit).
- The minimap is React Flow's `MiniMap`: click or drag it to move the viewport (hidden on small screens).
- A viewport change does not rebuild the node and edge arrays; only edits do.

## 7. Connecting

1. Menu -> *Relacionar* (Connect) on an entity, relationship or specialization: connect mode starts with the
   source highlighted; a click on a compatible target (a node, or a Crow's Foot attribute row standing for
   its entity) completes it. Dragging from the menu item to a target also works.
2. `C` with exactly two elements selected makes a quick connection (`operations.connectObjects`); with any
   other count it shows a notice. There is no toolbar *Connect* button and no toggle mode.
3. Attributes are attached by dropping a new attribute (toolbar drag or click placement) onto its owner.

`Escape` or a click on empty space leaves connect mode.

## 8. Keyboard

Shortcuts are ignored while focus is in an input, textarea, select or editable element, and while an inline editor is open.

| macOS | Windows / Linux | Action |
|---|---|---|
| `Delete`, `Backspace` | same | Delete the selection or selected connection |
| `Cmd+Z` | `Ctrl+Z` | Undo |
| `Cmd+Shift+Z`, `Cmd+Y` | `Ctrl+Shift+Z`, `Ctrl+Y` | Redo |
| `Cmd+C`, `Cmd+V` | `Ctrl+C`, `Ctrl+V` | Copy, paste (the copy is placed around the last pointer position) |
| `Cmd+A` | `Ctrl+A` | Select all, locked elements included |
| `Escape` | same | Close the menu, leave connect mode, cancel toolbar placement. Does not deselect. |
| `E`, `A`, `R`, `S` | same | Create an entity, attribute, relationship or specialization at the centre of the viewport, selected |
| `C` | same | Connect the two selected elements |
| `G` | same | Toggle the grid |
| `Shift+F` | same | Fit the diagram |
| `Cmd/Ctrl + +`, `-`, `0` | same | Zoom in, out, 100% |
| `Shift+L`, `Shift+T`, `Shift+D` | same | Align selection left, align top, distribute horizontally |
| `Shift+K` | same | Toggle lock on the selection |
| Arrow keys | same | Move the selection 10 px; with `Shift`, 1 px. Bend points follow. |
| Hold `Space` | same | Pan with a left-drag |

There is no keyboard shortcut for aggregations, auto-layout or tidy.
