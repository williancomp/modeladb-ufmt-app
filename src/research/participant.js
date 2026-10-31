import { researchMode } from './config.js';
/**
 * Identificação do participante.
 *
 * O nome é pedido uma única vez por sessão e reaproveitado em todas as
 * exportações seguintes. Fica em sessionStorage, não em localStorage: sobrevive
 * a recarregar a página e a queda de internet (mesma aba), mas não vaza para o
 * próximo aluno que abrir o navegador num laboratório compartilhado.
 */

const STORAGE_KEY = 'modeladb.participant.name';

/** @returns {string} nome já informado nesta sessão, ou '' */
export function getParticipantName() {
  if (!researchMode()) return '';
  try {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setParticipantName(name) {
  try {
    sessionStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* modo privado */
  }
}

/**
 * Converte o nome em algo seguro para nome de arquivo, preservando a
 * legibilidade: remove acentos, troca espaços por hífen e corta o excesso.
 * O nome original é gravado dentro do .merdb sem alteração.
 */
export function slugifyName(name) {
  return (
    (name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // marcas de acentuação
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'sem-nome'
  );
}

/**
 * Garante que há um nome informado, abrindo o modal se necessário.
 * @returns {Promise<string|null>} o nome, ou null se o aluno cancelou
 */
export function ensureParticipantName() {
  if (!researchMode()) return Promise.resolve('');
  const existing = getParticipantName();
  if (existing) return Promise.resolve(existing);

  const modal = document.getElementById('participantModal');
  const input = document.getElementById('participantInput');
  const confirmBtn = document.getElementById('participantConfirm');
  const cancelBtn = document.getElementById('participantCancel');
  const error = document.getElementById('participantError');

  // Sem o modal no HTML, não bloqueia a exportação
  if (!modal || !input || !confirmBtn) return Promise.resolve('');

  return new Promise((resolve) => {
    const close = () => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    };

    const onConfirm = () => {
      const value = input.value.trim().replace(/\s+/g, ' ');
      if (value.length < 3) {
        if (error) error.classList.remove('hidden');
        input.focus();
        return;
      }
      setParticipantName(value);
      close();
      resolve(value);
    };

    const onCancel = () => {
      close();
      resolve(null);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (error) error.classList.add('hidden');
    };

    confirmBtn.addEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);

    if (error) error.classList.add('hidden');
    input.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
  });
}
