import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { buildDocument } from '../evaluation/corpus/build.mjs';
import { openApp, menu, STORAGE_KEY } from './helpers.js';

// Export content and sharpness: PNG, SVG and PDF carry the same diagram, drawn crisply.

const model = {
  id: 'export',
  domain: 'Export',
  entities: [
    { k: 'a', name: 'Cliente', at: [0, 0], attrs: ['codigo:Int key', 'nome:Text'] },
    { k: 'b', name: 'Pedido', at: [2, 0], attrs: ['numero:Int key'] },
  ],
  rels: [{ k: 'r', name: 'faz', at: [1, 0], parts: [{ e: 'a', card: '1,1', role: 'Comprador' }, { e: 'b', card: '0,N' }] }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(buildDocument(model))]);
  await openApp(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(2 + 1 + 3);
});

const download = async (page, id) => {
  const [d] = await Promise.all([page.waitForEvent('download'), menu(page, id)]);
  return readFileSync(await d.path());
};
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/** Decodes PNG bytes in the page and returns luminance rows for analysis. */
async function decode(page, buf, rowFraction) {
  return page.evaluate(
    async ([b64, frac]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      let inked = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] < 128) inked++;
      const y = Math.floor(bmp.height * frac);
      const row = [];
      for (let x = 0; x < bmp.width; x++) row.push(data[(y * bmp.width + x) * 4 + 3] === 0 ? 255 : data[(y * bmp.width + x) * 4]);
      return { width: bmp.width, height: bmp.height, inked, row };
    },
    [buf.toString('base64'), rowFraction],
  );
}

test('PNG, SVG and PDF show the same diagram: names, cardinalities, roles and size', async ({ page }) => {
  const png = await download(page, 'btnExport');
  const svgText = (await download(page, 'btnExportSVG')).toString('utf8');
  const { w, h } = pngSize(png);
  const img = await decode(page, png, 0.5);
  expect(img.inked, 'the PNG is not blank').toBeGreaterThan(500);

  const svg = await page.evaluate((t) => {
    const d = new DOMParser().parseFromString(t, 'image/svg+xml');
    const root = d.documentElement;
    return {
      parseError: Boolean(d.querySelector('parsererror')),
      width: parseFloat(root.getAttribute('width')),
      height: parseFloat(root.getAttribute('height')),
      texts: [...d.querySelectorAll('text')].map((n) => n.textContent.trim()),
    };
  }, svgText);
  expect(svg.parseError).toBe(false);
  for (const label of ['Cliente', 'Pedido', 'faz', 'codigo', 'nome', 'numero', '1,1', '0,N', 'Comprador']) {
    expect(svg.texts, `SVG text ${label}`).toContain(label);
  }
  // The PNG is the SVG's drawing at 2x.
  expect(Math.abs(w - svg.width * 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(h - svg.height * 2)).toBeLessThanOrEqual(2);

  // PDF: a print page that holds the same PNG at the same size, landscape A4.
  await page.context().addInitScript(() => {
    window.print = () => {
      window.__printed = (window.__printed || 0) + 1;
    };
  });
  const [popup] = await Promise.all([page.waitForEvent('popup'), menu(page, 'btnExportPDF')]);
  await expect.poll(() => popup.evaluate(() => window.__printed || 0)).toBe(1);
  const pdfPage = await popup.evaluate(() => {
    const i = document.querySelector('img');
    return { src: i.src.slice(0, 22), w: i.naturalWidth, h: i.naturalHeight, css: document.querySelector('style').textContent };
  });
  expect(pdfPage.src).toBe('data:image/png;base64,');
  expect({ w: pdfPage.w, h: pdfPage.h }).toEqual({ w, h });
  expect(pdfPage.css).toContain('A4 landscape');
});

test.describe('high-density screens', () => {
  test.use({ deviceScaleFactor: 2 });

  test('on-screen nodes are rendered at device resolution and the PNG strokes stay sharp', async ({ page }) => {
    const node = page.locator('.react-flow__node[data-id="entity_0"]');
    const css = await node.boundingBox();
    const shot = await node.screenshot();
    const size = pngSize(shot);
    expect(size.w).toBe(Math.round(css.width * 2));
    expect(size.h).toBe(Math.round(css.height * 2));

    // Crossing the entity's left border mid-height: a 2 px stroke is a dark run of about 4 px at 2x, with
    // at most one in-between (anti-aliased) pixel on each side.
    const edge = await decode(page, shot, 0.5);
    const runs = [];
    let run = null;
    edge.row.forEach((v, x) => {
      const dark = v < 110;
      if (dark && !run) run = { start: x, len: 0 };
      if (dark) run.len++;
      if (!dark && run) {
        runs.push({ ...run });
        run = null;
      }
    });
    expect(runs.length).toBeGreaterThan(0);
    const border = runs.find((r) => r.len <= 12);
    expect(border, 'a thin dark run (the stroke)').toBeDefined();
    expect(border.len).toBeGreaterThanOrEqual(3);
    expect(border.len).toBeLessThanOrEqual(6);
    const around = [edge.row[border.start - 1], edge.row[border.start + border.len]].filter((v) => v !== undefined);
    const soft = around.filter((v) => v > 110 && v < 235).length;
    expect(soft).toBeLessThanOrEqual(2);

    const png = await download(page, 'btnExport');
    const exported = await decode(page, png, 0.5);
    expect(exported.width).toBeGreaterThan(css.width * 2); // exports are always drawn at 2x, independent of the screen
  });
});
