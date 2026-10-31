import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  logEvent,
  startSession,
  exportLog,
  resetLog,
  diffViolations,
  snapshotViolations,
} from '../processLog.js';
import { slugifyName } from '../participant.js';

beforeEach(() => vi.stubEnv('VITE_RESEARCH_MODE', 'true'));
afterEach(() => vi.unstubAllEnvs());

const violation = (ruleId, elementId, severity = 'error') => ({
  ruleId,
  elementId,
  severity,
  elementType: 'entity',
  name: 'x',
  message: 'y',
});

describe('log de processo', () => {
  beforeEach(() => resetLog());

  it('abre a sessão registrando o contexto de execução', () => {
    startSession({ appVersion: '2.1.0', notation: 'chen' });
    const log = exportLog();
    expect(log.events).toHaveLength(1);
    expect(log.events[0].type).toBe('session_start');
    expect(log.events[0].appVersion).toBe('2.1.0');
    expect(log.startedAtISO).not.toBeNull();
  });

  it('registra eventos com carimbo de tempo relativo à abertura', () => {
    startSession();
    logEvent('object_created', { objType: 'entity' });
    const log = exportLog();
    expect(log.events[1].type).toBe('object_created');
    expect(log.events[1].objType).toBe('entity');
    expect(log.events[1].t).toBeGreaterThanOrEqual(0);
  });

  it('trunca em vez de crescer sem limite, e informa quanto perdeu', () => {
    startSession();
    for (let i = 0; i < 5200; i++) logEvent('object_created', { objType: 'entity' });
    const log = exportLog();
    expect(log.eventCount).toBe(5000);
    expect(log.truncatedCount).toBeGreaterThan(0);
  });
});

describe('diffViolations — quais violações surgiram e quais foram resolvidas', () => {
  beforeEach(() => resetLog());

  it('registra abertura na primeira aparição', () => {
    startSession();
    const keys = diffViolations(new Set(), [violation('R001', 1)]);
    const tipos = exportLog().events.map((e) => e.type);
    expect(tipos).toContain('violation_opened');
    expect(keys.has('R001|entity|1')).toBe(true);
  });

  it('não registra nada enquanto o conjunto não muda', () => {
    startSession();
    let keys = diffViolations(new Set(), [violation('R001', 1)]);
    const antes = exportLog().eventCount;
    // updateViolations() roda a cada quadro — quadros idênticos não podem poluir o log
    for (let i = 0; i < 60; i++) keys = diffViolations(keys, [violation('R001', 1)]);
    expect(exportLog().eventCount).toBe(antes);
  });

  it('registra o fechamento quando o aluno corrige', () => {
    startSession();
    const keys = diffViolations(new Set(), [violation('R001', 1)]);
    diffViolations(keys, []);
    const fechados = exportLog().events.filter((e) => e.type === 'violation_closed');
    expect(fechados).toHaveLength(1);
    expect(fechados[0].rule).toBe('R001');
    expect(fechados[0].element).toBe('1');
  });

  it('acompanha abertura e fechamento simultâneos', () => {
    startSession();
    const keys = diffViolations(new Set(), [violation('R001', 1), violation('R009', 2)]);
    diffViolations(keys, [violation('R009', 2), violation('R010', 3)]);
    const ev = exportLog().events;
    expect(ev.filter((e) => e.type === 'violation_opened').map((e) => e.rule)).toEqual([
      'R001',
      'R009',
      'R010',
    ]);
    expect(ev.filter((e) => e.type === 'violation_closed').map((e) => e.rule)).toEqual(['R001']);
  });

  it('distingue violações da mesma regra em elementos diferentes', () => {
    startSession();
    const keys = diffViolations(new Set(), [violation('R001', 1), violation('R001', 2)]);
    diffViolations(keys, [violation('R001', 1)]);
    const fechados = exportLog().events.filter((e) => e.type === 'violation_closed');
    expect(fechados).toHaveLength(1);
    expect(fechados[0].element).toBe('2');
  });
});

describe('snapshotViolations — o que estava sendo sinalizado na hora de exportar', () => {
  it('preserva regra, elemento e severidade de cada violação', () => {
    const snap = snapshotViolations([
      violation('R001', 1, 'error'),
      violation('R009', 2, 'warning'),
    ]);
    expect(snap).toEqual([
      { rule: 'R001', element: 1, elementType: 'entity', severity: 'error' },
      { rule: 'R009', element: 2, elementType: 'entity', severity: 'warning' },
    ]);
  });

  it('modelo sem problemas gera fotografia vazia, não ausente', () => {
    expect(snapshotViolations([])).toEqual([]);
  });
});

describe('slugifyName — nome do aluno no nome do arquivo', () => {
  it('remove acentos e normaliza separadores', () => {
    expect(slugifyName('Maria José de Assunção')).toBe('maria-jose-de-assuncao');
    expect(slugifyName('João   Silva')).toBe('joao-silva');
  });

  it('descarta caracteres inválidos para nome de arquivo', () => {
    expect(slugifyName('Ana/Clara\\Souza')).toBe('ana-clara-souza');
  });

  it('limita o comprimento', () => {
    expect(slugifyName('a'.repeat(90)).length).toBeLessThanOrEqual(40);
  });

  it('tem recuo quando o nome está vazio', () => {
    expect(slugifyName('')).toBe('sem-nome');
    expect(slugifyName('!!!')).toBe('sem-nome');
  });
});

describe('colisão de id entre tipos de elemento', () => {
  beforeEach(() => resetLog());

  it('não confunde a entidade 0 com o atributo 0', () => {
    // Os contadores de id são independentes por tipo, então o mesmo número
    // aparece em objetos diferentes. A chave precisa distinguir.
    startSession();
    const entidade0 = { ruleId: 'R001', elementId: 0, elementType: 'entity', severity: 'error' };
    const atributo0 = { ruleId: 'R001', elementId: 0, elementType: 'attribute', severity: 'error' };

    const keys = diffViolations(new Set(), [entidade0, atributo0]);
    expect(keys.size).toBe(2);
    expect(exportLog().events.filter((e) => e.type === 'violation_opened')).toHaveLength(2);

    // Corrigir só o atributo não pode marcar a entidade como resolvida
    diffViolations(keys, [entidade0]);
    const fechados = exportLog().events.filter((e) => e.type === 'violation_closed');
    expect(fechados).toHaveLength(1);
    expect(fechados[0].elementType).toBe('attribute');
  });
});
