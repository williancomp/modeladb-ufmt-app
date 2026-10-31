import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './fixtures.js';
import { buildDocument } from '../evaluation/corpus/build.mjs';
import {
  openApp,
  dragTool,
  docWhere,
  readDoc,
  centerOf,
  multiClick,
  clickElement,
  menu,
  chooseFile,
  FIXTURE_DIR,
  STORAGE_KEY,
} from './helpers.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

/** Two entities with a relationship between them, all created from the toolbar. */
async function twoEntitiesAndRelationship(page) {
  await dragTool(page, 'btnEntity', 300, 300);
  await dragTool(page, 'btnEntity', 800, 300);
  await dragTool(page, 'btnRelationship', 550, 300);
  return docWhere(
    page,
    (d) => d.domain.entities.length === 2 && d.domain.relationships.length === 1,
  );
}

async function renameByDoubleClick(page, doc, kind, id, name) {
  const { x, y } = await centerOf(page, doc, kind, id);
  await page.mouse.dblclick(x, y);
  const input = page.locator('body > input[type="text"]');
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

test.describe('construct creation', () => {
  test('creates every notation construct from the toolbar', async ({ page }) => {
    await openApp(page);
    await twoEntitiesAndRelationship(page);
    await dragTool(page, 'btnAttribute', 300, 300);
    await dragTool(page, 'btnDerivedAttribute', 300, 300);
    await dragTool(page, 'btnMultivaluedAttribute', 300, 300);
    await dragTool(page, 'btnSpecialization', 500, 550);
    await dragTool(page, 'btnAggregation', 850, 550);
    await dragTool(page, 'btnPostit', 1100, 200);
    const { domain: d } = await docWhere(page, (doc) => doc.domain.postits.length === 1);
    expect(d.entities).toHaveLength(2);
    expect(d.relationships).toHaveLength(1);
    expect(d.attributes.map((a) => [!!a.derived, !!a.multivalued])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ]);
    expect(d.specializations.map((s) => s.genType)).toEqual(['T,C']);
    expect(d.aggregations).toHaveLength(1);
    await expect(page.locator('#validationDock')).toBeVisible();
  });

  test('creates elements from the keyboard shortcuts', async ({ page }) => {
    await openApp(page);
    for (const key of ['e', 'e', 'r', 'a', 's']) {
      await page.mouse.click(1000, 700); // focus the canvas without selecting anything
      await page.keyboard.press(key);
    }
    const { domain: d } = await docWhere(page, (doc) => doc.domain.specializations.length === 1);
    expect([d.entities.length, d.relationships.length, d.attributes.length]).toEqual([2, 1, 1]);
  });

  test('renames an element in place and marks an attribute as key and a sub-attribute', async ({
    page,
  }) => {
    await openApp(page);
    await dragTool(page, 'btnEntity', 400, 300);
    await dragTool(page, 'btnAttribute', 400, 300);
    let doc = await docWhere(page, (d) => d.domain.attributes.length === 1);
    await renameByDoubleClick(page, doc, 'entity', 0, 'Student');
    doc = await docWhere(page, (d) => d.domain.entities[0].name === 'Student');

    await clickElement(page, doc, 'attribute', 0, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Set Key' }).click();
    doc = await docWhere(page, (d) => d.domain.attributes[0].primary === true);

    await clickElement(page, doc, 'attribute', 0, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Add Sub' }).click();
    doc = await docWhere(page, (d) => d.domain.attributes.length === 2);
    expect(doc.domain.attributes[1]).toMatchObject({ parentType: 'attribute', parentId: 0 });
  });
});

test.describe('connections', () => {
  test('connects entities to a relationship with the keyboard (Ctrl/Cmd+click, C)', async ({
    page,
  }) => {
    await openApp(page);
    let doc = await twoEntitiesAndRelationship(page);
    await multiClick(page, doc, 'entity', 0);
    await multiClick(page, doc, 'relationship', 0);
    await page.keyboard.press('c');
    doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === 1);
    await page.mouse.click(1000, 700);
    await multiClick(page, doc, 'entity', 1);
    await multiClick(page, doc, 'relationship', 0);
    await page.keyboard.press('c');
    doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === 2);
    expect(doc.domain.relationships[0].connections.map((c) => c.entityId)).toEqual([0, 1]);
  });

  test('creates a ternary relationship through the interface and keeps all three participants', async ({
    page,
  }) => {
    await openApp(page);
    await dragTool(page, 'btnEntity', 250, 300);
    await dragTool(page, 'btnEntity', 850, 300);
    await dragTool(page, 'btnEntity', 550, 600);
    await dragTool(page, 'btnRelationship', 550, 380);
    let doc = await docWhere(
      page,
      (d) => d.domain.entities.length === 3 && d.domain.relationships.length === 1,
    );
    for (const [n, id] of [[1, 0], [2, 1], [3, 2]]) {
      await multiClick(page, doc, 'entity', id);
      await multiClick(page, doc, 'relationship', 0);
      await page.keyboard.press('c');
      doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === n);
      await page.mouse.click(1100, 750);
    }
    const connections = doc.domain.relationships[0].connections;
    expect(connections.map((c) => c.entityId).sort()).toEqual([0, 1, 2]);
    expect(connections.every((c) => c.cardinality)).toBe(true);
    // R002 asks for at least two participants and a cardinality; three satisfy it.
    await expect(page.locator('#validationDockList')).not.toContainText('R002');
    // The canonical export keeps the relationship with its three participants.
    await menu(page, 'btnExportSQL');
    await page.selectOption('#exportTargetSelect', 'ir');
    const ir = JSON.parse(await page.locator('#codePreview').inputValue());
    expect(ir.relationships).toHaveLength(1);
    expect(ir.relationships[0].participants).toHaveLength(3);
  });

  test('connects through the Connect menu item', async ({ page }) => {
    await openApp(page);
    let doc = await twoEntitiesAndRelationship(page);
    await clickElement(page, doc, 'entity', 0, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Connect' }).click();
    await clickElement(page, doc, 'relationship', 0);
    doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === 1);
    expect(doc.domain.relationships[0].connections[0].entityId).toBe(0);
  });

  test('edits a cardinality as a min,max pair and rejects an invalid one', async ({ page }) => {
    await openApp(page);
    let doc = await twoEntitiesAndRelationship(page);
    await multiClick(page, doc, 'entity', 0);
    await multiClick(page, doc, 'relationship', 0);
    await page.keyboard.press('c');
    doc = await docWhere(
      page,
      (d) =>
        d.domain.relationships[0].connections.length === 1 &&
        d.domain.relationships[0].connections[0].labelRect,
    );
    const rect = doc.domain.relationships[0].connections[0].labelRect;
    const box = await page.locator('#canvas').boundingBox();
    const at = {
      x: box.x + (rect.x + rect.width / 2 + doc.view.panOffset.x) * doc.view.zoom,
      y: box.y + (rect.y + rect.height / 2 + doc.view.panOffset.y) * doc.view.zoom,
    };
    await page.mouse.dblclick(at.x, at.y);
    const input = page.locator('body > input[type="text"]');
    // The editor's accessible name and hint follow the interface language (English here).
    await expect(input).toHaveAttribute('aria-label', 'Cardinality minimum,maximum');
    await expect(input).toHaveAttribute('title', /^Minimum,maximum: 0,N; 1,1; 2,5\. N stands for many\.$/);
    await input.fill('5,2');
    await input.press('Enter');
    expect(await input.evaluate((el) => el.validationMessage)).not.toBe('');
    await input.fill('2,5');
    await input.press('Enter');
    doc = await docWhere(
      page,
      (d) => d.domain.relationships[0].connections[0].cardinality === '2,5',
    );
    expect(doc.domain.relationships[0].connections[0].cardinality).toBe('2,5');
  });

  test('marks the participant as dependent through the connection menu and defines a partial key', async ({
    page,
  }) => {
    await openApp(page);
    let doc = await twoEntitiesAndRelationship(page);
    for (const id of [0, 1]) {
      await page.mouse.click(1000, 700);
      await multiClick(page, doc, 'entity', id);
      await multiClick(page, doc, 'relationship', 0);
      await page.keyboard.press('c');
      doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === id + 1);
    }
    // The line between entity 1 and the diamond: click between their centres.
    const a = await centerOf(page, doc, 'entity', 1);
    const b = await centerOf(page, doc, 'relationship', 0);
    await page.mouse.click(a.x * 0.55 + b.x * 0.45, a.y * 0.55 + b.y * 0.45);
    await page.locator('.submenu-item', { hasText: 'Dependent' }).click();
    doc = await docWhere(page, (d) => d.domain.relationships[0].connections.some((c) => c.weak));
    expect(doc.domain.relationships[0].connections.find((c) => c.weak).entityId).toBe(1);

    await dragTool(page, 'btnAttribute', ...(await pagePoint(page, doc, 'entity', 1)));
    doc = await docWhere(page, (d) => d.domain.attributes.length === 1);
    await clickElement(page, doc, 'attribute', 0, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Partial Key' }).click();
    doc = await docWhere(page, (d) => d.domain.attributes[0].partialKey === true);
    expect(doc.domain.attributes[0].primary).toBe(false);
  });

  test('draws a double line, double rectangle and double diamond only for a dependent connection', async ({
    page,
  }) => {
    await openApp(page);
    let doc = await twoEntitiesAndRelationship(page);
    for (const id of [0, 1]) {
      await page.mouse.click(1000, 700);
      await multiClick(page, doc, 'entity', id);
      await multiClick(page, doc, 'relationship', 0);
      await page.keyboard.press('c');
      doc = await docWhere(page, (d) => d.domain.relationships[0].connections.length === id + 1);
    }
    // Participation is expressed by (min,max): 1,1 on a connection keeps a single line.
    const conn = (d) => d.domain.relationships[0].connections;
    expect(conn(doc).map((c) => c.cardinality)).toEqual(['0,N', '0,N']);
    const svgText = async () => {
      const [svg] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnExportSVG')]);
      return readFileSync(await svg.path(), 'utf8');
    };
    const lines = (text) => (text.match(/<line [^>]*stroke-width="2"\/>/g) || []).length;
    const shapes = (text) => (text.match(/<(rect|polygon|path)[ >]/g) || []).length;
    const base = await svgText();
    const before = lines(base);
    const a = await centerOf(page, doc, 'entity', 1);
    const b = await centerOf(page, doc, 'relationship', 0);
    const onLine = [a.x * 0.55 + b.x * 0.45, a.y * 0.55 + b.y * 0.45];
    await page.mouse.click(...onLine);
    await page.locator('.submenu-item', { hasText: 'Dependent' }).click();
    doc = await docWhere(page, (d) => conn(d).some((c) => c.weak));
    expect(conn(doc).find((c) => c.weak)).toMatchObject({ entityId: 1, cardinality: '1,1' });
    expect(conn(doc).find((c) => !c.weak).cardinality).toBe('0,N');
    const marked = await svgText();
    expect(lines(marked)).toBe(before + 1);
    expect(shapes(marked)).toBeGreaterThan(shapes(base));
    // Undo restores the connection, its cardinality and the single line.
    await page.locator('#btnUndoFloating').click();
    doc = await docWhere(page, (d) => conn(d).every((c) => !c.weak));
    expect(conn(doc).map((c) => c.cardinality)).toEqual(['0,N', '0,N']);
    expect(shapes(await svgText())).toBe(shapes(base));
    expect(lines(await svgText())).toBe(before);
    // Redo, then unmark through the menu: the double line disappears again.
    await page.locator('#btnRedoFloating').click();
    doc = await docWhere(page, (d) => conn(d).some((c) => c.weak));
    expect(conn(doc).find((c) => c.weak).cardinality).toBe('1,1');
    await page.mouse.click(...onLine);
    await page.locator('.submenu-item', { hasText: 'Remove identification dependency' }).click();
    doc = await docWhere(page, (d) => conn(d).every((c) => !c.weak));
    expect(lines(await svgText())).toBe(before);
  });

  test('flags a loaded dependent connection with minimum 0', async ({ page }) => {
    await openApp(page);
    const model = {
      entities: [
        { id: 0, objType: 'entity', name: 'Order', x: 200, y: 300, width: 120, height: 60 },
        { id: 1, objType: 'entity', name: 'Line', x: 700, y: 300, width: 120, height: 60 },
      ],
      attributes: [
        {
          id: 0,
          objType: 'attribute',
          name: 'number',
          parentType: 'entity',
          parentId: 0,
          primary: true,
          x: 200,
          y: 230,
        },
        {
          id: 1,
          objType: 'attribute',
          name: 'position',
          parentType: 'entity',
          parentId: 1,
          partialKey: true,
          x: 700,
          y: 230,
        },
      ],
      relationships: [
        {
          id: 0,
          objType: 'relationship',
          name: 'contains',
          x: 450,
          y: 330,
          size: 80,
          connections: [
            { entityId: 0, cardinality: '1,1' },
            { entityId: 1, cardinality: '0,N', weak: true },
          ],
        },
      ],
    };
    await chooseFile(page, {
      name: 'dependent.merdb',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(model)),
    });
    await confirmLoad(page);
    await docWhere(page, (d) => d.domain.entities.length === 2);
    await expect(page.locator('#validationDockList')).toContainText('R012');
    await expect(page.locator('#validationDockList')).toContainText('minimum cardinality 0');
  });
});

