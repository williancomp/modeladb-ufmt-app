import { isIdentifyingRelationship, isWeakEntity } from './semantics.js';
import { t } from '../i18n/index.js';
import { diagram } from './state.js';
/**
 * High-level diagram operations: create, delete, clear selection, copy/paste, move, align.
 */

import { entities, setEntities, attributes, setAttributes, relationships, setRelationships, specializations, setSpecializations, aggregations, setAggregations, postits, setPostits, entityIdCounter, setEntityIdCounter, attributeIdCounter, setAttributeIdCounter, relationshipIdCounter, setRelationshipIdCounter, specializationIdCounter, setSpecializationIdCounter, aggregationIdCounter, setAggregationIdCounter, postitIdCounter, setPostitIdCounter, selectedConnection, setSelectedConnection, selectedSpecConnection, setSelectedSpecConnection, setSelectedAggregationConnection, clipboard, setClipboard, lastMousePos, saveState } from './state.js';

import {
  ATTR_CIRCLE_RADIUS,
  ATTR_TEXT_PADDING,
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  RELATIONSHIP_SIZE,
  DEFAULT_SPECIALIZATION_SIZE,
  DEFAULT_ENTITY_WIDTH as defaultEntityWidth, DEFAULT_ENTITY_HEIGHT as defaultEntityHeight, RELATIONSHIP_SIZE as relationshipSize, DEFAULT_SPECIALIZATION_SIZE as defaultSpecializationSize,
} from './constants.js';

/**
 * Clear the selected flag on every object.
 */
export function clearSelection() {
  entities.forEach((e) => (e.selected = false));
  attributes.forEach((a) => (a.selected = false));
  relationships.forEach((r) => (r.selected = false));
  specializations.forEach((s) => (s.selected = false));
  aggregations.forEach((a) => (a.selected = false));
  postits.forEach((p) => (p.selected = false));

  setSelectedConnection(null);
  setSelectedSpecConnection(null);
  setSelectedAggregationConnection(null);
}

/**
 * Returns true when the given attribute has sub-attributes.
 * @param {Object} attr
 */
export function hasChildrenAttribute(attr) {
  return attributes.some((a) => a.parentType === 'attribute' && a.parentId === attr.id);
}

/**
 * Returns true when the attribute should be visible (parent not collapsed).
 * @param {Object} attr
 */
export function isAttributeVisible(attr) {
  if (attr.parentType === 'attribute') {
    const parent = attributes.find((a) => a.id === attr.parentId);
    if (parent && parent.collapsed) return false;
  }
  return true;
}

/**
 * Returns true when a relationship has a dependent participant.
 * @param {Object} r
 */
export function isRelationshipWeak(r) {
  return isIdentifyingRelationship(r);
}

/**
 * Returns true when an entity is involved in at least one weak connection.
 * @param {Object} e
 */
export function isEntityWeak(e) {
  return isWeakEntity(e.id, [...relationships, ...aggregations]);
}

/**
 * Create a new diagram object and push it to the correct array.
 * @param {string} type - 'entity' | 'relationship' | 'attribute' | 'derivedAttribute' |
 *   'multivaluedAttribute' | 'specialization' | 'aggregation' | 'postit'
 * @param {number} cx - X center coordinate in canvas space
 * @param {number} cy - Y center coordinate in canvas space
 * @param {Object|null} [dropTarget] - hit-test result for attribute drops
 */
