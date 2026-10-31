import { expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export const FIXTURE_DIR = resolve('src/persistence/__tests__/fixtures');
export const STORAGE_KEY = 'modeladb:diagramData';

export async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#canvas')).toBeVisible();
  const welcome = page.locator('#startUsingBtn');
  await welcome.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await welcome.isVisible()) await welcome.click();
}

/** Press on a toolbar button, drag past the 5 px threshold and drop at page (x, y). */
export async function dragTool(page, buttonId, x, y) {
  const box = await page.locator(`#${buttonId}`).boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 20, sy + 20, { steps: 3 });
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}

/** Latest autosaved document (the editor debounces autosave by 800 ms). */
export async function readDoc(page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Waits until the autosaved document satisfies the predicate and returns it. */
export async function docWhere(page, predicate, message = 'autosaved document') {
  await expect
    .poll(async () => {
      const doc = await readDoc(page);
      return !!doc && !!predicate(doc);
    }, { message, timeout: 8000 })
    .toBe(true);
  return readDoc(page);
}

const KEYS = { entity: 'entity', relationship: 'rel', specialization: 'spec', aggregation: 'agg', attribute: 'attr', postit: 'postit' };

/** Page coordinates of the centre of an element, from the saved geometry, zoom and pan. */
export async function centerOf(page, doc, kind, id) {
  const pos = doc.view.positions[`${KEYS[kind]}_${id}`];
  if (!pos) throw new Error(`no position for ${kind} ${id}`);
  const box = await page.locator('#canvas').boundingBox();
  const cx = kind === 'entity' || kind === 'postit' ? pos.x + pos.width / 2 : pos.x;
  const cy = kind === 'entity' || kind === 'postit' ? pos.y + pos.height / 2 : pos.y;
  const { zoom, panOffset } = doc.view;
  return { x: box.x + (cx + panOffset.x) * zoom, y: box.y + (cy + panOffset.y) * zoom };
}

export async function clickElement(page, doc, kind, id, options = {}) {
  const { x, y } = await centerOf(page, doc, kind, id);
  await page.mouse.click(x, y, options);
  return { x, y };
}

export async function multiClick(page, doc, kind, id) {
  const { x, y } = await centerOf(page, doc, kind, id);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(x, y);
  await page.keyboard.up('ControlOrMeta');
}

/** Opens a File/View dropdown and clicks one of its items. */
export async function menu(page, itemId) {
  await page.locator(`#${itemId}`).evaluate((el) => el.click());
}

export const loadFixture = (name) => readFileSync(resolve(FIXTURE_DIR, name), 'utf8');

export async function chooseFile(page, filePath) {
  await page.setInputFiles('#fileInput', filePath);
}
