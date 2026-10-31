import { t } from '../i18n/index.js';
/** Pares mínimo/máximo; leitura compatível com (0,n), N e 1 dos arquivos antigos. */
export function parseCardinality(value) {
  if (value === undefined || value === null || value === '') return { min: 0, max: 'N' };
  let min, max;
  if (typeof value === 'object') ({ min, max } = value);
  else {
    let text = String(value).trim().toUpperCase();
    if (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1).trim();
    if (text === '1') text = '1,1';
    if (['N', 'M', '*'].includes(text)) text = '0,N';
    const match = text.match(/^(\d+)\s*,\s*(\d+|N|M|\*)$/);
    if (!match) throw new Error(t('Cardinalidade inválida: use mínimo,máximo (ex.: 0,N ou 2,5).'));
    min = Number(match[1]);
    max = ['N', 'M', '*'].includes(match[2]) ? 'N' : Number(match[2]);
  }
  if (
    !Number.isSafeInteger(min) ||
    min < 0 ||
    (max !== 'N' && (!Number.isSafeInteger(max) || max < 1 || min > max))
  ) {
    throw new Error(t('Cardinalidade inválida: mínimo não negativo e máximo >= mínimo e >= 1.'));
  }
  return { min, max };
}

export function formatCardinality(value) {
  const { min, max } = parseCardinality(value);
  return `${min},${max}`;
}

// weak marca o participante dependente; qualquer dependente torna o losango identificador.
export function isIdentifyingRelationship(rel) {
  return !!(rel.connections || rel.participants || []).some((c) => c.weak);
}

export function isWeakEntity(id, relationships = []) {
  return relationships.some((r) =>
    (r.connections || r.participants || []).some((c) => c.entityId === id && c.weak),
  );
}

export function isMany(max) {
  return max === 'N' || max === 'n' || Number(max) > 1;
}

export function hasTotalParticipation(cardinality) {
  return parseCardinality(cardinality).min >= 1;
}

/** Dependente (fraca) exige participação total: entidade fraca depende totalmente do proprietário. */
export function dependentCardinality(cardinality) {
  try {
    return hasTotalParticipation(cardinality) ? cardinality : '1,1';
  } catch {
    return '1,1';
  }
}

/** primary em entidades fracas antigas já significava discriminante: conserva essa leitura. */
export function attributeKeyKind(attribute, weak = false) {
  if (attribute.partialKey || (attribute.primary && weak)) return 'partial';
  return attribute.primary ? 'primary' : 'none';
}

/** Decoração da chave em Chen; a variante preenchida é uma preferência por atributo. */
export function attributePresentation(attribute, weak = false) {
  const kind = attributeKeyKind(attribute, weak);
  if (kind === 'partial') return { underline: 'dashed', filled: false };
  if (kind === 'primary')
    return attribute.keyStyle === 'filled'
      ? { underline: null, filled: true }
      : { underline: 'solid', filled: false };
  return { underline: null, filled: false };
}

/**
 * Em Chen a linha é simples; (min,max) já expressa a participação. Duas linhas paralelas,
 * incluindo os cotovelos, marcam apenas uma conexão dependente (fraca).
 */
export function participationPaths(points, dependent, notation = 'chen') {
  if (notation !== 'chen' || !dependent || points.length < 2) return [points];
  const normals = points.slice(1).map((point, i) => {
    const dx = point.x - points[i].x,
      dy = point.y - points[i].y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
  });
  return [-3, 3].map((offset) =>
    points.map((point, i) => {
      const before = normals[Math.max(0, i - 1)],
        after = normals[Math.min(i, normals.length - 1)];
      const x = before.x + after.x,
        y = before.y + after.y;
      const length = Math.hypot(x, y) || 1;
      const nx = x / length,
        ny = y / length;
      const scale = offset / Math.max(0.5, nx * after.x + ny * after.y);
      return { x: point.x + nx * scale, y: point.y + ny * scale };
    }),
  );
}

/** Lower-case ASCII snake_case identifier: accents are transliterated (Número -> numero), not replaced. */
export function toIdentifier(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}
