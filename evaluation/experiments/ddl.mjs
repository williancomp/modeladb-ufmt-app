/**
 * Experiment 1a - generated DDL executed on real database engines and compared with hand-written
 * oracles (structure) and with data-level tests (key / foreign-key behaviour).
 * Also runs a harness self-test: faults injected into the DDL must be detected by the checks.
 */
import { manifest, loadModel, toIR, generate } from '../lib/pipeline.mjs';
import { oracles } from '../oracles/oracles.mjs';
import { openDialect, runStatements, DIALECTS } from '../lib/db.mjs';
import { checkStructure } from '../lib/check.mjs';
import { runBehaviour } from '../lib/behaviour.mjs';
import { writeTable, writeLog } from '../lib/report.mjs';

async function evaluate(adapter, dialect, id, ddl) {
  const db = await adapter.fresh();
  try {
    const run = await runStatements(db, ddl);
    const catalog = await db.introspect();
    const { assertions, resolved } = checkStructure(oracles[id], catalog, dialect);
    let behaviour;
    try {
      behaviour = await runBehaviour({ db, adapter, catalog, oracle: oracles[id], resolved, dialect });
    } catch (error) {
      // A schema so broken that the data tests cannot even run is itself a failed check.
      behaviour = [{ id: 'B:data-tests-run', pass: false, detail: String(error.message).split('\n')[0] }];
    }
    return { run, catalog, assertions, behaviour };
  } finally {
    await db.close();
  }
}

const count = (items) => ({
  pass: items.filter((i) => i.pass === true).length,
  total: items.filter((i) => i.pass !== null).length,
});

/** Textual faults. Each returns the mutated DDL; equivalent mutants (same catalog) are discarded later. */
const FAULTS = {
  'drop-not-null': (ddl) => ddl.replace(/ NOT NULL/g, ''),
  'drop-foreign-keys': (ddl) =>
    ddl
      .replace(/^ALTER TABLE .* ADD FOREIGN KEY .*;\n?/gm, '')
      .replace(/,\n {2}FOREIGN KEY [^\n]*/g, ''),
  'drop-primary-keys': (ddl) =>
    ddl.replace(/,\n {2}PRIMARY KEY \([^)]*\)/g, '').replace(/\n {2}PRIMARY KEY \([^)]*\),/g, ''),
  'drop-unique': (ddl) => ddl.replace(/,\n {2}UNIQUE \([^)]*\)/g, '').replace(/ UNIQUE/g, ''),
  'widen-types-to-text': (ddl) => ddl.replace(/\bINTEGER\b/g, 'VARCHAR(255)'),
};

export async function runDdlExperiment({ config, log }) {
  const rows = [];
  const failures = [];
  const detail = [];
  const selfTest = [];
  for (const dialect of DIALECTS) {
    const adapter = await openDialect(dialect, config);
    log(`ddl: ${dialect}`);
    for (const m of manifest.models) {
      const ddl = generate(toIR(loadModel(m.file)), dialect);
      const result = await evaluate(adapter, dialect, m.id, ddl);
      const s = count(result.assertions);
      const b = count(result.behaviour);
      rows.push({
        model: m.id,
        dialect,
        ddl_executed: result.run.errors.length === 0 ? 'yes' : `no (${result.run.errors.length} errors)`,
        structure: `${s.pass}/${s.total}`,
        behaviour: `${b.pass}/${b.total}`,
        verdict: result.run.errors.length === 0 && s.pass === s.total && b.pass === b.total ? 'pass' : 'FAIL',
      });
      for (const e of result.run.errors) failures.push(`${dialect} ${m.id} DDL: ${e.message.split('\n')[0]} | ${e.statement.slice(0, 80)}`);
      for (const a of [...result.assertions, ...result.behaviour]) {
        if (a.pass === false) failures.push(`${dialect} ${m.id} ${a.id}: ${a.detail}`);
        detail.push(`${dialect}\t${m.id}\t${a.id}\t${a.pass === null ? 'n/a' : a.pass ? 'pass' : 'FAIL'}${a.pass === false ? `\t${a.detail}` : ''}`);
      }
      // Harness self-test: inject each fault and require that the checks notice (non-equivalent mutants only).
      for (const [fault, mutate] of Object.entries(FAULTS)) {
        const mutated = mutate(ddl);
        if (mutated === ddl) continue;
        const base = await evaluate(adapter, dialect, m.id, ddl);
        const faulty = await evaluate(adapter, dialect, m.id, mutated);
        const equivalent = JSON.stringify(base.catalog) === JSON.stringify(faulty.catalog);
        const detected =
          faulty.run.errors.length > 0 ||
          faulty.assertions.some((a) => a.pass === false) ||
          faulty.behaviour.some((a) => a.pass === false);
        selfTest.push({ dialect, model: m.id, fault, equivalent, detected });
      }
    }
    await adapter.closeAll();
  }
  writeTable('ddl_conformance', rows, [
    { key: 'model', header: 'Model' },
    { key: 'dialect', header: 'Dialect' },
    { key: 'ddl_executed', header: 'DDL executed' },
    { key: 'structure', header: 'Structure', align: 'r' },
    { key: 'behaviour', header: 'Behaviour', align: 'r' },
    { key: 'verdict', header: 'Verdict' },
  ]);
  const summary = DIALECTS.map((dialect) => {
    const own = rows.filter((r) => r.dialect === dialect);
    return {
      dialect,
      models: own.length,
      passed: own.filter((r) => r.verdict === 'pass').length,
      failed: own.filter((r) => r.verdict !== 'pass').length,
    };
  });
  writeTable('ddl_conformance_summary', summary, [
    { key: 'dialect', header: 'Dialect' },
    { key: 'models', header: 'Models', align: 'r' },
    { key: 'passed', header: 'Passed', align: 'r' },
    { key: 'failed', header: 'Failed', align: 'r' },
  ]);
  const faultRows = Object.keys(FAULTS).map((fault) => {
    const own = selfTest.filter((s) => s.fault === fault && !s.equivalent);
    return {
      fault,
      non_equivalent_cases: own.length,
      detected: own.filter((s) => s.detected).length,
      equivalent_discarded: selfTest.filter((s) => s.fault === fault && s.equivalent).length,
    };
  });
  writeTable('harness_sensitivity', faultRows, [
    { key: 'fault', header: 'Injected fault' },
    { key: 'non_equivalent_cases', header: 'Cases', align: 'r' },
    { key: 'detected', header: 'Detected', align: 'r' },
    { key: 'equivalent_discarded', header: 'Equivalent (discarded)', align: 'r' },
  ]);
  writeLog('ddl_assertions.tsv', ['dialect\tmodel\tassertion\tresult\tdetail', ...detail].join('\n'));
  writeLog('ddl_failures.txt', failures.length ? failures.join('\n') : '(no failures)');
  writeLog('harness_sensitivity_cases.tsv', ['dialect\tmodel\tfault\tequivalent\tdetected', ...selfTest.map((s) => `${s.dialect}\t${s.model}\t${s.fault}\t${s.equivalent}\t${s.detected}`)].join('\n'));
  return { rows, summary, faultRows, failures };
}
