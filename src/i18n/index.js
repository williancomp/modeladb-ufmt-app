/** Small dependency-free dictionary. Keys are the original Portuguese UI copy. */
import pt from './pt.json' with {type:'json'};
import en from './en.json' with {type:'json'};
export const dictionaries = {pt, en};
export const LANGUAGE_KEY = 'modeladb:language';
let language = 'pt';
const normalize = text => text.replace(/\s+/g, ' ').trim();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.keys(pt).filter(key => /__VAR\d+__/.test(key)).map(key => ({
  key,
  names: key.match(/__VAR\d+__/g),
  regex: new RegExp('^' + key.split(/__VAR\d+__/).map(part => escape(part).replace(/\s+/g, '\\s+')).join('([\\s\\S]*?)') + '$'),
}));

export function detectLanguage(stored, browserLanguage = 'en') {
  if (stored === 'pt' || stored === 'en') return stored;
  return browserLanguage.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}
export function getLanguage() { return language; }
export function getLocale() { return language === 'pt' ? 'pt-BR' : 'en-US'; }

/** Translate a UI message while preserving interpolated user content verbatim. */
export function t(text) {
  if (typeof text !== 'string' || language === 'pt') return text;
  const preserve = value => text.match(/^\s*/)[0] + value + text.match(/\s*$/)[0];
  const source = normalize(text);
  const dictionary = dictionaries[language];
  if (Object.hasOwn(dictionary, source)) return preserve(dictionary[source]);
  for (const {key, names, regex} of patterns) {
    const match = text.trim().match(regex);
    if (match) {
      let translated = dictionary[key];
      // A replacement callback preserves literal dollar signs in user names.
      names.forEach((name, index) => { translated = translated.replace(name, () => match[index + 1]); });
      return preserve(translated);
    }
  }
  return text;
}

export function setLanguage(next, storage) {
  language = next === 'pt' ? 'pt' : 'en';
  try { (storage || globalThis.localStorage)?.setItem(LANGUAGE_KEY, language); } catch { /* Storage can be disabled. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = getLocale();
}

/** Localize static HTML and dynamically inserted menu/tutorial text, never inputs or generated code. */
export function initI18n() {
  let stored;
  try { stored = localStorage.getItem(LANGUAGE_KEY); } catch { /* Use browser preference. */ }
  setLanguage(detectLanguage(stored, navigator.language));
  const sources = new WeakMap();
  const excluded = 'script, style, textarea, pre, code, [data-user-content]';
  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(excluded)) return;
      const previous = sources.get(node);
      const source = previous?.rendered === node.textContent ? previous.source : node.textContent;
      const rendered = t(source);
      sources.set(node, {source, rendered});
      if (node.textContent !== rendered) node.textContent = rendered;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const attributes = sources.get(node) || {};
      for (const key of ['title', 'aria-label', 'placeholder', 'alt']) {
        const value = node.getAttribute(key);
        if (value === null) continue;
        const source = attributes[key]?.rendered === value ? attributes[key].source : value;
        const rendered = t(source);
        attributes[key] = {source, rendered};
        if (value !== rendered) node.setAttribute(key, rendered);
      }
      sources.set(node, attributes);
      if (node.matches(excluded)) return;
      node.childNodes.forEach(translateNode);
    }
  }
  translateNode(document.documentElement);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(translateNode);
      else translateNode(record.target);
    }
  });
  observer.observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['title','aria-label','placeholder','alt']});
  return {refresh: () => translateNode(document.documentElement), disconnect: () => observer.disconnect()};
}
