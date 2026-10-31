import { describe, it, expect } from 'vitest';
import { toCanonicalIR } from '../../persistence/canonicalIR.js';
import { mapToRelational } from '../logicalMapper.js';

const key = (id, parentId, name) => ({ id, parentId, name, dataType: 'Texto', parentType: 'entity', primary: true });

describe('especialização com mais de dois subtipos', () => {
  const model = {
    entities: [0, 1, 2, 3, 4].map((id) => ({ id, name: `E${id}` })),
    attributes: [key(0, 0, 'codigo')],
    specializations: [
      {
        id: 0,
        genType: 'T,C',
        connections: [
          { entityId: 0, vertex: 0 },
          { entityId: 1, vertex: 1 },
          { entityId: 2, vertex: 2 },
          { entityId: 3, vertex: 2 },
          { entityId: 4, vertex: 1 },
        ],
      },
    ],
  };

  it('o IR canônico guarda todos os subtipos', () => {
    const ir = toCanonicalIR(model);
    expect(ir.generalizations[0].subEntityIds).toHaveLength(4);
  });

  it('o modelo lógico cria uma tabela por subtipo', () => {
    const tables = mapToRelational(toCanonicalIR(model)).tables.map((t) => t.name);
    for (const name of ['e1', 'e2', 'e3', 'e4']) expect(tables).toContain(name);
  });
});
