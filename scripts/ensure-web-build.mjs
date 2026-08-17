import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('dist/index.html')) {
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'build'], { stdio: 'inherit' });

if (result.error) {
  console.error(`No se pudo generar dist: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