async function pagePoint(page, doc, kind, id) {
  const { x, y } = await centerOf(page, doc, kind, id);
  return [x, y];
}

test.describe('specialization and aggregation', () => {
  test('changes the specialization type to a category (U) and connects an entity', async ({
    page,
  }) => {
    await openApp(page);
    await dragTool(page, 'btnEntity', 300, 250);
    await dragTool(page, 'btnSpecialization', 300, 520);
    let doc = await docWhere(page, (d) => d.domain.specializations.length === 1);
    const spec = await centerOf(page, doc, 'specialization', 0);
    await page.mouse.dblclick(spec.x, spec.y);
    await page.locator('select').last().selectOption('U');
    await page.mouse.click(1000, 700);
    doc = await docWhere(page, (d) => d.domain.specializations[0].genType === 'U');
    await multiClick(page, doc, 'entity', 0);
    await multiClick(page, doc, 'specialization', 0);
    await page.keyboard.press('c');
    doc = await docWhere(page, (d) => d.domain.specializations[0].connections.length === 1);
    expect(doc.domain.specializations[0].connections[0]).toMatchObject({ entityId: 0 });
  });

  test('converts a relationship into an aggregation', async ({ page }) => {
    await openApp(page);
    await twoEntitiesAndRelationship(page);
    const doc = await docWhere(page, (d) => d.domain.relationships.length === 1);
    await clickElement(page, doc, 'relationship', 0, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Convert to Aggregation' }).click();
    const after = await docWhere(page, (d) => d.domain.aggregations.length === 1);
    expect(after.domain.relationships).toHaveLength(0);
  });
});

test.describe('history', () => {
  test('undoes and redoes element creation', async ({ page }) => {
    await openApp(page);
    await dragTool(page, 'btnEntity', 300, 300);
    await dragTool(page, 'btnEntity', 700, 300);
    await docWhere(page, (d) => d.domain.entities.length === 2);
    await page.locator('#btnUndoFloating').click();
    await docWhere(page, (d) => d.domain.entities.length === 1);
    await page.locator('#btnUndoFloating').click();
    await docWhere(page, (d) => d.domain.entities.length === 0);
    await page.locator('#btnRedoFloating').click();
    await docWhere(page, (d) => d.domain.entities.length === 1);
    await page.mouse.click(1000, 700);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    const doc = await docWhere(page, (d) => d.domain.entities.length === 2);
    expect(doc.domain.counters.entityIdCounter).toBe(2);
  });
});

test.describe('validation panel', () => {
  test('shows the save notice above the navigation hints, on top of them', async ({ page }) => {
    await openApp(page);
    const boxes = await page.evaluate(() => {
      const rect = (id) => document.getElementById(id).getBoundingClientRect();
      return { notice: rect('autosave-indicator').bottom, hints: rect('canvasHints').top };
    });
    expect(boxes.notice).toBeLessThanOrEqual(boxes.hints);
  });

  test('starts collapsed, stays collapsed when issues appear, and opens only on request', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#validationDock')).toHaveClass(/collapsed/);
    await expect(page.locator('#validationDockBody')).toBeHidden();
    await dragTool(page, 'btnEntity', 500, 300);
    await expect(page.locator('#validationDockTitle')).not.toHaveText('No model issues');
    await expect(page.locator('#validationDockBody')).toBeHidden();
    await page.locator('#validationDockHeader').click();
    await expect(page.locator('#validationDockBody')).toBeVisible();
    await page.locator('#validationDockHeader').click();
    await expect(page.locator('#validationDockBody')).toBeHidden();
  });

  test('lists real violations and clears them once the model is fixed', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#validationDockTitle')).toHaveText('No model issues');
    await dragTool(page, 'btnEntity', 400, 300);
    await expect(page.locator('#validationDockList')).toContainText('R001');
    await expect(page.locator('#validationDockList')).toContainText('R009');
    let doc = await docWhere(page, (d) => d.domain.entities.length === 1);
    // Dropping before selecting: a click on an element opens its menu over the drop area.
    await dragTool(page, 'btnAttribute', ...(await pagePoint(page, doc, 'entity', 0)));
    doc = await docWhere(page, (d) => d.domain.attributes.length === 1);
    await renameByDoubleClick(page, doc, 'entity', 0, 'Student');
    await renameByDoubleClick(page, doc, 'attribute', 0, 'Number');
    await clickElement(page, doc, 'attribute', 0, { button: 'right' });
    await page.locator('.submenu-item', { hasText: 'Set Key' }).click();
    await expect(page.locator('#validationDockTitle')).toHaveText('No model issues');
  });

  test("applies notation-specific rules after switching to Crow's Foot", async ({ page }) => {
    await openApp(page);
    await chooseFile(page, join(FIXTURE_DIR, 'current-v2.merdb'));
    await confirmLoad(page);
    await expect(page.locator('#validationDock')).not.toContainText('CF001');
    await menu(page, 'btnNotationCrow');
    await expect(page.locator('#notation-badge-label')).toHaveText("Crow's Foot (IE)");
    await expect(page.locator('#validationDock')).toContainText('CF001');
    await menu(page, 'btnNotationChen');
    await expect(page.locator('#validationDock')).not.toContainText('CF001');
    const doc = await docWhere(page, (d) => d.meta.notation === 'chen');
    expect(doc.meta.notation).toBe('chen');
  });
});

