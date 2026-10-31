/** Ativação explícita no build; a versão pública não coleta identificação nem eventos. */
export function researchMode() {
  return import.meta.env?.VITE_RESEARCH_MODE === 'true';
}
