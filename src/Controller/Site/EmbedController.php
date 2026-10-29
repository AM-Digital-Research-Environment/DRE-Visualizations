<?php
declare(strict_types=1);
namespace DreVisualizations\Controller\Site;

use DreVisualizations\Site\BlockRegistry;
use Laminas\Mvc\Controller\AbstractActionController;
use Laminas\View\Model\ViewModel;

/**
 * Standalone embed endpoint for the DRE Visualizations page blocks.
 *
 * Every embeddable page block here is zero-configuration: it only needs a site
 * context (current site + base path) to render — the block templates never read
 * `$block`, they fetch their generated JSON through the module's same-origin
 * data route. That lets us render any single block (or a single chart
 * from a dashboard block) on its own bare page, suitable for dropping into a
 * third-party site via an `<iframe>`. Because the iframe loads from this same
 * origin, the data fetches, the module CSS, the active theme's compiled
 * stylesheet (its design tokens + fonts), and the lazy ECharts/MapLibre loaders
 * all resolve exactly as on a normal site page — no CORS, no cross-origin data
 * copy, no stylesheet collision with the host page.
 *
 * Routes (children of Omeka's `site` route, so `site-slug` is inherited and the
 * current site / public theme are set):
 *
 *   /s/:site-slug/dre-embed                 → indexAction  (snippet gallery)
 *   /s/:site-slug/dre-embed/:block          → blockAction  (one bare block)
 *   /s/:site-slug/dre-embed/:block/:viz      → blockAction  (one chart, dashboards)
 *
 * Query params honoured by blockAction (all optional):
 *   ?theme=dark         opt into dark mode (embeds render light by default)
 *   ?primary=RRGGBB     override the brand seed (else the site's primary_color)
 */
class EmbedController extends AbstractActionController
{
    /**
     * Whitelist of embeddable page blocks: BlockRegistry::embeddable(), slug =>
     * label, template, kind ('dashboard' | 'widget'), itemId and layout for
     * dashboards. The slug is route-constrained to [a-z0-9-]+ and doubles as the
     * directory-traversal guard: only a registry template, never user input,
     * reaches partial().
     *
     * @return array<string, array{label:string, template:string, kind:string, itemId?:string, layout?:string}>
     */
    public static function blocks(): array
    {
        return BlockRegistry::embeddable();
    }

    /**
     * Chart keys a dashboard layout renders, from the build-generated
     * config/dashboard-layouts.json (source: asset/js/dashboard-layouts.js).
     *
     * @return string[]
     */
    public static function layoutCharts(string $layout): array
    {
        static $layouts = null;
        if ($layouts === null) {
            $data = json_decode((string) @file_get_contents(dirname(__DIR__, 3) . '/config/dashboard-layouts.json'), true);
            $layouts = is_array($data['layouts'] ?? null) ? $data['layouts'] : [];
        }
        $charts = $layouts[$layout] ?? [];
        return is_array($charts) ? array_values(array_filter($charts, 'is_string')) : [];
    }

    /**
     * Snippet gallery: lists every embeddable block with a live preview and a
     * copy-paste `<iframe>` + auto-resize snippet. Dashboard blocks also expose
     * their individual charts (enumerated client-side from RV.LAYOUTS so the menu
     * never drifts from the actual layouts/labels).
     */
    public function indexAction()
    {
        $this->layout()->setTemplate('dre-visualizations/layout/embed');
        $this->layout()->setVariable('isGallery', true);

        $view = new ViewModel([
            'blocks' => self::blocks(),
            'siteSlug' => $this->currentSite()->slug(),
        ]);
        $view->setTemplate('dre-visualizations/embed/index');
        return $view;
    }

    /**
     * Render one page block — or one chart from a dashboard block — on a bare
     * page for iframe embedding.
     */
    public function blockAction()
    {
        $slug = (string) $this->params()->fromRoute('block', '');
        $blocks = self::blocks();
        if (!isset($blocks[$slug])) {
            return $this->notFound();
        }
        $info = $blocks[$slug];

        // A :viz segment requests a single chart; only the dashboard blocks
        // (rendered by dashboard.js from a chart-key layout) support it.
        $viz = (string) $this->params()->fromRoute('viz', '');
        if ($viz !== '' && ($info['kind'] !== 'dashboard'
            || !in_array($viz, self::layoutCharts((string) ($info['layout'] ?? '')), true))) {
            return $this->notFound();
        }

        // Colour mode. Embeds render light by default (the layout stamps
        // data-theme=light); ?theme=dark opts into dark. Pass the raw value
        // through — the layout treats anything but 'dark' as light.
        $theme = strtolower((string) $this->params()->fromQuery('theme', ''));
        if ($theme !== 'light' && $theme !== 'dark') {
            $theme = '';
        }

        // Brand seed override: accept a bare or #-prefixed 3/6/8-digit hex. The
        // DRE theme derives every accent/hover/focus tint from --primary-base via
        // OKLCH colour-mixing, so this single value re-tints the whole embed.
        $primary = (string) $this->params()->fromQuery('primary', '');
        if ($primary !== '' && preg_match('/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/', $primary)) {
            $primary = '#' . ltrim($primary, '#');
        } else {
            $primary = '';
        }

        // The single-chart title is read in a browser tab and announced as the
        // iframe's accessible name, so spell the camelCase chart key out as words
        // ("stackedTimeline" → "Stacked timeline") rather than leaking the identifier.
        $title = $info['label'];
        if ($viz !== '') {
            $words = strtolower(trim(preg_replace('/(?<!^)[A-Z]/', ' $0', $viz)));
            $title .= ' — ' . ucfirst($words);
        }

        $this->layout()->setTemplate('dre-visualizations/layout/embed');
        $this->layout()->setVariable('embedTheme', $theme);
        $this->layout()->setVariable('embedPrimary', $primary);
        $this->layout()->setVariable('embedTitle', $title);

        $view = new ViewModel([
            'slug' => $slug,
            'info' => $info,
            'viz' => $viz,
        ]);
        $view->setTemplate('dre-visualizations/embed/block');
        return $view;
    }

    /**
     * A bare 404 on the embed layout, so a mistyped slug still renders inside the
     * frame instead of bleeding the site's themed error page into the iframe.
     */
    protected function notFound()
    {
        $this->getResponse()->setStatusCode(404);
        $this->layout()->setTemplate('dre-visualizations/layout/embed');
        $this->layout()->setVariable('isGallery', true);
        $this->layout()->setVariable('embedTitle', 'Not found'); // @translate
        $view = new ViewModel();
        $view->setTemplate('dre-visualizations/embed/not-found');
        return $view;
    }
}
