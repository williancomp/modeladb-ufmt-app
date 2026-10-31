import { it, expect } from 'vitest';
import * as semantics from '../semantics.js';
const points = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 80, y: 30 },
];
it('em Chen só a conexão dependente desenha linha dupla; (min,max) não altera a linha', () => {
  expect(semantics.participationPaths(points, true, 'chen')).toHaveLength(2);
  expect(semantics.participationPaths(points, false, 'chen')).toEqual([points]);
  expect(semantics.participationPaths(points, undefined, 'chen')).toEqual([points]);
  expect(semantics.participationPaths(points, true, 'crow')).toEqual([points]);
});
it('marcar como dependente força participação total e preserva min >= 1', () => {
  expect(semantics.dependentCardinality('0,N')).toBe('1,1');
  expect(semantics.dependentCardinality('0,1')).toBe('1,1');
  expect(semantics.dependentCardinality('1,N')).toBe('1,N');
  expect(semantics.dependentCardinality('2,5')).toBe('2,5');
  expect(semantics.dependentCardinality('')).toBe('1,1');
});
it('chave Chen usa sublinhado e permite variante de círculo preenchido', () => {
  expect(semantics.attributePresentation({ primary: true }, false)).toEqual({
    underline: 'solid',
    filled: false,
  });
  expect(semantics.attributePresentation({ primary: true, keyStyle: 'filled' }, false)).toEqual({
    underline: null,
    filled: true,
  });
});
it('discriminante explícito e chave fraca legada usam sublinhado tracejado', () => {
  expect(semantics.attributePresentation({ partialKey: true }, true)).toEqual({
    underline: 'dashed',
    filled: false,
  });
  expect(semantics.attributePresentation({ primary: true }, true)).toEqual({
    underline: 'dashed',
    filled: false,
  });
  expect(semantics.attributeKeyKind({ primary: true }, false)).toBe('primary');
});
it('D-09 losango duplo exige algum dependente e não todos os participantes', () => {
  expect(
    semantics.isIdentifyingRelationship({ connections: [{ weak: true }, { weak: false }] }),
  ).toBe(true);
  expect(
    semantics.isIdentifyingRelationship({ connections: [{ weak: false }, { weak: false }] }),
  ).toBe(false);
});
it.each(['5,2', '-1,N', '1,0', '1.5,N', 'N,N', 'abc', '(1,1', '9007199254740992,N'])(
  'rejeita limites inválidos %s',
  (card) => expect(() => semantics.parseCardinality(card)).toThrow(),
);
it.each(['(0,n)', '0,N', 'N'])('normaliza formato legado %s', (card) =>
  expect(semantics.formatCardinality(card)).toBe('0,N'),
);
