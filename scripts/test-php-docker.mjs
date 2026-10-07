#!/usr/bin/env node
/**
 * Run the PHP gates in a throwaway `php:<version>-cli` container, for machines
 * without a local PHP. Mirrors the CI `php` and `module-contract` jobs:
 *
 *   npm run test:php                          # PHP 8.5: lint + pure harnesses
 *   npm run test:php -- --php 8.4             # another supported version
 *   OMEKA_CORE=/path/to/omeka-s npm run test:php
 *                                             # + module contract, PHPStan-free
 *                                             #   integration suites against core
 *
 * Node passes the volume paths to Docker untouched, which avoids the path
 * mangling Git Bash applies to `-v C:\…:/app`.
 */
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const version = flag('--php') || '8.5';
const core = process.env.OMEKA_CORE ? resolve(process.env.OMEKA_CORE) : '';
if (core && !existsSync(join(core, 'vendor', 'autoload.php'))) {
  console.error(`OMEKA_CORE does not look like an Omeka S checkout: ${core}`);
  process.exit(2);
}

const steps = [
  "find . \\( -name '*.php' -o -name '*.phtml' \\) -not -path './node_modules/*' -not -path './vendor/*' -print0"
    + ' | xargs -0 -n1 -P4 php -l > /dev/null',
  'php scripts/test-php.php',
];
if (core) {
  steps.push(
    'php scripts/check-module-contract.php /omeka-s',
    'php tests/integration/CoreContractsTest.php /omeka-s',
    'php tests/integration/DatabaseTest.php /omeka-s',
    'php tests/integration/LifecycleTest.php /omeka-s',
  );
}

const docker = ['run', '--rm', '-v', `${ROOT}:/app`, '-w', '/app'];
if (core) docker.push('-v', `${core}:/omeka-s:ro`);
docker.push(`php:${version}-cli`, 'sh', '-c', 'set -e; ' + steps.join(' && '));

console.log(`PHP ${version}${core ? ' + Omeka core' : ''}: ${steps.length} step(s)`);
const result = spawnSync('docker', docker, { stdio: 'inherit' });
if (result.error) {
  console.error(`Cannot run docker: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 1);
