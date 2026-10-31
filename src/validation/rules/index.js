/**
 * Índice central de regras de validação do ModelaDB.
 *
 * ModelaDB foca exclusivamente em modelagem conceitual de banco de dados.
 * As regras estão organizadas por escopo de aplicação:
 *
 *   common/    — regras do modelo conceitual EER/ER, aplicáveis a qualquer notação
 *   chen/      — regras específicas da notação EER estilo Chen
 *   crowsfoot/ — regras específicas da notação Crow's Foot (Information Engineering)
 *   uml/       — pasta mantida como placeholder (UML excluído por ser orientado a objetos
 *                e não uma notação conceitual de BD)
 *
 * Para adicionar uma nova regra:
 *   1. Crie o arquivo na pasta da notação correspondente
 *   2. Exporte-o no index.js da pasta
 *   3. Registre-o aqui
 */
import { R001, R002, R003, R004, R005, R006, R007, R008, R009, R010 } from './common/index.js';
import { R011 } from './common/R011_duplicate_entity_name.js';
import { R012 } from './common/R012_dependent_participation.js';
import { C001 } from './chen/index.js';
import { CF001 } from './crowsfoot/index.js';

const commonRules = [R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012];
const chenRules = [C001];
const crowsfootRules = [CF001];

/**
 * Retorna o conjunto de regras aplicáveis à notação conceitual informada.
 * @param {'chen'|'crow'} notation
 * @returns {Array} lista de objetos de regra
 */
export function getRulesForNotation(notation) {
  const notationSpecific = {
    chen: chenRules,
    crow: crowsfootRules,
  };
  return [...commonRules, ...(notationSpecific[notation] || [])];
}

// Compatibilidade retroativa — exporta todas as regras comuns como lista padrão
export const rules = commonRules;
