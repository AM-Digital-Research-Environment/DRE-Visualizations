/**
 * Download an npm package tarball and read its files, after checking it
 * against the integrity hash the registry publishes. Shared by
 * scripts/vendor-maplibre.mjs (which vendors from it) and
 * scripts/check-vendor.mjs (which compares the vendored files with it).
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const REGISTRY = 'https://registry.npmjs.org';

/** Minimal ustar reader — enough for an npm tarball's flat `package/` layout. */
export function untar(buffer) {
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

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function ok(response, what) {
  if (!response.ok) throw new Error(`${what} returned HTTP ${response.status}`);
  return response;
}

/** The registry's `latest` dist-tag of a package. */
export async function latestVersion(name) {
  const response = await ok(await fetch(`${REGISTRY}/${name}/latest`), `npm registry for ${name}`);
  return (await response.json()).version;
}

/**
 * The files of `name@version` as a Map of `package/...` paths to Buffers.
 * Throws unless the tarball matches the registry's sha512 integrity hash:
 * anything else would be an older or a tampered-with packument.
 */
export async function packageFiles(name, version) {
  const meta = await (await ok(await fetch(`${REGISTRY}/${name}/${version}`), `npm registry for ${name}@${version}`)).json();
  const { tarball, integrity } = meta.dist;
  const archive = Buffer.from(await (await ok(await fetch(tarball), `tarball of ${name}@${version}`)).arrayBuffer());
  const [algorithm, expected] = String(integrity).split('-');
  if (algorithm !== 'sha512') throw new Error(`${name}@${version}: unexpected integrity algorithm: ${integrity}`);
  const actual = createHash('sha512').update(archive).digest('base64');
  if (actual !== expected) {
    throw new Error(`${name}@${version}: tarball integrity mismatch\n  expected ${expected}\n  actual   ${actual}`);
  }
  return untar(gunzipSync(archive));
}
