import { test, expect } from './fixtures.js';
import { buildDocument } from '../evaluation/corpus/build.mjs';
import { openApp, dragTool, readDoc, docWhere, centerOf, clickElement, STORAGE_KEY } from './helpers.js';

const seed = (extra = (d) => d) =>
  extra(
    buildDocument({
      id: 'regress',
      domain: 'Regress',
      entities: [
        { k: 'a', name: 'Alpha', at: [0, 0], attrs: ['id:Text key', 'label:Text'] },
        { k: 'b', name: 'Beta', at: [2, 0], attrs: ['id:Text key'] },
        { k: 'c', name: 'Gamma', at: [0, 1], attrs: [] },
      ],
      rels: [{ k: 'r', name: 'links', at: [1, 0], parts: [{ e: 'a', card: '1,1' }, { e: 'b', card: '0,N' }] }],
    })
  );

async function load(page, doc) {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(doc)]);
  await openApp(page);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.waitForTimeout(900);
  return readDoc(page);
}

async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 3, from.y + dy / 3, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up();
}

test('dragging a relationship carries the bend points of its connections', async ({ page }) => {
  const bend = { x: 300, y: 300 };
  const loaded = await load(page, seed((d) => ({ ...d, view: { ...d.view, breakpoints: { rel_0_conn_0: [bend] } } })));
  const c = await centerOf(page, loaded, 'relationship', 0);
  await drag(page, c, 70, 0);
  const doc = await docWhere(page, (d) => Math.abs(d.view.breakpoints.rel_0_conn_0?.[0].x - bend.x) > 1);
  const moved = doc.view.positions.rel_0.x - loaded.view.positions.rel_0.x;
  expect(Math.abs(moved)).toBeGreaterThan(40);
  expect(doc.view.breakpoints.rel_0_conn_0[0].x).toBeCloseTo(bend.x + moved, 0);
  expect(doc.view.breakpoints.rel_0_conn_0[0].y).toBeCloseTo(bend.y, 0);
});

test('after a marquee, clicking a member collapses the selection and opens its menu', async ({ page }) => {
  const loaded = await load(page, seed());
  const a = await centerOf(page, loaded, 'entity', 0);
  const b = await centerOf(page, loaded, 'entity', 1);
  await page.mouse.move(Math.min(a.x, b.x) - 120, a.y - 120);
  await page.mouse.down();
  await page.mouse.move(Math.max(a.x, b.x) + 120, a.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node.selected')).not.toHaveCount(1);
  await page.mouse.click(a.x, a.y);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await expect(page.locator('.submenu')).toBeVisible();
});

test('after a marquee, double-clicking a member opens its name editor', async ({ page }) => {
  const loaded = await load(page, seed());
  const a = await centerOf(page, loaded, 'entity', 0);
  const b = await centerOf(page, loaded, 'entity', 1);
  await page.mouse.move(Math.min(a.x, b.x) - 120, a.y - 120);
  await page.mouse.down();
  await page.mouse.move(Math.max(a.x, b.x) + 120, a.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.mouse.dblclick(b.x, b.y);
  await expect(page.locator('body > input[type="text"]')).toBeVisible();
});

const handleOf = (page) => page.locator('.react-flow__node.selected [data-testid="resize-handle"]').first();
const entityBox = async (page, id) => {
  const doc = await docWhere(page, () => true);
  const p = doc.view.positions[`entity_${id}`];
  return { x: p.x, y: p.y, width: p.width, height: p.height };
};

test('a cancelled pointer during a resize restores the size and stops following the mouse', async ({ page }) => {
  const loaded = await load(page, seed());
  const before = loaded.view.positions.entity_2;
  await clickElement(page, loaded, 'entity', 2);
  const box = await handleOf(page).boundingBox();
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 60, hy + 30, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await page.mouse.move(hx + 400, hy + 200, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const after = await entityBox(page, 2);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
});

test('a cancelled pointer during a bend-point drag puts the bend point back', async ({ page }) => {
  const bend = { x: 300, y: 300 };
  const loaded = await load(page, seed((d) => ({ ...d, view: { ...d.view, breakpoints: { rel_0_conn_0: [bend] } } })));
  const handle = page.locator('.er-breakpoint').first();
  const box = await handle.boundingBox();
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 80, hy + 40, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await page.mouse.move(hx + 300, hy + 200, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const doc = await readDoc(page);
  expect(doc.view.breakpoints.rel_0_conn_0[0]).toEqual(bend);
  expect(loaded.view.breakpoints.rel_0_conn_0[0]).toEqual(bend);
});

test.describe('long press', () => {
  test.use({ hasTouch: true });
  const touch = (page, selector, type, x, y) =>
    page.evaluate(
      ([sel, kind, px, py]) => {
        const el = document.querySelector(sel);
        el.dispatchEvent(
          new PointerEvent(kind, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: px, clientY: py })
        );
      },
      [selector, type, x, y]
    );

  test('a cancelled press does not open the menu 400 ms later', async ({ page }) => {
    const loaded = await load(page, seed());
    const c = await centerOf(page, loaded, 'entity', 2);
    await touch(page, '[data-element-type="entity"][data-element-id="2"]', 'pointerdown', c.x, c.y);
    await touch(page, '[data-element-type="entity"][data-element-id="2"]', 'pointercancel', c.x, c.y);
    await page.waitForTimeout(700);
    await expect(page.locator('.submenu')).toHaveCount(0);
  });

  test('a long press on a post-it opens its menu', async ({ page }) => {
    await load(page, seed());
    await dragTool(page, 'btnPostit', 900, 600);
    const sel = '[data-element-type="postit"]';
    await expect(page.locator(sel)).toBeVisible();
    const b = await page.locator(sel).boundingBox();
    await touch(page, sel, 'pointerdown', b.x + 10, b.y + 10);
    await page.waitForTimeout(700);
    await expect(page.locator('.submenu')).toBeVisible();
  });
});

test('pressing the resize handle without moving does not consume an undo step', async ({ page }) => {
  const loaded = await load(page, seed());
  const start = loaded.view.positions.entity_2;
  const c = await centerOf(page, loaded, 'entity', 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 30, c.y + 30, { steps: 4 });
  await page.mouse.move(c.x + 90, c.y + 40, { steps: 4 });
  await page.mouse.up();
  const moved = await docWhere(page, (d) => d.view.positions.entity_2.x !== start.x);
  const box = await handleOf(page).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('#btnUndoFloating').click();
  const undone = await docWhere(page, (d) => d.view.positions.entity_2.x === start.x);
  expect(moved.view.positions.entity_2.x).not.toBe(undone.view.positions.entity_2.x);
});

test("in Crow's Foot, clicking an attribute row while a tool is armed places the object", async ({ page }) => {
  await load(page, seed((d) => ({ ...d, meta: { ...d.meta, notation: 'crow' } })));
  const before = (await readDoc(page)).domain.attributes.length;
  await page.locator('#btnAttribute').click();
  await page.locator('.crow-attr-row').first().click();
  const doc = await docWhere(page, (d) => d.domain.attributes.length === before + 1);
  expect(doc.domain.attributes).toHaveLength(before + 1);
  await expect(page.locator('.submenu')).toHaveCount(0);
});

test("in Crow's Foot, clicking an attribute row in connect mode connects the owning entity", async ({ page }) => {
  const doc0 = buildDocument({
    id: 'regress2',
    domain: 'Regress',
    entities: [
      { k: 'a', name: 'Alpha', at: [0, 0], attrs: ['id:Text key'] },
      { k: 'c', name: 'Gamma', at: [0, 1], attrs: ['id:Text key'] },
    ],
    rels: [{ k: 'r', name: 'links', at: [1, 0], parts: [{ e: 'a', card: '1,1' }] }],
  });
  const loaded = await load(page, { ...doc0, meta: { ...doc0.meta, notation: 'crow' } });
  const before = loaded.domain.relationships[0].connections.length;
  await clickElement(page, loaded, 'relationship', 0, { button: 'right' });
  await page.locator('.submenu-item', { hasText: 'Connect' }).click();
  await page.locator('.react-flow__node', { hasText: 'Gamma' }).locator('.crow-attr-row').first().click();
  const doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === before + 1);
  expect(doc.domain.relationships[0].connections.at(-1).entityId).toBe(loaded.domain.entities[1].id);
});

test('a copy of the toolbar button follows the pointer while dragging a new object and while placing by click', async ({ page }) => {
  await load(page, seed());
  const ghost = page.locator('#toolbarDragGhost');
  const box = await page.locator('#btnEntity').boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy + 40, { steps: 3 });
  await page.mouse.move(900, 600, { steps: 5 });
  await expect(ghost).toHaveCount(1);
  const g = await ghost.boundingBox();
  expect(Math.abs(g.x + g.width / 2 - 900)).toBeLessThan(4);
  expect(Math.abs(g.y + g.height / 2 - 600)).toBeLessThan(4);
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);

  // click placement: press and release the button without moving
  await page.locator('#btnEntity').click();
  await page.mouse.move(700, 500, { steps: 3 });
  await expect(ghost).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(ghost).toHaveCount(0);
});

