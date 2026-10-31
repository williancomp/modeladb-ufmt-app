/**
 * R009 — Entidade com nome padrão ou ausente
 *
 * Entidades criadas pela ferramenta recebem um rótulo provisório ("Entidade",
 * "Nova Entidade"). Manter esse rótulo significa que o tipo de entidade não foi
 * nomeado — o modelo perde a semântica do minimundo e o nome provisório é
 * carregado para o esquema lógico na geração do script.
 *
 * Complementa R007 (relacionamento com nome genérico), aplicando o mesmo
 * critério de nomeação significativa ao construto entidade.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R009 = {
  id: 'R009',
  name: 'Entidade com nome padrão',
  severity: 'warning',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const { entities = [] } = model;

    // Rótulos provisórios gerados pela ferramenta + genéricos equivalentes
    const defaultNames = new Set([
      '', 'entidade', 'nova entidade', 'entity', 'new entity',
      'entidade1', 'entidade 1', 'tabela', 'table', 'nome', 'sem nome',
    ]);

    entities.forEach(e => {
      const name = (e.name || '').trim().toLowerCase();
      if (defaultNames.has(name)) {
        violations.push({
          elementId: e.id,
          elementType: 'entity',
          message: `A entidade ainda está com o nome padrão '${e.name || '(vazio)'}'. Renomeie com um substantivo no singular que represente o tipo de objeto do minimundo (ex: 'Cliente', 'Veículo', 'Locação').`
        });
      }
    });

    return violations;
  }
};
