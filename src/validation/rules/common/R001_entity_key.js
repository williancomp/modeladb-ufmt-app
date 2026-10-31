import { isWeakEntity } from '../../../domain/semantics.js';
/**
 * R001 — Entidade sem atributo identificador
 *
 * Toda entidade forte deve possuir pelo menos um atributo chave (identificador).
 * Toda entidade fraca deve possuir um atributo discriminante (chave parcial).
 *
 * Subtipos em hierarquias de generalização herdam o atributo chave do supertipo
 * e, portanto, não precisam de um atributo chave próprio.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R001 = {
  id: 'R001',
  name: 'Entidade sem atributo identificador',
  severity: 'error',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const {
      entities = [],
      attributes = [],
      relationships = [],
      specializations = [],
      aggregations = [],
    } = model;

    // Collect all entity IDs that appear as subtypes in any generalization
    // (vertex !== 0 means subtype; legacy: isGeneralization === false)
    const isSubtype = (c) =>
      c.vertex !== undefined ? c.vertex !== 0 : c.isGeneralization === false;

    const subtypeEntityIds = new Set();
    specializations.forEach((s) => {
      if (s.genType === 'U') {
        (s.connections || [])
          .filter((c) => c.vertex === 0 || c.isGeneralization === true)
          .forEach((c) => subtypeEntityIds.add(c.entityId));
        return;
      }
      (s.connections || []).filter(isSubtype).forEach((c) => subtypeEntityIds.add(c.entityId));
    });

    entities.forEach((e) => {
      // Subtipos herdam o atributo chave do supertipo — não precisam de chave própria
      if (subtypeEntityIds.has(e.id)) return;

      const weak = isWeakEntity(e.id, [...relationships, ...aggregations]);

      if (weak) {
        // Entidade fraca precisa de atributo discriminante (chave parcial), marcado como primary
        // Entidades fracas precisam de um discriminante (chave parcial).
        const hasPartialKey = attributes.some(
          (a) => a.parentType === 'entity' && a.parentId === e.id && (a.partialKey || a.primary),
        );
        if (!hasPartialKey) {
          violations.push({
            elementId: e.id,
            elementType: 'entity',
            message: `A entidade fraca '${e.name}' não possui um atributo discriminante (chave parcial). Marque um atributo como chave parcial.`,
          });
        }
        return;
      }

      // Entidade forte precisa de pelo menos um atributo chave
      const hasKey = attributes.some(
        (a) => a.parentType === 'entity' && a.parentId === e.id && a.primary,
      );
      if (!hasKey) {
        violations.push({
          elementId: e.id,
          elementType: 'entity',
          message: `A entidade '${e.name}' é forte mas não possui um atributo chave (identificador). Toda entidade forte deve ter pelo menos um atributo chave.`,
        });
      }
    });

    return violations;
  },
};
