import { t } from '../i18n/index.js';
import { getRulesForNotation } from './rules/index.js';

/**
 * Valida o modelo contra as regras aplicáveis à notação corrente.
 *
 * @param {Object} model - estado atual do diagrama (entidades, atributos, etc.)
 * @param {'chen'|'crow'} notation - notação conceitual ativa (Chen 1976 ou Crow's Foot IE)
 * @returns {Array} lista de violações encontradas
 */
export function validateModel(model, notation = 'chen') {
  const violations = [];
  const rules = getRulesForNotation(notation);

  for (const rule of rules) {
    const result = rule.check(model);
    if (result && result.length > 0) {
      result.forEach(r => {
        violations.push({
          ruleId: rule.id,
          name: t(rule.name),
          severity: rule.severity,
          notation: rule.notation,
          literature: rule.literature,
          elementId: r.elementId,
          elementType: r.elementType,
          message: t(r.message)
        });
      });
    }
  }

  return violations;
}