export function createObjectAt(type, cx, cy, dropTarget) {
  if (type === 'attribute' || type === 'derivedAttribute' || type === 'multivaluedAttribute') {
    if (
      !dropTarget ||
      (dropTarget.type !== 'entity' &&
        dropTarget.type !== 'relationship' &&
        dropTarget.type !== 'attribute' &&
        dropTarget.type !== 'derivedAttribute' &&
        dropTarget.type !== 'aggregation')
    ) {
      return false; // caller should alert
    }

    const parentObj = dropTarget.element;
    let posX, posY;
    if (dropTarget.type === 'entity') {
      posX = parentObj.x + (parentObj.width || DEFAULT_ENTITY_WIDTH) + 30;
      posY = parentObj.y + (parentObj.height || DEFAULT_ENTITY_HEIGHT) / 2;
    } else if (dropTarget.type === 'relationship') {
      posX = parentObj.x + (parentObj.size || RELATIONSHIP_SIZE) / 2 + 30;
      posY = parentObj.y;
    } else if (dropTarget.type === 'aggregation') {
      posX = parentObj.x + (parentObj.size || RELATIONSHIP_SIZE) / 2 + 30;
      posY = parentObj.y;
    } else {
      posX = parentObj.x + 30;
      posY = parentObj.y;
    }

    const newA = {
      id: attributeIdCounter,
      x: posX,
      y: posY,
      name:
        type === 'derivedAttribute' ? t('Deriv.') : type === 'multivaluedAttribute' ? t('Multival.') : t('Simples'),
      parentType:
        dropTarget.type === 'derivedAttribute' || dropTarget.type === 'multivaluedAttribute'
          ? 'attribute'
          : dropTarget.type,
      parentId: parentObj.id,
      derived: type === 'derivedAttribute',
      multivalued: type === 'multivaluedAttribute',
      primary: false,
      dataType: null,
      collapsed: false,
      selected: false,
      objType: 'attribute',
      hitBox: {
        x: posX - ATTR_CIRCLE_RADIUS,
        y: posY - ATTR_CIRCLE_RADIUS,
        width: ATTR_CIRCLE_RADIUS * 2 + ATTR_TEXT_PADDING + 100,
        height: ATTR_CIRCLE_RADIUS * 2,
      },
    };
    setAttributeIdCounter(attributeIdCounter + 1);
    attributes.push(newA);
  } else if (type === 'entity') {
    const newE = {
      id: entityIdCounter,
      x: cx - DEFAULT_ENTITY_WIDTH / 2,
      y: cy - DEFAULT_ENTITY_HEIGHT / 2,
      width: DEFAULT_ENTITY_WIDTH,
      height: DEFAULT_ENTITY_HEIGHT,
      name: t('Entidade'),
      selected: false,
      locked: false,
      objType: 'entity',
    };
    setEntityIdCounter(entityIdCounter + 1);
    entities.push(newE);
  } else if (type === 'relationship') {
    const newR = {
      id: relationshipIdCounter,
      x: cx,
      y: cy,
      size: RELATIONSHIP_SIZE,
      name: t('Rel.'),
      connections: [],
      selected: false,
      locked: false,
      objType: 'relationship',
    };
    setRelationshipIdCounter(relationshipIdCounter + 1);
    relationships.push(newR);
  } else if (type === 'specialization') {
    const newS = {
      id: specializationIdCounter,
      x: cx,
      y: cy,
      size: DEFAULT_SPECIALIZATION_SIZE,
      genType: 'T,C',
      connections: [],
      selected: false,
      locked: false,
      objType: 'specialization',
    };
    setSpecializationIdCounter(specializationIdCounter + 1);
    specializations.push(newS);
  } else if (type === 'aggregation') {
    const newAgg = {
      id: aggregationIdCounter,
      x: cx,
      y: cy,
      size: RELATIONSHIP_SIZE,
      name: t('Agrega.'),
      connections: [],
      selected: false,
      locked: false,
      objType: 'aggregation',
    };
    setAggregationIdCounter(aggregationIdCounter + 1);
    aggregations.push(newAgg);
  } else if (type === 'postit') {
    const newP = {
      id: postitIdCounter,
      x: cx - 100,
      y: cy - 60,
      width: 200,
      height: 120,
      text: t('Clique duas vezes para editar esta anotação'),
      color: '#ffff88',
      selected: false,
      locked: false,
      objType: 'postit',
    };
    setPostitIdCounter(postitIdCounter + 1);
    postits.push(newP);
  }

  return true;
}

/**
 * Delete all currently selected objects and their orphaned children.
 */
