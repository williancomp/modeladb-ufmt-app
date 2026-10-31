import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const coverage = process.env.E2E_COVERAGE === '1';
export const COVERAGE_DIR = join(process.cwd(), 'coverage', 'e2e-raw');

/**
 * Every test runs against a page that (a) fails on uncaught page errors and on any
 * request leaving 127.0.0.1, and (b) can be switched offline once the assets are loaded.
 */
export const test = base.extend({
  page: async ({ page, context }, use, testInfo) => {
    const external = [];
    const pageErrors = [];
    await context.route('**/*', (route) => {
      const { hostname, protocol } = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(hostname) || ['data:', 'blob:'].includes(protocol)) {
        return route.continue();
      }
      external.push(route.request().url());
      return route.abort();
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    if (coverage) {
      const entries = await page.coverage.stopJSCoverage();
      mkdirSync(COVERAGE_DIR, { recursive: true });
      const name = testInfo.title.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
      writeFileSync(join(COVERAGE_DIR, `${testInfo.testId}_${name}.json`), JSON.stringify(entries));
    }
    expect(external, 'requests to external hosts').toEqual([]);
    expect(pageErrors, 'uncaught page errors').toEqual([]);
  },
});
export { expect };
