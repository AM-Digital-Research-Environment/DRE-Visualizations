/**
 * Firefox discards every import map that follows a module load or a
 * modulepreload, and Mirador mounts through one (`import … from "mirador"`).
 * A module <script> or a modulepreload hint in the head therefore breaks any
 * Mirador viewer on the same page — DRE Search shipped exactly that in 1.24.
 * The module loads ES modules only at run time (ns.ensureLibs' import()), after
 * the head is parsed; this pins that no PHP or template puts one in the head.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(php|phtml)$/.test(name)) yield path;
  }
}

test('no template or helper puts a module script or a modulepreload in the head', () => {
  const offenders = [];
  for (const dir of ['src', 'view', 'config']) {
    for (const path of files(join(ROOT, dir))) {
      // Comments may name what they forbid; only code counts.
      const src = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*(?:\/\/|#|\*).*$/gm, '');
      const rel = relative(ROOT, path).split('\\').join('/');
      if (/modulepreload/.test(src)) offenders.push(`${rel}: modulepreload`);
      // headScript()->appendScript(…, 'module') / appendFile(…, 'module'): the
      // script type is a later argument of the call, and a literal
      // <script type="module"> in a template.
      if (/,\s*['"]module['"]\s*[,)]/.test(src)) {
        offenders.push(`${rel}: module script via a view helper`);
      }
      if (/<script[^>]*type=["']module["']/i.test(src)) offenders.push(`${rel}: <script type="module">`);
    }
  }
  assert.deepEqual(offenders, []);
});
