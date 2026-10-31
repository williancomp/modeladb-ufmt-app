/**
 * R007 — Relacionamento com nome genérico ou ausente
 *
 * Relacionamentos devem ser nomeados com verbos significativos que expressem
 * a semântica da associação entre as entidades. Nomes genéricos (como "Rel."
 * ou vazio) prejudicam a legibilidade do modelo.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R007 = {
  id: 'R007',
  name: 'Relacionamento com nome genérico',
  severity: 'info',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const { relationships = [] } = model;

    const genericNames = new Set(['rel.', 'relacionamento', 'relationship', 'rel', '']);

    relationships.forEach(r => {
      const name = r.name.trim().toLowerCase();
      if (genericNames.has(name)) {
        violations.push({
          elementId: r.id,
          elementType: 'relationship',
          message: `O relacionamento '${r.name}' possui um nome genérico. Recomenda-se um verbo significativo (ex: 'possui', 'realiza', 'pertence') que expresse a semântica da associação.`
        });
      }
    });

    return violations;
  }
};
