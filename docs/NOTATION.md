# Notation reference

ModelaDB draws two notations over one model: Chen-style EER (default) and Crow's Foot (information-engineering
style). The first is a Chen-inspired drawing extended with later EER constructs; it is not a reproduction of
Chen's 1976 notation, and no drawing here is claimed to be the only standard one. This page lists what the tool
draws for each construct (see `evaluation/figures/fig5_construct_set.png`) and how it relates to Chen (1976).

The primary source cited is P. P.-S. Chen, "The entity-relationship model: toward a unified view of data",
*ACM Transactions on Database Systems* 1(1), 1976, pp. 9–36,
doi:[10.1145/320434.320440](https://doi.org/10.1145/320434.320440). In that paper (sections and pages in TODS
pagination): entity sets, relationship sets over n entity sets and roles appear in §2.2.1–2.2.2 (pp. 11–12);
attributes of entities and relationships in §2.2.3 (pp. 12–13); weak entities identified through a relationship in
§2.3 (p. 18); diagrams with rectangles for entity sets, diamonds for relationship sets, roles on the lines and
the labels `1`, `m`, `n` at the line ends in §3.1 (pp. 19–20, Figs. 10–11); a minimum number of entities only in the
textual declaration language, not in the diagram (§3.2, p. 21); and underlined keys only in relation lists at the
relational level (§4.1, p. 28). The paper has no generalization, specialization, category or aggregation
construct, and mentions overlapping entity sets only in prose (§2.2.1). Everything else below is a convention of
this tool or of later extended-ER literature and is left unattributed.

## Chen-style EER (default)

In the table below, "Chen" means the construct appears in Chen (1976) as cited above; "Tool" means ModelaDB's
drawing convention; "EER" means a construct from later EER extensions.

| Construct | Drawing in ModelaDB | Basis |
|---|---|---|
| Entity | Rectangle with the name | Chen: entity sets as rectangles (Fig. 10). |
| Relationship | Diamond with the name, lines to participants | Chen: relationship sets as diamonds. Binary, ternary and recursive relationships are drawn. |
| Role | Text on the connection line | Chen: roles are written on the lines. |
| Attribute | Small circle with the label beside it (not an ellipse enclosing the label), joined to its owner by a line | Chen has attributes of entities and relationships (§2.2.3); the circle-plus-label drawing is a Tool choice. |
| Key attribute | Underlined label (solid underline); optional per-attribute variant: filled circle | Tool. Chen's paper underlines keys only in relation lists (§4.1), not in the diagram. |
| Partial key (discriminator) | Dashed underline | Tool / EER convention for the discriminator of a weak entity. |
| Composite attribute | Attribute circles nested under a parent attribute circle (collapsible) | Tool. |
| Derived attribute | Dashed circle (toolbar: *Derived*) | EER convention; not in Chen. Not stored when generating a schema. |
| Multivalued attribute | Double circle (toolbar: *Multivalued*) | EER convention; not in Chen. Rule R005 warns because a relational schema needs a separate table. |
| Weak entity / dependent connection | Marking a connection *dependent* draws together: a double line on that connection, a double rectangle on the entity and a double diamond on the relationship. Unmarking reverts all three. | Chen has weak entities identified through a relationship, with a double border in Fig. 11 (§2.3, §3.1). The combined triple marking is a Tool convention. A dependent connection requires minimum >= 1 (see below). |
| Cardinality `(min,max)` | Label on each connection, e.g. `0,1`, `1,N`, `2,5` | Tool. Chen's diagram labels are maximum-style (`1`, `m`, `n`); a minimum appears in his declaration language only (§3.2). See *Cardinality semantics*. |
| Total / partial participation | Carried by the `min` of `(min,max)`: `min >= 1` total, `0` partial. Not drawn with a double line. | Tool. The double line is reserved for dependent connections. |
| Specialization / generalization | Triangle (apex up) labelled `T,D`, `T,C`, `P,D` or `P,C` (total/partial, disjoint/overlapping) joined to one supertype and up to two subtypes | EER; Chen has no subtype construct. |
| Category (union), type `U` | Circle (not a triangle) labelled `U`, drawn in the same colour family as the triangle; the apex vertex is the category, the other vertices its members (see fig5, top centre) | EER; not in Chen. Rule R003 expects at least two member entities and one category. |
| Aggregation | Rectangle around a relationship and the entities it relates, usable as a participant | EER abstraction; not in Chen. In the logical mapping an aggregation that links entities and relationships becomes its own table. |
| Post-it | Free text note | Tool feature; ignored by validation and export. |

### Cardinality semantics of the tool