test('undo and redo close an open element menu', async ({ page }) => {
  const loaded = await load(page, seed());
  await dragTool(page, 'btnEntity', 1000, 700);
  await clickElement(page, loaded, 'entity', 2);
  await expect(page.locator('.submenu')).toBeVisible();
  await page.locator('#btnUndoFloating').click();
  await expect(page.locator('.submenu')).toHaveCount(0);
  await page.waitForTimeout(400);
  await clickElement(page, loaded, 'entity', 2);
  await expect(page.locator('.submenu')).toBeVisible();
  await page.locator('#btnRedoFloating').click();
  await expect(page.locator('.submenu')).toHaveCount(0);
});

test('the About dialog links to the full third-party licence texts shipped with the build', async ({ page }) => {
  await load(page, seed());
  await page.locator('#btnAbout').evaluate((el) => el.click());
  const link = page.locator('#aboutLicensesLink');
  await expect(link).toBeVisible();
  const response = await page.request.get(new URL(await link.getAttribute('href'), page.url()).href);
  expect(response.ok()).toBe(true);
  const text = await response.text();
  for (const name of ['react 19', '@xyflow/react', 'zustand', 'd3-ease', 'Redistribution and use in source and binary forms', 'Poppins', 'Tailwind CSS']) {
    expect(text, name).toContain(name);
  }
  expect(text).toContain('webkid');
});

test('wheel zoom keeps showing current data (node arrays are reused only for viewport changes)', async ({ page }) => {
  await load(page, seed());
  const viewOf = () =>
    page.evaluate(() => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
      return { x: m.e, y: m.f, zoom: m.a };
    });
  const nodes = page.locator('.react-flow__node');
  const initialCount = await nodes.count();
  const before = await viewOf();
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await viewOf()).zoom).toBeGreaterThan(before.zoom);

  // An edit made after a zoom must appear (the cache is invalidated) and survive a further zoom.
  await dragTool(page, 'btnEntity', 1000, 700);
  await expect(nodes).toHaveCount(initialCount + 1);
  const zoomed = (await viewOf()).zoom;
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await viewOf()).zoom).toBeLessThan(zoomed);
  await expect(nodes).toHaveCount(initialCount + 1);

  // The element menu still opens after the viewport changed.
  await nodes.first().click();
  await expect(page.locator('.submenu')).toBeVisible();
});