/** Warning validation badges (#f59e0b) rendered inside a page-coordinate box on #canvas. */
async function warningBadgeCountAt(page, x, y, half) {
  return page.evaluate(
    ([bx, by, h]) => {
      const badges = [...document.querySelectorAll('#canvas .validation-badge')];
      let n = 0;
      for (const el of badges) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg !== 'rgb(245, 158, 11)') continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (Math.abs(cx - bx) <= h && Math.abs(cy - by) <= h) n++;
      }
      return n;
    },
    [x, y, half],
  );
}

test.describe('validation markers on the canvas', () => {
  test('puts each marker on the element of its own type when an entity and an attribute share an id', async ({
    page,
  }) => {
    const doc = JSON.parse(readFileSync('evaluation/corpus/m01_library.merdb', 'utf8'));
    // Entity 3 and attribute 3 both exist; both receive a default name (R009 and R010).
    doc.domain.entities.find((e) => e.id === 3).name = 'Entity';
    doc.domain.attributes.find((a) => a.id === 3).name = 'Attribute';
    await page.addInitScript(
      ([key, json]) => localStorage.setItem(key, json),
      [STORAGE_KEY, JSON.stringify(doc)],
    );
    await openApp(page);
    await expect(page.locator('#validationDockList')).toContainText('R009');
    await expect(page.locator('#validationDockList')).toContainText('R010');
    const entity = doc.view.positions.entity_3;
    const attribute = doc.view.positions.attr_3;
    const { zoom, panOffset } = doc.view;
    const canvas = await page.locator('#canvas').boundingBox();
    const at = (x, y) => [canvas.x + (x + panOffset.x) * zoom, canvas.y + (y + panOffset.y) * zoom];
    // The entity badge sits on its top-right corner; the attribute badge on its circle.
    await expect.poll(() => warningBadgeCountAt(page, ...at(entity.x + entity.width, entity.y), 14)).toBe(1);
    await expect.poll(() => warningBadgeCountAt(page, ...at(attribute.x, attribute.y), 45)).toBe(1);
    // And no marker where neither element is: the entity's own centre.
    expect(await warningBadgeCountAt(page, ...at(entity.x + entity.width / 2, entity.y + entity.height / 2), 20)).toBe(0);
  });
});

