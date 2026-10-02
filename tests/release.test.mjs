import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextPatch, bumpPatch } from '../scripts/bump-patch.mjs';

test('next patch preserves major/minor and respects Chrome limits', () => {
  assert.equal(nextPatch('0.1.0'), '0.1.1');
  assert.equal(nextPatch('1.2.99'), '1.2.100');
  for (const version of ['0.0.0', '1.2', '1.2.3.4', '01.2.3', '1.2.3-beta', '65536.1.0', '1.2.65535']) {
    assert.throws(() => nextPatch(version));
  }
});

test('bump updates all version fields, preserves metadata and check mode writes nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbhr-release-'));
  try {
    await mkdir(join(root, 'public'));
    const paths = ['public/manifest.json', 'package.json', 'package-lock.json'];
    const documents = [
      { version: '0.1.0', manifest_version: 3 },
      { version: '0.1.0', name: 'test' },
      { version: '0.1.0', packages: { '': { version: '0.1.0' }, dependency: { version: '9.0.0' } } },
    ];
    for (let i = 0; i < paths.length; i++) await writeFile(join(root, paths[i]), JSON.stringify(documents[i]));
    assert.equal(await bumpPatch(root, true), '0.1.1');
    assert.equal(JSON.parse(await readFile(join(root, paths[0]), 'utf8')).version, '0.1.0');
    assert.equal(await bumpPatch(root), '0.1.1');
    for (const path of paths) assert.equal(JSON.parse(await readFile(join(root, path), 'utf8')).version, '0.1.1');
    const lock = JSON.parse(await readFile(join(root, paths[2]), 'utf8'));
    assert.equal(lock.packages[''].version, '0.1.1');
    assert.equal(lock.packages.dependency.version, '9.0.0');
    await writeFile(join(root, paths[1]), JSON.stringify({ version: '0.2.0' }));
    await assert.rejects(bumpPatch(root), /must match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});