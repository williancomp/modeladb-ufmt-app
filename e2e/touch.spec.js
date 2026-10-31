import { test, expect } from './fixtures.js';
import { buildDocument } from '../evaluation/corpus/build.mjs';
import { openApp, STORAGE_KEY } from './helpers.js';

// docs/INTERACTION.md §2-§6 on touch: tap, long press, one-finger pan, pinch. The document is seeded
// (the phone layout has no desktop toolbar to build one from).
test.use({ hasTouch: true });

const doc = buildDocument({
  id: 'touch',
  domain: 'Touch',
  entities: [
    { k: 'a', name: 'Alpha', at: [0, 0], attrs: ['id:Text key'] },
    { k: 'b', name: 'Beta', at: [2, 0], attrs: ['id:Text key'] },
  ],
  rels: [{ k: 'r', name: 'links', at: [1, 0], parts: [{ e: 'a', card: '1,1' }, { e: 'b', card: '0,N' }] }],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(doc)]);
  await openApp(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(3 + 2);
});

const node = (page, id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const centreOf = async (loc) => {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const viewOf = (page) =>
  page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });

/** Touch input through CDP (Chromium only): Playwright's touchscreen has tap but no move or hold. */
async function cdpGesture(page, steps) {
  const session = await page.context().newCDPSession(page);
  for (const [type, points] of steps) {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })),
    });
    await page.waitForTimeout(16);
  }
  await session.detach();
}

test('a tap on an object selects it and opens its menu; a tap on empty space closes it', async ({ page }) => {
  const c = await centreOf(node(page, 'entity_0'));
  await page.touchscreen.tap(c.x, c.y);
  await expect(page.locator('.submenu')).toHaveCount(1);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  const empty = { x: Math.max(8, c.x), y: c.y + 260 };
  await page.touchscreen.tap(empty.x, empty.y);
  await expect(page.locator('.submenu')).toHaveCount(0);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
});

test('a long press (>= 400 ms, stationary) opens the menu; a short press does not hold it', async ({ page }) => {
  const c = await centreOf(node(page, 'entity_0'));
  const press = (ms) =>
    page.evaluate(
      async ([x, y, hold]) => {
        const target = document.elementFromPoint(x, y);
        const fire = (type) =>
          target.dispatchEvent(
            new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }),
          );
        fire('pointerdown');
        await new Promise((r) => setTimeout(r, hold));
        fire('pointerup');
      },
      [c.x, c.y, ms],
    );
  await press(150);
  await expect(page.locator('.submenu')).toHaveCount(0);
  await press(550);
  await expect(page.locator('.submenu')).toHaveCount(1);
});

test('one-finger drag on empty space pans and closes the menu; it does not draw a marquee', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'multi-point touch needs CDP input, which only Chromium offers');
  const c = await centreOf(node(page, 'entity_0'));
  await page.touchscreen.tap(c.x, c.y);
  await expect(page.locator('.submenu')).toHaveCount(1);
  const before = await viewOf(page);
  const from = { x: Math.max(20, c.x), y: c.y + 220 };
  await cdpGesture(page, [
    ['touchStart', [from]],
    ...Array.from({ length: 8 }, (_, i) => ['touchMove', [{ x: from.x + (i + 1) * 8, y: from.y + (i + 1) * 4 }]]),
    ['touchEnd', []],
  ]);
  await expect.poll(async () => (await viewOf(page)).x - before.x).toBeGreaterThan(40);
  await expect(page.locator('.react-flow__selection')).toHaveCount(0);
  await expect(page.locator('.submenu')).toHaveCount(0);
});

test('a two-finger pinch zooms', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'multi-point touch needs CDP input, which only Chromium offers');
  const before = await viewOf(page);
  const mid = { x: 200, y: 400 };
  await cdpGesture(page, [
    ['touchStart', [{ x: mid.x - 20, y: mid.y }, { x: mid.x + 20, y: mid.y }]],
    ...Array.from({ length: 8 }, (_, i) => [
      'touchMove',
      [{ x: mid.x - 20 - (i + 1) * 8, y: mid.y }, { x: mid.x + 20 + (i + 1) * 8, y: mid.y }],
    ]),
    ['touchEnd', []],
  ]);
  await expect.poll(async () => (await viewOf(page)).zoom).toBeGreaterThan(before.zoom * 1.2);
});
