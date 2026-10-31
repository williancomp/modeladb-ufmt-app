/**
 * Experiment 1b - ORM and schema exporters checked by the strongest available tool, run inside
 * pinned containers. Each result is labelled with the kind of check actually performed:
 *   semantic  - the tool's own validator or a real migration run accepted / rejected the output
 *   syntactic - the output only parsed
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { manifest, loadModel, toIR, generate } from '../lib/pipeline.mjs';
import { oracles } from '../oracles/oracles.mjs';
import { runIn } from '../lib/docker.mjs';
import { writeTable, writeLog, RESULTS_DIR } from '../lib/report.mjs';

const TMP = join(RESULTS_DIR, '.tmp');
const PRISMA = '6.19.0';
const DJANGO = '5.2.7';
const ILLUMINATE = '11.46.1';
const GRAPHQL = '16.11.0';
const AJV = '8.17.1';

const models = manifest.models;
const dirOf = (tool, id) => join(TMP, tool, id);
const firstLine = (text) => String(text || '').split('\n').find((l) => l.trim()) || '';

function stage(tool, extension, target) {
  rmSync(join(TMP, tool), { recursive: true, force: true });
  for (const m of models) {
    const dir = dirOf(tool, m.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `input.${extension}`), generate(toIR(loadModel(m.file)), target));
  }
}

/** Parses lines `RESULT\t<model>\t<ok|fail>\t<message>` printed by a container script. */
function parse(stdout) {
  const out = {};
  for (const line of stdout.split('\n')) {
    const [tag, id, status, ...rest] = line.split('\t');
    if (tag === 'RESULT') out[id] = { ok: status === 'ok', message: rest.join(' ').trim() };
  }
  return out;
}

function runTool({ tool, image, setup, perModel, env, label, kind, extra }) {
  const ids = models.map((m) => m.id).join(' ');
  const script = `set -u\ncd /work\n${setup}\nfor id in ${ids}; do\n  out=$( (cd /work/$id && ${perModel}) 2>&1 ); code=$?\n  if [ $code -eq 0 ]; then echo "RESULT\t$id\tok\t$(echo "$out" | head -n 1 | tr '\\t' ' ')"; else echo "RESULT\t$id\tfail\t$(echo "$out" | grep -v '^\\s*$' | grep -v 'prisma:warn' | grep -i -m 3 -e 'error' -e 'warning' -e 'fail' -e 'Traceback' | tr '\\n\\t' '  ')"; fi\n  echo "$out" > /work/$id/tool-output.txt\ndone\n`;
  writeFileSync(join(TMP, tool, 'run.sh'), script);
  const result = runIn(image, 'sh /work/run.sh', { mounts: [[join(TMP, tool), '/work', 'rw'], ...(extra || [])], env, workdir: '/work' });
  const raw = `$ ${result.command}\n--- exit ${result.status}\n${result.stdout}\n--- stderr\n${result.stderr}`;
  writeLog(`targets_${tool}.log`, raw);
  for (const extraFile of ['pip-list.txt', 'package.json', 'package-lock.json']) {
    try {
      writeLog(`targets_${tool}_${extraFile}`, readFileSync(join(TMP, tool, extraFile), 'utf8'));
    } catch {
      /* not produced by this tool */
    }
  }
  const parsed = parse(result.stdout || '');
  return models.map((m) => ({
    target: label,
    model: m.id,
    check: kind,
    result: parsed[m.id] ? (parsed[m.id].ok ? 'pass' : 'FAIL') : 'FAIL',
    message: parsed[m.id] ? (parsed[m.id].ok ? parsed[m.id].message : parsed[m.id].message) : `tool did not run: ${firstLine(result.stderr).slice(0, 160)}`,
  }));
}