A cardinality is written `min,max` on each connection, for example `1,N`.

* The `max` next to a participant is a ratio-style label for that participant (matching Chen's `1`, `m`,
  `n` end labels, §3.1): how many instances of this participant relate to one instance of the other side.
  Publisher `0,1` – Book `1,N` reads "a publisher has many books, a book has at most one publisher", i.e. `1 : N`.
* The `min` next to a participant is that participant's own participation constraint: `0` is optional, `>= 1`
  mandatory (total). This combines a participation ("look-here") reading of the minimum with ratio-style maxima.
* Arbitrary bounds such as `2,5` are accepted and validated (`min >= 0`, `max >= min`). For the relational
  mapping any maximum above 1 is treated as "many"; the exact bound is not enforced by generated DDL.
* New connections start at `0,N` whether created by dragging or by the keyboard.
* Dependent connections must have `min >= 1`: a weak entity depends totally on its owner. Marking a
  connection dependent sets `0,x` to `1,1` and keeps an existing `min >= 1`; loaded files that violate this
  trigger rule R012 (including on aggregations).

### Limits of the Chen-style drawing in this tool

* A specialization triangle is drawn with one supertype vertex and two subtype vertices, but this is a drawing
  feature, not a limit on the model: any number of subtypes can be attached (several connections may share a
  subtype vertex) and the canonical IR, validation and all generators handle them (covered by
  `src/export/__tests__/subtypeCount.test.js`).
* Relationships to aggregations are supported for drawing, but dropped from the canonical IR and generated code.
* Attribute and entity names are free text; the code generators transliterate accents and lower-case identifiers
  (`Matrícula` -> `matricula`).

## Crow's Foot

The same model can be viewed with Crow's Foot symbols (switch under *View -> notation*). Symbols derive from the
`(min,max)` pair and distinguish only optional/mandatory and one/many:

| Pair | Symbol meaning |
|---|---|
| `0,1` | optional, at most one |
| `1,1` | mandatory, exactly one |
| `0,N` | optional, many |
| `1,N` | mandatory, many |

Bounds outside this set (e.g. `2,5`) have no Crow's Foot symbol; rule CF001 flags them. Participation in Crow's
Foot is never drawn with a double line. Crow's Foot is an engineering notation with several dialects; this tool
implements a simplified style and does not reproduce a specific dialect.

## Delete policy of generated foreign keys

Only the dependent connection of a weak entity (an identifying relationship) deletes its rows with the owner:
`ON DELETE CASCADE`. Every other generated foreign key (ordinary 1:N relationships, associative tables, multivalued
attribute tables, specialization keys) uses the SQL default `NO ACTION`, so deleting a referenced row that still
has referencing rows is rejected. The same policy is applied by the ORM targets:

| Target | Dependent weak-entity key | All other keys |
|---|---|---|
| SQL (PostgreSQL, MySQL, MariaDB, SQLite) | `ON DELETE CASCADE` | no clause (`NO ACTION`) |
| Laravel | `->onDelete('cascade')` | `->onDelete('no action')` |
| Django | `models.CASCADE` | `models.DO_NOTHING` (Django has no `NO ACTION`; `DO_NOTHING` leaves the database constraint to reject the delete) |
| Prisma | `onDelete: Cascade` | `onDelete: NoAction` |
| GraphQL SDL, JSON Schema | not applicable (no referential actions) | not applicable |

Versions before 2.3.1 wrote `ON DELETE CASCADE` on every foreign key.

## Validation rules and notation

Rules R001–R012 apply to both notations, C001 only to Chen-style EER (attribute not attached to a parent) and CF001
only to Crow's Foot. The rule list with its detection logic is in `src/validation/rules/`.

Provenance of the rules: `literature` fields cite Chen (1976) with a section only where the paper supports the rule
(partially: R002 participants, R004 weak entity identified through a relationship, R012 existence dependence;
C001 attributes belong to entities and relationships). All other rules are modelling guidelines of this tool.

### Severity: errors, warnings and advice

Rules have three severities. `error` and `warning` report structural problems. `info` is advice: it is shown in the
problems panel with a blue marker and the label *suggestion*, in a separate counter, and never blocks an export or
a save. R005 (multivalued attribute becomes a separate table in the logical model), R006 (entity name looks plural),
R007 (generic relationship name), R009 (default entity name) and R010 (default attribute name) are advice. R006,
R007, R009 and R010 are name heuristics; R005 is information about the logical mapping, not a defect, because a
multivalued attribute is valid EER. A legitimate name can trigger advice (for example a singular entity named
`Compras`, or a domain term that matches a default label); this is expected and is not counted as a defect.