export function deleteSelectedObjects() {
  const deletedEntityIds = entities.filter((e) => e.selected).map((e) => e.id);
  const deletedRelationshipIds = relationships.filter((r) => r.selected).map((r) => r.id);

  setEntities(entities.filter((e) => !e.selected));
  setRelationships(relationships.filter((r) => !r.selected));
  setSpecializations(specializations.filter((s) => !s.selected));
  setPostits(postits.filter((p) => !p.selected));

  setAttributes(
    attributes.filter((a) => {
      if (a.selected) return false;
      if (a.parentType === 'entity' && deletedEntityIds.includes(a.parentId)) return false;
      if (a.parentType === 'relationship' && deletedRelationshipIds.includes(a.parentId)) return false;
      return true;
    })
  );

  relationships.forEach((r) => {
    r.connections = r.connections.filter((c) => !deletedEntityIds.includes(c.entityId));
  });
  specializations.forEach((s) => {
    if (s.connections) {
      s.connections = s.connections.filter((c) => !deletedEntityIds.includes(c.entityId));
    }
  });

  if (selectedConnection) {
    const r = relationships.find((rr) => rr.id === selectedConnection.relationshipId);
    if (r) {
      r.connections = r.connections.filter((c) => c.entityId !== selectedConnection.entityId);
    }
    setSelectedConnection(null);
  }

  if (selectedSpecConnection) {
    const s = specializations.find((sp) => sp.id === selectedSpecConnection.specializationId);
    if (s && s.connections) {
      s.connections = s.connections.filter(
        (c) =>
          !(
            c.entityId === selectedSpecConnection.entityId &&
            c.vertex === selectedSpecConnection.vertex
          )
      );
    }
    setSelectedSpecConnection(null);
  }

  const deletedAggregationIds = aggregations.filter((a) => a.selected).map((a) => a.id);
  setAggregations(aggregations.filter((a) => !a.selected));
  setAttributes(
    attributes.filter((a) => {
      if (a.selected) return false;
      if (a.parentType === 'aggregation' && deletedAggregationIds.includes(a.parentId)) return false;
      return true;
    })
  );

  setSelectedConnection(null);
  setSelectedSpecConnection(null);
  setSelectedAggregationConnection(null);

  saveState();
  clearSelection();
}

/**
 * Copy all selected objects to the clipboard.
 */
export function copySelection() {
  const cb = {
    entities: [],
    attributes: [],
    relationships: [],
    specializations: [],
    aggregations: [],
    postits: [],
    boundingBox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  };

  function updateBB(obj, bb) {
    if (obj.x !== undefined && obj.y !== undefined) {
      bb.minX = Math.min(bb.minX, obj.x);
      bb.minY = Math.min(bb.minY, obj.y);
      if (obj.width && obj.height) {
        bb.maxX = Math.max(bb.maxX, obj.x + obj.width);
        bb.maxY = Math.max(bb.maxY, obj.y + obj.height);
      } else {
        const r = ATTR_CIRCLE_RADIUS;
        bb.maxX = Math.max(bb.maxX, obj.x + r);
        bb.maxY = Math.max(bb.maxY, obj.y + r);
      }
    }
  }

  entities.forEach((e) => {
    if (e.selected) { const c = JSON.parse(JSON.stringify(e)); cb.entities.push(c); updateBB(c, cb.boundingBox); }
  });
  attributes.forEach((a) => {
    if (a.selected) { const c = JSON.parse(JSON.stringify(a)); cb.attributes.push(c); updateBB(c, cb.boundingBox); }
  });
  relationships.forEach((r) => {
    if (r.selected) { const c = JSON.parse(JSON.stringify(r)); cb.relationships.push(c); updateBB(c, cb.boundingBox); }
  });
  specializations.forEach((s) => {
    if (s.selected) { const c = JSON.parse(JSON.stringify(s)); cb.specializations.push(c); updateBB(c, cb.boundingBox); }
  });
  aggregations.forEach((agg) => {
    if (agg.selected) { const c = JSON.parse(JSON.stringify(agg)); cb.aggregations.push(c); updateBB(c, cb.boundingBox); }
  });
  postits.forEach((p) => {
    if (p.selected) { const c = JSON.parse(JSON.stringify(p)); cb.postits.push(c); updateBB(c, cb.boundingBox); }
  });

  setClipboard(cb);
}

/**
 * Paste clipboard contents centred on lastMousePos.
 */
