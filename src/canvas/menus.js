import {
  ATTR_CIRCLE_RADIUS,
  ATTR_TEXT_PADDING,
  DEFAULT_ENTITY_WIDTH,
  DEFAULT_ENTITY_HEIGHT,
  DEFAULT_ATTRIBUTE_RADIUS_X,
  DEFAULT_ATTRIBUTE_RADIUS_Y,
  RELATIONSHIP_SIZE,
  DEFAULT_SPECIALIZATION_SIZE,
} from '../domain/constants.js';
import { diagram } from '../domain/state.js';
import * as operations from '../domain/operations.js';
import {
  formatCardinality,
  dependentCardinality,
} from '../domain/semantics.js';
import {
  cardinalityLabel,
  isAttributeOwnerWeak,
  relationshipConnectionGeometry,
} from './geometry.js';
import { t } from '../i18n/index.js';
import { logEvent } from '../research/processLog.js';

let activeOutsidePointerListener = null;

export function closeSubmenu() {
  if (diagram.submenuTimeout) {
    clearTimeout(diagram.submenuTimeout);
    diagram.submenuTimeout = null;
  }
  if (diagram.submenu) {
    diagram.submenu.remove();
    diagram.submenu = null;
    diagram.submenuRect = null;
  }
  if (diagram.currentSubmenuCloseHandler) {
    document.removeEventListener('click', diagram.currentSubmenuCloseHandler);
    diagram.currentSubmenuCloseHandler = null;
  }
  if (activeOutsidePointerListener) {
    document.removeEventListener('pointerdown', activeOutsidePointerListener, true);
    activeOutsidePointerListener = null;
  }
}

export function closeInlineEditors() {
  if (diagram.inlineInput) {
    diagram.inlineInput.blur();
  }
  if (diagram.inlineSelect) {
    diagram.inlineSelect.remove();
    diagram.inlineSelect = null;
  }
  if (diagram.inlineSpecSelect) {
    diagram.inlineSpecSelect.blur();
  }
  diagram.isEditingInline = false;
}

function attachOutsideClose(submenuEl) {
  if (activeOutsidePointerListener) {
    document.removeEventListener('pointerdown', activeOutsidePointerListener, true);
  }
  activeOutsidePointerListener = (e) => {
    if (!diagram.submenu || diagram.submenu !== submenuEl) return;
    if (submenuEl.contains(e.target)) return;
    // Let node/edge click handlers replace the submenu cleanly if clicking another diagram object
    if (e.target.closest && e.target.closest('.er-node, .er-edge, .crow-attr-row')) {
      return;
    }
    closeSubmenu();
  };
  document.addEventListener('pointerdown', activeOutsidePointerListener, true);
}

