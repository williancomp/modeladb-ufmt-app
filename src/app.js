import { initI18n, t, setLanguage, getLanguage } from './i18n/index.js';
import {
  INITIAL_ZOOM,
  DEFAULT_ENTITY_WIDTH as defaultEntityWidth,
  DEFAULT_ENTITY_HEIGHT as defaultEntityHeight,
} from './domain/constants.js';
import * as storage from './persistence/localStorage.js';
import * as filePersistence from './persistence/file.js';
import { showNotification } from './ui/notifications.js';
import packageInfo from '../package.json' with { type: 'json' };
import * as state from './domain/state.js';
import { diagram } from './domain/state.js';
import * as operations from './domain/operations.js';
import { formatCardinality } from './domain/semantics.js';
import { researchMode } from './research/config.js';
import { validateModel } from './validation/engine.js';
import { toCanonicalIR } from './persistence/canonicalIR.js';
import { exportCode, exporters } from './export/index.js';
import { parseSQLToModel } from './import/sqlParser.js';
import {
  logEvent,
  startSession,
  exportLog,
  diffViolations,
  snapshotViolations,
} from './research/processLog.js';
import {
  ensureParticipantName,
  getParticipantName,
  slugifyName,
} from './research/participant.js';
import {
  mountDiagramSurface,
  clientToWorld,
  findDraggableAtWorld,
} from './canvas/DiagramSurface.js';
import { trackPointerDrag } from './canvas/pointerDrag.js';
import {
  getSpecializationVertices,
  getDiagramBounds,
  updateRelationshipConnectionRects,
} from './canvas/geometry.js';
import {
  exportDiagramPNG,
  exportDiagramPDF,
  exportDiagramSVG,
} from './canvas/imageExport.js';
import { closeSubmenu } from './canvas/menus.js';

const APP_VERSION = packageInfo.version;
const localization = initI18n();
document.querySelectorAll('[data-app-version]').forEach((element) => {
  element.textContent = `ModelaDB ${APP_VERSION}`;
});

const languageSwitch = document.getElementById('language-switch');
languageSwitch.value = getLanguage();
languageSwitch.addEventListener('change', () => {
  setLanguage(languageSwitch.value);
  localization.refresh();
  updateViolations();
  refreshExportPanelIfOpen();
  draw();
});

function buildExportFilename(ext) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const who = researchMode() ? slugifyName(getParticipantName()) + '_' : '';
  return `diagrama_er_${who}${dateStr}_${timeStr}.${ext}`;
}

async function withParticipant(format, run) {
  if (!researchMode()) {
    run();
    return;
  }
  const name = await ensureParticipantName();
  if (name === null) return;
  logEvent('export', {
    format,
    participant: name,
    violations: snapshotViolations(currentViolations),
  });
  run();
}

state.setOnSave(() => {
  normalizeCardinalities();
  saveToLocalStorageDebounced();
  refreshExportPanelIfOpen();
});

const canvas = document.getElementById('canvas');
diagram.zoom = INITIAL_ZOOM;
let currentNotation = 'chen';
let currentViolations = [];
let loggedViolationKeys = new Set();

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;

document.getElementById('btnToggle').addEventListener('click', () => {
  const extraButtons = document.getElementById('extraButtons');
  const iconPlus = document.getElementById('iconPlus');
  const iconClose = document.getElementById('iconClose');

  if (extraButtons.classList.contains('hidden')) {
    extraButtons.classList.remove('hidden');
    setTimeout(() => {
      extraButtons.style.opacity = '1';
      extraButtons.style.transform = 'translateY(0)';
    }, 10);
    iconPlus.style.opacity = '0';
    setTimeout(() => {
      iconClose.style.opacity = '1';
    }, 150);
  } else {
    extraButtons.style.opacity = '0';
    extraButtons.style.transform = 'translateY(10px)';
    setTimeout(() => {
      extraButtons.classList.add('hidden');
    }, 300);
    iconClose.style.opacity = '0';
    setTimeout(() => {
      iconIconReset(iconPlus);
    }, 150);
  }
});

function iconIconReset(iconPlus) {
  if (iconPlus) iconPlus.style.opacity = '1';
}

document.addEventListener('mousedown', (e) => {
  if (Date.now() - (diagram.inlineOpenedAt || 0) < 30) return;
  if (
    diagram.inlineInput &&
    e.target !== diagram.inlineInput &&
    !diagram.inlineInput.contains(e.target)
  ) {
    diagram.inlineInput.blur();
  }
  if (
    diagram.inlineSelect &&
    e.target !== diagram.inlineSelect &&
    !diagram.inlineSelect.contains(e.target)
  ) {
    diagram.inlineSelect.blur();
  }
  if (
    diagram.inlineSpecSelect &&
    e.target !== diagram.inlineSpecSelect &&
    !diagram.inlineSpecSelect.contains(e.target)
  ) {
    diagram.inlineSpecSelect.blur();
  }
});

function resizeCanvas() {
  const navbarHeight = 52;
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight - navbarHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  diagram.mainWidth = cssWidth;
  diagram.mainHeight = cssHeight;
  draw();
}

window.addEventListener('resize', resizeCanvas);

function copySelection() {
  operations.copySelection();
}
function pasteClipboard() {
  operations.pasteClipboard();
  draw();
}
function clearSelection() {
  operations.clearSelection();
}
function resetUndoBaseline() {
  state.resetUndoBaseline();
}

window.addEventListener('beforeunload', () => {
  if (diagram.hasUnsavedChanges) {
    saveToLocalStorage();
  }
});

setInterval(() => {
  if (diagram.hasUnsavedChanges) {
    saveToLocalStorage();
  }
}, 30000);

const surface = mountDiagramSurface(canvas, {
  getCurrentNotation: () => currentNotation,
  getCurrentViolations: () => currentViolations,
  saveState,
  draw,
  onViewportUpdated: updateZoomIndicator,
  findElementById,
  createObjectAt,
  startClickRelationMode,
  exitClickRelationMode,
  startRelationDragFromMenu,
  completeRelationToTarget,
});

function draw() {
  updateViolations();
  // Connection label rectangles are derived while the surface renders (DiagramSurface.buildGraph).
  surface.refresh();
}

function scheduleDraw() {
  if (diagram.drawPending) return;
  diagram.drawPending = true;
  requestAnimationFrame(() => {
    diagram.drawPending = false;
    draw();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileSidebar = document.getElementById('mobile-sidebar');

  if (mobileMenuToggle && mobileSidebar) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileSidebar.classList.toggle('open');
    });
    canvas.addEventListener('click', () => {
      mobileSidebar.classList.remove('open');
    });
  }

  setupMobileButtons();
  addMobileListeners();
  resizeCanvas();
  loadFromLocalStorage();
  draw();
  setupDesktopButtons();
  setupKeyboardEvents();
  setupDropdownMenus();
  setupFileDropAndAbout();
  setupWelcomeModal();
});