export function pasteClipboard() {
  if (!clipboard) return;

  const bb = clipboard.boundingBox;
  const centerX = (bb.minX + bb.maxX) / 2;
  const centerY = (bb.minY + bb.maxY) / 2;
  const dx = lastMousePos.x - centerX;
  const dy = lastMousePos.y - centerY;

  const entityIdMap = {};
  const attributeIdMap = {};
  const relationshipIdMap = {};
  const specializationIdMap = {};
  const aggregationIdMap = {};

  clearSelection();

  clipboard.entities.forEach((oldE) => {
    const newE = JSON.parse(JSON.stringify(oldE));
    newE.id = entityIdCounter;
    setEntityIdCounter(entityIdCounter + 1);
    newE.x += dx; newE.y += dy; newE.selected = true;
    entities.push(newE);
    entityIdMap[oldE.id] = newE.id;
  });

  clipboard.relationships.forEach((oldR) => {
    const newR = JSON.parse(JSON.stringify(oldR));
    newR.id = relationshipIdCounter;
    setRelationshipIdCounter(relationshipIdCounter + 1);
    newR.x += dx; newR.y += dy; newR.selected = true;
    if (newR.connections) {
      newR.connections = newR.connections.filter((c) => entityIdMap[c.entityId] !== undefined);
      newR.connections.forEach((c) => {
        c.entityId = entityIdMap[c.entityId];
        if (c.breakpoints) c.breakpoints.forEach((bp) => { bp.x += dx; bp.y += dy; });
      });
    }
    relationships.push(newR);
    relationshipIdMap[oldR.id] = newR.id;
  });

  clipboard.specializations.forEach((oldS) => {
    const newS = JSON.parse(JSON.stringify(oldS));
    newS.id = specializationIdCounter;
    setSpecializationIdCounter(specializationIdCounter + 1);
    newS.x += dx; newS.y += dy; newS.selected = true;
    if (newS.connections) {
      newS.connections = newS.connections.filter((c) => entityIdMap[c.entityId] !== undefined);
      newS.connections.forEach((c) => {
        c.entityId = entityIdMap[c.entityId];
        if (c.breakpoints) c.breakpoints.forEach((bp) => { bp.x += dx; bp.y += dy; });
      });
    }
    specializations.push(newS);
    specializationIdMap[oldS.id] = newS.id;
  });

  clipboard.aggregations.forEach((oldAgg) => {
    const newAgg = JSON.parse(JSON.stringify(oldAgg));
    newAgg.id = aggregationIdCounter;
    setAggregationIdCounter(aggregationIdCounter + 1);
    newAgg.x += dx; newAgg.y += dy; newAgg.selected = true;
    if (newAgg.connections) {
      newAgg.connections = newAgg.connections.filter(
        (c) =>
          (c.entityId && entityIdMap[c.entityId] !== undefined) ||
          (c.relationshipId && relationshipIdMap[c.relationshipId] !== undefined)
      );
      newAgg.connections.forEach((c) => {
        if (c.entityId && entityIdMap[c.entityId] !== undefined) c.entityId = entityIdMap[c.entityId];
        if (c.relationshipId && relationshipIdMap[c.relationshipId] !== undefined)
          c.relationshipId = relationshipIdMap[c.relationshipId];
        if (c.breakpoints) c.breakpoints.forEach((bp) => { bp.x += dx; bp.y += dy; });
      });
    }
    aggregations.push(newAgg);
    aggregationIdMap[oldAgg.id] = newAgg.id;
  });

  clipboard.attributes.forEach((oldA) => {
    const newA = JSON.parse(JSON.stringify(oldA));
    newA.id = attributeIdCounter;
    setAttributeIdCounter(attributeIdCounter + 1);
    newA.x += dx; newA.y += dy; newA.selected = true;
    if (typeof newA.collapsed !== 'boolean') newA.collapsed = false;
    if (newA.parentType === 'entity' && entityIdMap[newA.parentId] !== undefined) {
      newA.parentId = entityIdMap[newA.parentId];
    } else if (newA.parentType === 'attribute' && attributeIdMap[newA.parentId] !== undefined) {
      newA.parentId = attributeIdMap[newA.parentId];
    } else if (newA.parentType === 'relationship' && relationshipIdMap[newA.parentId] !== undefined) {
      newA.parentId = relationshipIdMap[newA.parentId];
    } else if (newA.parentType === 'aggregation' && aggregationIdMap[newA.parentId] !== undefined) {
      newA.parentId = aggregationIdMap[newA.parentId];
    } else {
      return; // parent not copied — skip
    }
    attributes.push(newA);
    attributeIdMap[oldA.id] = newA.id;
  });

  clipboard.postits.forEach((oldP) => {
    const newP = JSON.parse(JSON.stringify(oldP));
    newP.id = postitIdCounter;
    setPostitIdCounter(postitIdCounter + 1);
    newP.x += dx; newP.y += dy; newP.selected = true;
    postits.push(newP);
  });

  saveState();
}

/**
 * Move all selected (and unlocked) objects by (dx, dy).
 * @param {number} dx
 * @param {number} dy
 */
