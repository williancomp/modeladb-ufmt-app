import { t } from '../i18n/index.js';
/** Transient autosave/status indicator used by the editor. */
export function showNotification(message, type = "info") {
  const indicator = document.getElementById("autosave-indicator");
  if (!indicator) return;

  // Configura a cor baseada no tipo
  indicator.classList.remove("text-green-400", "text-red-500", "text-blue-400");

  if (type === "success") {
    indicator.classList.add("text-green-400");
  } else if (type === "error") {
    indicator.classList.add("text-red-500");
  } else {
    indicator.classList.add("text-blue-400");
  }

  // Define a mensagem e mostra
  indicator.textContent = t(message);
  indicator.classList.remove("opacity-0");
  indicator.classList.add("opacity-100");

  // Esconde após 3 segundos
  setTimeout(() => {
    indicator.classList.remove("opacity-100");
    indicator.classList.add("opacity-0");
  }, 3000);
}
