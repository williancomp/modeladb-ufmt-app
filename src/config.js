/**
 * Single place for the project's public identity. Schema identifiers derive
 * from it; override at build time with VITE_MODELADB_BASE_URL (for example
 * after the repository is renamed or hosted elsewhere).
 */
export const BASE_URL = (
  import.meta.env?.VITE_MODELADB_BASE_URL || 'https://github.com/williancomp/modeladb-ufmt-app'
).replace(/\/+$/, '');

export const schemaId = (file) => `${BASE_URL}/schemas/${file}`;
