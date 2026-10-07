#!/usr/bin/env node
/**
 * PHPStan in Docker, against an Omeka S core, for machines without PHP:
 *
 *   OMEKA_CORE=/path/to/omeka-s npm run phpstan
 *   OMEKA_CORE=… npm run phpstan -- --generate-baseline   # rewrite the baseline
 *
 * The phar is downloaded once into node_modules/.cache (pinned version below;
 * CI pins the same one).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VERSION = '2.3.0';
const ROOT = resolve(import.meta.dirname, '..');
const core = process.env.OMEKA_CORE ? resolve(process.env.OMEKA_CORE) : '';
if (!core || !existsSync(join(core, 'vendor', 'autoload.php'))) {
  console.error('Set OMEKA_CORE to an Omeka S checkout (with vendor/).');
  process.exit(2);
}
const cacheDir = join(ROOT, 'node_modules', '.cache', 'phpstan');
const phar = join(cacheDir, `phpstan-${VERSION}.phar`);
if (!existsSync(phar)) {
  mkdirSync(cacheDir, { recursive: true });
  const response = await fetch(`https://github.com/phpstan/phpstan/releases/download/${VERSION}/phpstan.phar`);
  if (!response.ok) throw new Error(`phpstan.phar download failed: ${response.status}`);
  writeFileSync(phar, Buffer.from(await response.arrayBuffer()));
}
const extra = process.argv.slice(2);
const args = ['run', '--rm', '-v', `${ROOT}:/app`, '-v', `${core}:/omeka-s:ro`, '-v', `${phar}:/phpstan.phar:ro`,
  '-w', '/app', 'php:8.5-cli', 'php', '-d', 'memory_limit=2G', '/phpstan.phar', 'analyse',
  '-c', 'phpstan.neon.dist', '--autoload-file', '/omeka-s/vendor/autoload.php', '--no-progress', ...extra];
if (extra.includes('--generate-baseline')) args.push('phpstan-baseline.neon');
const result = spawnSync('docker', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
