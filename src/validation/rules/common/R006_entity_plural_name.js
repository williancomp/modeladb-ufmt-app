/**
 * R006 — Entidade nomeada no plural
 *
 * Entidades representam tipos de objetos, não coleções; por convenção de nomeação
 * desta ferramenta, seus nomes devem ser substantivos no singular. Heurística de
 * precisão limitada (ver evaluation/results/mutation_rules.csv).
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R006 = {
  id: 'R006',
  name: 'Entidade nomeada no plural',
  severity: 'info',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const { entities = [] } = model;

    // Palavras portuguesas terminadas em 's' que são genuinamente singulares
    const singularExceptions = new Set([
      'status', 'campus', 'bonus', 'bônus', 'virus', 'vírus', 'atlas',
      'pais', 'país', 'onibus', 'ônibus', 'calculus', 'nexus', 'locus',
      'focus', 'census', 'exodus', 'radius', 'sinus', 'plexus', 'hiatus',
      'anus', 'corpus', 'syllabus', 'tórax', 'lápis', 'oásis', 'deus',
      'stress', 'access', 'process', 'address', 'express', 'progress',
      'success', 'excess', 'recess', 'egress', 'ingress', 'canvas',
      'alias', 'bias', 'chaos', 'cosmos', 'logos',
      'analysis', 'synthesis', 'thesis', 'basis', 'crisis', 'news', 'series', 'species',
      'physics', 'economics', 'mathematics', 'linguistics', 'measles', 'diabetes', 'business',
    ]);

    entities.forEach(e => {
      const name = e.name.trim();
      const nameLower = name.toLowerCase();

      if (
        nameLower.length <= 2 ||
        nameLower.endsWith('ss') ||
        singularExceptions.has(nameLower)
      ) return;

      const irregularEnglishPlurals = new Set(['people', 'children', 'men', 'women', 'teeth', 'feet', 'mice', 'geese', 'oxen']);
      if (nameLower.endsWith('s') || irregularEnglishPlurals.has(nameLower)) {
        violations.push({
          elementId: e.id,
          elementType: 'entity',
          message: `O nome da entidade '${e.name}' parece estar no plural. Recomenda-se o uso do singular, pois entidades representam tipos, não coleções.`
        });
      }
    });

    return violations;
  }
};
