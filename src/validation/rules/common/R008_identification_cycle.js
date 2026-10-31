/**
 * R008 — Ciclo de identificação entre entidades fracas
 *
 * Entidades fracas dependem de entidades proprietárias para sua identificação.
 * Um ciclo de dependência (A fraca de B, B fraca de A) cria uma dependência
 * circular sem âncora forte, tornando o modelo logicamente inconsistente.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R008 = {
  id: 'R008',
  name: 'Ciclo de identificação entre entidades fracas',
  severity: 'warning',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const relationships = [...(model.relationships || []), ...(model.aggregations || [])];

    // Construir grafo de dependência de identificação: weakEntityId → Set<ownerEntityId>
    const graph = {};
    relationships.forEach((r) => {
      if (!r.connections) return;
      const weakConns = r.connections.filter((c) => c.weak);
      const ownerConns = r.connections.filter((c) => !c.weak);
      weakConns.forEach((wc) => {
        if (!graph[wc.entityId]) graph[wc.entityId] = new Set();
        ownerConns.forEach((oc) => graph[wc.entityId].add(oc.entityId));
      });
    });

    // Detectar ciclos via DFS
    const visited = new Set();
    const recursionStack = new Set();
    const isCyclic = (node) => {
      if (!visited.has(node)) {
        visited.add(node);
        recursionStack.add(node);
        for (const owner of graph[node] || []) {
          if (!visited.has(owner) && isCyclic(owner)) return true;
          if (recursionStack.has(owner)) return true;
        }
      }
      recursionStack.delete(node);
      return false;
    };

    const seen = new Set();
    for (const node in graph) {
      if (isCyclic(Number(node))) {
        const key = String(node);
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            elementId: Number(node),
            elementType: 'entity',
            message: `A entidade fraca participa de um ciclo de identificação (nenhuma entidade forte raiz foi encontrada na cadeia de dependência).`,
          });
        }
      }
    }

    return violations;
  },
};
