#!/usr/bin/env node
/**
 * One-command evaluation: `npm run evaluate`. Starts the pinned database containers (or uses
 * EVAL_<ENGINE>_PORT servers), runs every experiment and writes CSV + LaTeX tables, raw logs and
 * environment.json to evaluation/results/. Everything except timings is deterministic.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { RESULTS_DIR, writeLog } from './lib/report.mjs';
import { startServers, serverVersions, lock } from './lib/docker.mjs';
import { runDdlExperiment } from './experiments/ddl.mjs';
import { runMutationExperiment } from './experiments/mutation.mjs';
import { runPerformanceExperiment } from './experiments/performance.mjs';
import { runRoundTripExperiment } from './experiments/roundtrip.mjs';
import { runTargetsExperiment } from './experiments/targets.mjs';
import { snapshotResults, compareResults, writeReproductionCheck } from './lib/reproduction.mjs';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const wants = (name) => only.length === 0 || only.includes(name);
const lines = [];
const log = (text) => {
  console.log(text);
  // Container ports and timings differ between runs; keep them out of the committed log.
  if (!/^performance:/.test(text)) lines.push(text);
};

// A full run starts from an empty results directory; a partial run keeps the other experiments' files.
// The committed results are kept aside so the fresh run can be compared with them at the end.
const committed = only.length === 0 ? snapshotResults(RESULTS_DIR) : null;
if (only.length === 0) rmSync(RESULTS_DIR, { recursive: true, force: true });
mkdirSync(RESULTS_DIR, { recursive: true });
const servers = await startServers(['postgres', 'mysql', 'mariadb'], log);
try {
  const versions = await serverVersions(servers.config);
  writeFileSync(
    join(RESULTS_DIR, 'environment.json'),
    `${JSON.stringify(
      {
        note: 'Versions of the tools that produced these results. Timings are the only non-deterministic output.',
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        databases: versions,
        images: Object.fromEntries(Object.entries(lock.images).map(([k, v]) => [k, v.ref])),
      },
      null,
      2,
    )}\n`,
  );
  log(`databases: ${JSON.stringify(versions)}`);
  const outcome = {};
  if (wants('ddl')) outcome.ddl = await runDdlExperiment({ config: servers.config, log });
  if (wants('targets')) outcome.targets = await runTargetsExperiment({ log });
  if (wants('roundtrip')) outcome.roundtrip = await runRoundTripExperiment({ config: servers.config, log });
  if (wants('performance')) outcome.performance = await runPerformanceExperiment({ log });
  if (wants('mutation')) outcome.mutation = runMutationExperiment({ log });
  writeLog('run.log', lines.join('\n'));
  if (committed) {
    const verdict = writeReproductionCheck(compareResults(committed, RESULTS_DIR), RESULTS_DIR);
    console.log(`reproduction check: ${verdict} (results/reproduction_check.csv)`);
  }
  const failed = outcome.ddl?.summary.reduce((n, s) => n + s.failed, 0) ?? 0;
  log(`done. DDL conformance failures: ${failed} (failures are results; see results/logs/ddl_failures.txt)`);
} finally {
  servers.stop();
}
