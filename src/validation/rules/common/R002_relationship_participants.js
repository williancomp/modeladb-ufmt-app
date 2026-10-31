import { parseCardinality } from '../../../domain/semantics.js';
/**
 * R002 — Relacionamento sem participantes ou sem cardinalidade definida
 *
 * Todo relacionamento deve conectar pelo menos 2 entidades participantes,
 * e cada conexão deve ter a cardinalidade explicitamente definida.
 *
 * Fonte (parcial): Chen (1976), §2.2.1–2.2.2, pp. 11–12 — relacionamentos são tuplas
 * sobre conjuntos de entidades. Isso sustenta somente a exigência de participantes; a
 * exigência de cardinalidade explícita é diretriz da ferramenta, sem atribuição.
 */
export const R002 = {
  id: 'R002',
  name: 'Relacionamento sem participantes ou cardinalidade',
  severity: 'error',
  notation: 'common',
  literature: 'Chen (1976), §2.2.1–2.2.2 (apenas: relacionamento sobre conjuntos de entidades); cardinalidade explícita é diretriz da ferramenta',
  check: (model) => {
    const violations = [];
    const { relationships = [] } = model;

    relationships.forEach((r) => {
      const connections = r.connections || [];

      if (connections.length < 2) {
        violations.push({
          elementId: r.id,
          elementType: 'relationship',
          message: `O relacionamento '${r.name}' deve conectar pelo menos 2 entidades participantes.`,
        });
      }

      connections.forEach((c) => {
        let invalid = !c.cardinality || String(c.cardinality).trim() === '';
        try {
          parseCardinality(c.cardinality);
        } catch {
          invalid = true;
        }
        if (invalid) {
          violations.push({
            elementId: r.id,
            elementType: 'relationship',
            message: `O relacionamento '${r.name}' possui uma cardinalidade ausente ou inválida. Use mínimo,máximo, com mínimo não negativo e máximo >= mínimo (ex.: 0,N ou 2,5).`,
          });
        }
      });
    });

    return violations;
  },
};