function setupDropdownMenus() {
  const menuCategories = document.querySelectorAll('.menu-category');
  menuCategories.forEach((category) => {
    const button = category.querySelector('.menu-category-btn');
    if (button) {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        menuCategories.forEach((otherCategory) => {
          if (otherCategory !== category) {
            otherCategory.classList.remove('open');
          }
        });
        category.classList.toggle('open');
      });
    }
    const dropdown = category.querySelector('.menu-dropdown');
    if (dropdown) {
      dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  });
  document.addEventListener('click', () => {
    menuCategories.forEach((category) => {
      category.classList.remove('open');
    });
  });
}

document
  .getElementById('btnMultivaluedAttribute')
  .addEventListener('mousedown', (e) => startToolbarDrag('multivaluedAttribute', e));
document
  .getElementById('btnAggregation')
  .addEventListener('mousedown', (e) => startToolbarDrag('aggregation', e));
document
  .getElementById('btnPostit')
  .addEventListener('mousedown', (e) => startToolbarDrag('postit', e));

function addMobileListeners() {
  const mobileButtonIds = ['MultivaluedAttribute', 'Aggregation'];
  mobileButtonIds.forEach((id) => {
    const mobileBtn = document.getElementById(`btn${id}-mobile`);
    const desktopBtn = document.getElementById(`btn${id}`);
    if (mobileBtn && desktopBtn) {
      mobileBtn.addEventListener('mousedown', (e) => {
        desktopBtn.dispatchEvent(
          new MouseEvent('mousedown', {
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: true,
          })
        );
        document.getElementById('mobile-sidebar').classList.remove('open');
      });
      mobileBtn.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        desktopBtn.dispatchEvent(
          new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
          })
        );
        document.getElementById('mobile-sidebar').classList.remove('open');
      });
    }
  });
}

function setupMobileButtons() {
  const buttonIds = [
    'Entity',
    'Attribute',
    'DerivedAttribute',
    'Relationship',
    'Specialization',
    'IncreaseFont',
    'DecreaseFont',
    'Clear',
    'Export',
    'Undo',
    'Redo',
    'SaveFile',
    'OpenFile',
    'ExportSVG',
  ];

  buttonIds.forEach((id) => {
    const mobileBtn = document.getElementById(`btn${id}-mobile`);
    const desktopBtn = document.getElementById(`btn${id}`);
    if (mobileBtn && desktopBtn) {
      if (
        ['Entity', 'Attribute', 'DerivedAttribute', 'Relationship', 'Specialization'].includes(id)
      ) {
        mobileBtn.addEventListener('mousedown', (e) => {
          desktopBtn.dispatchEvent(
            new MouseEvent('mousedown', {
              clientX: e.clientX,
              clientY: e.clientY,
              bubbles: true,
            })
          );
          document.getElementById('mobile-sidebar').classList.remove('open');
        });
        mobileBtn.addEventListener('touchstart', (e) => {
          const touch = e.touches[0];
          desktopBtn.dispatchEvent(
            new MouseEvent('mousedown', {
              clientX: touch.clientX,
              clientY: touch.clientY,
              bubbles: true,
            })
          );
          document.getElementById('mobile-sidebar').classList.remove('open');
        });
      } else {
        mobileBtn.addEventListener('click', () => {
          desktopBtn.click();
          document.getElementById('mobile-sidebar').classList.remove('open');
        });
      }
    }
  });
}

function clearAllObjects() {
  diagram.entities = [];
  diagram.attributes = [];
  diagram.relationships = [];
  diagram.specializations = [];
  diagram.aggregations = [];
  diagram.postits = [];
  diagram.fontSize = 18;
  clearSelection();
  draw();
  saveState();
}

function setupDesktopButtons() {
  document
    .getElementById('btnEntity')
    .addEventListener('mousedown', (e) => startToolbarDrag('entity', e));
  document
    .getElementById('btnAttribute')
    .addEventListener('mousedown', (e) => startToolbarDrag('attribute', e));
  document
    .getElementById('btnDerivedAttribute')
    .addEventListener('mousedown', (e) => startToolbarDrag('derivedAttribute', e));
  document
    .getElementById('btnRelationship')
    .addEventListener('mousedown', (e) => startToolbarDrag('relationship', e));
  document
    .getElementById('btnSpecialization')
    .addEventListener('mousedown', (e) => startToolbarDrag('specialization', e));
  document.getElementById('btnIncreaseFont').addEventListener('click', () => {
    diagram.fontSize += 2;
    draw();
  });
  document.getElementById('btnDecreaseFont').addEventListener('click', () => {
    diagram.fontSize = Math.max(8, diagram.fontSize - 2);
    draw();
  });
  document.getElementById('btnClearFloating').addEventListener('click', clearAllObjects);
  document.getElementById('btnClear-mobile').addEventListener('click', clearAllObjects);

  document
    .getElementById('btnExport')
    .addEventListener('click', () =>
      withParticipant('png', () => exportDiagramPNG(currentNotation, buildExportFilename))
    );
  const btnExportSVG = document.getElementById('btnExportSVG');
  if (btnExportSVG) {
    btnExportSVG.addEventListener('click', () =>
      withParticipant('svg', () => {
        exportDiagramSVG(currentNotation, buildExportFilename);
        showNotification('Exportado como SVG', 'success');
      })
    );
  }
  const btnExportSQL = document.getElementById('btnExportSQL');
  if (btnExportSQL) btnExportSQL.addEventListener('click', openExportPanel);
  const btnExportPDF = document.getElementById('btnExportPDF');
  if (btnExportPDF) {
    btnExportPDF.addEventListener('click', () =>
      withParticipant('pdf', () => exportDiagramPDF(currentNotation, showNotification))
    );
  }
  const btnToggleGrid = document.getElementById('btnToggleGrid');
  if (btnToggleGrid) btnToggleGrid.addEventListener('click', toggleGrid);
  const btnTutorial = document.getElementById('btnTutorial');
  if (btnTutorial) btnTutorial.addEventListener('click', openTutorialPanel);

  const NOTATION_INFO = {
    chen: {
      tag: 'ER',
      label: 'EER estilo Chen',
      sub: 'ER / EER',
      menuLabel: 'Notação: EER estilo Chen',
      title: 'Modelo Entidade-Relacionamento estendido (EER) desenhado em estilo Chen',
    },
    crow: {
      tag: 'CF',
      label: "Crow's Foot (IE)",
      sub: 'Information Engineering',
      menuLabel: "Notação: Crow's Foot (IE)",
      title: 'Information Engineering — uso conceitual simplificado',
    },
  };

  function updateNotationUI() {
    const info = NOTATION_INFO[currentNotation] || NOTATION_INFO.chen;
    const badge = document.getElementById('notation-badge');
    const badgeTag = document.getElementById('notation-badge-tag');
    const badgeLabel = document.getElementById('notation-badge-label');
    const badgeSub = document.getElementById('notation-badge-sub');
    if (badge) {
      badge.className = `notation-${currentNotation}`;
      badge.title = info.title;
    }
    if (badgeTag) badgeTag.textContent = info.tag;
    if (badgeLabel) badgeLabel.textContent = info.label;
    if (badgeSub) badgeSub.textContent = info.sub;
    ['chen', 'crow'].forEach((n) => {
      const btn = document.getElementById(
        `btnNotation${n.charAt(0).toUpperCase() + n.slice(1)}`
      );
      if (btn) btn.setAttribute('aria-checked', n === currentNotation ? 'true' : 'false');
    });
  }

  document.addEventListener('modeladb:notation-loaded', updateNotationUI);
  updateNotationUI();

  function setNotation(n) {
    if (!['chen', 'crow'].includes(n) || n === currentNotation) return;
    if (n === 'chen') {
      diagram.entities.forEach((e) => {
        if (e._preCrowWidth !== undefined) {
          e.width = e._preCrowWidth;
          e.height = e._preCrowHeight;
          delete e._preCrowWidth;
          delete e._preCrowHeight;
        }
      });
    } else {
      diagram.entities.forEach((e) => {
        delete e._preCrowWidth;
        delete e._preCrowHeight;
      });
    }
    logEvent('notation_changed', { from: currentNotation, to: n });
    currentNotation = n;
    updateNotationUI();
    scheduleDraw();
  }

  const btnNotationChen = document.getElementById('btnNotationChen');
  const btnNotationCrow = document.getElementById('btnNotationCrow');
  if (btnNotationChen) btnNotationChen.addEventListener('click', () => setNotation('chen'));
  if (btnNotationCrow) btnNotationCrow.addEventListener('click', () => setNotation('crow'));

  const btnImportSQL = document.getElementById('btnImportSQL');
  if (btnImportSQL) btnImportSQL.addEventListener('click', openImportPanel);

  const panel = document.getElementById('sidePanel');
  const tabTut = document.getElementById('panelTabTutorial');
  const btnClose = document.getElementById('panelClose');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      panel.style.display = 'none';
      panel._widthResizeReady = false;
    });
  }
  if (tabTut) tabTut.addEventListener('click', showTutorialPanel);

  document.getElementById('btnUndoFloating').addEventListener('click', undo);
  document.getElementById('btnRedoFloating').addEventListener('click', redo);
  document
    .getElementById('btnSaveFile')
    .addEventListener('click', () => withParticipant('merdb', saveDiagramToFile));
  document.getElementById('btnOpenFile').addEventListener('click', openFileSelector);

  const btnShareLink = document.getElementById('btnShareLink');
  if (btnShareLink) btnShareLink.addEventListener('click', shareDiagramURL);

  loadFromURL().then(() => {
    scheduleDraw();
  });
}

