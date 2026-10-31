/**
 * Summarises the V8 coverage collected by `E2E_COVERAGE=1 playwright test` for src/app.js.
 *
 * The coverage run serves the sources through the Vite dev server, so offsets refer to the
 * module exactly as the browser received it (import specifiers rewritten, no minification).
 * Reported numbers are V8 function coverage (a function counts once any test called it) and an
 * approximate line coverage (a non-blank, non-comment line counts when its first non-blank
 * character lies in a range V8 reports as executed). They are NOT comparable with the
 * statement/branch figures of the Vitest coverage run.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const rawDir = join(process.cwd(), 'coverage', 'e2e-raw');
const target = /\/src\/app\.js(\?|$)/;
let source = null;
const functionCovered = new Map();
let charCovered = null;

for (const file of readdirSync(rawDir).filter((f) => f.endsWith('.json'))) {
  for (const entry of JSON.parse(readFileSync(join(rawDir, file), 'utf8'))) {
    if (!target.test(entry.url)) continue;
    source ??= entry.source;
    if (entry.source !== source) throw new Error('src/app.js changed between tests');
    charCovered ??= new Uint8Array(source.length);
    const ranges = [];
    for (const fn of entry.functions) {
      const outer = fn.ranges[0];
      const key = `${fn.functionName}@${outer.startOffset}-${outer.endOffset}`;
      functionCovered.set(key, functionCovered.get(key) || outer.count > 0);
      ranges.push(...fn.ranges);
    }
    ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    const covered = new Uint8Array(source.length);
    for (const r of ranges) covered.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
    for (let i = 0; i < covered.length; i++) charCovered[i] |= covered[i];
  }
}
if (!source) throw new Error('no coverage entry for src/app.js; run with E2E_COVERAGE=1');

let offset = 0;
let lines = 0;
let coveredLines = 0;
let inBlockComment = false;
for (const line of source.split('\n')) {
  const trimmed = line.trim();
  const first = offset + line.search(/\S|$/);
  offset += line.length + 1;
  if (inBlockComment) {
    if (trimmed.includes('*/')) inBlockComment = false;
    continue;
  }
  if (!trimmed || trimmed.startsWith('//')) continue;
  if (trimmed.startsWith('/*')) {
    if (!trimmed.includes('*/')) inBlockComment = true;
    continue;
  }
  lines++;
  if (charCovered[first]) coveredLines++;
}
const functions = functionCovered.size;
const functionsCalled = [...functionCovered.values()].filter(Boolean).length;
const pct = (a, b) => Math.round((1000 * a) / b) / 10;
const summary = {
  file: 'src/app.js',
  measuredOn: 'Vite dev-server module, Chrome V8 coverage, all e2e tests merged',
  functions,
  functionsCalled,
  functionPercent: pct(functionsCalled, functions),
  codeLines: lines,
  codeLinesExecuted: coveredLines,
  linePercent: pct(coveredLines, lines),
};
mkdirSync(join(process.cwd(), 'coverage'), { recursive: true });
writeFileSync(join(process.cwd(), 'coverage', 'e2e-appjs-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
