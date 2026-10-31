/**
 * R011 — Nome de entidade duplicado.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra. Os nomes viram tabelas distintas.
 */
export const R011 = {
  id: 'R011',
  name: 'Nome de entidade duplicado',
  severity: 'error',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check(model) {
    const groups = new Map();
    for (const entity of model.entities || []) {
      const name = (entity.name || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      if (!name) continue;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(entity);
    }
    return [...groups.values()]
      .filter((group) => group.length > 1)
      .flatMap((group) =>
        group.map((entity) => ({
          elementId: entity.id,
          elementType: 'entity',
          message: `O nome '${entity.name}' está repetido. Use nomes distintos para identificar as entidades.`,
        })),
      );
  },
};
