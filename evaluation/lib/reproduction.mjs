/**
 * Reproduction check: compares the results of a fresh run with the results that were committed before it.
 * Timings are the only non-deterministic output and are ignored; everything else is compared byte for byte.
 * The outcome is written to results/reproduction_check.csv, one row per file, so it states exactly what matched.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import os from 'node:os';

/** Files whose content is a timing or a machine description, not a result. */
const TIMING = /^(performance\.(csv|tex)|logs\/performance_machine\.json)$/;
/** Fields of environment.json that describe the machine that ran the evaluation, not the evaluated tool. */
const MACHINE_FIELDS = ['node', 'platform'];

export function snapshotResults(dir) {
  if (!existsSync(dir)) return null;
  const copy = mkdtempSync(join(os.tmpdir(), 'modeladb-results-'));
  cpSync(dir, copy, { recursive: true });
  return copy;
}

/** Scratch directories of the target checkers (package caches), not results. */
const SCRATCH = new Set(['.tmp']);

const walk = (dir, base = dir) =>
  readdirSync(dir).filter((name) => !SCRATCH.has(name)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, base) : [relative(base, path)];
  });

const comparable = (rel, text) => {
  if (rel !== 'environment.json') return text;
  const data = JSON.parse(text);
  for (const field of MACHINE_FIELDS) delete data[field];
  return JSON.stringify(data, null, 2);
};

function firstDifference(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}: committed "${(x[i] ?? '').slice(0, 80)}" vs fresh "${(y[i] ?? '').slice(0, 80)}"`;
  }
  return '';
}

export function compareResults(committedDir, freshDir) {
  const rows = [];
  const files = [...new Set([...walk(committedDir), ...walk(freshDir)])].sort();
  for (const rel of files) {
    if (rel === 'reproduction_check.csv') continue;
    const old = join(committedDir, rel);
    const now = join(freshDir, rel);
    if (TIMING.test(rel)) {
      rows.push({ file: rel, status: 'ignored', detail: 'timing or machine description; not compared' });
    } else if (!existsSync(old)) {
      rows.push({ file: rel, status: 'new', detail: 'not in the committed results' });
    } else if (!existsSync(now)) {
      rows.push({ file: rel, status: 'missing', detail: 'committed but not produced by the fresh run' });
    } else {
      const a = comparable(rel, readFileSync(old, 'utf8'));
      const b = comparable(rel, readFileSync(now, 'utf8'));
      const note = rel === 'environment.json' ? `compared without ${MACHINE_FIELDS.join(', ')}` : 'compared byte for byte';
      rows.push(a === b ? { file: rel, status: 'identical', detail: note } : { file: rel, status: 'differs', detail: `${note}; ${firstDifference(a, b)}` });
    }
  }
  return rows;
}

export function writeReproductionCheck(rows, resultsDir) {
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  const count = (status) => rows.filter((r) => r.status === status).length;
  const summary = `# ${rows.length} files: ${count('identical')} identical, ${count('differs')} differ, ${count('new')} new, ${count('missing')} missing, ${count('ignored')} ignored (timings)`;
  const body = [summary, 'file,status,detail', ...rows.map((r) => [r.file, r.status, r.detail].map(cell).join(','))].join('\n');
  writeFileSync(join(resultsDir, 'reproduction_check.csv'), `${body}\n`);
  return summary.slice(2);
}