function styleAndMountSubmenu(submenu, screenX, screenY, screenWidth = 0, screenHeight = 0) {
  const canvasEl = document.getElementById('canvas');
  const canvasRect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52, width: window.innerWidth, height: window.innerHeight - 52 };

  for (let i = 0; i < submenu.children.length; i++) {
    const child = submenu.children[i];
    child.style.padding = '8px 12px';
    child.style.borderRadius = '6px';
    child.style.cursor = 'pointer';
    child.style.display = 'flex';
    child.style.alignItems = 'center';
    child.style.whiteSpace = 'nowrap';
    child.style.transition = 'background 0.2s';
    child.addEventListener('mouseover', function () {
      this.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    child.addEventListener('mouseout', function () {
      this.style.backgroundColor = 'transparent';
    });
  }

  Object.assign(submenu.style, {
    position: 'fixed',
    zIndex: '1050',
    backgroundColor: '#1f2937',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    left: '0px',
    top: '0px',
  });

  let submenuX = screenX + screenWidth / 2 - submenu.offsetWidth / 2;
  let submenuY = screenY + screenHeight + 5;

  if (submenuX < 5) submenuX = 5;
  if (submenuX + submenu.offsetWidth > window.innerWidth - 5) {
    submenuX = window.innerWidth - submenu.offsetWidth - 5;
  }
  if (submenuY + submenu.offsetHeight > window.innerHeight - 5) {
    submenuY = Math.max(5, screenY - submenu.offsetHeight - 5);
  }

  submenu.style.left = `${submenuX}px`;
  submenu.style.top = `${submenuY}px`;

  diagram.submenu = submenu;
  diagram.submenuRect = {
    x: submenuX - canvasRect.left,
    y: submenuY - canvasRect.top,
    width: submenu.offsetWidth,
    height: submenu.offsetHeight,
  };

  attachOutsideClose(submenu);
}

export function showSubmenu(element, callbacks = {}) {
  const {
    getCurrentNotation = () => 'chen',
    saveState = () => {},
    clearSelection = () => {},
    draw = () => {},
    startClickRelationMode = () => {},
    startRelationDragFromMenu = () => {},
  } = callbacks;

  const currentNotation = getCurrentNotation();
  closeSubmenu();

  const submenu = document.createElement('div');
  submenu.className = 'submenu';
  document.body.appendChild(submenu);

  const items = [];

  if (
    element.objType === 'entity' ||
    element.objType === 'relationship' ||
    element.objType === 'specialization'
  ) {
    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>',
      label: 'Relacionar',
      id: 'menuRelate',
      action(e) {
        e.preventDefault();
        e.stopPropagation();
        closeSubmenu();
        startClickRelationMode(element);
      },
    });

    if (element.objType === 'relationship' && currentNotation === 'chen') {
      items.push({
        icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /><polygon points="12 8 16 12 12 16 8 12" /></svg>',
        label: 'Mudar para Agregação',
        id: 'menuConvertToAggregation',
        action(e) {
          e.preventDefault();
          closeSubmenu();
          operations.convertRelationship(element, 'aggregation');
          saveState();
          clearSelection();
          draw();
        },
      });
    }

    if (element.objType === 'entity') {
      const addAttrTypes = [
        { label: 'Simples', primary: false, derived: false, multivalued: false, name: t('Atributo') },
        { label: 'Chave Primária', primary: true, derived: false, multivalued: false, name: 'ID' },
        { label: 'Derivado', primary: false, derived: true, multivalued: false, name: t('Deriv.') },
        { label: 'Multivalorado', primary: false, derived: false, multivalued: true, name: t('Multival.') },
      ];
      items.push({
        icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>',
        label: 'Adicionar Atributo',
        id: 'menuAddAttr',
        flyout: addAttrTypes.map((at) => ({
          label: at.label,
          action(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            closeSubmenu();
            operations.addAttribute(
              element,
              { name: at.name, primary: at.primary, derived: at.derived, multivalued: at.multivalued },
              {
                x: element.x + (element.width || DEFAULT_ENTITY_WIDTH) + 60,
                y: element.y + (element.height || DEFAULT_ENTITY_HEIGHT) / 2,
              }
            );
            saveState();
            clearSelection();
            draw();
          },
        })),
      });
    }

    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
      label: 'Deletar',
      id: 'menuDelete',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        if (element.objType === 'entity') {
          diagram.entities = diagram.entities.filter((en) => en.id !== element.id);
          diagram.attributes = diagram.attributes.filter(
            (a) => !(a.parentType === 'entity' && a.parentId === element.id)
          );
          diagram.relationships.forEach((r) => {
            r.connections = r.connections.filter((c) => c.entityId !== element.id);
          });
          diagram.specializations.forEach((s) => {
            s.connections = s.connections.filter((c) => c.entityId !== element.id);
          });
        } else if (element.objType === 'relationship') {
          diagram.relationships = diagram.relationships.filter((r) => r.id !== element.id);
          diagram.attributes = diagram.attributes.filter(
            (a) => !(a.parentType === 'relationship' && a.parentId === element.id)
          );
        } else if (element.objType === 'specialization') {
          diagram.specializations = diagram.specializations.filter((s) => s.id !== element.id);
        }
        saveState();
        clearSelection();
        draw();
      },
    });
  }

  if (element.objType === 'aggregation') {
    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>',
      label: 'Relacionar',
      id: 'menuRelate',
      action(e) {
        e.preventDefault();
        e.stopPropagation();
        closeSubmenu();
        startClickRelationMode(element);
      },
    });

    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 4 20 12 12 20 4 12" /></svg>',
      label: 'Mudar para Relacionamento',
      id: 'menuConvertToRelationship',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        operations.convertRelationship(element, 'relationship');
        saveState();
        clearSelection();
        draw();
      },
    });

    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
      label: 'Deletar',
      id: 'menuDelete',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        diagram.aggregations = diagram.aggregations.filter((a) => a.id !== element.id);
        diagram.attributes = diagram.attributes.filter(
          (a) => !(a.parentType === 'aggregation' && a.parentId === element.id)
        );
        saveState();
        clearSelection();
        draw();
      },
    });
  }

  if (
    element.objType === 'attribute' ||
    element.objType === 'derivedAttribute' ||
    element.objType === 'multivaluedAttribute'
  ) {
    const ownerWeak = isAttributeOwnerWeak(
      element,
      diagram.relationships,
      diagram.aggregations,
      diagram.attributes
    );

    if (!element.derived && !element.multivalued && !ownerWeak) {
      items.push({
        icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>',
        label: element.primary ? 'Remover Chave' : 'Definir Chave',
        id: 'menuKey',
        action(e) {
          e.preventDefault();
          closeSubmenu();
          element.primary = !element.primary;
          saveState();
          clearSelection();
          draw();
        },
      });
    }

    if (!element.derived && !element.multivalued && ownerWeak) {
      items.push({
        label:
          element.partialKey || element.primary
            ? 'Remover Chave Parcial'
            : 'Definir Chave Parcial (discriminante)',
        id: 'menuPartialKey',
        action(e) {
          e.preventDefault();
          closeSubmenu();
          const enabled = !(element.partialKey || element.primary);
          element.primary = false;
          element.partialKey = enabled;
          saveState();
          clearSelection();
          draw();
        },
      });
    }

    if (element.primary && !ownerWeak && currentNotation === 'chen') {
      items.push({
        label:
          element.keyStyle === 'filled'
            ? 'Chave: usar sublinhado (estilo Chen)'
            : 'Chave: usar círculo preenchido (variante)',
        id: 'menuKeyStyle',
        action(e) {
          e.preventDefault();
          closeSubmenu();
          element.keyStyle = element.keyStyle === 'filled' ? 'underline' : 'filled';
          saveState();
          draw();
        },
      });
    }

    const dataTypes = [
      'Texto',
      'Numérico Inteiro',
      'Numérico Real',
      'Data',
      'Data e Hora',
      'Booleano',
      'Identificador',
    ];
    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="12" height="4" rx="1"/><rect x="3" y="17" width="8" height="4" rx="1"/></svg>',
      label: element.dataType ? `Tipo: ${t(element.dataType)}` : 'Definir Tipo',
      id: 'menuSetType',
      flyout: [
        ...dataTypes.map((dt) => ({
          label: `${element.dataType === dt ? '✓ ' : '   '}${t(dt)}`,
          action(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            closeSubmenu();
            element.dataType = dt;
            saveState();
            draw();
          },
        })),
        {
          label: '— Remover tipo',
          action(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            closeSubmenu();
            element.dataType = null;
            saveState();
            draw();
          },
        },
      ],
    });

    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>',
      label: 'Adicionar Subatributo',
      id: 'menuAddSubattr',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        operations.addAttribute(element, { name: t('Subatributo') }, { x: element.x + 40, y: element.y + 30 });
        saveState();
        clearSelection();
        draw();
      },
    });

    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
      label: 'Deletar',
      id: 'menuDelete',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        diagram.attributes = diagram.attributes.filter((a) => a.id !== element.id);
        diagram.attributes.forEach((a) => {
          if (a.parentType === 'attribute' && a.parentId === element.id) a.parentId = null;
        });
        saveState();
        clearSelection();
        draw();
      },
    });

    if (operations.hasChildrenAttribute(element)) {
      items.push({
        icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
        label: element.collapsed ? 'Expandir subatributos' : 'Colapsar subatributos',
        id: 'menuCollapse',
        action(e) {
          e.preventDefault();
          closeSubmenu();
          element.collapsed = !element.collapsed;
          saveState();
          draw();
        },
      });
    }
  }

  if (element.objType === 'postit') {
    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>',
      label: 'Mudar Cor',
      id: 'menuChangeColor',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        const colors = ['#ffff88', '#fff8dc', '#90ee90', '#add8e6', '#ffb6c1', '#e6e6fa'];
        const currentIndex = colors.indexOf(element.color || colors[0]);
        element.color = colors[(currentIndex + 1) % colors.length];
        saveState();
        draw();
      },
    });

    items.push({
      icon: '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
      label: 'Deletar',
      id: 'menuDelete',
      action(e) {
        e.preventDefault();
        closeSubmenu();
        diagram.postits = diagram.postits.filter((p) => p.id !== element.id);
        saveState();
        clearSelection();
        draw();
      },
    });
  }

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'submenu-item';
    div.id = item.id;

    if (item.flyout) {
      div.innerHTML = `${item.icon || ''}<span class="text-white ml-2" style="flex:1">${item.label}</span><span style="opacity:0.5;font-size:12px">›</span>`;
      div.style.position = 'relative';

      const flyoutDiv = document.createElement('div');
      flyoutDiv.style.cssText =
        'display:none;position:absolute;left:100%;top:-8px;margin-left:2px;background:#1f2937;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.6);padding:8px;flex-direction:column;gap:4px;z-index:1051;min-width:180px;';
      item.flyout.forEach((sub) => {
        const subDiv = document.createElement('div');
        subDiv.innerHTML = `<span class="text-white" style="white-space:nowrap">${sub.label}</span>`;
        subDiv.style.cssText =
          'padding:8px 12px;border-radius:6px;cursor:pointer;display:flex;align-items:center;';
        subDiv.addEventListener('click', sub.action);
        subDiv.addEventListener('mouseover', function () {
          this.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        subDiv.addEventListener('mouseout', function () {
          this.style.backgroundColor = 'transparent';
        });
        flyoutDiv.appendChild(subDiv);
      });
      div.appendChild(flyoutDiv);

      let flyoutHideTimer = null;
      const cancelHide = () => {
        if (flyoutHideTimer) {
          clearTimeout(flyoutHideTimer);
          flyoutHideTimer = null;
        }
      };
      const scheduleHide = (relatedTarget) => {
        if (flyoutDiv.contains(relatedTarget) || div.contains(relatedTarget)) return;
        flyoutHideTimer = setTimeout(() => {
          flyoutDiv.style.display = 'none';
        }, 180);
      };

      div.addEventListener('mouseenter', () => {
        cancelHide();
        flyoutDiv.style.display = 'flex';
        const r = div.getBoundingClientRect();
        if (r.right + 190 > window.innerWidth) {
          flyoutDiv.style.left = 'auto';
          flyoutDiv.style.right = '100%';
          flyoutDiv.style.marginLeft = '0';
          flyoutDiv.style.marginRight = '4px';
        }
      });
      div.addEventListener('mouseleave', (e) => scheduleHide(e.relatedTarget));
      flyoutDiv.addEventListener('mouseenter', cancelHide);
      flyoutDiv.addEventListener('mouseleave', (e) => scheduleHide(e.relatedTarget));
    } else {
      div.innerHTML = `${item.icon || ''}<span class="text-white ml-2">${item.label}</span>`;
      div.addEventListener('click', item.action);

      if (item.id === 'menuRelate') {
        div.addEventListener('mousedown', (e) => {
          startRelationDragFromMenu(element, e);
        });
      }
    }

    submenu.appendChild(div);
  });

  const rect =
    element.objType === 'entity'
      ? {
          x: element.x,
          y: element.y,
          width: element.width || DEFAULT_ENTITY_WIDTH,
          height: element.height || DEFAULT_ENTITY_HEIGHT,
        }
      : element.objType === 'attribute' ||
          element.objType === 'derivedAttribute' ||
          element.objType === 'multivaluedAttribute'
        ? currentNotation !== 'chen' && element.hitBox
          ? element.hitBox
          : {
              x: element.x - (element.radiusX || DEFAULT_ATTRIBUTE_RADIUS_X),
              y: element.y - (element.radiusY || DEFAULT_ATTRIBUTE_RADIUS_Y),
              width: (element.radiusX || DEFAULT_ATTRIBUTE_RADIUS_X) * 2,
              height: (element.radiusY || DEFAULT_ATTRIBUTE_RADIUS_Y) * 2,
            }
        : element.objType === 'relationship'
          ? {
              x: element.x - (element.size || RELATIONSHIP_SIZE) / 2,
              y: element.y - (element.size || RELATIONSHIP_SIZE) / 2,
              width: element.size || RELATIONSHIP_SIZE,
              height: element.size || RELATIONSHIP_SIZE,
            }
          : element.objType === 'postit'
            ? {
                x: element.x,
                y: element.y,
                width: element.width || 200,
                height: element.height || 120,
              }
            : {
                x: element.x - (element.size || DEFAULT_SPECIALIZATION_SIZE) / 2,
                y: element.y - (element.size || DEFAULT_SPECIALIZATION_SIZE) / 2,
                width: element.size || DEFAULT_SPECIALIZATION_SIZE,
                height: element.size || DEFAULT_SPECIALIZATION_SIZE,
              };

  const canvasEl = document.getElementById('canvas');
  const canvasRect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52, width: window.innerWidth, height: window.innerHeight - 52 };

  const screenX = canvasRect.left + (rect.x + diagram.panOffset.x) * diagram.zoom;
  const screenY = canvasRect.top + (rect.y + diagram.panOffset.y) * diagram.zoom;
  const screenWidth = rect.width * diagram.zoom;
  const screenHeight = rect.height * diagram.zoom;

  styleAndMountSubmenu(submenu, screenX, screenY, screenWidth, screenHeight);
}

