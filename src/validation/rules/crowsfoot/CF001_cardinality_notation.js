import { parseCardinality } from '../../../domain/semantics.js';

/**
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 * R002 trata ausências e pares inválidos; CF001 avisa só limites que os símbolos IE não distinguem.
 */
export const CF001 = {
  id: 'CF001',
  name: "Limites numéricos em Crow's Foot",
  severity: 'warning',
  notation: 'crow',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check({ relationships = [] }) {
    return relationships.flatMap((r) =>
      (r.connections || []).flatMap((c) => {
        if (!c.cardinality) return [];
        let card;
        try {
          card = parseCardinality(c.cardinality);
        } catch {
          return [];
        }
        if (card.min <= 1 && (card.max === 1 || card.max === 'N')) return [];
        return [
          {
            elementId: r.id,
            elementType: 'relationship',
            message: `O relacionamento '${r.name}' usa limites numéricos específicos. Consulte o par mínimo,máximo: os símbolos Crow's Foot distinguem somente opcional/obrigatório e um/muitos.`,
          },
        ];
      }),
    );
  },
};
