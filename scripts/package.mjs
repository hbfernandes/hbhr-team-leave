import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
const files = {};
for (const name of await readdir('dist')) files[name] = new Uint8Array(await readFile(`dist/${name}`));
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/hbhr-team-leave.zip', zipSync(files));
console.log('Packaged artifacts/hbhr-team-leave.zip');