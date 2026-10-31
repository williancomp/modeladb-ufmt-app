import { researchMode } from './config.js';
/**
 * Log de processo — instrumentação de pesquisa.
 *
 * Registra o que aconteceu DURANTE a construção do modelo, não apenas o
 * resultado final. Sem isso, um aluno que cometeu um erro, foi avisado e
 * corrigiu produz um artefato idêntico ao de um aluno que nunca cometeu o erro
 * — dois eventos de aprendizagem opostos colapsados no mesmo dado.
 *
 * O log é anexado ao arquivo .merdb sob a chave `processLog`. O PNG não carrega
 * nada. A coleta é declarada no termo de consentimento do estudo.
 *
 * Tipos de evento:
 *   session_start      abertura da sessão (versão, notação, viewport)
 *   object_created     objeto adicionado ao modelo
 *   object_renamed     renomeação, com marcação de saída de nome padrão
 *   violation_opened   uma violação passou a ser exibida
 *   violation_closed   uma violação deixou de ser exibida (corrigida)
 *   panel_item_click   o aluno clicou num item do painel de problemas
 *   panel_toggle       o aluno recolheu/expandiu o painel
 *   notation_changed   troca de notação (não deve ocorrer no estudo)
 *   export             exportação, com as violações presentes naquele instante
 */

// Teto de segurança: o log acompanha o .merdb e não pode crescer sem limite.
const MAX_EVENTS = 5000;

let events = [];
let truncated = 0;
let startedAt = null;

/** Milissegundos desde a abertura da sessão — âncora temporal relativa. */
function elapsed() {
  return startedAt === null ? 0 : Date.now() - startedAt;
}

/**
 * Registra um evento.
 * @param {string} type - um dos tipos documentados acima
 * @param {Object} [data] - campos específicos do evento
 */
export function logEvent(type, data = {}) {
  if (!researchMode()) return;
  if (startedAt === null) startedAt = Date.now();
  if (events.length >= MAX_EVENTS) {
    truncated++;
    return;
  }
  events.push({ t: elapsed(), type, ...data });
}

/** Marca o início da sessão e registra o contexto de execução. */
export function startSession(context = {}) {
  if (!researchMode()) {
    resetLog();
    return;
  }
  startedAt = Date.now();
  events = [];
  truncated = 0;
  events.push({
    t: 0,
    type: 'session_start',
    startedAtISO: new Date(startedAt).toISOString(),
    ...context,
  });
}

/**
 * Serializa o log para gravação no .merdb.
 * @returns {Object} bloco pronto para virar a chave `processLog`
 */
export function exportLog() {
  return {
    schema: 1,
    startedAtISO: startedAt === null ? null : new Date(startedAt).toISOString(),
    durationMs: elapsed(),
    eventCount: events.length,
    truncatedCount: truncated,
    events: events.slice(),
  };
}

/** Somente para testes. */
export function resetLog() {
  events = [];
  truncated = 0;
  startedAt = null;
}

/**
 * Compara o conjunto de violações do quadro anterior com o atual e emite
 * violation_opened / violation_closed para as diferenças.
 *
 * Chamada a cada quadro, então precisa ser barata: opera sobre Sets de chaves.
 *
 * @param {Set<string>} previousKeys - chaves do quadro anterior (é mutado)
 * @param {Array} violations - violações do quadro atual
 * @returns {Set<string>} as chaves do quadro atual
 */
export function diffViolations(previousKeys, violations) {
  const currentKeys = new Set();
  const byKey = new Map();

  for (const v of violations) {
    // O tipo entra na chave porque os contadores de id são independentes por
    // tipo: a entidade 0 e o atributo 0 coexistem. Sem o tipo, o par
    // regra+elemento não identifica o alvo de forma única.
    const key = `${v.ruleId}|${v.elementType}|${v.elementId}`;
    currentKeys.add(key);
    byKey.set(key, v);
  }

  for (const key of currentKeys) {
    if (!previousKeys.has(key)) {
      const v = byKey.get(key);
      logEvent('violation_opened', {
        rule: v.ruleId,
        element: v.elementId,
        elementType: v.elementType,
        severity: v.severity,
      });
    }
  }

  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      const [rule, elementType, element] = key.split('|');
      logEvent('violation_closed', { rule, elementType, element });
    }
  }

  return currentKeys;
}

/**
 * Fotografia das violações presentes num instante — usada no evento de
 * exportação. É este registro que permite, na análise, separar os erros que a
 * ferramenta estava sinalizando dos que ela não cobre.
 */
export function snapshotViolations(violations) {
  return violations.map((v) => ({
    rule: v.ruleId,
    element: v.elementId,
    elementType: v.elementType,
    severity: v.severity,
  }));
}
