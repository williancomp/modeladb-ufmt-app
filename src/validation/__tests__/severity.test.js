import { describe, it, expect, afterEach } from 'vitest';
import { validateModel } from '../engine.js';
import { getRulesForNotation } from '../rules/index.js';
import { setLanguage } from '../../i18n/index.js';

const storage = { setItem() {} };
afterEach(() => setLanguage('pt', storage));

const advice = ['R005', 'R006', 'R007', 'R009', 'R010'];

describe('severidade das regras', () => {
  it('as regras de orientação (nomes e mapeamento lógico) têm severidade info', () => {
    const rules = getRulesForNotation('chen');
    for (const id of advice) expect(rules.find((r) => r.id === id).severity).toBe('info');
  });

  it('regras estruturais continuam como erro ou aviso', () => {
    const rules = getRulesForNotation('chen').filter((r) => !advice.includes(r.id));
    for (const r of rules) expect(['error', 'warning']).toContain(r.severity);
  });

  const model = {
    entities: [{ id: 1, name: 'Alunos', objType: 'entity' }],
    attributes: [
      { id: 4, name: 'matricula', primary: true, parentType: 'entity', parentId: 1, objType: 'attribute' },
      { id: 5, name: 'fones', multivalued: true, parentType: 'entity', parentId: 1, objType: 'multivaluedAttribute' },
    ],
    relationships: [],
  };

  it('R005 e R006 chegam ao resultado com severity info', () => {
    const found = validateModel(model, 'chen').filter((v) => advice.includes(v.ruleId));
    expect(found.map((v) => v.ruleId).sort()).toEqual(['R005', 'R006']);
    expect(found.every((v) => v.severity === 'info')).toBe(true);
  });

  it('R005 diz que o atributo é válido e vira tabela separada, em português e em inglês', () => {
    const pt = validateModel(model, 'chen').find((v) => v.ruleId === 'R005');
    expect(pt.message).toMatch(/válido no EER/);
    expect(pt.message).toMatch(/tabela separada/);
    setLanguage('en', storage);
    const en = validateModel(model, 'chen').find((v) => v.ruleId === 'R005');
    expect(en.name).toBe('Multivalued attribute becomes a separate table in the logical model');
    expect(en.message).toBe(
      "The multivalued attribute 'fones' is valid EER; in the logical model it will become a separate table.",
    );
    expect(en.message).not.toMatch(/warn|must|invalid/i);
  });

  it('sugestões não são contadas como erro ou aviso', () => {
    const blocking = validateModel(model, 'chen').filter((v) => v.severity !== 'info');
    expect(blocking).toEqual([]);
  });
});