async function shareDiagramURL() {
  try {
    normalizeCardinalities();
    const jsonStr = filePersistence.serializeDiagram(diagramData());
    const stream = new Blob([jsonStr]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const buffer = await response.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const encoded = encodeURIComponent(btoa(binary));
    const url = window.location.origin + window.location.pathname + '?m=' + encoded;

    if (url.length > 8000) {
      showNotification(
        'Modelo muito grande para URL. O download (.merdb) será iniciado automaticamente.',
        'warning'
      );
      saveDiagramToFile();
      return;
    }

    await navigator.clipboard.writeText(url);
    showNotification('Link copiado para a área de transferência!', 'success');
  } catch (err) {
    console.error(err);
    showNotification('Erro ao gerar o link.', 'error');
  }
}

async function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get('m');
  if (!m) return;

  try {
    const binaryString = atob(decodeURIComponent(m));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(decompressedStream);
    const jsonStr = await response.text();
    applyLoadedDiagram(filePersistence.parseDiagram(jsonStr));

    const newUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
    showNotification('Modelo carregado via link!', 'success');
  } catch (err) {
    console.error(err);
    showNotification('Link inválido ou expirado.', 'error');
  }
}

function toggleGrid() {
  diagram.gridEnabled = !diagram.gridEnabled;
  showNotification(diagram.gridEnabled ? 'Grade ativada' : 'Grade desativada', 'info');
  draw();
}

function setupKeyboardEvents() {
  document.addEventListener('keydown', (e) => {
    if (diagram.isEditingInline) return;
    if (
      document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.tagName === 'SELECT' ||
        document.activeElement.isContentEditable)
    ) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copySelection();
      showNotification('Copiado!', 'success');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      pasteClipboard();
      showNotification('Colado!', 'success');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      [
        ...diagram.entities,
        ...diagram.attributes,
        ...diagram.relationships,
        ...diagram.specializations,
        ...diagram.aggregations,
        ...diagram.postits,
      ].forEach((obj) => {
        obj.selected = true;
      });
      showNotification('Todos os objetos selecionados', 'info');
      scheduleDraw();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      zoomIn();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      zoomOut();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      zoomReset();
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      zoomToFit();
      return;
    }

    if (e.code === 'Space') {
      setPanHintActive(true);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      closeSubmenu();
      if (diagram.isDraggingConnection) {
        exitClickRelationMode();
      }
      if (diagram.draggingToolbarType) {
        cleanupToolbarDrag();
        draw();
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelectedObjects();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')
    ) {
      e.preventDefault();
      redo();
    } else if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown'
    ) {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 10;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;
      moveSelectionBy(dx, dy);
    } else if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
      toggleGrid();
    } else if (e.shiftKey && e.key.toLowerCase() === 'l') {
      alignSelectedLeft();
    } else if (e.shiftKey && e.key.toLowerCase() === 't') {
      alignSelectedTop();
    } else if (e.shiftKey && e.key.toLowerCase() === 'd') {
      distributeSelectedHorizontally();
    } else if (e.shiftKey && e.key.toLowerCase() === 'k') {
      toggleLockOnSelection();
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      createElementFromKeyboard('entity');
    } else if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      createElementFromKeyboard('attribute');
    } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      createElementFromKeyboard('relationship');
    } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      createElementFromKeyboard('specialization');
    } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      connectSelectedElements();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      setPanHintActive(false);
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement) {
      const role = document.activeElement.getAttribute('role');
      if (role === 'button' || document.activeElement.classList.contains('menu-item')) {
        e.preventDefault();
        document.activeElement.click();
      }
    }
  });
}

function createElementFromKeyboard(type) {
  const cx = diagram.mainWidth / 2 / diagram.zoom - diagram.panOffset.x;
  const cy = diagram.mainHeight / 2 / diagram.zoom - diagram.panOffset.y;

  operations.createElementFromKeyboard(type, cx, cy);
  clearSelection();
  let lastObj = null;
  if (type === 'entity') lastObj = diagram.entities[diagram.entities.length - 1];
  if (type === 'attribute') lastObj = diagram.attributes[diagram.attributes.length - 1];
  if (type === 'relationship') lastObj = diagram.relationships[diagram.relationships.length - 1];
  if (type === 'specialization')
    lastObj = diagram.specializations[diagram.specializations.length - 1];
  if (lastObj) lastObj.selected = true;

  logEvent('object_created', { objType: type, via: 'keyboard' });
  saveState();
  draw();
  showNotification('Elemento criado (Use setas para mover)', 'success');
}

