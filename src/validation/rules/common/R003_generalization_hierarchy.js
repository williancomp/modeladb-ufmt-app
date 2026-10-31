/**
 * R003 — Hierarquia de generalização incompleta
 *
 * Uma hierarquia de generalização/especialização (EER) deve ter:
 *   - Exatamente 1 supertipo (conectado ao vértice superior — vertex 0)
 *   - Pelo menos 1 subtipo (conectado aos vértices inferiores — vertex 1, 2…)
 *
 * Categorias (union types, genType='U') seguem convenção inversa:
 *   - Múltiplos supertipos (as entidades que formam a união)
 *   - Exatamente 1 subtipo (a entidade que representa o subconjunto da união)
 *
 * Chen (1976) não tem generalização nem categoria (nenhuma construção de subtipo no texto).
 * Fonte: nenhuma. Diretriz de modelagem desta ferramenta, sem atribuição a autor ou obra.
 */
export const R003 = {
  id: 'R003',
  name: 'Hierarquia de generalização incompleta',
  severity: 'error',
  notation: 'common',
  literature: 'Diretriz de modelagem da ferramenta (sem atribuição a fonte)',
  check: (model) => {
    const violations = [];
    const { specializations = [] } = model;

    specializations.forEach((s) => {
      if (!s.connections || s.connections.length === 0) return;

      // vertex === 0 is the apex (supertype); support legacy isGeneralization field
      const isSuperConn = (c) =>
        c.vertex === 0 || (c.vertex === undefined && c.isGeneralization === true);
      const superClasses = s.connections.filter(isSuperConn);
      const subClasses = s.connections.filter((c) => !isSuperConn(c));

      if (s.genType === 'U') {
        // Categoria (União): múltiplos supertipos → 1 subtipo (a entidade-união)
        // O vértice superior (vertex 0) recebe o subtipo; os demais recebem os supertipos
        const unionSubtype = s.connections.filter(isSuperConn);
        const unionSupertypes = s.connections.filter((c) => !isSuperConn(c));
        if (unionSubtype.length !== 1 || unionSupertypes.length < 2) {
          violations.push({
            elementId: s.id,
            elementType: 'specialization',
            message: `A Categoria (União) deve ter pelo menos 2 superclasses e 1 subclasse — o vértice superior recebe a entidade-resultado da união.`,
          });
        }
      } else {
        if (superClasses.length !== 1) {
          violations.push({
            elementId: s.id,
            elementType: 'specialization',
            message: `A hierarquia de generalização deve estar conectada a uma entidade genérica (supertipo) no vértice superior do triângulo.`,
          });
        }
        if (subClasses.length < 1) {
          violations.push({
            elementId: s.id,
            elementType: 'specialization',
            message: `A hierarquia de generalização deve ter pelo menos 1 entidade especializada (subtipo) nos vértices inferiores do triângulo.`,
          });
        }
      }
    });

    return violations;
  },
};
