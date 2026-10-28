#!/usr/bin/env node
/**
 * Vendor MapLibre GL JS into asset/vendor/.
 *
 * MapLibre 6 ships ES modules only. Since 6.13 the entry point and the worker
 * are each self-contained (`dist/maplibre-gl-shared.mjs` is an empty
 * placeholder); 6.0–6.12 split shared code into a chunk both imported. The
 * files are copied byte for byte, with one change of NAME only:
 *
 *   Upstream names them `.mjs`, and nginx's bundled mime.types — stock on the
 *   DRE host, and still without an `mjs` entry upstream — would serve them as
 *   the default type. Browsers refuse to execute a module script, or start a
 *   module worker, that is not JavaScript-typed. Omeka modules install onto
 *   servers we do not configure, so the extension has to be one every server
 *   already knows: `.js`.
 *
 * Module assets are served immutable for a year and busted by Omeka's `?v=`
 * query. Both files reach the browser with it — the entry through
 * `import(RV_LIBS.maplibre)`, the worker through `setWorkerUrl()` — so their
 * names need no version. A relative import inside either file would resolve
 * against `import.meta.url` and DROP that query, so the script refuses a
 * release that still has one (as 6.0–6.12 did) rather than vendor a chunk
 * that would never be re-fetched after an upgrade.
 *
 * The npm tarball is verified against the integrity hash the registry
 * publishes before a byte of it is read (scripts/lib/npm-tarball.mjs), every
 * file written is reported with its SHA-256 so the vendored diff can be
 * audited, and asset/vendor/versions.json — the pin this script defaults to —
 * is rewritten with the new version and hashes. Update THIRD_PARTY_NOTICES to
 * match; `npm run check:vendor` fails until it does.
 *
 * Usage: node scripts/vendor-maplibre.mjs [version]
 */
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { packageFiles, sha256 } from './lib/npm-tarball.mjs';

const ROOT = join(import.meta.dirname, '..');
const VENDOR = join(ROOT, 'asset', 'vendor');
const MANIFEST = join(VENDOR, 'versions.json');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
/** Any relative static or dynamic import, which would drop Omeka's `?v=`. */
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)["'`]\.\.?\//;

const version = process.argv[2] || manifest.packages['maplibre-gl'].version;

async function main() {
  const files = await packageFiles('maplibre-gl', version);
  console.log(`maplibre-gl@${version}: tarball verified against npm integrity (sha512).`);

  const take = (name) => {
    const data = files.get(`package/dist/${name}`);
    if (!data) throw new Error(`maplibre-gl@${version} ships no dist/${name}`);
    return data;
  };

  const selfContained = (name) => {
    const text = take(name).toString('utf8');
    if (RELATIVE_IMPORT.test(text)) {
      throw new Error(`dist/${name} imports a relative chunk; its URL would lose Omeka's ?v= cache-buster.`
        + ' This script vendors self-contained builds only (MapLibre >= 6.13).');
    }
    return text;
  };

  const written = [
    ['maplibre-gl.js', selfContained('maplibre-gl.mjs')],
    ['maplibre-gl-worker.js', selfContained('maplibre-gl-worker.mjs')],
    ['maplibre-gl.css', take('maplibre-gl.css').toString('utf8')],
  ];

  // Drop files from older layouts (version-stamped shared chunk and worker);
  // leaving them behind would ship dead megabytes in every release archive.
  for (const stale of readdirSync(VENDOR)) {
    if (/^maplibre-gl-(shared|worker)-/.test(stale)) {
      rmSync(join(VENDOR, stale));
      console.log(`  removed stale ${stale}`);
    }
  }

  const pin = manifest.packages['maplibre-gl'];
  pin.version = version;
  for (const [name, contents] of written) {
    writeFileSync(join(VENDOR, name), contents, 'utf8');
    pin.files[name].sha256 = sha256(contents);
    console.log(`  asset/vendor/${name}  ${Buffer.byteLength(contents)} bytes  sha256:${pin.files[name].sha256}`);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Vendored maplibre-gl ${version} (renamed .mjs -> .js; contents unchanged); asset/vendor/versions.json updated.`);
}

main().catch((error) => {
  console.error(`vendor-maplibre: ${error.message}`);
  process.exit(1);
});