function computePolylineAnchor(points, offset) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (acc + seg >= half) {
      const rest = half - acc;
      const ratio = seg ? rest / seg : 0;
      const mx = points[i].x + ratio * (points[i + 1].x - points[i].x);
      const my = points[i].y + ratio * (points[i + 1].y - points[i].y);
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      return { x: mx + nx * offset, y: my + ny * offset };
    }
    acc += seg;
  }
  return points[Math.floor(points.length / 2)] || points[0];
}

export function showConnectionSubmenu(connInfo, x, y, callbacks = {}) {
  const {
    saveState = () => {},
    clearSelection = () => {},
    draw = () => {},
  } = callbacks;

  closeSubmenu();

  const submenu = document.createElement('div');
  submenu.className = 'submenu';
  document.body.appendChild(submenu);

  const rObj = diagram.relationships.find((rr) => rr.id === connInfo.relationshipId);
  const connectionObj = rObj
    ? connInfo.conn || rObj.connections.find((c) => c.entityId === connInfo.entityId)
    : null;

  const weakItem = document.createElement('div');
  weakItem.className = 'submenu-item';
  if (connectionObj && !connectionObj.weak) {
    weakItem.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2 L22 12 L12 22 L2 12 Z" stroke-dasharray="4 2"/></svg><span class="text-white ml-2">Dependente (identificação)</span>`;
  } else {
    weakItem.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2 L22 12 L12 22 L2 12 Z" stroke-dasharray="4 2"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg><span class="text-white ml-2">Remover dependência de identificação</span>`;
  }
  weakItem.addEventListener('click', (e) => {
    e.preventDefault();
    if (connectionObj) {
      connectionObj.weak = !connectionObj.weak;
      if (connectionObj.weak) {
        connectionObj.cardinality = dependentCardinality(connectionObj.cardinality);
      }
    }
    closeSubmenu();
    saveState();
    clearSelection();
    draw();
  });
  submenu.appendChild(weakItem);

  const deleteItem = document.createElement('div');
  deleteItem.className = 'submenu-item';
  deleteItem.innerHTML = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg><span class="text-white ml-2">Deletar</span>`;
  deleteItem.addEventListener('click', (e) => {
    e.preventDefault();
    if (rObj) {
      if (connectionObj) {
        const idx = rObj.connections.indexOf(connectionObj);
        if (idx >= 0) rObj.connections.splice(idx, 1);
      } else {
        rObj.connections = rObj.connections.filter((c) => c.entityId !== connInfo.entityId);
      }
    }
    closeSubmenu();
    diagram.selectedConnection = null;
    saveState();
    clearSelection();
    draw();
  });
  submenu.appendChild(deleteItem);

  const roleItem = document.createElement('div');
  roleItem.className = 'submenu-item';
  roleItem.innerHTML = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg><span class="text-white ml-2">Definir Papel</span>`;
  roleItem.addEventListener('click', (e) => {
    e.preventDefault();
    closeSubmenu();
    if (connectionObj) {
      const newRole = prompt(
        t('Digite o papel (role) da entidade neste relacionamento:'),
        connectionObj.role || ''
      );
      if (newRole !== null) {
        connectionObj.role = newRole;
        saveState();
        draw();
      }
    }
  });
  submenu.appendChild(roleItem);

  let anchorX = x;
  let anchorY = y;
  const lr = connectionObj?.labelRect;
  // On the cardinality pill the menu stays at the pointer: anchored on the line it would sit over
  // the pill, and the second click of a double-click (cardinality editor) would hit the menu.
  const onPill = lr && x >= lr.x && x <= lr.x + lr.width && y >= lr.y && y <= lr.y + lr.height;
  if (rObj && connectionObj && !onPill) {
    const geom = relationshipConnectionGeometry(
      rObj,
      connectionObj,
      diagram.entities,
      diagram.aggregations,
      diagram.attributes
    );
    if (geom && geom.points) {
      const anchor = computePolylineAnchor(geom.points, 24);
      anchorX = anchor.x;
      anchorY = anchor.y;
    }
  }

  const canvasEl = document.getElementById('canvas');
  const canvasRect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52, width: window.innerWidth, height: window.innerHeight - 52 };
  const screenX = canvasRect.left + (anchorX + diagram.panOffset.x) * diagram.zoom;
  const screenY = canvasRect.top + (anchorY + diagram.panOffset.y) * diagram.zoom;

  styleAndMountSubmenu(submenu, screenX + 12, screenY + 12, 0, 0);
}

