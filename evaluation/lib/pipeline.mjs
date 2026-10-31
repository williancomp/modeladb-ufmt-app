/** Loads a corpus fixture through the production code paths (codec -> IR -> exporter). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiagram } from '../../src/persistence/file.js';
import { toCanonicalIR } from '../../src/persistence/canonicalIR.js';
import { exportCode } from '../../src/export/index.js';
import { validateModel } from '../../src/validation/engine.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CORPUS_DIR = join(ROOT, 'evaluation', 'corpus');
export const manifest = JSON.parse(readFileSync(join(CORPUS_DIR, 'manifest.json'), 'utf8'));

export const loadModel = (file) => parseDiagram(readFileSync(join(CORPUS_DIR, file), 'utf8'));
export const toIR = (model) => toCanonicalIR(model);
export const generate = (ir, target) => exportCode(ir, target);
export const validate = (model, notation = 'chen') => validateModel(model, notation);
