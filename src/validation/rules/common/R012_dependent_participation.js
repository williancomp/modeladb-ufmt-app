import { parseCardinality } from '../../../domain/semantics.js';
/**
 * R012 — Participação parcial em conexão dependente
 *
 * Uma entidade fraca depende da proprietária para existir e ser identificada; a ferramenta
 * traduz essa dependência por min >= 1 na conexão dependente. Vale também para agregações.
 *
 * Fonte (parcial): Chen (1976), §2.3, p. 18, e §3.1, p. 20 — dependência de existência da
 * entidade fraca. A tradução para o mínimo (min >= 1) é leitura da ferramenta: em Chen o
 * mínimo só aparece na linguagem textual de declaração (§3.2, p. 21), não no diagrama.
 */
export const R012 = {
  id: 'R012',
  name: 'Conexão dependente com participação parcial',
  severity: 'warning',
  notation: 'common',
  literature: 'Chen (1976), §2.3 e §3.1 (apenas: dependência de existência da entidade fraca); min >= 1 é leitura da ferramenta',
  check(model) {
    const violations = [];
    for (const r of [...(model.relationships || []), ...(model.aggregations || [])]) {
      for (const c of r.connections || []) {
        if (!c.weak || !c.cardinality) continue;
        let min;
        try {
          min = parseCardinality(c.cardinality).min;
        } catch {
          continue; // R002 informa os limites inválidos.
        }
        if (min >= 1) continue;
        violations.push({
          elementId: r.id,
          elementType: r.objType || 'relationship',
          message: `A conexão dependente de '${r.name}' tem cardinalidade mínima 0. Uma entidade fraca depende totalmente da proprietária: use mínimo 1.`,
        });
      }
    }
    return violations;
  },
};