export function moveSelectionBy(dx, dy) {
  const sel = [...entities, ...attributes, ...relationships, ...specializations, ...aggregations, ...postits].filter(
    (o) => o.selected && !o.locked
  );
  if (sel.length === 0) return;
  const bends = collectFollowingBreakpoints();
  sel.forEach((o) => {
    o.x = (o.x || 0) + dx;
    o.y = (o.y || 0) + dy;
  });
  bends.forEach((bp) => {
    bp.x += dx;
    bp.y += dy;
  });
  saveState();
}

/**
 * Bend points that travel with a move of the current selection: those of every connection owned by
 * a moving relationship, specialization or aggregation, and those of connections that end on a
 * moving entity (or, for aggregations, relationship). Each point appears once.
 */
export function collectFollowingBreakpoints() {
  const moving = (o) => Boolean(o && o.selected && !o.locked);
  const entityMoves = (id) => moving(entities.find((e) => e.id === id));
  const found = new Set();
  const take = (owner, endMoves) => {
    (owner.connections || []).forEach((conn) => {
      if (moving(owner) || endMoves(conn)) (conn.breakpoints || []).forEach((bp) => found.add(bp));
    });
  };
  relationships.forEach((r) => take(r, (c) => entityMoves(c.entityId)));
  specializations.forEach((s) => take(s, (c) => entityMoves(c.entityId)));
  aggregations.forEach((a) =>
    take(a, (c) =>
      c.entityId ? entityMoves(c.entityId) : moving(relationships.find((r) => r.id === c.relationshipId))
    )
  );
  return [...found];
}

/**
 * Align selected objects to the leftmost x.
 */
export function alignSelectedLeft() {
  const sel = [...entities, ...relationships, ...specializations, ...aggregations, ...postits].filter(
    (o) => o.selected && !o.locked
  );
  if (sel.length < 2) return;
  const minX = Math.min(...sel.map((o) => o.x));
  sel.forEach((o) => (o.x = minX));
  saveState();
}

/**
 * Align selected objects to the topmost y.
 */
export function alignSelectedTop() {
  const sel = [...entities, ...relationships, ...specializations, ...aggregations, ...postits].filter(
    (o) => o.selected && !o.locked
  );
  if (sel.length < 2) return;
  const minY = Math.min(...sel.map((o) => o.y));
  sel.forEach((o) => (o.y = minY));
  saveState();
}

/**
 * Distribute selected objects evenly along the horizontal axis.
 */
export function distributeSelectedHorizontally() {
  const sel = [...entities, ...relationships, ...specializations, ...aggregations, ...postits]
    .filter((o) => o.selected && !o.locked)
    .sort((a, b) => a.x - b.x);
  if (sel.length < 3) return;
  const minX = sel[0].x;
  const maxX = sel[sel.length - 1].x;
  const step = (maxX - minX) / (sel.length - 1);
  sel.forEach((o, i) => (o.x = minX + i * step));
  saveState();
}

/**
 * Toggle locked state on all selected objects.
 */
export function toggleLockOnSelection() {
  const sel = [...entities, ...attributes, ...relationships, ...specializations, ...aggregations, ...postits].filter(
    (o) => o.selected
  );
  if (sel.length === 0) return;
  const targetState = !sel.every((o) => o.locked);
  sel.forEach((o) => (o.locked = targetState));
  saveState();
}