function connectSelectedElements() {
  const selected = [
    ...diagram.entities,
    ...diagram.attributes,
    ...diagram.relationships,
    ...diagram.specializations,
    ...diagram.aggregations,
  ].filter((obj) => obj.selected);
  if (selected.length !== 2) {
    showNotification('Selecione exatamente 2 elementos para conectar (Ctrl/Cmd+Click)', 'warning');
    return;
  }

  const [obj1, obj2] = selected;
  const connected = operations.connectObjects(obj1, obj2);
  if (connected) {
    saveState();
    draw();
    showNotification('Elementos conectados', 'success');
  } else {
    showNotification('Combinação de elementos inválida para conexão rápida', 'error');
  }
}

function moveSelectionBy(dx, dy) {
  operations.moveSelectionBy(dx, dy);
  draw();
}
function alignSelectedLeft() {
  operations.alignSelectedLeft();
  draw();
}
function alignSelectedTop() {
  operations.alignSelectedTop();
  draw();
}
function distributeSelectedHorizontally() {
  operations.distributeSelectedHorizontally();
  draw();
}
function toggleLockOnSelection() {
  operations.toggleLockOnSelection();
  draw();
}
function deleteSelectedObjects() {
  closeSubmenu();
  operations.deleteSelectedObjects();
  draw();
}

function setupFileDropAndAbout() {
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
      loadDiagramFromFile(event.target.files[0]);
      fileInput.value = '';
    }
  });

  canvas.addEventListener('dragover', (event) => {
    event.preventDefault();
    canvas.classList.add('border-4', 'border-blue-500', 'border-dashed');
  });

  canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('border-4', 'border-blue-500', 'border-dashed');
  });

  canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    canvas.classList.remove('border-4', 'border-blue-500', 'border-dashed');
    if (event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (file.name.endsWith('.merdb')) {
        loadDiagramFromFile(file);
      } else {
        showNotification('Formato de arquivo não suportado. Use arquivos .merdb', 'error');
      }
    }
  });

  document.getElementById('btnAbout').addEventListener('click', () => {
    document.getElementById('aboutModal').classList.remove('hidden');
  });

  document.getElementById('aboutCloseBtn').addEventListener('click', () => {
    document.getElementById('aboutModal').classList.add('hidden');
  });
}

function setupWelcomeModal() {
  const welcomeModal = document.getElementById('welcomeModal');
  const closeWelcomeBtn = document.getElementById('closeWelcomeBtn');
  const startUsingBtn = document.getElementById('startUsingBtn');

  const hasVisited = localStorage.getItem('modelaDBVisited');
  if (!hasVisited) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        welcomeModal.classList.remove('hidden');
      })
    );
  }

  function closeWelcome() {
    welcomeModal.classList.add('hidden');
    localStorage.setItem('modelaDBVisited', 'true');
  }

  closeWelcomeBtn.addEventListener('click', closeWelcome);
  startUsingBtn.addEventListener('click', closeWelcome);
}

function loadFromLocalStorage() {
  const data = storage.loadFromLocalStorage();
  if (!data) return false;
  applyLoadedDiagram(data);
  return true;
}

function saveToLocalStorage() {
  normalizeCardinalities();
  const saved = storage.saveToLocalStorage(diagramData());
  showNotification(
    saved ? 'Diagrama salvo com sucesso!' : 'Erro ao salvar',
    saved ? 'success' : 'error'
  );
  return saved;
}

function saveToLocalStorageDebounced() {
  storage.scheduleLocalStorageSave(diagramData, (saved) => {
    if (saved) showNotification('Diagrama salvo com sucesso!', 'success');
  });
}

function normalizeCardinalities() {
  for (const relationship of [...diagram.relationships, ...diagram.aggregations]) {
    for (const connection of relationship.connections || []) {
      if (!connection.cardinality) continue;
      try {
        connection.cardinality = formatCardinality(connection.cardinality);
      } catch {
        /* Preserva o valor para R002 sinalizar. */
      }
    }
  }
  updateRelationshipConnectionRects(
    diagram.relationships,
    diagram.entities,
    diagram.aggregations,
    diagram.attributes,
    currentNotation,
    diagram.fontSize
  );
}

function saveState() {
  normalizeCardinalities();
  state.saveState();
}

function refreshExportPanelIfOpen() {
  const ta = document.getElementById('codePreview');
  if (!ta) return;
  renderExportPanel();
}

function saveDiagramToFile() {
  try {
    normalizeCardinalities();
    filePersistence.saveDiagramToFile(diagramData(true), buildExportFilename('merdb'));
    showNotification('Diagrama salvo com sucesso!', 'success');
  } catch (error) {
    showNotification('Erro ao salvar o arquivo: ' + error.message, 'error');
  }
}

function openFileSelector() {
  filePersistence.openFileSelector();
}

function loadDiagramFromFile(file) {
  filePersistence.loadDiagramFromFile(
    file,
    (data) => {
      const modal = document.getElementById('loadModal');
      modal.classList.remove('hidden');
      document.getElementById('loadCancelBtn').onclick = () => modal.classList.add('hidden');
      document.getElementById('loadConfirmBtn').onclick = () => {
        applyLoadedDiagram(data);
        saveToLocalStorage();
        draw();
        modal.classList.add('hidden');
        showNotification('Diagrama carregado com sucesso!', 'success');
      };
    },
    (error) => showNotification('Erro ao carregar o arquivo: ' + error.message, 'error')
  );
}

function undo() {
  closeSubmenu();
  state.undo(draw);
  saveToLocalStorageDebounced();
  refreshExportPanelIfOpen();
}

function redo() {
  closeSubmenu();
  state.redo(draw);
  saveToLocalStorageDebounced();
  refreshExportPanelIfOpen();
}

function createObjectAt(type, cx, cy) {
  const drop = ['attribute', 'derivedAttribute', 'multivaluedAttribute'].includes(type)
    ? findDraggableAtWorld(cx, cy, currentNotation)
    : null;
  if (!operations.createObjectAt(type, cx, cy, drop)) {
    alert(
      t(
        'O atributo deve ser arrastado sobre uma entidade, relacionamento, outro atributo ou agregação.'
      )
    );
  } else {
    logEvent('object_created', { objType: type, via: 'toolbar' });
    saveState();
  }
  cleanupToolbarDrag();
  draw();
}

function startToolbarDrag(type, evt) {
  evt.preventDefault();
  const startX = evt.clientX ?? evt.pageX;
  const startY = evt.clientY ?? evt.pageY;
  diagram.toolbarDrag = {
    type,
    startX,
    startY,
    isDragging: false,
    source: evt.currentTarget,
  };
  document.addEventListener('mousemove', onToolbarDragMove);
  document.addEventListener('mouseup', onToolbarDragEnd);
}

/**
 * Small copy of the toolbar button that follows the pointer while an object is being dragged out of
 * the toolbar or while click placement is armed. It lives outside the diagram surface, so moving it
 * costs no React render and no validation.
 */
