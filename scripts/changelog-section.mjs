#!/usr/bin/env node
/**
 * CHANGELOG.md (Keep a Changelog) helpers — the same format and the same
 * helper as DRE-theme's scripts/changelog-section.mjs.
 *
 *   node scripts/changelog-section.mjs <version>   print that version's notes
 *
 * release.yml publishes the printed section as the notes of the GitHub
 * release; check-release-metadata.mjs reads the dated heading through
 * changelogDate(). Exit code 1 when the version has no section, or an empty one.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingRe = (name) => new RegExp(`^## \\[${escape(name)}\\][^\\n]*\\n`, 'm');

/**
 * Body of `## [name]` up to the next `## ` heading or link reference block,
 * without HTML comments (editing placeholders), trimmed; null when absent.
 */
export function changelogSection(text, name) {
  const source = text.replace(/\r\n/g, '\n');
  const heading = source.match(headingRe(name));
  if (!heading) return null;
  const rest = source.slice(heading.index + heading[0].length);
  const end = rest.search(/^## |^\[[^\]]+\]: /m);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** The YYYY-MM-DD of `## [version] - YYYY-MM-DD`, or null. */
export function changelogDate(text, version) {
  const match = new RegExp(`^## \\[${escape(version)}\\] - (\\d{4}-\\d{2}-\\d{2})[ \\t]*$`, 'm')
    .exec(text.replace(/\r\n/g, '\n'));
  return match ? match[1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2]?.replace(/^v/, '');
  if (!version) {
    console.error('Usage: node scripts/changelog-section.mjs <version>');
    process.exit(2);
  }
  const text = readFileSync(join(import.meta.dirname, '..', 'CHANGELOG.md'), 'utf8');
  const notes = changelogSection(text, version);
  if (!notes) {
    console.error(`CHANGELOG.md has no notes for ${version}.`);
    process.exit(1);
  }
  process.stdout.write(notes + '\n');
}
