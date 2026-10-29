#!/usr/bin/env node
/**
 * Static server for the browser suite (playwright.config.mjs `webServer`) and
 * the Lighthouse budgets (scripts/check-lighthouse.mjs): the module's own files
 * under /asset/, and the fixture pages at
 * /fixture/<name>?theme=light|dark&i18n=<json>.
 *
 * Generated-data requests (/s/test/dre-data/…) answer 404 here, and each
 * Playwright test stubs the ones it needs; with FIXTURE_DATA=golden (what
 * Lighthouse sets, since it cannot stub) they answer from tests/golden/, the
 * precompute's output on the synthetic corpus.
 *
 * Text goes out gzipped when the client accepts it, as Omeka's web server sends
 * it live, so byte budgets measure what a reader downloads.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fixturePage } from './fixtures.mjs';

const root = resolve(import.meta.dirname, '../..');
const golden = resolve(root, 'tests/golden');
const port = Number(process.env.PORT || 4173);
const serveGolden = process.env.FIXTURE_DATA === 'golden';
const GENERATION = '20261005T000000Z-aaaaaaaaaaaa';
const TYPES = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.map': 'application/json', '.geojson': 'application/geo+json', '.pbf': 'application/x-protobuf', '.html': 'text/html',
};
const COMPRESSIBLE = /^(text\/|application\/(json|geo\+json))/;
const gzipped = new Map();

function send(req, res, type, body, key) {
  res.setHeader('Content-Type', type);
  if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let zipped = key ? gzipped.get(key) : undefined;
    if (!zipped) {
      zipped = gzipSync(body);
      if (key) gzipped.set(key, zipped);
    }
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    return res.end(zipped);
  }
  return res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const fixture = /^\/fixture\/([a-z-]+)$/.exec(url.pathname);
  if (fixture) {
    let i18n = {};
    try { i18n = JSON.parse(url.searchParams.get('i18n') || '{}'); } catch { /* ignore */ }
    const html = fixturePage(fixture[1], { theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light', i18n });
    if (html === null) { res.statusCode = 404; return res.end(); }
    return send(req, res, 'text/html; charset=utf-8', Buffer.from(html));
  }
  if (serveGolden && url.pathname.startsWith('/s/test/dre-data/')) {
    if (url.pathname.endsWith('/current.json')) {
      return send(req, res, 'application/json', Buffer.from(JSON.stringify({ generationId: GENERATION })));
    }
    const artifact = /^\/s\/test\/dre-data\/generations\/[^/]+\/(.+)$/.exec(url.pathname);
    const file = artifact ? resolve(golden, artifact[1]) : '';
    if (file.startsWith(golden)) {
      try { return send(req, res, 'application/json', await readFile(file), file); } catch { /* 404 below */ }
    }
    res.statusCode = 404;
    return res.end('{}');
  }
  if (!url.pathname.startsWith('/asset/') && !url.pathname.startsWith('/modules/DreVisualizations/asset/')) {
    res.statusCode = 404;
    return res.end();
  }
  // Maps resolve module assets through ns.moduleAsset (basePath + /modules/…).
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/modules\/DreVisualizations/, ''));
  const file = resolve(root, '.' + relativePath);
  if (!file.startsWith(resolve(root, 'asset'))) { res.statusCode = 403; return res.end(); }
  try {
    return send(req, res, TYPES[extname(file)] || 'application/octet-stream', await readFile(file), file);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Fixture server on http://127.0.0.1:${port}`));