function moveToolbarGhost(source, cx, cy) {
  let ghost = document.getElementById('toolbarDragGhost');
  if (!ghost && source) {
    ghost = source.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.id = 'toolbarDragGhost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText =
      'position:fixed;z-index:60;pointer-events:none;opacity:.75;transform:translate(-50%,-50%);' +
      'background:#1f2937;border-radius:6px;padding:6px;margin:0;';
    document.body.appendChild(ghost);
  }
  if (ghost) {
    ghost.style.left = `${cx}px`;
    ghost.style.top = `${cy}px`;
  }
}

function removeToolbarGhost() {
  document.removeEventListener('mousemove', onGhostFollow);
  document.getElementById('toolbarDragGhost')?.remove();
}

let ghostSource = null;
function onGhostFollow(evt) {
  moveToolbarGhost(ghostSource, evt.clientX, evt.clientY);
}

function onToolbarDragMove(evt) {
  if (!diagram.toolbarDrag) return;
  const cx = evt.clientX ?? evt.pageX;
  const cy = evt.clientY ?? evt.pageY;
  const distance = Math.hypot(cx - diagram.toolbarDrag.startX, cy - diagram.toolbarDrag.startY);

  if (!diagram.toolbarDrag.isDragging && distance > 5) {
    diagram.toolbarDrag.isDragging = true;
    diagram.draggingToolbarType = diagram.toolbarDrag.type;
    ghostSource = diagram.toolbarDrag.source;
  }
  if (diagram.toolbarDrag.isDragging) {
    const wPos = clientToWorld(cx, cy);
    diagram.draggingNewObj = { type: diagram.toolbarDrag.type, x: wPos.x, y: wPos.y };
    moveToolbarGhost(ghostSource, cx, cy);
  }
}

function onToolbarDragEnd(evt) {
  if (!diagram.toolbarDrag) return;
  document.removeEventListener('mousemove', onToolbarDragMove);
  document.removeEventListener('mouseup', onToolbarDragEnd);

  const cx = evt.clientX ?? evt.pageX;
  const cy = evt.clientY ?? evt.pageY;
  const rect = canvas.getBoundingClientRect();
  const wPos = clientToWorld(cx, cy);
  const viewportX = cx - rect.left;
  const viewportY = cy - rect.top;
  const isInsideCanvas =
    viewportX >= 0 && viewportX <= rect.width && viewportY >= 0 && viewportY <= rect.height;

  if (diagram.toolbarDrag.isDragging) {
    if (isInsideCanvas) {
      createObjectAt(diagram.toolbarDrag.type, wPos.x, wPos.y);
    }
    cleanupToolbarDrag();
  } else {
    diagram.draggingToolbarType = diagram.toolbarDrag.type;
    diagram.clickPlacementMode = true;
    ghostSource = diagram.toolbarDrag.source;
    moveToolbarGhost(ghostSource, cx, cy);
    document.addEventListener('mousemove', onGhostFollow);
    if (isInsideCanvas) {
      diagram.draggingNewObj = {
        type: diagram.toolbarDrag.type,
        x: wPos.x,
        y: wPos.y,
      };
    }
  }
  diagram.toolbarDrag = null;
  draw();
}

function cleanupToolbarDrag() {
  removeToolbarGhost();
  diagram.draggingToolbarType = null;
  diagram.draggingNewObj = null;
  diagram.clickPlacementMode = false;
  diagram.toolbarDrag = null;
}

function startClickRelationMode(element) {
  const centerX =
    element.objType === 'entity'
      ? element.x + (element.width || defaultEntityWidth) / 2
      : element.x;
  const centerY =
    element.objType === 'entity'
      ? element.y + (element.height || defaultEntityHeight) / 2
      : element.y;

  diagram.isDraggingConnection = true;
  diagram.relationClickMode = true;
  diagram.draggingConnection = {
    type: element.objType,
    element,
    start: { x: centerX, y: centerY },
    current: { x: centerX, y: centerY },
  };
  clearSelection();
  draw();
  showNotification('Clique em outro objeto para criar o relacionamento', 'info');
}

function exitClickRelationMode() {
  diagram.isDraggingConnection = false;
  diagram.relationClickMode = false;
  diagram.draggingConnection = null;
  draw();
}

function completeRelationToTarget(targetDrop) {
  if (!diagram.isDraggingConnection || !diagram.draggingConnection) return;
  if (targetDrop && targetDrop.element) {
    handleConnectionDrop(diagram.draggingConnection, targetDrop);
    saveState();
    showNotification('Relacionamento criado com sucesso!', 'success');
  } else {
    showNotification('Clique em um objeto válido para relacionar', 'info');
  }
  exitClickRelationMode();
}

function startRelationDragFromMenu(element, startEvt) {
  diagram.relationMenuSource = element;
  const startClient = { x: startEvt.clientX, y: startEvt.clientY };

  const onMove = (moveEvt) => {
    if (!diagram.relationMenuSource) return;
    if (
      !diagram.isDraggingConnection &&
      Math.hypot(moveEvt.clientX - startClient.x, moveEvt.clientY - startClient.y) >= 5
    ) {
      diagram.isDraggingConnection = true;
      diagram.draggingRelationFromMenu = true;
      closeSubmenu();
      const pos = clientToWorld(moveEvt.clientX, moveEvt.clientY);
      diagram.draggingConnection = {
        type: element.objType,
        element,
        start: {
          x: element.x + (element.width || element.size || 0) / 2,
          y: element.y + (element.height || element.size || 0) / 2,
        },
        current: pos,
      };
      clearSelection();
    }
    if (diagram.isDraggingConnection && diagram.draggingConnection) {
      diagram.draggingConnection.current = clientToWorld(moveEvt.clientX, moveEvt.clientY);
      draw();
    }
  };

  const finish = (upEvt) => {
    if (
      diagram.isDraggingConnection &&
      diagram.draggingConnection &&
      diagram.draggingRelationFromMenu
    ) {
      if (upEvt) {
        const pos = clientToWorld(upEvt.clientX, upEvt.clientY);
        const drop = findDraggableAtWorld(pos.x, pos.y, currentNotation);
        if (drop) {
          handleConnectionDrop(diagram.draggingConnection, drop);
          saveState();
          showNotification('Relacionamento criado com sucesso!', 'success');
        }
      }
      diagram.isDraggingConnection = false;
      diagram.draggingConnection = null;
      diagram.draggingRelationFromMenu = false;
      draw();
    }
    diagram.relationMenuSource = null;
  };

  // A cancelled pointer (touch taken by the system) abandons the connection without dropping it.
  trackPointerDrag({ onMove, onEnd: finish, onCancel: () => finish(null) });
}

function handleConnectionDrop(connection, drop) {
  const spec =
    connection.type === 'specialization'
      ? connection.element
      : drop.type === 'specialization'
        ? drop.element
        : null;
  let vertex = 0;
  if (spec) {
    const position = connection.current || connection.start;
    const distances = getSpecializationVertices(spec).map((point) =>
      Math.hypot(point.x - position.x, point.y - position.y)
    );
    vertex = distances.indexOf(Math.min(...distances));
  }
  operations.handleConnectionDrop(connection, drop, vertex);
}

