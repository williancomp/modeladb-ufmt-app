/**
 * C001 — Atributo sem vínculo (notação Chen)
 *
 * No desenho EER estilo Chen, atributos são elementos gráficos independentes (círculos)
 * conectados às entidades ou relacionamentos por linhas. Um atributo sem
 * parentId definido (orphan attribute) não pertence a nenhum elemento e
 * representa um erro de modelagem.
 *
 * Esta regra é específica do EER estilo Chen porque no Crow's Foot os atributos são
 * linhas de texto dentro do retângulo da entidade e não podem existir de forma
 * independente na interface.
 *
 * Fonte: Chen (1976), §2.2.3, pp. 12–13 — atributos pertencem a entidades e a
 * relacionamentos. O desenho como círculo ligado por linha é da ferramenta.
 */
export const C001 = {
  id: 'C001',
  name: 'Atributo sem vínculo (EER estilo Chen)',
  severity: 'error',
  notation: 'chen',
  literature: 'Chen (1976), §2.2.3 (atributos pertencem a entidades e relacionamentos)',
  check: (model) => {
    const violations = [];
    const { attributes = [], entities = [], relationships = [], aggregations = [] } = model;

    const entityIds = new Set(entities.map((e) => e.id));
    const relIds = new Set(relationships.map((r) => r.id));

    attributes.forEach((a) => {
      const parentExists =
        (a.parentType === 'entity' && entityIds.has(a.parentId)) ||
        (a.parentType === 'relationship' && relIds.has(a.parentId)) ||
        (a.parentType === 'aggregation' && aggregations.some((g) => g.id === a.parentId)) ||
        (a.parentType === 'attribute' &&
          attributes.some((parent) => parent.id === a.parentId && parent.id !== a.id)); // sub-atributo — pai é outro atributo

      if (!parentExists) {
        violations.push({
          elementId: a.id,
          elementType: 'attribute',
          message: `O atributo '${a.name}' não está vinculado a nenhuma entidade ou relacionamento. No EER estilo Chen, atributos devem pertencer a um elemento pai.`,
        });
      }
    });

    return violations;
  },
};
