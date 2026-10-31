/**
 * Generates the English screenshots (Chen notation unless noted; fig6-fig8 show the EER figure fixture) at 2x device scale:
 *   npm run figures
 * Output: evaluation/figures/*.png. The app is served by the Vite dev server and driven by Playwright.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { buildDocument } from '../corpus/build.mjs';
import { constructSet, placeConstructSet } from './construct-set.mjs';
import { libraryModel, universityModel, eerFigureModel } from './figure-models.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = (id) => JSON.parse(readFileSync(join(here, '..', 'corpus', `${id}.merdb`), 'utf8'));
const KEY = 'modeladb:diagramData';
const SCALE = 3;
const FONT = 20; // canvas label size: legible when the figure is printed about 14 cm wide

/** The university model with defects injected into the document, so the real validator reports them. */
function withViolations() {
  const doc = buildDocument(universityModel);
  const byName = (list, name) => list.find((x) => x.name === name);
  const student = byName(doc.domain.entities, 'Student');
  // Student loses its key (error). Entity ids and attribute ids are counted per type: Courses (entity 1) and the attribute
  // named 'Attribute' (attribute 1) share an id, so each marker must still land on its own element.
  doc.domain.attributes.filter((a) => a.parentType === 'entity' && a.parentId === student.id).forEach((a) => { a.primary = false; });
  byName(doc.domain.entities, 'Course').name = 'Courses';
  doc.domain.relationships[0].name = 'Rel';
  doc.domain.attributes.find((a) => a.id === 1).name = 'Attribute';
  doc.domain.attributes.push({ id: doc.domain.attributes.length, objType: 'attribute', name: 'tags', parentType: 'entity', parentId: 0, multivalued: true, primary: false, selected: false, collapsed: false, resizeHandles: [] });
  doc.view.positions[`attr_${doc.domain.attributes.length - 1}`] = { x: 120, y: 20 };
  doc.domain.counters.attributeIdCounter = doc.domain.attributes.length;
  return doc;
}

/** The committed university model, with course_no moved off the 'offered as' diamond so its label touches no other shape. */
function universityForFigure() {
  const doc = corpus('m02_university');
  const attr = doc.domain.attributes.find((a) => a.name === 'course_no');
  doc.view.positions[`attr_${attr.id}`] = { x: 770, y: 285 };
  return doc;
}

/**
 * Overlays that carry no information for a figure of the model itself. The React Flow attribution is NOT
 * hidden: the library asks that it stay visible unless the project subscribes to React Flow Pro.
 */
const HIDE_OVERLAYS = '#canvasHints, .er-minimap, #viewControls, #btnToggle, #extraButtons, #btnUndoFloating, #btnRedoFloating, #btnClearFloating { display: none !important; }';
const HIDE_HINTS = '#canvasHints { display: none !important; }';
const HIDE_DOCK = '#validationDock { display: none !important; }';
const NAVBAR = 52;

/**
 * viewport: CSS size of the window; clip: 'canvas' crops the navbar away.
 * inset: space the overlays take ({ left, right, bottom }); the model is fitted into the rest.
 */
/** Same entities, spread out so the relationship names and cardinality labels of the crow's foot notation do not crowd the tables. */
const crowsFootModel = { ...universityModel, entities: universityModel.entities.map((e, i) => ({ ...e, at: [[0, 0], [1.55, 0], [1.55, 1.3]][i] })) };

