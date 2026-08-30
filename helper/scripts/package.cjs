'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);
const artifactName = 'JASWA-Helper-Setup.exe';

async function main() {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'jaswa-helper-build-'));
  const builder = require.resolve('electron-builder/cli');
  await run(process.execPath, [builder, '--win', 'nsis', '--x64', '--config.extraMetadata.version=0.0.0', `--config.directories.output=${output}`], { stdio: 'inherit' });
  const publicDirectory = path.join(__dirname, '..', '..', 'public');
  await fs.copyFile(path.join(output, artifactName), path.join(publicDirectory, artifactName));
  await fs.copyFile(path.join(output, `${artifactName}.blockmap`), path.join(publicDirectory, `${artifactName}.blockmap`));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
