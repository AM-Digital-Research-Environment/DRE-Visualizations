// ESLint flat config. Browser sources are classic scripts (IIFEs sharing
// window.RV), not modules; the generated bundles and vendored libraries are
// not linted — their sources are.
import js from '@eslint/js';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  {
    ignores: [
      'asset/vendor/**',
      'asset/js/dashboard-core.js',          // generated from asset/js/core/
      'asset/js/dashboard-charts.bundle.js', // generated from CHART_SCRIPTS
      'node_modules/**',
      'tests/golden/**',
      '.cache/**',
      'test-results/**',                     // Playwright output
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['asset/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        echarts: 'readonly',
        maplibregl: 'readonly',
        d3: 'readonly',
      },
    },
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      // Markup built from data must pass an escaper; scripts/check-html-safety.mjs
      // keeps the reviewed count of these sinks and executes the formatters.
      'no-unsanitized/property': ['error', {
        escape: { methods: ['ns.escapeHtml', 'escapeHtml', 'esc', 'echarts.format.encodeHTML', 'enc'] },
      }],
      'no-unsanitized/method': ['error', {
        escape: { methods: ['ns.escapeHtml', 'escapeHtml', 'esc', 'echarts.format.encodeHTML', 'enc'] },
      }],
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.mjs', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      // tests/browser also passes functions into page.evaluate().
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