// ═══════════════════════════════════════════════════════════════════
// PAINEL FIXO DE VALIDAÇÃO
// ═══════════════════════════════════════════════════════════════════

function updateViolations() {
  currentViolations = validateModel(
    {
      entities: diagram.entities,
      attributes: diagram.attributes,
      relationships: diagram.relationships,
      specializations: diagram.specializations,
      aggregations: diagram.aggregations,
    },
    currentNotation
  );
  loggedViolationKeys = diffViolations(loggedViolationKeys, currentViolations);
  syncValidationDock();
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
let lastViolationSignature = null;
let validationDockCollapsed = true;

function violationSignature(violations) {
  return violations
    .map((v) => `${v.ruleId}|${v.elementType}|${v.elementId}|${v.message}`)
    .join('\n');
}

function findElementById(id, type) {
  const all = [
    ...diagram.entities,
    ...diagram.attributes,
    ...diagram.relationships,
    ...diagram.specializations,
    ...diagram.aggregations,
    ...diagram.postits,
  ];
  return (
    all.find((obj) => String(obj.id) === String(id) && (!type || obj.objType === type)) || null
  );
}

function describeViolationTarget(violation) {
  const el = findElementById(violation.elementId, violation.elementType);
  if (!el) return violation.name;
  const typeLabel = t(
    {
      entity: 'entidade',
      attribute: 'atributo',
      relationship: 'relacionamento',
      specialization: 'generalização',
      aggregation: 'agregação',
    }[el.objType] || ''
  );
  const name = (el.name || '').trim();
  if (!name) return typeLabel ? `${t('(sem nome)')} — ${typeLabel}` : violation.name;
  return typeLabel ? `${name} — ${typeLabel}` : name;
}

function focusViolationElement(elementId, elementType) {
  const el = findElementById(elementId, elementType);
  if (!el) return;
  const cx = el.x + (el.width ? el.width / 2 : 0);
  const cy = el.y + (el.height ? el.height / 2 : 0);
  clearSelection();
  el.selected = true;
  centerViewportOn(cx, cy);
}

function escapeHTML(str) {
  return String(str).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );
}

function syncValidationDock(force = false) {
  const dock = document.getElementById('validationDock');
  if (!dock) return;

  const signature = violationSignature(currentViolations);
  if (!force && signature === lastViolationSignature) return;
  lastViolationSignature = signature;

  const counts = { error: 0, warning: 0, info: 0 };
  currentViolations.forEach((v) => {
    if (counts[v.severity] !== undefined) counts[v.severity]++;
  });
  const total = currentViolations.length;
  const worst = counts.error
    ? 'error'
    : counts.warning
      ? 'warning'
      : counts.info
        ? 'info'
        : 'clean';
  dock.setAttribute('data-severity', worst);

  const icon = document.getElementById('validationDockIcon');
  const title = document.getElementById('validationDockTitle');
  const countsEl = document.getElementById('validationDockCounts');

  if (icon) icon.textContent = worst === 'clean' ? '✓' : worst === 'error' ? '✕' : '!';
  if (title) {
    title.textContent =
      total === 0 ? 'Modelo sem problemas' : total === 1 ? '1 problema' : `${total} problemas`;
  }
  if (countsEl) {
    const chips = [];
    if (counts.error)
      chips.push(
        `<span class="vc vc-error" title="Erros">${counts.error} erro${counts.error > 1 ? 's' : ''}</span>`
      );
    if (counts.warning)
      chips.push(
        `<span class="vc vc-warning" title="Avisos">${counts.warning} aviso${counts.warning > 1 ? 's' : ''}</span>`
      );
    if (counts.info)
      chips.push(`<span class="vc vc-info" title="Sugestões">${counts.info}</span>`);
    countsEl.innerHTML = chips.join('');
  }

  const body = document.getElementById('validationDockBody');
  if (!body) return;

  if (total === 0) {
    body.innerHTML =
      '<div id="validationDockEmpty">Nenhum problema encontrado no modelo atual.</div>';
    return;
  }

  let ul = document.getElementById('validationDockList');
  if (!ul) {
    body.innerHTML = '<ul id="validationDockList"></ul>';
    ul = document.getElementById('validationDockList');
  }

  const ordered = [...currentViolations].sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    return s !== 0 ? s : String(a.ruleId).localeCompare(String(b.ruleId));
  });

  ul.innerHTML = ordered
    .map(
      (v) => `
        <li class="sev-${v.severity}" data-element-id="${escapeHTML(v.elementId)}" data-element-type="${escapeHTML(v.elementType)}"
            data-rule="${escapeHTML(v.ruleId)}" tabindex="0"
            title="Clique para localizar no diagrama e ver a explicação">
          <span class="v-dot" aria-hidden="true"></span>
          <span class="v-text">
            <span class="v-title">${escapeHTML(v.name)}<span class="v-rule">${escapeHTML(v.ruleId)}</span></span>
            <span class="v-where">${escapeHTML(describeViolationTarget(v))}</span>
            <span class="v-msg">${escapeHTML(v.message)}</span>
          </span>
        </li>`
    )
    .join('');

  ul.querySelectorAll('li[data-element-id]').forEach((li) => {
    const go = () => {
      ul.querySelectorAll('li.expanded').forEach((o) => {
        if (o !== li) o.classList.remove('expanded');
      });
      li.classList.toggle('expanded');
      logEvent('panel_item_click', {
        rule: li.getAttribute('data-rule'),
        element: li.getAttribute('data-element-id'),
        expanded: li.classList.contains('expanded'),
      });
      focusViolationElement(
        li.getAttribute('data-element-id'),
        li.getAttribute('data-element-type')
      );
    };
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });
}

function setValidationDockCollapsed(collapsed) {
  const dock = document.getElementById('validationDock');
  const toggle = document.getElementById('validationDockToggle');
  if (!dock) return;
  validationDockCollapsed = collapsed;
  dock.classList.toggle('collapsed', collapsed);
  if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
}

function setupValidationDock() {
  const dock = document.getElementById('validationDock');
  const header = document.getElementById('validationDockHeader');
  if (!dock || !header) return;
  header.addEventListener('click', () => {
    setValidationDockCollapsed(!validationDockCollapsed);
    logEvent('panel_toggle', { collapsed: validationDockCollapsed });
  });
  setValidationDockCollapsed(true);
  syncValidationDock(true);
}

// ═══════════════════════════════════════════════════════════════════
// NAVEGAÇÃO — zoom, pan e minimapa interativo
// ═══════════════════════════════════════════════════════════════════

function updateZoomIndicator() {
  const el = document.getElementById('btnZoomLevel');
  if (el) el.textContent = Math.round(diagram.zoom * 100) + '%';
}

