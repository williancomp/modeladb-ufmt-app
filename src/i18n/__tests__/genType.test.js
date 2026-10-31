import { describe, it, expect, afterEach } from 'vitest';
import { displayGenType, setLanguage } from '../index.js';
import { parseGenType } from '../../persistence/canonicalIR.js';

const storage = { setItem() {} };
afterEach(() => setLanguage('pt', storage));

describe('rótulos de especialização', () => {
  it('português mostra o código armazenado (D/C)', () => {
    setLanguage('pt', storage);
    expect(['T,D', 'T,C', 'P,D', 'P,C', 'U'].map(displayGenType)).toEqual(['T,D', 'T,C', 'P,D', 'P,C', 'U']);
  });
  it('inglês mostra disjoint/overlapping como D/O', () => {
    setLanguage('en', storage);
    expect(['T,D', 'T,C', 'P,D', 'P,C', 'U'].map(displayGenType)).toEqual(['T,D', 'T,O', 'P,D', 'P,O', 'U']);
  });
  it('o código armazenado no arquivo não muda', () => {
    expect(parseGenType('P,C')).toEqual({ totality: 'partial', disjointness: 'overlapping' });
    expect(parseGenType('T,D')).toEqual({ totality: 'total', disjointness: 'disjoint' });
  });
});
