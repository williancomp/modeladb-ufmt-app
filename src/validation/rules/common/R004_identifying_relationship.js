import { isIdentifyingRelationship } from '../../../domain/semantics.js';
/**
 * R004 — Relacionamento identificador incompleto
 *
 * Um relacionamento identificador (conexão dependente) liga uma entidade fraca a uma
 * ou mais entidades proprietárias (que podem depender de outra proprietária). Sem uma
 * entidade proprietária conectada, a entidade fraca não pode ser identificada.
 *
 * Fonte (parcial): Chen (1976), §2.3, p. 18, e §3.1, p. 20 — entidades fracas são
 * identificadas por meio de um relacionamento. Isso sustenta o conceito; a contagem
 * mínima de proprietárias verificada aqui é diretriz da ferramenta, sem atribuição.
 */
export const R004 = {
  id: 'R004',
  name: 'Relacionamento identificador incompleto',
  severity: 'warning',
  notation: 'common',
  literature: 'Chen (1976), §2.3 e §3.1 (apenas: entidade fraca identificada por relacionamento); número de proprietárias é diretriz da ferramenta',
  check: (model) => {
    const violations = [];
    const relationships = [...(model.relationships || []), ...(model.aggregations || [])];

    relationships.forEach((r) => {
      if (!r.connections || r.connections.length === 0) return;

      if (!isIdentifyingRelationship(r)) return;

      const strongConnections = r.connections.filter((c) => !c.weak && c.entityId !== undefined);
      if (strongConnections.length === 0) {
        violations.push({
          elementId: r.id,
          elementType: 'relationship',
          message: `O relacionamento identificador '${r.name}' deve estar ligado a pelo menos uma entidade proprietária (que pode depender de outra proprietária).`,
        });
      }
    });

    return violations;
  },
};