function prisma() {
  stage('prisma', 'prisma', 'prisma');
  for (const m of models) writeFileSync(join(dirOf('prisma', m.id), 'schema.prisma'), readFileSync(join(dirOf('prisma', m.id), 'input.prisma')));
  return runTool({
    tool: 'prisma',
    image: 'node',
    label: `Prisma ${PRISMA}`,
    kind: 'semantic (prisma validate)',
    env: { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', npm_config_update_notifier: 'false', npm_config_cache: '/work/.npm' },
    setup: `(apt-get update -qq && apt-get install -y -qq openssl) >/dev/null 2>&1; npm init -y >/dev/null 2>&1 && npm install --silent --no-audit --no-fund prisma@${PRISMA} >/dev/null 2>&1 || { echo "RESULT\tsetup\tfail\tnpm install failed"; }`,
    perModel: `/work/node_modules/.bin/prisma validate --schema schema.prisma`,
  });
}

function django() {
  stage('django', 'py', 'django');
  for (const m of models) {
    const dir = dirOf('django', m.id);
    mkdirSync(join(dir, 'app'), { recursive: true });
    writeFileSync(join(dir, 'app', '__init__.py'), '');
    writeFileSync(join(dir, 'app', 'models.py'), readFileSync(join(dir, 'input.py')));
    writeFileSync(join(dir, 'settings.py'), `SECRET_KEY = 'x'\nINSTALLED_APPS = ['app']\nDATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}\nDEFAULT_AUTO_FIELD = 'django.db.models.AutoField'\n`);
  }
  return runTool({
    tool: 'django',
    image: 'python',
    label: `Django ${DJANGO}`,
    kind: 'semantic (manage check + makemigrations)',
    env: { PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONDONTWRITEBYTECODE: '1' },
    setup: `pip install --quiet --target /work/.pylib Django==${DJANGO} >/dev/null 2>&1 || echo "setup failed"; pip list --path /work/.pylib > /work/pip-list.txt 2>&1`,
    perModel: `PYTHONPATH=/work/.pylib:. python -m django check --settings=settings && PYTHONPATH=/work/.pylib:. python -m django makemigrations app --dry-run --settings=settings`,
  });
}

function graphql() {
  stage('graphql', 'graphql', 'graphql');
  return runNodeChecker('graphql', 'GraphQL', `graphql ${GRAPHQL}`, 'semantic (buildSchema)', `import { buildSchema } from 'graphql';\nimport { readFileSync } from 'node:fs';\nbuildSchema(readFileSync('input.graphql', 'utf8'));\nconsole.log('schema built');`, `graphql@${GRAPHQL}`);
}

function jsonschema() {
  stage('jsonschema', 'json', 'jsonschema');
  return runNodeChecker('jsonschema', 'JSON Schema', `Ajv ${AJV}`, 'semantic (ajv strict compile)', `import Ajv from 'ajv';\nimport { readFileSync } from 'node:fs';\nconst schema = JSON.parse(readFileSync('input.json', 'utf8'));\nconst ajv = new Ajv({ strict: true });\nconst validate = ajv.compile(schema);\nconsole.log('compiled; empty object valid=' + validate({}));`, `ajv@${AJV}`);
}

function runNodeChecker(tool, name, label, kind, source, pkg) {
  writeFileSync(join(TMP, tool, 'check.mjs'), source);
  return runTool({
    tool,
    image: 'node',
    label,
    kind,
    env: { npm_config_update_notifier: 'false', npm_config_cache: '/work/.npm' },
    setup: `npm init -y >/dev/null 2>&1 && npm pkg set type=module >/dev/null && npm install --silent --no-audit --no-fund ${pkg} >/dev/null 2>&1 || echo "setup failed"`,
    perModel: `cp /work/check.mjs ./check.mjs && node --preserve-symlinks check.mjs`,
  }).map((row) => ({ ...row, target: name === row.target ? row.target : label }));
}

function laravel() {
  stage('laravel', 'php', 'laravel');
  const expected = {};
  for (const m of models) expected[m.id] = Object.fromEntries(Object.entries(oracles[m.id]).map(([t, spec]) => [t, Object.keys(spec.columns)]));
  writeFileSync(join(TMP, 'laravel', 'expected.json'), JSON.stringify(expected));
  // 1. install pinned illuminate/database with composer (network), 2. run migrations on SQLite in the php image.
  const install = runIn('composer', `composer require --no-interaction --quiet --ignore-platform-reqs illuminate/database:${ILLUMINATE} illuminate/events:${ILLUMINATE} && echo installed`, {
    mounts: [[join(TMP, 'laravel'), '/work', 'rw']],
    workdir: '/work',
    env: { COMPOSER_HOME: '/work/.composer' },
  });
  writeLog('targets_laravel_composer.log', `$ ${install.command}\n--- exit ${install.status}\n${install.stdout}\n${install.stderr}`);
  writeFileSync(
    join(TMP, 'laravel', 'migrate.php'),
    `<?php
require '/work/vendor/autoload.php';
use Illuminate\\Database\\Capsule\\Manager as Capsule;
$expected = json_decode(file_get_contents('/work/expected.json'), true);
foreach ($expected as $id => $tables) {
  $capsule = new Capsule;
  $capsule->addConnection(['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']);
  $capsule->setAsGlobal();
  $pdo = $capsule->getConnection()->getPdo();
  $pdo->exec('PRAGMA foreign_keys = ON');
  try {
    $source = file_get_contents("/work/$id/input.php");
    $syntax = null;
    exec('php -l ' . escapeshellarg("/work/$id/input.php") . ' 2>&1', $lint, $code);
    if ($code !== 0) throw new Exception('php -l: ' . trim(implode(' ', $lint)));
    $lint = [];
    $parts = preg_split('/^return new class/m', $source);
    array_shift($parts);
    $migrations = [];
    foreach ($parts as $i => $part) {
      $file = "/work/$id/migration_$i.php";
      file_put_contents($file, "<?php\\nuse Illuminate\\\\Database\\\\Migrations\\\\Migration;\\nuse Illuminate\\\\Database\\\\Schema\\\\Blueprint;\\nuse Illuminate\\\\Support\\\\Facades\\\\Schema;\\nreturn new class" . $part);
      $migrations[] = $file;
    }
    Illuminate\\Support\\Facades\\Facade::setFacadeApplication(new Illuminate\\Container\\Container);
    $container = Illuminate\\Support\\Facades\\Facade::getFacadeApplication();
    $container->instance('db', $capsule->getDatabaseManager());
    $container->instance('db.schema', $capsule->getConnection()->getSchemaBuilder());
    foreach ($migrations as $file) { $m = require $file; $m->up(); }
    $created = [];
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
      $created[$t] = array_column($pdo->query("PRAGMA table_info(\\"$t\\")")->fetchAll(PDO::FETCH_ASSOC), 'name');
    }
    $wantTables = array_keys($tables); sort($wantTables);
    $gotTables = array_keys($created); sort($gotTables);
    if ($wantTables !== $gotTables) throw new Exception('tables differ: expected [' . implode(',', $wantTables) . '] got [' . implode(',', $gotTables) . ']');
    foreach ($tables as $t => $cols) foreach ($cols as $c) if (!in_array($c, $created[$t])) throw new Exception("column $t.$c missing");
    echo "RESULT\\t$id\\tok\\tmigrated " . count($created) . " tables\\n";
  } catch (Throwable $e) {
    echo "RESULT\\t$id\\tfail\\t" . str_replace(["\\n", "\\t"], ' ', substr($e->getMessage(), 0, 240)) . "\\n";
  }
}
`,
  );
  const result = runIn('php', 'php /work/migrate.php', { mounts: [[join(TMP, 'laravel'), '/work', 'rw']], workdir: '/work' });
  writeLog('targets_laravel.log', `$ ${result.command}\n--- exit ${result.status}\n${result.stdout}\n--- stderr\n${result.stderr}`);
  const parsed = parse(result.stdout || '');
  return models.map((m) => ({
    target: `Laravel (illuminate/database ${ILLUMINATE})`,
    model: m.id,
    check: 'semantic (php -l + migrations run on SQLite, tables/columns compared with oracle)',
    result: parsed[m.id]?.ok ? 'pass' : 'FAIL',
    message: parsed[m.id]?.message || `did not run: ${firstLine(result.stderr).slice(0, 160)}`,
  }));
}

export async function runTargetsExperiment({ log }) {
  mkdirSync(TMP, { recursive: true });
  const rows = [];
  for (const [name, fn] of [['prisma', prisma], ['django', django], ['laravel', laravel], ['graphql', graphql], ['jsonschema', jsonschema]]) {
    log(`targets: ${name}`);
    rows.push(...fn());
  }
  writeTable('targets_detail', rows, [
    { key: 'target', header: 'Target' },
    { key: 'model', header: 'Model' },
    { key: 'check', header: 'Check' },
    { key: 'result', header: 'Result' },
    { key: 'message', header: 'First message' },
  ]);
  const summary = [...new Set(rows.map((r) => r.target))].map((target) => {
    const own = rows.filter((r) => r.target === target);
    return { target, check: own[0].check, models: own.length, passed: own.filter((r) => r.result === 'pass').length, failed: own.filter((r) => r.result !== 'pass').length };
  });
  writeTable('targets_summary', summary, [
    { key: 'target', header: 'Target' },
    { key: 'check', header: 'Strongest check' },
    { key: 'models', header: 'Models', align: 'r' },
    { key: 'passed', header: 'Passed', align: 'r' },
    { key: 'failed', header: 'Failed', align: 'r' },
  ]);
  return { rows, summary };
}
