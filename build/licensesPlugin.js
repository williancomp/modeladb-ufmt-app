import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Ships the full licence texts of everything the production bundle contains.
 *
 * MIT, ISC and BSD-3-Clause require the copyright notice and licence text to accompany copies and
 * binary redistributions; the minified bundle carries none, so this emits `THIRD_PARTY_LICENSES.txt`
 * next to `index.html`. It walks the runtime `dependencies` of package.json (type-only `@types/*`
 * packages are not bundled and are skipped) and appends the Poppins and Tailwind CSS texts from
 * `licenses/`. The About dialog links to the file.
 */
export function thirdPartyLicenses({ root = '.' } = {}) {
  const readPackage = (name) => {
    const dir = join(root, 'node_modules', name);
    const manifest = join(dir, 'package.json');
    return existsSync(manifest) ? { dir, json: JSON.parse(readFileSync(manifest, 'utf8')) } : null;
  };

  const collect = () => {
    const seen = new Map();
    const visit = (name) => {
      if (seen.has(name) || name.startsWith('@types/')) return;
      const pkg = readPackage(name);
      if (!pkg) return;
      seen.set(name, pkg);
      Object.keys(pkg.json.dependencies || {}).forEach(visit);
    };
    Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies || {}).forEach(visit);
    return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  const licenseText = (dir) => {
    const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE'].find((f) => existsSync(join(dir, f)));
    return file ? readFileSync(join(dir, file), 'utf8').trim() : null;
  };

  return {
    name: 'modeladb-third-party-licenses',
    apply: 'build',
    generateBundle() {
      const rule = '='.repeat(78);
      const parts = [
        'ModelaDB - third-party licences',
        '',
        'ModelaDB itself is released under the MIT License (LICENSE in the source repository).',
        'This file reproduces the licence text of every third-party component contained in this',
        'distribution, as required by those licences.',
        '',
      ];
      const section = (title, body) => parts.push(rule, title, rule, '', body, '');
      for (const [name, { dir, json }] of collect()) {
        const text = licenseText(dir);
        if (!text) throw new Error(`No licence file found for ${name}@${json.version}`);
        section(`${name} ${json.version} (${json.license})`, text);
      }
      section('Tailwind CSS (MIT) - utility CSS generated into the stylesheet', readFileSync(resolve(root, 'licenses/Tailwind-MIT.txt'), 'utf8').trim());
      section('Poppins typeface (SIL Open Font License 1.1) - fonts/*.woff2', readFileSync(resolve(root, 'licenses/Poppins-OFL.txt'), 'utf8').trim());
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: parts.join('\n') });
    },
  };
}
