import { describe, it, expect } from 'vitest';
import { R007 } from '../rules/common/R007_generic_relationship_name.js';
import { R009 } from '../rules/common/R009_default_entity_name.js';
import { R010 } from '../rules/common/R010_default_attribute_name.js';
import { validateModel } from '../engine.js';

const entity = (id, name) => ({ id, name, x: 0, y: 0, width: 140, height: 70, objType: 'entity' });
const attribute = (id, name, extra = {}) => ({
  id, name, x: 0, y: 0, primary: false, derived: false, multivalued: false,
  parentType: 'entity', parentId: 1, objType: 'attribute', ...extra
});

describe('R009 — entidade com nome padrão', () => {
  it('acusa os rótulos provisórios gerados pela ferramenta', () => {
    // "Entidade" vem do arraste da barra; "Nova Entidade" vem do atalho E
    const model = { entities: [entity(1, 'Entidade'), entity(2, 'Nova Entidade')] };
    expect(R009.check(model)).toHaveLength(2);
  });

  it('acusa nome vazio ou só com espaços', () => {
    const model = { entities: [entity(1, ''), entity(2, '   ')] };
    expect(R009.check(model)).toHaveLength(2);
  });

  it('ignora maiúsculas/minúsculas', () => {
    expect(R009.check({ entities: [entity(1, 'ENTIDADE')] })).toHaveLength(1);
  });

  it('aceita nomes de domínio', () => {
    const model = { entities: [entity(1, 'Cliente'), entity(2, 'Veículo'), entity(3, 'Locação')] };
    expect(R009.check(model)).toHaveLength(0);
  });

  it('não confunde nome de domínio que contém a palavra padrão', () => {
    expect(R009.check({ entities: [entity(1, 'EntidadeFederativa')] })).toHaveLength(0);
  });

  it('cita o nome atual na mensagem, para o aluno localizar', () => {
    const [v] = R009.check({ entities: [entity(7, 'Entidade')] });
    expect(v.elementId).toBe(7);
    expect(v.elementType).toBe('entity');
    expect(v.message).toContain('Entidade');
  });
});

describe('R010 — atributo com nome padrão', () => {
  it('acusa os rótulos de cada tipo de atributo do menu', () => {
    const model = { attributes: [
      attribute(1, 'Atributo'), attribute(2, 'NovoAtributo'),
      attribute(3, 'Subatributo'), attribute(4, 'Deriv.'), attribute(5, 'Multival.'),
    ] };
    expect(R010.check(model)).toHaveLength(5);
  });

  it('trata o rótulo de chave primária com mensagem própria', () => {
    const [v] = R010.check({ attributes: [attribute(1, 'ID', { primary: true })] });
    expect(v.message).toContain('identificador');
    expect(v.message).not.toContain('nome padrão');
  });

  it('aceita nomes de domínio', () => {
    const model = { attributes: [
      attribute(1, 'nome'), attribute(2, 'dataNascimento'),
      attribute(3, 'placa'), attribute(4, 'idCliente'), attribute(5, 'CPF'),
    ] };
    expect(R010.check(model)).toHaveLength(0);
  });

  it('não acusa nada quando não há atributos', () => {
    expect(R010.check({})).toHaveLength(0);
  });
});

describe('nomeação padrão — integração com o motor', () => {
  it('as três regras de nomeação têm a mesma severidade', () => {
    // Entidade, atributo e relacionamento com nome padrão são o mesmo tipo de
    // problema; severidades diferentes gerariam cores diferentes no painel.
    expect(R009.severity).toBe(R007.severity);
    expect(R010.severity).toBe(R007.severity);
  });

  it('o motor reporta as três em um modelo inteiramente com nomes padrão', () => {
    const violations = validateModel({
      entities: [entity(1, 'Entidade'), entity(2, 'Nova Entidade')],
      attributes: [attribute(11, 'Atributo')],
      relationships: [{ id: 21, name: 'Rel.', x: 0, y: 0, objType: 'relationship',
        connections: [{ entityId: 1 }, { entityId: 2 }] }],
      specializations: [], aggregations: [],
    }, 'chen');

    const rules = violations.map(v => v.ruleId);
    expect(rules).toContain('R007');
    expect(rules).toContain('R009');
    expect(rules).toContain('R010');
  });

  it('um modelo bem nomeado não dispara nenhuma regra de nomeação', () => {
    const violations = validateModel({
      entities: [entity(1, 'Cliente'), entity(2, 'Veículo')],
      attributes: [attribute(11, 'CPF', { primary: true }), attribute(12, 'placa', { parentId: 2, primary: true })],
      relationships: [{ id: 21, name: 'aluga', x: 0, y: 0, objType: 'relationship',
        connections: [{ entityId: 1, cardinality: '1' }, { entityId: 2, cardinality: 'N' }] }],
      specializations: [], aggregations: [],
    }, 'chen');

    const rules = violations.map(v => v.ruleId);
    expect(rules).not.toContain('R007');
    expect(rules).not.toContain('R009');
    expect(rules).not.toContain('R010');
  });
});
