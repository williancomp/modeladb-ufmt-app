/**
 * R005 — Atributo multivalorado (orientação sobre o modelo lógico)
 *
 * Atributo multivalorado (círculo duplo no desenho) é construto válido do EER.
 * No modelo lógico relacional ele vira uma tabela separada; a regra apenas
 * informa isso, como orientação, e nunca bloqueia a exportação.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R005 = {
  id: 'R005',
  name: 'Atributo multivalorado vira tabela separada no modelo lógico',
  severity: 'info',
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
          message: `O atributo multivalorado '${a.name}' é válido no EER; no modelo lógico ele se tornará uma tabela separada.`
        });
      }
    });

    return violations;
  }
};
