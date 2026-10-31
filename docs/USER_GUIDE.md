# User guide

## Starting

Open the page (or run `npm run dev`). A welcome dialog appears once; *Start using* closes it. The interface
language (Portuguese or English) is chosen from the selector at the top right and remembered in the browser.

## Creating and editing elements

* Toolbar: press a button (Entity, Attribute, Derived, Multivalued, Rel., Gen./Spec., Aggregation,
  Post-it) and drag onto the diagram surface, or click a tool and click on the surface. Dropping an attribute
  onto an entity or relationship attaches it.
* Keyboard: the single-letter shortcuts `E`, `A`, `R` and `S` create an entity, attribute, relationship or
  specialization at the centre of the visible area (`G` toggles the grid).
* Select and contextual menu: left-click (or tap), right-click (`Ctrl+click` on macOS), or long-press on touch
  (`>= 400 ms`) on any construct, Crow's Foot inline attribute row, or connection line selects it and opens its
  contextual submenu immediately. Clicking empty space closes the menu and clears the selection; `Escape`
  closes the menu but keeps the selection.
* Multi-selection and panning: `Shift+click` or `Ctrl/Cmd+click` toggles nodes in the selection. On desktop,
  left-dragging on empty space draws a marquee selection box; pan with `Space + left-drag`, middle-button drag,
  or right-button drag on empty space. On touch devices, single-finger drag on empty space pans and two-finger
  pinch zooms. See [docs/INTERACTION.md](INTERACTION.md) for the full interaction contract.
* Rename / inline edit: double-click (or double-tap) an element and type; `Enter` confirms, `Escape` cancels.
* Mark a key: click or right-click an attribute -> *Set Key* (underlined) or *Partial Key* (dashed underline,
  for the discriminator of a weak entity). *Derived* and *Multivalued* attributes come from their toolbar buttons.
* Composite attributes: click or right-click an attribute -> add a sub-attribute.

## Connecting

* Contextual submenu: click or right-click an element -> *Connect* and click a compatible target (there is no
  *Connect* button in the toolbar), or
* Multi-select two elements (for example an entity and a relationship) with `Ctrl/Cmd + click` or `Shift + click`,
  then press `C`.
* New connections start as `0,N`. Double-click the cardinality pill to edit `min,max` (for example `1,N` or `2,5`);
  an invalid pair such as `5,2` is rejected. Double-click a connection segment to add a routing breakpoint, or
  double-click an existing breakpoint to remove it.
* Click or right-click a connection line for its menu: *Dependent (identification)* marks the participant as weak
  (double line, double rectangle, double diamond; the minimum becomes at least 1) and *Remove identification
  dependency* reverts it; *Define Role* names the role; *Delete* removes the connection.
* Specializations: connect one supertype and up to two subtypes to the triangle; double-click or open the submenu
  on the triangle to change its type (`T,D`, `T,C`, `P,D`, `P,C` or the category `U`).
* Click or right-click a relationship -> *Convert to Aggregation* (and back).

## Validation panel

The panel at the bottom left lists the rules the model currently violates (errors and warnings). Click an item
to locate the element and read the explanation. Rules R001–R012, C001 (Chen-style EER) and CF001 (Crow's Foot) are
defined in `src/validation/rules/`.

## Notation

*View -> Chen-style EER* (PT: *EER estilo Chen*) or *Crow's Foot* switches the drawing and the notation-specific
rules. See `docs/NOTATION.md`.

## Undo, redo, clear

Use the floating buttons at the bottom right, or `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`. *Clear* empties the diagram.

## Saving and loading

* *File -> Save* downloads a `.merdb` file (JSON, format below). *File -> Open* loads one; files from earlier
  versions open and are written back in the current format.
* The editor autosaves to the browser's `localStorage` and restores it on reload.
* Opening a malformed file shows an error and keeps the current diagram.

## Exporting

* Images: PNG, SVG and PDF from the *File* menu.
* Code: *File -> Export code* previews and downloads PostgreSQL, MySQL, MariaDB, SQLite, Laravel
  migrations, Prisma, Django, GraphQL, JSON Schema or the canonical MerDB-IR.
* SQL import: *File -> Import SQL* reads `CREATE TABLE` statements (and `ALTER TABLE ... ADD FOREIGN KEY`)
  and builds a model (`evaluation/results/roundtrip_not_recovered.csv`).

## The `.merdb` format

A `.merdb` file is JSON with `version: "2.0"`, `meta` (timestamps, tool version, notation), `domain`
(entities, attributes, relationships, specializations, aggregations, post-its and id counters) and `view`
(element positions, pan, zoom, font size). The schema is `schemas/merdb-v2.schema.json`; the canonical export is
described by `schemas/merdb-ir.schema.json`.