export function showSpecConnectionSubmenu(connInfo, x, y, callbacks = {}) {
  const {
    saveState = () => {},
    clearSelection = () => {},
    draw = () => {},
  } = callbacks;

  closeSubmenu();
  const submenu = document.createElement('div');
  submenu.className = 'submenu';
  document.body.appendChild(submenu);

  const deleteItem = document.createElement('div');
  deleteItem.className = 'submenu-item';
  deleteItem.innerHTML = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg><span class="text-white ml-2">Deletar</span>`;
  deleteItem.addEventListener('click', (e) => {
    e.preventDefault();
    const spec = diagram.specializations.find((sp) => sp.id === connInfo.specializationId);
    if (spec && spec.connections) {
      spec.connections = spec.connections.filter(
        (c) => !(c.entityId === connInfo.entityId && c.vertex === connInfo.vertex)
      );
    }
    closeSubmenu();
    diagram.selectedSpecConnection = null;
    saveState();
    clearSelection();
    draw();
  });
  submenu.appendChild(deleteItem);

  const canvasEl = document.getElementById('canvas');
  const canvasRect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52, width: window.innerWidth, height: window.innerHeight - 52 };
  const screenX = canvasRect.left + (x + diagram.panOffset.x) * diagram.zoom;
  const screenY = canvasRect.top + (y + diagram.panOffset.y) * diagram.zoom;

  styleAndMountSubmenu(submenu, screenX + 12, screenY + 12, 0, 0);
}

export function showAggregationConnectionSubmenu(connInfo, x, y, callbacks = {}) {
  const {
    saveState = () => {},
    clearSelection = () => {},
    draw = () => {},
  } = callbacks;

  closeSubmenu();
  const submenu = document.createElement('div');
  submenu.className = 'submenu';
  document.body.appendChild(submenu);

  const deleteItem = document.createElement('div');
  deleteItem.className = 'submenu-item';
  deleteItem.innerHTML = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg><span class="text-white ml-2">Deletar</span>`;
  deleteItem.addEventListener('click', (e) => {
    e.preventDefault();
    const agg = diagram.aggregations.find((a) => a.id === connInfo.aggregationId);
    if (agg && agg.connections) {
      agg.connections = agg.connections.filter(
        (c) => !(c.entityId === connInfo.entityId || c.relationshipId === connInfo.relationshipId)
      );
    }
    closeSubmenu();
    diagram.selectedAggregationConnection = null;
    saveState();
    clearSelection();
    draw();
  });
  submenu.appendChild(deleteItem);

  const canvasEl = document.getElementById('canvas');
  const canvasRect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52, width: window.innerWidth, height: window.innerHeight - 52 };
  const screenX = canvasRect.left + (x + diagram.panOffset.x) * diagram.zoom;
  const screenY = canvasRect.top + (y + diagram.panOffset.y) * diagram.zoom;

  styleAndMountSubmenu(submenu, screenX + 12, screenY + 12, 0, 0);
}

