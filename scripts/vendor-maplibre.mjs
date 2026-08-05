#!/usr/bin/env node
/**
 * Vendor MapLibre GL JS into asset/vendor/.
 *
 * MapLibre 6 ships ES modules only, split across three files: the entry point,
 * a shared chunk it imports statically, and the worker (which imports the same
 * chunk). Two things stop us from copying them in untouched:
 *
 *   1. Upstream names them `.mjs`, and nginx's bundled mime.types — stock on
 *      the DRE host, and still without an `mjs` entry upstream — would serve
 *      them as the default type. Browsers refuse to execute a module script,
 *      or start a module worker, that is not JavaScript-typed. Omeka modules
 *      install onto servers we do not configure, so the extension has to be
 *      one every server already knows: `.js`.
 *   2. Module assets are served immutable for a year and busted by Omeka's
 *      `?v=` query. The relative import inside the entry point resolves
 *      against `import.meta.url`, which DROPS that query — so the shared chunk
 *      and worker would never be re-fetched after a MapLibre upgrade. Their
 *      version therefore goes in the file name, which changes when the library
 *      does. (The worker is additionally handed over through `setWorkerUrl()`,
 *      so it gets the `?v=` as well; the chunk cannot be, its specifier is
 *      baked into the bundle.)
 *
 * Both are satisfied by ONE rewrite: the `./maplibre-gl-shared.mjs` specifier
 * becomes `./maplibre-gl-shared-<version>.js`. Nothing else is altered. The
 * npm tarball is verified against the integrity hash the registry publishes
 * before a byte of it is read, and every file written is reported with its
 * SHA-256 so the vendored diff can be audited.
 *
 * Usage: node scripts/vendor-maplibre.mjs [version]
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const VENDOR = join(ROOT, 'asset', 'vendor');
// The pinned release. Bump here, re-run, then update DashboardAssets::MAPLIBRE_*
// and THIRD_PARTY_NOTICES to match.
const PINNED = '6.1.0';
const SPECIFIER = './maplibre-gl-shared.mjs';

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

  const sharedName = `maplibre-gl-shared-${version}.js`;
  const workerName = `maplibre-gl-worker-${version}.js`;
  const rewrite = (source, from) => {
    const text = source.toString('utf8');
    const hits = text.split(SPECIFIER).length - 1;
    if (hits !== 1) throw new Error(`${from} references ${SPECIFIER} ${hits} times, expected exactly 1`);
    return text.replace(SPECIFIER, `./${sharedName}`);
  };

  const written = [
    ['maplibre-gl.js', rewrite(take('maplibre-gl.mjs'), 'maplibre-gl.mjs')],
    [sharedName, take('maplibre-gl-shared.mjs').toString('utf8')],
    [workerName, rewrite(take('maplibre-gl-worker.mjs'), 'maplibre-gl-worker.mjs')],
    ['maplibre-gl.css', take('maplibre-gl.css').toString('utf8')],
  ];

  // Drop the previous release's version-stamped chunks; leaving them behind
  // would ship two copies of a 480 KiB bundle in every release archive.
  for (const stale of readdirSync(VENDOR)) {
    if (/^maplibre-gl-(shared|worker)-/.test(stale) && !written.some(([name]) => name === stale)) {
      rmSync(join(VENDOR, stale));
      console.log(`  removed stale ${stale}`);
    }
  }

  for (const [name, contents] of written) {
    writeFileSync(join(VENDOR, name), contents, 'utf8');
    console.log(`  asset/vendor/${name}  ${Buffer.byteLength(contents)} bytes  sha256:${sha256(contents)}`);
  }
  console.log(`Vendored maplibre-gl ${version} (one rewrite: ${SPECIFIER} -> ./${sharedName}).`);
}

main().catch((error) => {
  console.error(`vendor-maplibre: ${error.message}`);
  process.exit(1);
});