/** Quick connection rules shared by the editor and tests. */
export function connectObjects(first, second, options = {}) {
  const pair = [first, second];
  const entity = pair.find(object => object.objType === 'entity');
  const attribute = pair.find(object => object.objType === 'attribute');
  const parent = pair.find(object => ['entity', 'relationship'].includes(object.objType));
  if (attribute && parent) {
    attribute.parentType = parent.objType; attribute.parentId = parent.id; return true;
  }
  const relationship = pair.find(object => object.objType === 'relationship');
  const specialization = pair.find(object => object.objType === 'specialization');
  const aggregation = pair.find(object => object.objType === 'aggregation');
  // Same default for drag and quick connection: no participation or multiplicity constraint is implied.
  const defaults = {cardinality:'0,N',role:'',weak:false,breakpoints:[]};
  if (entity && relationship && !aggregation) {
    relationship.connections ||= [];
    if (!options.drag && relationship.connections.some(connection => connection.entityId === entity.id)) return false;
    relationship.connections.push({entityId:entity.id,...defaults}); return true;
  }
  if (entity && specialization) {
    specialization.connections ||= [];
    const connections = specialization.connections;
    const vertex = options.vertex ?? ([0,1,2].find(v => !connections.some(c => c.vertex === v)) ?? 2);
    if (connections.some(c => c.entityId === entity.id && (!options.drag || c.vertex === vertex))) return false;
    connections.push(options.drag ? {entityId:entity.id,vertex} : {entityId:entity.id,vertex,breakpoints:[]}); return true;
  }
  if (options.drag && aggregation && (entity || relationship)) {
    aggregation.connections ||= [];
    const key = entity ? 'entityId' : 'relationshipId';
    const target = entity || relationship;
    if (aggregation.connections.some(connection => connection[key] === target.id)) return false;
    aggregation.connections.push({[key]:target.id,...defaults}); return true;
  }
  if (options.drag && first.objType === 'entity' && second.objType === 'entity') {
    const center = object => ({x:object.x + (object.width || DEFAULT_ENTITY_WIDTH)/2,y:object.y + (object.height || DEFAULT_ENTITY_HEIGHT)/2});
    const a = center(first), b = center(second);
    createObjectAt('relationship',(a.x+b.x)/2,(a.y+b.y)/2);
    relationships.at(-1).connections = [{entityId:first.id,...defaults},{entityId:second.id,...defaults}]; return true;
  }
  return false;
}

/** Keyboard placement permits a floating attribute for subsequent connection. */
export function createElementFromKeyboard(type, cx, cy) {
      if (type === "entity") {
        diagram.entities.push({
          id: diagram.entityIdCounter++,
          x: cx - defaultEntityWidth/2,
          y: cy - defaultEntityHeight/2,
          width: defaultEntityWidth,
          height: defaultEntityHeight,
          name: t("Nova Entidade"),
          selected: true,
          locked: false,
          objType: "entity"
        });
      } else if (type === "attribute") {
        diagram.attributes.push({
          id: diagram.attributeIdCounter++,
          x: cx, y: cy,
          name: t("NovoAtributo"),
          primary: false, derived: false, multivalued: false, collapsed: false,
          parentType: null, parentId: null, dataType: null,
          selected: true, locked: false, objType: "attribute"
        });
      } else if (type === "relationship") {
        diagram.relationships.push({
          id: diagram.relationshipIdCounter++,
          x: cx, y: cy,
          size: relationshipSize,
          name: t("Rel."),
          connections: [],
          selected: true, locked: false, objType: "relationship"
        });
      } else if (type === "specialization") {
        diagram.specializations.push({
          id: diagram.specializationIdCounter++,
          x: cx, y: cy,
          size: defaultSpecializationSize,
          genType: "T,C",
          connections: [],
          selected: true, locked: false, objType: "specialization"
        });
      }

}

export function handleConnectionDrop(connection, drop, vertex = 0) {
  return connectObjects(connection.element, drop.element, {drag:true,vertex});
}

/** Context menu placement shares the same attribute defaults as toolbar creation. */
export function addAttribute(parent, flags, position) {
  const type = flags.derived ? 'derivedAttribute' : flags.multivalued ? 'multivaluedAttribute' : 'attribute';
  createObjectAt(type, position.x, position.y, {type: parent.objType, element: parent});
  const attribute = attributes.at(-1);
  Object.assign(attribute, flags, position);
  return attribute;
}

/** Conversion moves ownership of attributes and preserves all entity-connection semantics. */
export function convertRelationship(element, targetType) {
  const sourceType = element.objType;
  const target = {...element, id: targetType === 'aggregation' ? aggregationIdCounter : relationshipIdCounter, objType:targetType,
    connections: JSON.parse(JSON.stringify((element.connections || []).filter(c => targetType === 'aggregation' || c.entityId !== undefined)))};
  if (targetType === 'aggregation') {
    setAggregationIdCounter(aggregationIdCounter + 1);
    aggregations.push(target);
    setRelationships(relationships.filter(r => r.id !== element.id));
  } else {
    setRelationshipIdCounter(relationshipIdCounter + 1);
    relationships.push(target);
    setAggregations(aggregations.filter(a => a.id !== element.id));
  }
  attributes.forEach(attribute => {
    if (attribute.parentType === sourceType && attribute.parentId === element.id) {
      attribute.parentType = targetType;
      attribute.parentId = target.id;
    }
  });
  return target;
}
