import {readFile, writeFile, mkdir, readdir, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const urlIndex = process.argv.indexOf('--backend');
const backend = new URL(urlIndex >= 0 ? process.argv[urlIndex + 1] : 'http://127.0.0.1:8000');
if (backend.username || backend.password || backend.search || backend.hash || backend.pathname !== '/') throw new Error('Use somente a origem do backend, sem caminho ou credenciais.');
if (production && backend.protocol !== 'https:') throw new Error('Produção exige HTTPS.');
if (!production && !(backend.protocol === 'https:' || (backend.protocol === 'http:' && ['127.0.0.1','localhost'].includes(backend.hostname)))) throw new Error('HTTP permitido apenas no loopback local.');
for (const browser of ['edge']) {
  const out = path.join(root, 'dist', browser);
  await mkdir(out, {recursive: true});
  for (const entry of await readdir(path.join(root, 'extension'), {withFileTypes: true})) {
    if (entry.isFile()) await copyFile(path.join(root, 'extension', entry.name), path.join(out, entry.name));
  }
  await mkdir(path.join(out, 'icons'), {recursive: true});
  for (const name of await readdir(path.join(root, 'extension', 'icons'))) await copyFile(path.join(root, 'extension', 'icons', name), path.join(out, 'icons', name));
  const manifest = JSON.parse(await readFile(path.join(root, 'manifests', `${browser}.json`), 'utf8'));
  manifest.host_permissions = [`${backend.protocol}//${backend.hostname}/*`];
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(out, 'config.js'), `globalThis.AllyConfig = Object.freeze(${JSON.stringify({backendUrl: backend.origin})});\n`);
  await writeFile(path.join(out, 'ui-style.js'), `globalThis.AllyStyle = ${JSON.stringify(await readFile(path.join(root, 'extension', 'ui.css'), 'utf8'))};\n`);
  console.log(`${browser}: ${out}`);
}