function setZoom(newZoom, anchorX, anchorY) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  if (Math.abs(clamped - diagram.zoom) < 1e-6) return;
  const sX = anchorX === undefined ? diagram.mainWidth / 2 : anchorX;
  const sY = anchorY === undefined ? diagram.mainHeight / 2 : anchorY;
  const worldX = sX / diagram.zoom - diagram.panOffset.x;
  const worldY = sY / diagram.zoom - diagram.panOffset.y;
  diagram.zoom = clamped;
  diagram.panOffset.x = sX / diagram.zoom - worldX;
  diagram.panOffset.y = sY / diagram.zoom - worldY;
  updateZoomIndicator();
  scheduleDraw();
}

function zoomIn() {
  setZoom(diagram.zoom * 1.2);
}
function zoomOut() {
  setZoom(diagram.zoom / 1.2);
}
function zoomReset() {
  setZoom(1);
}

function zoomToFit() {
  const b = getDiagramBounds(
    diagram.entities,
    diagram.attributes,
    diagram.relationships,
    diagram.specializations,
    diagram.aggregations,
    diagram.postits,
    currentNotation,
    diagram.fontSize
  );
  if (!b) {
    diagram.zoom = 1;
    diagram.panOffset.x = 0;
    diagram.panOffset.y = 0;
    updateZoomIndicator();
    scheduleDraw();
    return;
  }
  const pad = 60;
  const dw = b.maxX - b.minX + pad * 2;
  const dh = b.maxY - b.minY + pad * 2;
  diagram.zoom = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.min(diagram.mainWidth / dw, diagram.mainHeight / dh))
  );
  diagram.panOffset.x = (diagram.mainWidth / diagram.zoom - (b.maxX - b.minX)) / 2 - b.minX;
  diagram.panOffset.y = (diagram.mainHeight / diagram.zoom - (b.maxY - b.minY)) / 2 - b.minY;
  updateZoomIndicator();
  scheduleDraw();
}

function centerViewportOn(worldX, worldY) {
  diagram.panOffset.x = diagram.mainWidth / (2 * diagram.zoom) - worldX;
  diagram.panOffset.y = diagram.mainHeight / (2 * diagram.zoom) - worldY;
  scheduleDraw();
}

function setPanHintActive(active) {
  const hints = document.getElementById('canvasHints');
  if (hints) hints.classList.toggle('pan-active', Boolean(active));
}

function setupViewControls() {
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  bind('btnZoomIn', zoomIn);
  bind('btnZoomOut', zoomOut);
  bind('btnZoomLevel', zoomReset);
  bind('btnZoomFit', zoomToFit);
  updateZoomIndicator();
}

// ═══════════════════════════════════════════════════════════════════
// PAINEL LATERAL — Tutorial, Exportação de Código e Importação SQL
// ═══════════════════════════════════════════════════════════════════

let tutorialStepIndex = 0;
const tutorialSteps = [
  {
    id: 'step1',
    title: 'Criar entidades',
    description: 'Adicione pelo menos duas entidades e nomeie-as.',
    check: () => diagram.entities.length >= 2,
  },
  {
    id: 'step2',
    title: 'Adicionar atributos',
    description: 'Adicione atributos às entidades, incluindo pelo menos uma chave.',
    check: () => diagram.attributes.some((a) => a.primary),
  },
  {
    id: 'step3',
    title: 'Relacionar entidades',
    description: 'Crie um relacionamento entre entidades e defina cardinalidades.',
    check: () =>
      diagram.relationships.some(
        (r) =>
          r.connections &&
          r.connections.length >= 2 &&
          r.connections.every((c) => c.cardinality)
      ),
  },
  {
    id: 'step4',
    title: 'Especialização',
    description: 'Crie uma especialização e associe a entidade.',
    check: () => diagram.specializations.length >= 1,
  },
  {
    id: 'step5',
    title: 'Revisão',
    description:
      'Confira o painel de problemas no canto inferior esquerdo e ajuste o que estiver apontado.',
    check: () => true,
  },
];

function openTutorialPanel() {
  const panel = document.getElementById('sidePanel');
  panel.style.display = 'block';
  showTutorialPanel();
}

function showTutorialPanel() {
  const c = document.getElementById('panelContent');
  const list = tutorialSteps
    .map(
      (s, i) =>
        `<div style='margin-bottom:8px;padding:8px;border:1px solid #374151;border-radius:6px;background:${i === tutorialStepIndex ? '#1f2937' : '#0f172a'}'><div style='font-weight:600'>${s.title}</div><div style='opacity:.85'>${s.description}</div><div style='margin-top:6px;color:${s.check() ? '#10b981' : '#ef4444'}'>${s.check() ? 'Concluído' : 'Pendente'}</div></div>`
    )
    .join('');
  const controls = `<div style='display:flex;gap:8px;margin-top:8px'><button id='btnPrevStep' class='px-3 py-2 bg-gray-700 text-white rounded'>Voltar</button><button id='btnNextStep' class='px-3 py-2 bg-blue-600 text-white rounded'>Avançar</button></div>`;
  c.innerHTML = `<div>${list}${controls}</div>`;
  const prev = document.getElementById('btnPrevStep');
  const next = document.getElementById('btnNextStep');
  if (prev) {
    prev.onclick = () => {
      tutorialStepIndex = Math.max(0, tutorialStepIndex - 1);
      showTutorialPanel();
    };
  }
  if (next) {
    next.onclick = () => {
      tutorialStepIndex = Math.min(tutorialSteps.length - 1, tutorialStepIndex + 1);
      showTutorialPanel();
    };
  }
}

let exportTarget = 'postgres';

function exportCodeFile() {
  const ir = toCanonicalIR({
    entities: diagram.entities,
    attributes: diagram.attributes,
    relationships: diagram.relationships,
    specializations: diagram.specializations,
    aggregations: diagram.aggregations,
  });
  const code = exportCode(ir, exportTarget);
  const extMap = {
    postgres: 'sql',
    mysql: 'sql',
    mariadb: 'sql',
    sqlite: 'sql',
    laravel: 'php',
    prisma: 'prisma',
    django: 'py',
    graphql: 'graphql',
    jsonschema: 'json',
    ir: 'json',
  };
  const ext = extMap[exportTarget] || 'txt';
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = buildExportFilename(ext);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function openExportPanel() {
  const panel = document.getElementById('sidePanel');
  panel.style.display = 'block';
  renderExportPanel();
  initPanelWidthResize(panel);
}

function initPanelWidthResize(panel) {
  if (panel._widthResizeReady) return;
  panel._widthResizeReady = true;
  let startX;
  let startW;
  const onMove = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const delta = startX - clientX;
    const newW = Math.max(280, Math.min(window.innerWidth * 0.85, startW + delta));
    panel.style.width = newW + 'px';
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    document.body.style.userSelect = '';
  };
  panel.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('#panelWidthHandle');
    if (!handle) return;
    startX = e.clientX;
    startW = panel.offsetWidth;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  panel.addEventListener('touchstart', (e) => {
    const handle = e.target.closest('#panelWidthHandle');
    if (!handle) return;
    startX = e.touches[0].clientX;
    startW = panel.offsetWidth;
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
  });
}