export function showInlineEditor(item, callbacks = {}) {
  const {
    getCurrentNotation = () => 'chen',
    saveState = () => {},
    draw = () => {},
  } = callbacks;

  closeSubmenu();
  if (diagram.inlineInput) {
    diagram.inlineInput.remove();
    diagram.inlineInput = null;
  }

  const currentNotation = getCurrentNotation();
  const canvasEl = document.getElementById('canvas');
  const rect = canvasEl
    ? canvasEl.getBoundingClientRect()
    : { left: 0, top: 52 };

  let screenX = rect.left + (item.x + diagram.panOffset.x) * diagram.zoom;
  let screenY = rect.top + (item.y + diagram.panOffset.y) * diagram.zoom;

  if (item.objType === 'entity') {
    screenX = rect.left + (item.x + (item.width || DEFAULT_ENTITY_WIDTH) / 2 + diagram.panOffset.x) * diagram.zoom - 80;
    screenY = rect.top + (item.y + (item.height || DEFAULT_ENTITY_HEIGHT) / 2 + diagram.panOffset.y) * diagram.zoom;
  } else if (
    item.objType === 'attribute' ||
    item.objType === 'derivedAttribute' ||
    item.objType === 'multivaluedAttribute'
  ) {
    if (currentNotation !== 'chen' && item.hitBox) {
      screenX = rect.left + (item.hitBox.x + 10 + diagram.panOffset.x) * diagram.zoom;
      screenY = rect.top + (item.hitBox.y + item.hitBox.height / 2 + diagram.panOffset.y) * diagram.zoom;
    } else {
      screenX = rect.left + (item.x + ATTR_CIRCLE_RADIUS + ATTR_TEXT_PADDING + diagram.panOffset.x) * diagram.zoom;
    }
  }

  diagram.isEditingInline = true;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'p-2 border rounded shadow bg-gray-800 text-white';
  input.value = item.name || '';
  Object.assign(input.style, {
    position: 'absolute',
    fontSize: '16px',
    zIndex: '1000',
    width: '160px',
    left: `${screenX}px`,
    top: `${screenY - 10}px`,
    outline: 'none',
    borderRadius: '6px',
    border: '1px solid #3b82f6',
  });
  diagram.inlineInput = input;
  const openedAt = Date.now();
  diagram.inlineOpenedAt = openedAt;
  document.body.appendChild(input);
  input.focus();
  input.select();
  requestAnimationFrame(() => {
    if (diagram.inlineInput === input) {
      input.focus();
      input.select();
    }
  });

  let cancelled = false;
  let committed = false;
  const outsideClose = (ev) => {
    if (!diagram.inlineInput) return;
    if (Date.now() - openedAt < 100) return;
    if (ev.target !== diagram.inlineInput && !diagram.inlineInput.contains(ev.target)) {
      diagram.inlineInput.blur();
    }
  };
  document.addEventListener('pointerdown', outsideClose);

  input.addEventListener('blur', () => {
    if (!cancelled && !committed && Date.now() - openedAt < 100 && document.body.contains(input)) {
      input.focus();
      input.select();
      return;
    }
    if (!cancelled) {
      if (input.value !== item.name) {
        logEvent('object_renamed', {
          objType: item.objType,
          element: item.id,
          from: item.name,
          to: input.value,
        });
      }
      item.name = input.value;
      saveState();
    }
    input.remove();
    diagram.inlineInput = null;
    diagram.isEditingInline = false;
    draw();
    document.removeEventListener('pointerdown', outsideClose);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      committed = true;
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelled = true;
      input.blur();
    }
  });
}

