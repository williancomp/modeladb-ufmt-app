import { describe, it, expect } from 'vitest';
import { toCanonicalIR } from '../../persistence/canonicalIR.js';
import { exportCode } from '../index.js';

const key = (id, parentId, name, type = 'Texto') => ({ id, parentId, name, dataType: type, parentType: 'entity', primary: true });
const model = () => ({
  entities: [
    { id: 0, name: 'Team' },
    { id: 1, name: 'Fixture' },
  ],
  attributes: [key(0, 0, 'code'), key(1, 1, 'number', 'Numérico Inteiro')],
  relationships: [
    { id: 0, name: 'home', connections: [{ entityId: 0, cardinality: '0,1' }, { entityId: 1, cardinality: '1,N' }] },
    { id: 1, name: 'away', connections: [{ entityId: 0, cardinality: '0,1' }, { entityId: 1, cardinality: '1,N' }] },
  ],
});

describe('estrutura válida nos alvos ORM', () => {
  const ir = toCanonicalIR(model());
  it('Django: nenhum argumento vazio, chave primária declarada e referências por nome', () => {
    const code = exportCode(ir, 'django');
    expect(code).not.toContain('(,');
    expect(code).toContain('code = models.CharField(max_length=255, primary_key=True)');
    expect(code).toContain("models.ForeignKey('Team'");
    expect(code).toContain("db_table = 'fixture'");
  });
  it('Django: chave composta usa CompositePrimaryKey', () => {
    const m = model();
    m.entities.push({ id: 2, name: 'Slot' });
    m.attributes.push({ ...key(2, 2, 'position', 'Numérico Inteiro'), primary: false, partialKey: true });
    m.relationships.push({ id: 2, name: 'has', connections: [{ entityId: 1, cardinality: '1,1' }, { entityId: 2, cardinality: '0,N', weak: true }] });
    expect(exportCode(toCanonicalIR(m), 'django')).toContain("pk = models.CompositePrimaryKey('position', 'fixture_number')");
  });
  it('Prisma: campo de relação distinto da coluna, relação nomeada e lado inverso declarado', () => {
    const code = exportCode(ir, 'prisma');
    const fixture = code.slice(code.indexOf('model Fixture'));
    expect(fixture.match(/^ {2}team_code\b/gm)).toHaveLength(1);
    expect(fixture).toContain('@relation("fixture_');
    expect(code.slice(code.indexOf('model Team'), code.indexOf('model Fixture'))).toContain('Fixture[]');
    expect(code).toContain('@@map("fixture")');
  });
  it('Prisma: relação opcional quando a coluna é opcional e o tipo nativo vem antes do modificador', () => {
    const m = {
      entities: [{ id: 0, name: 'Owner' }, { id: 1, name: 'Car' }],
      attributes: [key(0, 0, 'ident', 'Identificador'), { ...key(1, 1, 'plate'), primary: true }],
      relationships: [{ id: 0, name: 'has', connections: [{ entityId: 0, cardinality: '0,1' }, { entityId: 1, cardinality: '0,N' }] }],
    };
    const code = exportCode(toCanonicalIR(m), 'prisma');
    expect(code).toContain('ident String @db.Uuid @id');
    expect(code).toMatch(/owner Owner\? @relation/);
  });
  it('GraphQL: relacionamentos repetidos entre os mesmos tipos geram campos distintos', () => {
    const code = exportCode(ir, 'graphql');
    const team = code.slice(code.indexOf('type Team'), code.indexOf('type Fixture'));
    const names = [...team.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]);
    expect(new Set(names).size).toBe(names.length);
  });
  it('Laravel: uma chave estrangeira composta é emitida em uma única chamada', () => {
    const m = model();
    m.entities.push({ id: 2, name: 'Slot' });
    m.attributes.push({ ...key(2, 2, 'position', 'Numérico Inteiro'), primary: false, partialKey: true });
    m.relationships.push({ id: 2, name: 'has', connections: [{ entityId: 1, cardinality: '1,1' }, { entityId: 2, cardinality: '0,N', weak: true }] });
    expect(exportCode(toCanonicalIR(m), 'laravel')).toContain("->foreign('fixture_number')");
  });
});
