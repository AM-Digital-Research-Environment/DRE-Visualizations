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
 * publishes before a byte of it is read, and every file written is reported
 * with its SHA-256 so the vendored diff can be audited.
 *
 * Usage: node scripts/vendor-maplibre.mjs [version]
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const VENDOR = join(ROOT, 'asset', 'vendor');
// The pinned release. Bump here, re-run, then update THIRD_PARTY_NOTICES and
// the version comment in DashboardAssets to match.
const PINNED = '6.13.0';
/** Any relative static or dynamic import, which would drop Omeka's `?v=`. */
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)["'`]\.\.?\//;

const version = process.argv[2] || PINNED;

/** Minimal ustar reader — enough for an npm tarball's flat `package/` layout. */
function untar(buffer) {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break; // two zero blocks terminate the archive
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const type = header.subarray(156, 157).toString('utf8');
    offset += 512;
    if (type === '0' || type === '') entries.set(name, buffer.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function main() {
  const meta = await fetch(`https://registry.npmjs.org/maplibre-gl/${version}`)
    .then((response) => {
      if (!response.ok) throw new Error(`npm registry returned ${response.status} for maplibre-gl@${version}`);
      return response.json();
    });
  const { tarball, integrity } = meta.dist;
  const archive = Buffer.from(await fetch(tarball).then((response) => {
    if (!response.ok) throw new Error(`tarball download returned ${response.status}`);
    return response.arrayBuffer();
  }));

  // npm publishes `sha512-<base64>`; anything else would be an older or a
  // tampered-with packument, and we would rather stop than vendor it.
  const [algorithm, expected] = String(integrity).split('-');
  if (algorithm !== 'sha512') throw new Error(`unexpected integrity algorithm: ${integrity}`);
  const actual = createHash('sha512').update(archive).digest('base64');
  if (actual !== expected) throw new Error(`tarball integrity mismatch\n  expected ${expected}\n  actual   ${actual}`);
  console.log(`maplibre-gl@${version}: tarball verified against npm integrity (sha512).`);

  const files = untar(gunzipSync(archive));
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

  for (const [name, contents] of written) {
    writeFileSync(join(VENDOR, name), contents, 'utf8');
    console.log(`  asset/vendor/${name}  ${Buffer.byteLength(contents)} bytes  sha256:${sha256(contents)}`);
  }
  console.log(`Vendored maplibre-gl ${version} (renamed .mjs -> .js; contents unchanged).`);
}

main().catch((error) => {
  console.error(`vendor-maplibre: ${error.message}`);
  process.exit(1);
});
