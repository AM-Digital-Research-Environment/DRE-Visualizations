#!/usr/bin/env node
/**
 * Static server for the browser suite (playwright.config.mjs `webServer`):
 * the module's own files under /asset/, and the fixture pages at
 * /fixture/<name>?theme=light|dark&i18n=<json>. Generated-data requests
 * (/s/test/dre-data/…) answer 404 here; each test stubs the ones it needs.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fixturePage } from './fixtures.mjs';

const root = resolve(import.meta.dirname, '../..');
const port = Number(process.env.PORT || 4173);
const TYPES = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.pbf': 'application/x-protobuf', '.html': 'text/html',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const fixture = /^\/fixture\/([a-z-]+)$/.exec(url.pathname);
  if (fixture) {
    let i18n = {};
    try { i18n = JSON.parse(url.searchParams.get('i18n') || '{}'); } catch { /* ignore */ }
    const html = fixturePage(fixture[1], { theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light', i18n });
    if (html === null) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(html);
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
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Fixture server on http://127.0.0.1:${port}`));
