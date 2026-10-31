import { it, expect } from 'vitest';
import { exportCode } from '../index.js';

const entity = (id, attributes = [], extra = {}) => ({ id, name: id, attributes, ...extra });
const key = (name, type = 'integer') => ({ name, dataType: type, type: 'simple', primaryKey: true });

// pessoa 1-N dependente (identificador, cascade) e pessoa 1-N pedido (comum, sem cascade)
const ir = {
  entities: [
    entity('pessoa', [key('cpf', 'string')]),
    entity('dependente', [key('numero')], { weak: true }),
    entity('pedido', [key('codigo')]),
  ],
  relationships: [
    {
      id: 'possui',
      identifying: true,
      participants: [
        { entityId: 'pessoa', weak: false, cardinality: { min: 1, max: 1 } },
        { entityId: 'dependente', weak: true, cardinality: { min: 1, max: 'N' } },
      ],
    },
    {
      id: 'faz',
      participants: [
        { entityId: 'pessoa', cardinality: { min: 1, max: 1 } },
        { entityId: 'pedido', cardinality: { min: 0, max: 'N' } },
      ],
    },
  ],
};

it('SQL: CASCADE só na conexão dependente da entidade fraca', () => {
  for (const target of ['postgres', 'mysql', 'sqlite']) {
    const code = exportCode(ir, target);
    const dep = code.split('\n').filter((l) => /FOREIGN KEY \(.*pessoa_cpf\)/.test(l) && !/\(pedido/.test(l));
    const cascades = code.match(/ON DELETE CASCADE/g) || [];
    expect(cascades).toHaveLength(1);
    expect(dep.some((l) => l.includes('ON DELETE CASCADE'))).toBe(true);
    expect(code).not.toMatch(/FOREIGN KEY \(`?"?pessoa_cpf`?"?\) REFERENCES [^;\n]*\)\s*ON DELETE NO/);
  }
});

it('Laravel, Django e Prisma seguem a mesma política', () => {
  const laravel = exportCode(ir, 'laravel');
  expect(laravel.match(/onDelete\('cascade'\)/g)).toHaveLength(1);
  expect(laravel).toContain("onDelete('no action')");
  const django = exportCode(ir, 'django');
  expect(django.match(/models\.CASCADE/g)).toHaveLength(1);
  expect(django).toContain('models.DO_NOTHING');
  const prisma = exportCode(ir, 'prisma');
  expect(prisma.match(/onDelete: Cascade/g)).toHaveLength(1);
  expect(prisma).toContain('onDelete: NoAction');
});

it('modelo sem entidade fraca não gera nenhum CASCADE', () => {
  const plain = { ...ir, entities: ir.entities.map((e) => ({ ...e, weak: false })), relationships: [ir.relationships[1]] };
  for (const target of ['postgres', 'laravel', 'django', 'prisma']) {
    expect(exportCode(plain, target)).not.toMatch(/cascade/i);
  }
});
