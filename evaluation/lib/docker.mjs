/** Docker helpers: start the pinned database servers, run one-shot tools in pinned images. */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './pipeline.mjs';
import { openDialect } from './db.mjs';

export const lock = JSON.parse(readFileSync(join(ROOT, 'evaluation', 'images.lock.json'), 'utf8'));
export const image = (name) => lock.images[name].ref;
const PASSWORD = 'evalpw';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SERVERS = {
  postgres: { port: 5432, env: [`POSTGRES_PASSWORD=${PASSWORD}`], user: 'postgres' },
  mysql: { port: 3306, env: [`MYSQL_ROOT_PASSWORD=${PASSWORD}`], user: 'root' },
  mariadb: { port: 3306, env: [`MARIADB_ROOT_PASSWORD=${PASSWORD}`], user: 'root' },
};

/**
 * Returns { config, containers, stop } for the requested server engines. When EVAL_<ENGINE>_PORT is set
 * (GitHub Actions service containers) the already running server on 127.0.0.1 is used instead.
 */
export async function startServers(names, log = () => {}) {
  const config = {};
  const containers = [];
  for (const name of names) {
    const spec = SERVERS[name];
    const external = process.env[`EVAL_${name.toUpperCase()}_PORT`];
    if (external) {
      config[name] = { host: '127.0.0.1', port: Number(external), user: spec.user, password: PASSWORD };
      log(`${name}: using external server`);
      continue;
    }
    const args = ['run', '-d', '--rm', '-p', `127.0.0.1::${spec.port}`, ...spec.env.flatMap((e) => ['-e', e]), image(name)];
    const id = execFileSync('docker', args, { encoding: 'utf8' }).trim();
    containers.push(id);
    const mapping = execFileSync('docker', ['port', id, `${spec.port}/tcp`], { encoding: 'utf8' }).trim().split('\n')[0];
    const port = Number(mapping.split(':').pop());
    config[name] = { host: '127.0.0.1', port, user: spec.user, password: PASSWORD };
    log(`${name}: container started`);
  }
  for (const name of names) {
    let lastError;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const adapter = await openDialect(name, config);
        await adapter.closeAll();
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await sleep(1000);
      }
    }
    if (lastError) throw new Error(`${name} did not become ready: ${lastError.message}`);
  }
  const stop = () => containers.forEach((id) => spawnSync('docker', ['rm', '-f', id], { stdio: 'ignore' }));
  return { config, containers, stop };
}

export async function serverVersions(config) {
  const versions = {};
  for (const name of Object.keys(config)) {
    const adapter = await openDialect(name, config);
    const db = await adapter.fresh();
    const rows = await db.query('SELECT version() AS v');
    versions[name] = String(rows[0].v);
    await db.close();
    await adapter.closeAll();
  }
  return versions;
}

/** Runs a command in a pinned image with the repository mounted read-only; returns { status, stdout, stderr }. */
export function runIn(imageName, command, { mounts = [], workdir = '/work', env = {}, network = true, shell = true } = {}) {
  const args = ['run', '--rm', ...(network ? [] : ['--network', 'none']), '-w', workdir];
  for (const [host, container, mode] of mounts) args.push('-v', `${host}:${container}:${mode || 'ro'}`);
  for (const [key, value] of Object.entries(env)) args.push('-e', `${key}=${value}`);
  args.push(image(imageName), ...(shell ? ['sh', '-c', command] : command));
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, command: `docker ${args.join(' ')}` };
}
