import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const parts = String(manifest.version).split('.');
if (parts.length > 4 || !parts.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65535) || parts.every((part) => Number(part) === 0)) {
  throw new Error('Manifest must have a valid Chrome numeric version.');
}
if (pkg.version !== manifest.version || lock.version !== manifest.version || lock.packages[''].version !== manifest.version) {
  throw new Error('Keep manifest, package.json and package-lock.json versions identical before release.');
}
console.log(`Release version: ${manifest.version}`);