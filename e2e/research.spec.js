import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { openApp, dragTool, docWhere, menu } from './helpers.js';

// Research mode is a build-time switch (VITE_RESEARCH_MODE=true); the build is served on port 4175.
const RESEARCH = 'http://127.0.0.1:4175';

test.describe('research build', () => {
  test.use({ baseURL: RESEARCH });

  test('shows the consent notice, asks for the participant once, names the files and records the process', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#researchConsent')).toBeVisible();
    await dragTool(page, 'btnEntity', 400, 300);
    await docWhere(page, (d) => d.domain.entities.length === 1);

    await menu(page, 'btnSaveFile');
    const modal = page.locator('#participantModal');
    await expect(modal).toBeVisible();
    await page.fill('#participantInput', 'ab'); // too short
    await page.click('#participantConfirm');
    await expect(page.locator('#participantError')).toBeVisible();
    await page.fill('#participantInput', 'Maria José Souza');
    const [file] = await Promise.all([page.waitForEvent('download'), page.click('#participantConfirm')]);
    expect(file.suggestedFilename()).toMatch(/^diagrama_er_maria-jose-souza_\d{8}_\d{6}\.merdb$/);
    const saved = JSON.parse(readFileSync(await file.path(), 'utf8'));
    expect(saved.meta.processLog.events[0].type).toBe('session_start');
    expect(saved.meta.processLog.events.map((e) => e.type)).toEqual(expect.arrayContaining(['object_created', 'export']));
    expect(JSON.stringify(saved)).toContain('Maria José Souza');

    // The name is asked once per session: the next export goes straight through and carries the name in the image.
    const [svg] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnExportSVG')]);
    expect(svg.suggestedFilename()).toContain('maria-jose-souza');
    await expect(modal).toBeHidden();
    expect(readFileSync(await svg.path(), 'utf8')).toContain('Maria José Souza');
  });
});

test.describe('default build', () => {
  test('has no consent notice, no participant prompt and no process log', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#researchConsent')).toBeHidden();
    await dragTool(page, 'btnEntity', 400, 300);
    await docWhere(page, (d) => d.domain.entities.length === 1);
    const [file] = await Promise.all([page.waitForEvent('download'), menu(page, 'btnSaveFile')]);
    expect(file.suggestedFilename()).toMatch(/^diagrama_er_\d{8}_\d{6}\.merdb$/);
    expect(readFileSync(await file.path(), 'utf8')).not.toContain('processLog');
    await expect(page.locator('#participantModal')).toBeHidden();
  });
});
