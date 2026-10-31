/** Autosave and file loading use the same versioned codec. */
import { parseDiagram, serializeDiagram } from './file.js';
const PRIMARY_KEY = 'modeladb:diagramData';
const LEGACY_KEY = 'diagramData';

export function saveToLocalStorage(data, storage = globalThis.localStorage) {
  try {
    const json = serializeDiagram(data);
    storage.setItem(PRIMARY_KEY, json);
    return storage.getItem(PRIMARY_KEY) === json;
  } catch { return false; }
}

export function loadFromLocalStorage(storage = globalThis.localStorage) {
  try {
    const json = storage.getItem(PRIMARY_KEY) || storage.getItem(LEGACY_KEY);
    return json ? parseDiagram(json) : null;
  } catch { return null; }
}

let timer;
export function scheduleLocalStorageSave(getData, onSaved, delay = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => onSaved(saveToLocalStorage(getData())), delay);
}