export function showSpecTypeEditor(spec, compX, compY, callbacks = {}) {
  const { saveState = () => {}, draw = () => {} } = callbacks;
  closeSubmenu();
  if (diagram.inlineSpecSelect) {
    diagram.inlineSpecSelect.remove();
    diagram.inlineSpecSelect = null;
  }

  const canvasEl = document.getElementById('canvas');
  const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 52 };
  const screenX = canvasRect.left + (compX + diagram.panOffset.x) * diagram.zoom;
  const screenY = canvasRect.top + (compY + diagram.panOffset.y) * diagram.zoom;
  diagram.isEditingInline = true;
  const openedAt = Date.now();
  diagram.inlineOpenedAt = openedAt;

  const sel = document.createElement('select');
  sel.className = 'p-2 border rounded shadow bg-gray-800 text-white';
  Object.assign(sel.style, {
    position: 'absolute',
    fontSize: '16px',
    zIndex: '1000',
    width: '100px',
    left: `${screenX - 50}px`,
    top: `${screenY - 20}px`,
    outline: 'none',
    borderRadius: '6px',
    border: '1px solid #3b82f6',
  });
  diagram.inlineSpecSelect = sel;

  ['T,C', 'T,D', 'P,C', 'P,D', 'U'].forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    if (opt === spec.genType) option.selected = true;
    sel.appendChild(option);
  });

  document.body.appendChild(sel);
  sel.focus();
  requestAnimationFrame(() => {
    if (diagram.inlineSpecSelect === sel) {
      sel.focus();
    }
  });
  let changed = false;
  sel.addEventListener('change', () => {
    changed = true;
    spec.genType = sel.value;
    saveState();
    draw();
  });
  sel.addEventListener('blur', () => {
    if (!changed && Date.now() - openedAt < 30 && document.body.contains(sel)) {
      sel.focus();
      return;
    }
    spec.genType = sel.value;
    sel.remove();
    diagram.inlineSpecSelect = null;
    diagram.isEditingInline = false;
    saveState();
    draw();
  });
}