test.describe('high-density screens', () => {
  test.use({ deviceScaleFactor: 2 });
  test('renders crisp vector nodes on #canvas and a vector minimap that lists the node', async ({ page }) => {
    await openApp(page);
    await dragTool(page, 'btnEntity', 400, 300);
    await docWhere(page, (d) => d.domain.entities.length === 1);
    const info = await page.evaluate(() => ({
      dpr: window.devicePixelRatio,
      hasVectorNode: Boolean(document.querySelector('#canvas .er-entity-node svg')),
      minimapIsSvg: Boolean(document.querySelector('.react-flow__minimap svg')),
    }));
    expect(info.dpr).toBe(2);
    expect(info.hasVectorNode).toBe(true);
    expect(info.minimapIsSvg).toBe(true);
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(1);
  });
});

async function confirmLoad(page) {
  const confirm = page.locator('#loadConfirmBtn');
  await confirm.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  if (await confirm.isVisible()) await confirm.click();
}

test.describe('files', () => {
  test('saves a v2 file, reloads from autosave and re-opens the downloaded file', async ({
    page,
  }) => {
    await openApp(page);
    await twoEntitiesAndRelationship(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      menu(page, 'btnSaveFile'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.merdb$/);
    const path = await download.path();
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    expect(saved.version).toBe('2.0');
    expect(saved.meta).toMatchObject({
      tool: 'ModelaDB',
      toolVersion: pkg.version,
      notation: 'chen',
    });
    expect(saved.domain.entities).toHaveLength(2);
    expect(saved.view.zoom).toBe(0.8);
    expect(JSON.stringify(saved)).not.toContain('processLog');

    await page.reload();
    await expect(page.locator('#canvas')).toBeVisible();
    const restored = await docWhere(page, (d) => d.domain.entities.length === 2);
    expect(restored.domain.relationships).toHaveLength(1);

    await page.locator('#btnClearFloating').click();
    await docWhere(page, (d) => d.domain.entities.length === 0);
    await chooseFile(page, path);
    await confirmLoad(page);
    const reopened = await docWhere(page, (d) => d.domain.entities.length === 2);
    expect(reopened.domain.relationships[0].name).toBe(saved.domain.relationships[0].name);
  });

  test('opens the legacy v1 fixture and writes it back as v2 keeping the initial zoom', async ({
    page,
  }) => {
    await openApp(page);
    await chooseFile(page, join(FIXTURE_DIR, 'legacy-v1.merdb'));
    await confirmLoad(page);
    const doc = await docWhere(page, (d) => d.domain.entities.length === 3);
    expect(doc.version).toBe('2.0');
    expect(doc.domain.entities.map((e) => e.name)).toEqual(['Cliente', 'Dependente', 'Curso']);
    expect(doc.domain.attributes).toHaveLength(3);
    expect(doc.domain.relationships[0].connections.some((c) => c.weak)).toBe(true);
    expect(doc.view.zoom).toBe(0.8);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      menu(page, 'btnSaveFile'),
    ]);
    const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));
    expect(saved.version).toBe('2.0');
    expect(saved.domain.entities).toHaveLength(3);
  });

  test('opens a file written by the previous production release', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, join(FIXTURE_DIR, 'production-v1.merdb'));
    await confirmLoad(page);
    const doc = await docWhere(page, (d) => d.domain.entities.length > 0);
    expect(doc.meta.sourceAppVersion).toBe('2.1.1');
  });

  test('rejects a malformed file without touching the current diagram', async ({ page }) => {
    await openApp(page);
    await twoEntitiesAndRelationship(page);
    page.once('dialog', (dialog) => dialog.accept());
    await page.setInputFiles('#fileInput', {
      name: 'broken.merdb',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":"9.0","domain":{}}'),
    });
    await confirmLoad(page);
    await page.waitForTimeout(1200);
    expect((await readDoc(page)).domain.entities).toHaveLength(2);
  });
});

