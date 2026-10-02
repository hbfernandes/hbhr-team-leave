import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function nextPatch(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Releases require a three-part numeric version (major.minor.patch).');
  }
  const parts = version.split('.').map(Number);
  if (parts.some((part) => part > 65535) || parts.every((part) => part === 0) || parts[2] === 65535) {
    throw new Error('Release and next patch must fit Chrome version limits.');
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

export async function bumpPatch(root = '.', checkOnly = false) {
  const paths = ['public/manifest.json', 'package.json', 'package-lock.json'];
  const documents = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))));
  const [manifest, pkg, lock] = documents;
  const version = manifest.version;
  if (pkg.version !== version || lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error('Manifest, package and lockfile versions must match.');
  }
  const next = nextPatch(version);
  if (!checkOnly) {
    for (const document of documents) document.version = next;
    lock.packages[''].version = next;
    for (let i = 0; i < paths.length; i++) {
      await writeFile(resolve(root, paths[i]), `${JSON.stringify(documents[i], null, 2)}\n`);
    }
  }
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await bumpPatch('.', process.argv.includes('--check')));
}