function renderExportPanel() {
  const c = document.getElementById('panelContent');
  let code = '';
  let mappingError = '';
  try {
    const ir = toCanonicalIR({
      entities: diagram.entities,
      attributes: diagram.attributes,
      relationships: diagram.relationships,
      specializations: diagram.specializations,
      aggregations: diagram.aggregations,
    });
    code = exportCode(ir, exportTarget);
  } catch (error) {
    mappingError = error.message;
  }

  const targetOptions = Object.keys(exporters)
    .map(
      (k) => `<option value='${k}' ${exportTarget === k ? 'selected' : ''}>${exporters[k].name}</option>`
    )
    .join('');

  const targetHTML = `<div style='margin-bottom:10px'><div style='font-weight:600;margin-bottom:6px'>Formato de Exportação</div><select id='exportTargetSelect' style='width:100%;padding:6px;background:#1e293b;color:white;border:1px solid #374151;border-radius:4px;margin-bottom:8px'>${targetOptions}</select></div>`;
  const actionsHTML = `<div style='display:flex;gap:8px;margin-bottom:10px'><button id='btnDownloadCode' class='px-3 py-2 bg-blue-600 text-white rounded'>Baixar Arquivo</button><button id='btnCopyCode' class='px-3 py-2 bg-gray-700 text-white rounded'>Copiar</button></div>`;
  const preHTML = `${mappingError ? `<p role='alert' style='color:#fca5a5;margin-bottom:10px'>Não foi possível gerar o código: ${escapeHTML(mappingError)}</p>` : ''}<textarea id='codePreview' readonly style='width:100%;height:300px;background:#0f172a;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:8px;font-family:monospace;resize:vertical'>${escapeHTML(code)}</textarea>`;
  const resizeHandle = `<div id='panelWidthHandle' title='Arrastar para redimensionar largura' style='display:flex;align-items:center;justify-content:flex-start;padding:4px 2px;cursor:ew-resize;color:rgba(255,255,255,0.35);user-select:none;'><svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'><rect x='2' y='4' width='2' height='8' rx='1'/><rect x='7' y='4' width='2' height='8' rx='1'/><rect x='12' y='4' width='2' height='8' rx='1'/></svg></div>`;

  c.innerHTML = `${targetHTML}${actionsHTML}${preHTML}${resizeHandle}`;

  const select = document.getElementById('exportTargetSelect');
  select.onchange = () => {
    exportTarget = select.value;
    renderExportPanel();
  };

  const btnDown = document.getElementById('btnDownloadCode');
  if (btnDown) btnDown.disabled = Boolean(mappingError);
  if (btnDown) btnDown.onclick = () => withParticipant('codigo', exportCodeFile);

  const btnCopy = document.getElementById('btnCopyCode');
  if (btnCopy) btnCopy.disabled = Boolean(mappingError);
  if (btnCopy) {
    btnCopy.onclick = () => {
      const ta = document.getElementById('codePreview');
      ta.select();
      document.execCommand('copy');
      showNotification('Código copiado para a área de transferência', 'success');
    };
  }
}

function openImportPanel() {
  const panel = document.getElementById('sidePanel');
  panel.style.display = 'block';
  renderImportPanel();
}

function renderImportPanel() {
  const c = document.getElementById('panelContent');
  c.innerHTML = `
    <div style='margin-bottom:10px'><div style='font-weight:600;margin-bottom:6px'>Engenharia Reversa (DDL SQL)</div>
    <textarea id='sqlImportInput' placeholder='Cole seu CREATE TABLE aqui...' style='width:100%;height:300px;background:#0f172a;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:8px;font-family:monospace'></textarea></div>
    <div style='display:flex;gap:8px;margin-bottom:10px'>
      <button id='btnDoImportSQL' class='px-3 py-2 bg-blue-600 text-white rounded'>Gerar Modelo</button>
    </div>
  `;

  const btnDoImport = document.getElementById('btnDoImportSQL');
  if (btnDoImport) {
    btnDoImport.onclick = () => {
      const sql = document.getElementById('sqlImportInput').value;
      if (!sql.trim()) return;
      try {
        const importedModel = parseSQLToModel(sql, {
          entityIdCounter: Math.max(
            diagram.entityIdCounter,
            ...diagram.entities.map((e) => Number(e.id) + 1)
          ),
          attributeIdCounter: Math.max(
            diagram.attributeIdCounter,
            ...diagram.attributes.map((a) => Number(a.id) + 1)
          ),
          relationshipIdCounter: Math.max(
            diagram.relationshipIdCounter,
            ...diagram.relationships.map((r) => Number(r.id) + 1)
          ),
        });
        diagram.entityIdCounter = importedModel.entityIdCounter;
        diagram.attributeIdCounter = importedModel.attributeIdCounter;
        diagram.relationshipIdCounter = importedModel.relationshipIdCounter;
        diagram.entities.push(...importedModel.entities);
        diagram.attributes.push(...importedModel.attributes);
        diagram.relationships.push(...importedModel.relationships);
        saveState();
        scheduleDraw();
        showNotification('Modelo importado com sucesso', 'success');
        document.getElementById('sidePanel').style.display = 'none';
      } catch (err) {
        console.error(err);
        showNotification('Erro ao analisar SQL', 'error');
      }
    };
  }
}

document.getElementById('btnIncreaseZoom').addEventListener('click', zoomIn);
document.getElementById('btnDecreaseZoom').addEventListener('click', zoomOut);

setupViewControls();
setupValidationDock();

document.getElementById('researchConsent').hidden = !researchMode();
startSession({
  appVersion: APP_VERSION,
  notation: currentNotation,
  viewport: { w: window.innerWidth, h: window.innerHeight },
  zoom: diagram.zoom,
});

resizeCanvas();
saveState();
draw();

function diagramData(includeResearch = false) {
  const data = Object.fromEntries(
    [
      'entities',
      'attributes',
      'relationships',
      'specializations',
      'aggregations',
      'postits',
      'entityIdCounter',
      'attributeIdCounter',
      'relationshipIdCounter',
      'specializationIdCounter',
      'aggregationIdCounter',
      'postitIdCounter',
      'fontSize',
      'panOffset',
      'zoom',
      'fileMeta',
    ].map((key) => [key, diagram[key]])
  );
  return {
    ...data,
    notation: currentNotation,
    ...(includeResearch && researchMode()
      ? { student: getParticipantName(), processLog: exportLog() }
      : {}),
  };
}

function applyLoadedDiagram(data) {
  for (const key of [
    'entities',
    'attributes',
    'relationships',
    'specializations',
    'aggregations',
    'postits',
    'entityIdCounter',
    'attributeIdCounter',
    'relationshipIdCounter',
    'specializationIdCounter',
    'aggregationIdCounter',
    'postitIdCounter',
    'fontSize',
    'panOffset',
    'zoom',
    'fileMeta',
  ]) {
    diagram[key] = data[key];
  }
  currentNotation = data.notation;
  document.dispatchEvent(new Event('modeladb:notation-loaded'));
  normalizeCardinalities();
  resetUndoBaseline();
}
