import { test, expect } from './fixtures.js';
import { openApp, dragTool, docWhere } from './helpers.js';

// docs/INTERACTION.md §2, §5, §6: marquee selection, panning, zoom, minimap.

async function twoEntities(page) {
  await dragTool(page, 'btnEntity', 300, 300);
  await dragTool(page, 'btnEntity', 800, 300);
  return docWhere(page, (d) => d.domain.entities.length === 2);
}
const selectedNodes = (page) => page.locator('.react-flow__node.selected');
/** Live viewport of the surface: {x, y, zoom} from the transform React Flow applies. */
const viewOf = (page) =>
  page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
const viewChanged = (page, before, key) => expect.poll(async () => (await viewOf(page))[key] - before[key]);

test.describe('desktop navigation', () => {
  test('a left-drag on empty space draws a marquee and selects what it touches, without panning', async ({ page }) => {
    await openApp(page);
    await twoEntities(page);
    const before = await viewOf(page);
    await page.mouse.move(150, 200);
    await page.mouse.down();
    await page.mouse.move(400, 330, { steps: 6 });
    await expect(page.locator('.react-flow__selection')).toBeVisible();
    await page.mouse.up();
    await expect(selectedNodes(page)).toHaveCount(1);
    await expect(page.locator('.submenu')).toHaveCount(0);
    expect(await viewOf(page)).toEqual(before);
  });

  test('Space + left-drag pans the view', async ({ page }) => {
    await openApp(page);
    await twoEntities(page);
    const before = await viewOf(page);
    await page.keyboard.down('Space');
    await page.mouse.move(600, 600);
    await page.mouse.down();
    await page.mouse.move(700, 650, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await viewChanged(page, before, 'x').toBeGreaterThan(50);
    await viewChanged(page, before, 'y').toBeGreaterThan(25);
    await expect(selectedNodes(page)).toHaveCount(0);
  });

  for (const [name, button] of [['middle', 'middle'], ['right', 'right']]) {
    test(`${name}-button drag on empty space pans the view`, async ({ page }) => {
      await openApp(page);
      await twoEntities(page);
      const before = await viewOf(page);
      await page.mouse.move(600, 600);
      await page.mouse.down({ button });
      await page.mouse.move(520, 560, { steps: 6 });
      await page.mouse.up({ button });
      await viewChanged(page, before, 'x').toBeLessThan(-40);
    });
  }

  test('the wheel zooms within 0.25x-3x and the zoom buttons agree', async ({ page }) => {
    await openApp(page);
    await twoEntities(page);
    const start = await viewOf(page);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await viewOf(page)).zoom).toBeGreaterThan(start.zoom);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -800);
    await expect.poll(async () => (await viewOf(page)).zoom).toBeCloseTo(3, 1);
    for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 800);
    await expect.poll(async () => (await viewOf(page)).zoom).toBeCloseTo(0.25, 2);
  });

  test('clicking the minimap recentres the view on that point', async ({ page }) => {
    await openApp(page);
    await twoEntities(page);
    const before = await viewOf(page);
    const box = await page.locator('.react-flow__minimap svg').boundingBox();
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await viewChanged(page, before, 'x').not.toBe(0);
  });
});
