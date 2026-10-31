import { test, expect } from './fixtures.js';
import { openApp, dragTool, docWhere } from './helpers.js';

// Contextual menu contract (docs/INTERACTION.md §3, §5): a press-release moving < 5 px opens the menu
// whatever its duration; empty space closes it; a drag >= 5 px closes it and does not reopen it.

/** Deterministic pseudo-random sequence (mulberry32) so a failure is reproducible. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the contextual menu follows the contract on 50 mixed clicks, deselects and drags', async ({ page }) => {
  await openApp(page);
  await dragTool(page, 'btnEntity', 300, 250);
  await dragTool(page, 'btnEntity', 800, 250);
  await dragTool(page, 'btnRelationship', 550, 250);
  await docWhere(
    page,
    (d) => d.domain.entities.length === 2 && d.domain.relationships.length === 1,
  );
  const ids = ['entity_0', 'entity_1', 'relationship_0'];
  // Live centre of a node: a real drag may leave it a few pixels off (grid snap), so never assume the old spot.
  const centre = async (id) => {
    const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const empty = { x: 1100, y: 750 };
  const submenu = page.locator('.submenu');
  const next = rng(20260101);
  const holds = [10, 60, 150, 500];
  const log = [];

  for (let i = 0; i < 50; i++) {
    const kind = ['click', 'click', 'deselect', 'smallDrag', 'realDrag'][Math.floor(next() * 5)];
    const t = await centre(ids[Math.floor(next() * ids.length)]);
    const hold = holds[Math.floor(next() * holds.length)];
    let expectOpen;
    if (kind === 'click') {
      await page.mouse.move(t.x, t.y);
      await page.mouse.down();
      await page.waitForTimeout(hold);
      await page.mouse.up();
      expectOpen = true;
    } else if (kind === 'smallDrag') {
      // 3 px of movement: still a click.
      await page.mouse.move(t.x, t.y);
      await page.mouse.down();
      await page.mouse.move(t.x + 2, t.y + 2);
      await page.waitForTimeout(hold);
      await page.mouse.up();
      expectOpen = true;
    } else if (kind === 'deselect') {
      await page.mouse.click(empty.x, empty.y);
      expectOpen = false;
    } else {
      // Real drag (40 px), then move it back so the targets keep their positions.
      await page.mouse.move(t.x, t.y);
      await page.mouse.down();
      await page.mouse.move(t.x + 20, t.y + 20, { steps: 4 });
      await page.mouse.move(t.x + 40, t.y + 40, { steps: 4 });
      await page.mouse.up();
      expectOpen = false;
      await page.mouse.move(t.x + 40, t.y + 40);
      await page.mouse.down();
      await page.mouse.move(t.x + 20, t.y + 20, { steps: 4 });
      await page.mouse.move(t.x, t.y, { steps: 4 });
      await page.mouse.up();
      await page.mouse.click(empty.x, empty.y); // the next step starts from a known state
    }
    log.push(`${i}:${kind}@${hold}`);
    await expect(submenu, `step ${log.join(' ')}`).toHaveCount(expectOpen ? 1 : 0);
    // Opening a menu must not hide the other targets: close it before the next step, like a user would.
    if (expectOpen) {
      await page.mouse.click(empty.x, empty.y);
      await expect(submenu).toHaveCount(0);
    }
  }
});
