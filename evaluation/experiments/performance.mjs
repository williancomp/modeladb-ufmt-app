/**
 * Experiment E - two measurements on synthetic diagrams of 50, 200 and 1000 elements (entities +
 * attributes + relationships), in headless Chrome:
 *
 *  1. Validation: time of `validateModel`, measured in the page against the Vite dev server (so the real
 *     module graph can be imported there). The editor validates on every `draw()`, but not on wheel zoom.
 *  2. Wheel-to-frame latency: time from a wheel event (its `timeStamp`) to two animation frames after the
 *     first style mutation of the surface, i.e. until the zoomed viewport is painted. It is measured
 *     against the PRODUCTION build served by `vite preview` (the React development build is about three
 *     times slower), and it includes frame waits, so its floor is about one to two frames (20-35 ms).
 *     It is not comparable with the CPU time of a canvas redraw reported for earlier versions (a
 *     requestAnimationFrame callback without paint): the series changed with the React Flow surface.
 *
 * Timings are the only non-deterministic output of `npm run evaluate`.
 */
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createServer, build, preview } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDocument } from '../corpus/build.mjs';
import { writeTable, writeLog } from '../lib/report.mjs';

const SIZES = [50, 200, 1000];
const SAMPLES = 30;
const WARMUP = 5;
const STORAGE_KEY = 'modeladb:diagramData';

/** `count` elements = entities * (1 entity + 3 attributes + 1 relationship); a ring of relationships links neighbours. */
export function syntheticModel(count) {
  const n = Math.max(2, Math.round(count / 5));
  const columns = Math.ceil(Math.sqrt(n * 1.6));
  const entities = Array.from({ length: n }, (_, i) => ({
    k: `e${i}`,
    name: `Entity ${i}`,
    at: [i % columns, Math.floor(i / columns)],
    attrs: [`key_${i}:Int key`, `name_${i}:Text`, `created_${i}:Date`],
  }));
  const rels = Array.from({ length: n }, (_, i) => ({
    k: `r${i}`,
    name: `relates ${i}`,
    parts: [{ e: `e${i}`, card: '0,N' }, { e: `e${(i + 1) % n}`, card: '1,1' }],
  }));
  return { id: `synthetic_${count}`, entities, rels };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));

export async function runPerformanceExperiment({ log }) {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');
  // Production build in a temporary directory, so `dist/` is left alone.
  const outDir = mkdtempSync(join(tmpdir(), 'modeladb-perf-'));
  await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
  const production = await preview({ logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const prodBase = production.resolvedUrls.local[0].replace(/\/$/, '');
  const browser = await chromium.launch({ headless: true, channel: process.env.E2E_CHANNEL || undefined });
  const rows = [];
  try {
    const version = browser.version();
    for (const size of SIZES) {
      const doc = buildDocument(syntheticModel(size));
      const elements = doc.domain.entities.length + doc.domain.attributes.length + doc.domain.relationships.length;
      const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
      const page = await context.newPage();
      await page.addInitScript(
        ([key, json]) => {
          localStorage.setItem(key, json);
          localStorage.setItem('modeladb:language', 'en');
          // The surface is React Flow (DOM/SVG): the latency is the time from a wheel event to the frame
          // in which the zoomed viewport is painted.
          window.__draws = [];
          let t0 = 0;
          addEventListener('wheel', (e) => { t0 = e.timeStamp; }, true);
          addEventListener('DOMContentLoaded', () => {
            new MutationObserver(() => {
              if (!t0) return;
              const started = t0;
              t0 = 0;
              requestAnimationFrame(() => requestAnimationFrame(() => window.__draws.push(performance.now() - started)));
            }).observe(document.querySelector('#canvas'), { subtree: true, attributes: true, attributeFilter: ['style'] });
          });
        },
        [STORAGE_KEY, JSON.stringify(doc)],
      );
      await page.goto(prodBase);
      await page.waitForSelector('#canvas');
      const welcome = page.locator('#startUsingBtn');
      await welcome.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (await welcome.isVisible()) await welcome.click();
      await page.waitForTimeout(500);

      const devPage = await context.newPage();
      await devPage.goto(base);
      const validation = await devPage.evaluate(
        async ({ json, warmup, samples }) => {
          const { parseDiagram } = await import('/src/persistence/file.js');
          const { validateModel } = await import('/src/validation/engine.js');
          const model = parseDiagram(json);
          const run = () => validateModel(model, 'chen');
          for (let i = 0; i < warmup; i++) run();
          const times = [];
          let findings = 0;
          for (let i = 0; i < samples; i++) {
            const start = performance.now();
            findings = run().length;
            times.push(performance.now() - start);
          }
          return { times, findings };
        },
        { json: JSON.stringify(doc), warmup: WARMUP, samples: SAMPLES },
      );

      await devPage.close();

      // Each wheel notch over the canvas changes the zoom and re-renders the surface; zooming in and out alternately.
      await page.evaluate(() => { window.__draws.length = 0; });
      await page.mouse.move(700, 450);
      for (let i = 0; i < WARMUP + SAMPLES; i++) {
        await page.mouse.wheel(0, i % 2 ? 100 : -100);
        await page.waitForTimeout(80);
      }
      const draws = (await page.evaluate(() => window.__draws)).slice(-SAMPLES);
      await context.close();
      rows.push({
        elements_requested: size,
        elements_actual: elements,
        entities: doc.domain.entities.length,
        samples: draws.length,
        validate_ms_mean: mean(validation.times).toFixed(2),
        validate_ms_sd: sd(validation.times).toFixed(2),
        wheel_to_frame_ms_mean: mean(draws).toFixed(2),
        wheel_to_frame_ms_sd: sd(draws).toFixed(2),
        findings: validation.findings,
      });
      log(`performance: ${size} elements -> validate ${mean(validation.times).toFixed(2)} ms, wheel-to-frame ${mean(draws).toFixed(2)} ms`);
    }
    let cpu = os.cpus()[0]?.model ?? 'unknown CPU';
    try { cpu = execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim() || cpu; } catch { /* not macOS */ }
    const machine = { cpu, logicalCores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30), os: `${os.type()} ${os.release()} (${os.arch()})`, browser: `Chromium-based ${version} headless`, wheelMeasuredOn: 'production build (vite preview)', node: process.version, samplesPerCell: SAMPLES, warmup: WARMUP };
    writeLog('performance_machine.json', JSON.stringify(machine, null, 2));
    writeTable('performance', rows, [
      { key: 'elements_actual', header: 'Elements', align: 'r' },
      { key: 'entities', header: 'Entities', align: 'r' },
      { key: 'samples', header: 'Wheel events sampled', align: 'r' },
      { key: 'validate_ms_mean', header: 'Validation mean (ms)', align: 'r' },
      { key: 'validate_ms_sd', header: 'sd', align: 'r' },
      { key: 'wheel_to_frame_ms_mean', header: 'Wheel-to-frame latency mean (ms)', align: 'r' },
      { key: 'wheel_to_frame_ms_sd', header: 'sd', align: 'r' },
    ]);
    return { rows, machine };
  } finally {
    await browser.close();
    await server.close();
    await new Promise((resolve) => production.httpServer.close(resolve));
    rmSync(outDir, { recursive: true, force: true });
  }
}