test.describe('language', () => {
  test('switches between Portuguese and English and remembers the choice', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('#btnEntity')).toContainText('Entity');
    await page.selectOption('#language-switch', 'pt');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('#btnEntity')).toContainText('Entidade');
    await expect(page.locator('#validationDockTitle')).toHaveText('Modelo sem problemas');
    await page.reload();
    await expect(page.locator('#language-switch')).toHaveValue('pt');
    await expect(page.locator('#btnEntity')).toContainText('Entidade');
    await page.selectOption('#language-switch', 'en');
    await expect(page.locator('#validationDockTitle')).toHaveText('No model issues');

    // One violation exercises the singular form of the panel title in both languages.
    await dragTool(page, 'btnEntity', 400, 300);
    const doc = await docWhere(page, (d) => d.domain.entities.length === 1);
    await renameByDoubleClick(page, doc, 'entity', 0, 'Student');
    await expect(page.locator('#validationDockTitle')).toHaveText('1 issue');
    await page.selectOption('#language-switch', 'pt');
    await expect(page.locator('#validationDockTitle')).toHaveText('1 problema');
  });
});

test.describe('exports', () => {
  test('previews and downloads code for every target', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, join(FIXTURE_DIR, 'current-v2.merdb'));
    await confirmLoad(page);
    await docWhere(page, (d) => d.domain.entities.length === 3);
    await menu(page, 'btnExportSQL');
    const targets = {
      postgres: 'CREATE TABLE',
      mysql: 'CREATE TABLE',
      mariadb: 'CREATE TABLE',
      sqlite: 'CREATE TABLE',
      laravel: 'Schema::create',
      prisma: 'model ',
      django: 'models.Model',
      graphql: 'type ',
      jsonschema: '"$schema"',
      ir: '"entities"',
    };
    for (const [target, needle] of Object.entries(targets)) {
      await page.selectOption('#exportTargetSelect', target);
      await expect(page.locator('#codePreview')).toHaveValue(
        new RegExp(needle.replace(/[$"]/g, '\\$&')),
      );
    }
    await page.selectOption('#exportTargetSelect', 'postgres');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btnDownloadCode').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.sql$/);
    expect(readFileSync(await download.path(), 'utf8')).toContain('CREATE TABLE cliente');
  });

  test('exports PNG and SVG images', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, join(FIXTURE_DIR, 'current-v2.merdb'));
    await confirmLoad(page);
    await docWhere(page, (d) => d.domain.entities.length === 3);
    const [png] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnExport')]);
    expect(png.suggestedFilename()).toMatch(/\.png$/);
    expect([...readFileSync(await png.path()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const [svg] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnExportSVG')]);
    expect(svg.suggestedFilename()).toMatch(/\.svg$/);
    const text = readFileSync(await svg.path(), 'utf8');
    expect(text).toMatch(/<svg[\s>]/);
    expect(text).toContain('Cliente');
  });
});

test.describe('recursive relationship', () => {
  test('draws the two connections apart, each with its cardinality and role, in the SVG and the PNG', async ({ page }) => {
    const doc = buildDocument({
      id: 'recursive',
      domain: 'Recursive relationship',
      entities: [{ k: 'teacher', name: 'Teacher', at: [0, 0], attrs: ['employee_no:Text key'] }],
      rels: [{ k: 'sup', name: 'supervises', at: [0, 1], parts: [{ e: 'teacher', card: '0,1', role: 'Supervisor' }, { e: 'teacher', card: '0,N', role: 'Subordinate' }] }],
    });
    await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(doc)]);
    await openApp(page);
    const [svg] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnExportSVG')]);
    const text = readFileSync(await svg.path(), 'utf8');
    const lines = [...text.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="#000000" stroke-width="2"\/>/g)].map((m) => m.slice(1).map(Number));
    // The key attribute's line plus the two connections; the connections must not coincide.
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map((l) => l.map(Math.round).join(','))).size).toBe(3);
    expect(new Set(lines.map((l) => `${Math.round(l[2])},${Math.round(l[3])}`)).size).toBe(3);
    expect(text).toContain('>0,1<');
    expect(text).toContain('>0,N<');
    expect(text).toContain('>Supervisor<');
    expect(text).toContain('>Subordinate<');
    // the two role labels do not share a position
    const roleX = [...text.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-style="italic"[^>]*>(Supervisor|Subordinate)</g)].map((m) => `${Math.round(m[1])},${Math.round(m[2])}`);
    expect(new Set(roleX).size).toBe(2);
    const [png] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnExport')]);
    expect([...readFileSync(await png.path()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

test.describe('offline operation', () => {
  test('keeps editing, exporting and saving with the network disabled', async ({
    page,
    context,
  }) => {
    await openApp(page);
    await context.setOffline(true);
    await twoEntitiesAndRelationship(page);
    await menu(page, 'btnExportSQL');
    await expect(page.locator('#codePreview')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      menu(page, 'btnSaveFile'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.merdb$/);
    await context.setOffline(false);
  });

  test('ships no remote scripts, styles or fonts in the served document', async ({ page }) => {
    await openApp(page);
    const remote = await page.evaluate(() =>
      [...document.querySelectorAll('script[src],link[href],img[src]')]
        .map((el) => el.src || el.href)
        .filter((url) => !url.startsWith(location.origin)),
    );
    expect(remote).toEqual([]);
  });
});

test.describe('validation panel targets', () => {
  test('names the element of the reported type when ids coincide across types', async ({ page }) => {
    await openApp(page);
    const model = {
      entities: [{ id: 0, objType: 'entity', name: 'Room', x: 300, y: 300, width: 120, height: 60 }],
      attributes: [
        { id: 1, objType: 'attribute', name: 'room_no', parentType: 'entity', parentId: 0, primary: true, x: 300, y: 230 },
        { id: 0, objType: 'attribute', name: 'tags', parentType: 'entity', parentId: 0, multivalued: true, x: 450, y: 230 },
      ],
      relationships: [],
    };
    await chooseFile(page, { name: 'ids.merdb', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model)) });
    await confirmLoad(page);
    await expect(page.locator('#validationDockList li[data-rule="R005"] .v-where')).toHaveText('tags — attribute');
  });
});