export function showCardinalityEditor(connection, compX, compY, callbacks = {}) {
  const { saveState = () => {}, draw = () => {} } = callbacks;
  closeSubmenu();
  if (diagram.inlineSelect) {
    diagram.inlineSelect.remove();
    diagram.inlineSelect = null;
  }

  const canvasEl = document.getElementById('canvas');
  const rect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 52 };
  const input = document.createElement('input');
  input.type = 'text';
  input.value = cardinalityLabel(connection.cardinality);
  input.setAttribute('aria-label', t('Cardinalidade mínimo,máximo'));
  input.title = t('Mínimo,máximo: 0,N; 1,1; 2,5. N representa muitos.');
  input.className = 'p-2 border rounded shadow bg-gray-800 text-white';
  Object.assign(input.style, {
    position: 'absolute',
    fontSize: '16px',
    zIndex: '1000',
    width: '150px',
    left: `${rect.left + (compX + diagram.panOffset.x) * diagram.zoom - 75}px`,
    top: `${rect.top + (compY + diagram.panOffset.y) * diagram.zoom - 20}px`,
  });
  diagram.inlineSelect = input;
  diagram.isEditingInline = true;
  const openedAt = Date.now();
  diagram.inlineOpenedAt = openedAt;

  let finished = false;
  let enterPressed = false;
  const commit = (fromBlur = false) => {
    if (finished) return;
    if (fromBlur && !enterPressed && Date.now() - openedAt < 100 && document.body.contains(input)) {
      input.focus();
      input.select();
      return;
    }
    try {
      if (!input.value.trim()) throw new Error('Informe mínimo,máximo.');
      connection.cardinality = formatCardinality(input.value);
    } catch (err) {
      input.setCustomValidity(t(err.message));
      input.reportValidity();
      input.focus();
      return;
    }
    finished = true;
    input.remove();
    diagram.inlineSelect = null;
    diagram.isEditingInline = false;
    saveState();
    draw();
  };

  input.addEventListener('input', () => input.setCustomValidity(''));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      enterPressed = true;
      commit(false);
    }
    if (event.key === 'Escape') {
      finished = true;
      input.remove();
      diagram.inlineSelect = null;
      diagram.isEditingInline = false;
    }
  });
  input.addEventListener('blur', () => commit(true));
  document.body.appendChild(input);
  input.focus();
  input.select();
  requestAnimationFrame(() => {
    if (diagram.inlineSelect === input && !finished) {
      input.focus();
      input.select();
    }
  });
}

