import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { logEvent, startSession, exportLog, resetLog } from '../processLog.js';
import { ensureParticipantName, getParticipantName } from '../participant.js';
beforeEach(() => {
  resetLog();
  vi.stubEnv('VITE_RESEARCH_MODE', '');
});
afterEach(() => vi.unstubAllEnvs());
it('D-07 pesquisa desativada por padrão não pede nome e não registra eventos', async () => {
  startSession();
  logEvent('object_created', { name: 'privado' });
  expect(exportLog().eventCount).toBe(0);
  expect(getParticipantName()).toBe('');
  expect(await ensureParticipantName()).toBe('');
});
it('pesquisa exige flag true explícita', () => {
  vi.stubEnv('VITE_RESEARCH_MODE', 'false');
  startSession();
  expect(exportLog().eventCount).toBe(0);
  vi.stubEnv('VITE_RESEARCH_MODE', 'true');
  startSession();
  logEvent('object_created');
  expect(exportLog().eventCount).toBe(2);
});