/** The figure fixture is stored as .merdb files next to the figures, so the captures can be reproduced and inspected. */
function eerFixture(seeded) {
  const doc = buildDocument(eerFigureModel(seeded));
  const dir = join(here, 'fixtures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `university_eer_${seeded ? 'defect' : 'repaired'}.merdb`), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}
/** Opens the problems panel the way a user does (click on its header) and lets it grow to show every item. */
const openPanel = async (page) => {
  const collapsed = await page.locator('#validationDock.collapsed').count();
  if (collapsed) await page.locator('#validationDockHeader').click();
  await page.waitForSelector('#validationDockList li');
};
const PANEL_FULL = '#validationDock, #validationDockList { max-height: none !important; }';

const shots = [
  { file: 'fig1_full_interface.png', doc: universityForFigure, viewport: { width: 960, height: 620 }, css: HIDE_HINTS, inset: { bottom: 220 } },
  { file: 'fig2_validation_panel.png', doc: withViolations, viewport: { width: 900, height: 620 }, css: HIDE_OVERLAYS + '#validationDock, #validationDockList { max-height: none !important; }', inset: { left: 300 }, clip: 'canvas' },
  { file: 'fig3_code_export.png', doc: () => buildDocument(libraryModel), viewport: { width: 1000, height: 720 }, css: HIDE_OVERLAYS + HIDE_DOCK + '#sidePanel { max-height: none !important; }', inset: { right: 470 }, clip: 'canvas', after: async (page) => {
      await page.locator('#btnExportSQL').evaluate((el) => el.click());
      await page.waitForTimeout(600);
      await page.addStyleTag({ content: '#sidePanel textarea, #sidePanel pre { height: 400px !important; max-height: none !important; }' });
    } },
  { file: 'fig4_crows_foot.png', doc: () => buildDocument(crowsFootModel), viewport: { width: 760, height: 560 }, css: HIDE_OVERLAYS + HIDE_DOCK, clip: 'canvas', before: async (page) => {
      await page.locator('#btnNotationCrow').evaluate((el) => el.click());
      await page.waitForTimeout(400);
    } },
  { file: 'fig6_eer_defect_chen.png', doc: () => eerFixture(true), viewport: { width: 1180, height: 760 }, css: HIDE_OVERLAYS + PANEL_FULL, inset: { left: 330 }, clip: 'canvas', after: openPanel },
  { file: 'fig7_eer_repaired_chen.png', doc: () => eerFixture(false), viewport: { width: 1180, height: 760 }, css: HIDE_OVERLAYS + PANEL_FULL, inset: { left: 330 }, clip: 'canvas', after: openPanel },
  { file: 'fig8_eer_crows_foot.png', doc: () => eerFixture(false), viewport: { width: 1000, height: 760 }, css: HIDE_OVERLAYS + HIDE_DOCK, clip: 'canvas', before: async (page) => {
      await page.locator('#btnNotationCrow').evaluate((el) => el.click());
      await page.waitForTimeout(400);
    } },
  { file: 'fig5_construct_set.png', doc: () => placeConstructSet(buildDocument(constructSet)), viewport: { width: 1000, height: 640 }, css: HIDE_OVERLAYS + HIDE_DOCK, clip: 'canvas' },
];

export async function generateFigures({ only } = {}) {
  mkdirSync(here, { recursive: true });
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ headless: true, channel: process.env.E2E_CHANNEL || undefined });
  try {
    for (const shot of shots) {
      if (only && !shot.file.startsWith(only)) continue;
      const doc = shot.doc();
      doc.view.fontSize = FONT;
      const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: SCALE, locale: 'en-US' });
      const page = await context.newPage();
      await page.addInitScript(([key, json]) => {
        localStorage.setItem(key, json);
        localStorage.setItem('modeladb:language', 'en');
      }, [KEY, JSON.stringify(doc)]);
      await page.goto(base);
      await page.waitForSelector('#canvas');
      const welcome = page.locator('#startUsingBtn');
      await welcome.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (await welcome.isVisible()) await welcome.click();
      await page.addStyleTag({ content: shot.css });
      await page.waitForTimeout(500);
      if (shot.before) await shot.before(page);
      const fit = async () => {
        await page.locator('#btnZoomFit').evaluate((el) => el.click());
        await page.waitForTimeout(500);
      };
      const { left = 0, right = 0, bottom = 0 } = shot.inset || {};
      const full = shot.viewport;
      if (left || right || bottom) {
        // Fit the model into the part of the canvas the overlays leave free, then restore the window.
        await page.setViewportSize({ width: full.width - left - right, height: full.height - bottom });
        await page.waitForTimeout(300);
        await fit();
        await page.setViewportSize(full);
        await page.waitForTimeout(300);
        if (left) {
          // Space + drag pans the canvas: move the fitted model right by the width of the overlay.
          const y = full.height - 60;
          await page.keyboard.down('Space');
          await page.mouse.move(full.width / 2, y);
          await page.mouse.down();
          await page.mouse.move(full.width / 2 + left, y, { steps: 8 });
          await page.mouse.up();
          await page.keyboard.up('Space');
          await page.waitForTimeout(300);
        }
      } else await fit();
      if (shot.after) await shot.after(page);
      await page.waitForTimeout(400);
      const clip = shot.clip === 'canvas' ? { x: 16, y: NAVBAR + 6, width: full.width - 16, height: full.height - NAVBAR - 6 } : undefined;
      await page.screenshot({ path: join(here, shot.file), clip });
      await context.close();
      console.log(`figure: ${shot.file}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateFigures({ only: process.argv[2] });
