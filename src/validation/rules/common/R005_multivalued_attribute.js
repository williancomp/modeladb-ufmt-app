/**
 * R005 — Atributo multivalorado (aviso de normalização)
 *
 * Atributos multivalorados (círculo duplo no desenho) exigem conversão para uma
 * tabela separada na etapa do modelo lógico relacional. Esta regra emite um aviso
 * informativo para que o projetista esteja ciente.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R005 = {
  id: 'R005',
  name: 'Atributo multivalorado requer normalização',
  severity: 'warning',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const { attributes = [] } = model;

    attributes.forEach(a => {
      if (a.multivalued || a.objType === 'multivaluedAttribute') {
        violations.push({
          elementId: a.id,
          elementType: 'attribute',
          message: `O atributo multivalorado '${a.name}' precisará ser convertido em uma nova relação na etapa do modelo lógico.`
        });
      }
    });

    return violations;
  }
};
