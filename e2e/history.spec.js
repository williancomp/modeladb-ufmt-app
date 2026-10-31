import { test, expect } from './fixtures.js';
import { buildDocument } from '../evaluation/corpus/build.mjs';
import { openApp, dragTool, readDoc, centerOf, clickElement, multiClick, STORAGE_KEY } from './helpers.js';

// Undo and redo after each kind of edit: the document returns exactly to the state before the edit
// (undo) and to the state after it (redo).

const seed = () =>
  buildDocument({
    id: 'history',
    domain: 'History',
    entities: [
      { k: 'a', name: 'Alpha', at: [0, 0], attrs: ['id:Text key', 'label:Text'] },
      { k: 'b', name: 'Beta', at: [2, 0], attrs: ['id:Text key'] },
      { k: 'c', name: 'Gamma', at: [0, 1], attrs: [] },
    ],
    rels: [{ k: 'r', name: 'links', at: [1, 0], parts: [{ e: 'a', card: '1,1' }, { e: 'b', card: '0,N' }] }],
  });

/** Domain and positions without transient flags (selection), after autosave has settled. */
async function snapshot(page) {
  await page.waitForTimeout(1100);
  const doc = await readDoc(page);
  // Selection flags, label rectangles and hit boxes are derived; id counters never go back by design.
  const DERIVED = new Set(['selected', 'labelRect', 'roleRect', 'hitBox', 'counters']);
  const canon = (v) =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).filter((k) => !DERIVED.has(k)).sort().map((k) => [k, canon(v[k])]))
        : v;
  return JSON.stringify(canon({ domain: doc.domain, positions: doc.view.positions, breakpoints: doc.view.breakpoints }));
}

const undo = (page) => page.locator('#btnUndoFloating').click();
const redo = (page) => page.locator('#btnRedoFloating').click();

const edits = {
  'creating an entity': async (page) => dragTool(page, 'btnEntity', 1000, 600),
  'creating a post-it': async (page) => dragTool(page, 'btnPostit', 1000, 600),
  'moving an entity': async (page, doc) => {
    const c = await centerOf(page, doc, 'entity', 2);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y + 30, { steps: 4 });
    await page.mouse.move(c.x + 90, c.y + 40, { steps: 4 });
    await page.mouse.up();
  },
  'renaming an entity': async (page, doc) => {
    const c = await centerOf(page, doc, 'entity', 2);
    await page.mouse.dblclick(c.x, c.y);
    const input = page.locator('body > input[type="text"]');
    await input.fill('Renamed');
    await input.press('Enter');
    await expect(input).toHaveCount(0);
  },
  'deleting an entity': async (page, doc) => {
    await clickElement(page, doc, 'entity', 2);
    await page.mouse.click(1100, 760);
    await multiClick(page, doc, 'entity', 2);
    await page.keyboard.press('Delete');
  },
  'connecting an entity to a relationship': async (page, doc) => {
    await multiClick(page, doc, 'entity', 2);
    await multiClick(page, doc, 'relationship', 0);
    await page.keyboard.press('c');
  },
  'changing a cardinality': async (page) => {
    await page.locator('.er-cardinality-pill').nth(1).dblclick();
    const input = page.locator('body > input[type="text"]');
    await input.fill('2,5');
    await input.press('Enter');
    await expect(input).toHaveCount(0);
  },
  'marking an attribute as key': async (page, doc) => {
    await clickElement(page, doc, 'attribute', 1, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Set Key' }).click();
  },
  'toggling the dependent connection': async (page, doc) => {
    const a = await centerOf(page, doc, 'entity', 1);
    const b = await centerOf(page, doc, 'relationship', 0);
    await page.mouse.click(a.x * 0.55 + b.x * 0.45, a.y * 0.55 + b.y * 0.45);
    await page.locator('.submenu-item', { hasText: 'Dependent' }).click();
  },
};

for (const [name, apply] of Object.entries(edits)) {
  test(`undo and redo after ${name}`, async ({ page }) => {
    await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(seed())]);
    await openApp(page);
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await page.waitForTimeout(900);
    const doc = await readDoc(page);
    const before = await snapshot(page);
    await apply(page, doc);
    const after = await snapshot(page);
    expect(after, 'the edit changed the document').not.toBe(before);
    await undo(page);
    expect(await snapshot(page), 'undo restores the previous state').toBe(before);
    await redo(page);
    expect(await snapshot(page), 'redo restores the edited state').toBe(after);
  });
}
