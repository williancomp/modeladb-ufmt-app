import { t } from '../i18n/index.js';
/** .merdb codec: every read detects/migrates; every write emits documented v2. */
import { autoMigrate, flattenV2ToV1, packToV2 } from './migration.js';

export function parseDiagram(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const migrated = autoMigrate(data);
  for (const key of ['entities', 'attributes', 'relationships', 'specializations', 'aggregations', 'postits']) {
    if (!Array.isArray(migrated.domain[key])) throw new Error(t('Formato de arquivo inválido'));
    for (const element of migrated.domain[key]) {
      if (!element || !Number.isSafeInteger(element.id) || element.id < 0) throw new Error(t('Formato de arquivo inválido'));
      if (element.connections !== undefined && !Array.isArray(element.connections)) throw new Error(t('Formato de arquivo inválido'));
    }
  }
  return flattenV2ToV1(migrated);
}

export function serializeDiagram(data) {
  return JSON.stringify(packToV2(data), null, 2);
}

export function saveDiagramToFile(data, filename) {
  const blob = new Blob([serializeDiagram(data)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function openFileSelector() {
  document.getElementById('fileInput')?.click();
}

export async function loadDiagramFromFile(file, onLoaded, onError) {
  try { onLoaded(parseDiagram(await file.text())); }
  catch (error) { if (onError) onError(error); }
}