export function showPostitEditor(postit, callbacks = {}) {
  const { saveState = () => {}, draw = () => {} } = callbacks;
  closeSubmenu();
  if (diagram.inlineInput) {
    diagram.inlineInput.remove();
    diagram.inlineInput = null;
  }

  const canvasEl = document.getElementById('canvas');
  const rect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 52 };
  const screenX = rect.left + (postit.x + diagram.panOffset.x) * diagram.zoom;
  const screenY = rect.top + (postit.y + diagram.panOffset.y) * diagram.zoom;
  const screenWidth = (postit.width || 200) * diagram.zoom;
  const screenHeight = (postit.height || 120) * diagram.zoom;

  diagram.isEditingInline = true;
  const textarea = document.createElement('textarea');
  textarea.className = 'p-2 border rounded shadow bg-yellow-100 text-black';
  textarea.value = postit.text || '';
  Object.assign(textarea.style, {
    position: 'absolute',
    fontSize: `${(diagram.fontSize || 14) * 0.9}px`,
    zIndex: '1000',
    width: `${Math.max(screenWidth - 10, 120)}px`,
    height: `${Math.max(screenHeight - 10, 80)}px`,
    left: `${screenX + 5}px`,
    top: `${screenY + 5}px`,
    resize: 'none',
    textAlign: 'left',
    outline: 'none',
    borderRadius: '6px',
    border: '1px solid #3b82f6',
  });
  diagram.inlineInput = textarea;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  textarea.addEventListener('blur', () => {
    postit.text = textarea.value;
    textarea.remove();
    diagram.inlineInput = null;
    diagram.isEditingInline = false;
    saveState();
    draw();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      textarea.blur();
    }
    if (e.key === ' ' || e.code === 'Space') {
      e.stopPropagation();
    }
  });
}
