/**
 * R010 — Atributo com nome padrão ou ausente
 *
 * Atributos criados pela ferramenta recebem rótulos provisórios conforme o tipo
 * escolhido no menu ("Atributo", "NovoAtributo", "Deriv.", "Multival.",
 * "Subatributo", "ID"). Manter o rótulo provisório esvazia a semântica do
 * atributo e propaga nomes sem significado para o esquema lógico.
 *
 * O caso 'ID' recebe mensagem própria: não é um nome errado em si, mas é o
 * rótulo sugerido pela ferramenta ao criar uma chave primária e costuma
 * permanecer sem revisão. Em modelagem conceitual, o identificador deve
 * nomear o que de fato identifica a entidade no minimundo.
 *
 * Complementa R007 (relacionamento) e R009 (entidade), aplicando o mesmo
 * critério de nomeação significativa ao construto atributo.
 *
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R010 = {
  id: 'R010',
  name: 'Atributo com nome padrão',
  severity: 'warning',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const { attributes = [] } = model;

    // Rótulos provisórios gerados pela ferramenta + genéricos equivalentes
    const defaultNames = new Set([
      'simples', 'simple', 'new attribute', 'newattribute', 'subattribute', 'derived', 'multivalued', 'derived attribute', 'multivalued attribute',
      '', 'atributo', 'novoatributo', 'novo atributo', 'subatributo',
      'sub atributo', 'deriv.', 'deriv', 'derivado', 'multival.', 'multival',
      'multivalorado', 'attribute', 'campo', 'coluna', 'column', 'field',
    ]);

    // Rótulo sugerido para chave primária — tratado à parte
    const defaultKeyNames = new Set(['id', 'chave', 'key', 'codigo', 'código']);

    attributes.forEach(a => {
      const raw = a.name || '';
      const name = raw.trim().toLowerCase();

      if (defaultNames.has(name)) {
        violations.push({
          elementId: a.id,
          elementType: 'attribute',
          message: `O atributo ainda está com o nome padrão '${raw || '(vazio)'}'. Renomeie com a propriedade que ele representa no minimundo (ex: 'nome', 'dataNascimento', 'placa').`
        });
      } else if (defaultKeyNames.has(name)) {
        violations.push({
          elementId: a.id,
          elementType: 'attribute',
          message: `O atributo '${raw}' usa o rótulo genérico sugerido pela ferramenta. Em modelagem conceitual o identificador deve nomear o que identifica a entidade no minimundo (ex: 'CPF', 'matrícula', 'placa') ou ser qualificado (ex: 'idCliente').`
        });
      }
    });

    return violations;
  }
};
