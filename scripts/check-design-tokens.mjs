#!/usr/bin/env node
/**
 * Design-token contract lint — this module's CONFIG for the shared rule set.
 *
 *   node scripts/check-design-tokens.mjs                    (npm run lint:tokens)
 *   node scripts/check-design-tokens.mjs --update-allowlist
 *
 * The rules themselves are in scripts/lib/token-rules.mjs, vendored verbatim
 * from DRE-theme (refresh with `npm run vendor:lint` over there). This file used
 * to be a hand-written port that opened by claiming it mirrored the theme's
 * check — it did not, and neither did the search client's. Each repo had
 * hardened the rules it happened to need: this one enforced off-scale spacing
 * and radius that the theme did not, the theme measured contrast that no module
 * did, and the search client had no rem check at all. Three rule sets, and the
 * differences were undocumented. Now there is one, and the differences that
 * remain are this config, in the open.
 *
 * The scale values are read from scripts/lib/dre-tokens-fallback.json — also
 * vendored from the theme, generated from its OKLCH source — so "off-scale"
 * means off the theme's actual scale rather than off a list copied by hand.
 *
 * Exit code 1 on any finding; prints file:line for each.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRules, report, parseAllowlist, formatAllowlist } from './lib/token-rules.mjs';

const ROOT = join(import.meta.dirname, '..');
const ALLOWLIST = join(ROOT, 'scripts', 'design-token-allowlist.txt');
const table = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lib', 'dre-tokens-fallback.json'), 'utf8'));
const updateAllowlist = process.argv.includes('--update-allowlist');

const SCAN = {
  root: ROOT,
  dirs: ['asset/css', 'asset/js', 'view'],
  extensions: ['.css', '.js', '.phtml'],
  table,
  // This module aliases the theme tokens into --rv-* on `body` (DESIGN.md §9
  // rule 2), so its own namespace is not a theme token and must not be reported
  // as a missing one.
  localPrefixes: ['--rv-'],
};

// Exempt BY DESIGN, as opposed to the ratchet in design-token-allowlist.txt,
// which is work not yet done.
const BASE_RULES = {
  // The categorical chart palettes (ns.COLORS / ns.HALO) are DATA colour, not
  // chrome: ECharts and the graph canvas cannot parse oklch(), so the twelve
  // brand-derived stops and their dark-lifted twins are necessarily literal
  // here. DESIGN.md §9 "The data-colour contract" governs them instead, and
  // requires stops 1–6 to track --brand-* exactly.
  hex: {
    allow: [
      'asset/js/dashboard-core.js',
      'asset/js/entity-graph.js',
      'asset/js/graph-canvas.js',
      'asset/js/knowledge-graph.js',
      // Omeka's ADMIN theme styles these, not the DRE theme, so the DRE tokens
      // are not defined on the page at all.
      'view/dre-visualizations/admin/',
    ],
  },
  // A 0.6rem square with two 2px borders is a CSS chevron caret — construction,
  // not the "accent side-stripe" tell. The theme allowlists the same idiom in
  // _linked-resources.scss and _navigation.scss.
  stripe: { allow: ['asset/css/dre-visualizations.css'] },
  radius: { allow: ['view/dre-visualizations/admin/'] },
  // Page geometry in JS is layout maths (canvas sizes, force-graph radii), not
  // CSS, and the px rules do not apply to it.
  pxGeometry: { allow: ['asset/js/', 'view/'] },
  fontSize: { allow: ['asset/js/'] },
  spacing: { allow: ['asset/js/'] },
  radius: { allow: ['asset/js/'] },
  leading: { allow: ['asset/js/'] },
  zindex: { allow: ['asset/js/'] },
};

if (updateAllowlist) {
  const all = runRules({ ...SCAN, rules: BASE_RULES });
  writeFileSync(
    ALLOWLIST,
    formatAllowlist(
      all,
      `# GENERATED baseline for scripts/check-design-tokens.mjs — the RATCHET.\n` +
        `#\n` +
        `# Each line exempts one rule in one file. This is a backlog, not a set of\n` +
        `# exemptions: every line is a conversion someone still owes. Lines should\n` +
        `# only ever be REMOVED. Regenerate with --update-allowlist after a pass,\n` +
        `# and check the diff — a new line means new drift got in.\n` +
        `#\n` +
        `# Rules exempt by design (the data-colour palettes, JS layout maths) live\n` +
        `# in the script.`
    )
  );
  console.log(`Wrote ${all.length} allowlist entr(ies) to scripts/design-token-allowlist.txt`);
  process.exit(0);
}

const findings = runRules({
  ...SCAN,
  rules: parseAllowlist(readFileSync(ALLOWLIST, 'utf8'), BASE_RULES),
});

report('Design-token contract', findings);
