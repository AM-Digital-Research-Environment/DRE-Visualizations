<?php
namespace DreVisualizations\View\Helper;

use DreVisualizations\Module;
use Laminas\View\Helper\AbstractHelper;

/**
 * Appends the module's dashboard front-end assets to the page head.
 *
 * Single source of truth for the chart-builder <script> chain, so registering
 * a new chart touches exactly one place (see {@see self::CHART_SCRIPTS}) instead
 * of every dashboard template. Used by every dashboard surface:
 *   - item / item-set resource-page blocks (library URLs + core already
 *     injected by Module.php, so they call it without `cdn`);
 *   - site-page block layouts — Collection Overview, Compare, and the
 *     cross-cutting blocks — which pass `['cdn' => true]` for the legacy option
 *     name because Module.php does not run on page controllers.
 *
 * Laminas's headScript()/headLink() de-duplicate by src, so it is safe for
 * several blocks on one page to each request the library prelude.
 */
class DashboardAssets extends AbstractHelper
{
    private bool $mapConfigInjected = false;
    private bool $i18nInjected = false;

    // Vendored under asset/vendor/ — self-hosted for same-origin delivery (the
    // Omeka server gzips them to the same wire size jsDelivr served), server-side
    // caching, and no third-party dependency (consistent with the privacy-first
    // posture). Paths are relative to the module asset root: resolve with
    // assetUrl()/the $asset() helper before use. Pinned: echarts 6.1.0,
    // echarts-wordcloud 2.1.0, maplibre-gl 5.24.0, d3-force 3.0.0.
    const ECHARTS_JS   = 'vendor/echarts.min.js';
    const WORDCLOUD_JS = 'vendor/echarts-wordcloud.min.js';
    const MAPLIBRE_CSS = 'vendor/maplibre-gl.css';
    const MAPLIBRE_JS  = 'vendor/maplibre-gl.js';

    /**
     * The d3-force layout stack the knowledge graph simulates with, in LOAD
     * ORDER: d3-force's UMD wrapper resolves d3-quadtree / d3-dispatch /
     * d3-timer off the shared `d3` global, so the three dependencies MUST
     * execute first. ~17 KiB total — only the force engine is vendored; the
     * graph renders to its own canvas and handles pan/zoom/drag with plain
     * pointer events, so the d3-selection / d3-zoom chain is not needed.
     *
     * @var string[]
     */
    const D3_SCRIPTS = [
        'vendor/d3-quadtree.min.js',
        'vendor/d3-dispatch.min.js',
        'vendor/d3-timer.min.js',
        'vendor/d3-force.min.js',
    ];

    /**
     * The item-page Knowledge Graph's OWN files, in LOAD ORDER: the data layer, its
     * chrome, the location-map module, and the controller that wires everything
     * together last. The shared renderer is prepended from
     * {@see self::GRAPH_RENDERER_SCRIPTS} at use, so the renderer is listed once.
     *
     * Deferred scripts execute in append order, so each file finds the namespaces
     * it reads (ns.GraphCanvas, ns.ForceGraph, ns.graphChrome, ns.kgData, ns.kgUI,
     * ns.itemLocationMap) already registered. Neither ECharts nor the chart-builder
     * bundle appears here — the graph needs neither.
     *
     * @var string[]
     */
    const KNOWLEDGE_GRAPH_SCRIPTS = [
        'js/knowledge-graph-data.js',
        'js/knowledge-graph-ui.js',
        'js/item-location-map.js',
        'js/knowledge-graph.js',
    ];

    /**
     * The Entity Network (Discursive Communities) chain, in LOAD ORDER: the chrome
     * first — the keyboard walker, the text alternative, the cluster filter and the
     * export / fullscreen controls — then the controller that wires them to the
     * MapLibre layers. Deferred scripts run in append order, so entity-graph.js
     * finds ns.egUI registered by the time its init() fires.
     *
     * @var string[]
     */
    const ENTITY_GRAPH_SCRIPTS = [
        'js/entity-graph-ui.js',
        'js/entity-graph.js',
    ];

    /**
     * The shared d3-force graph renderer, in LOAD ORDER: canvas geometry, the
     * simulation controller, then the chrome that wraps either of them.
     *
     * Named separately from KNOWLEDGE_GRAPH_SCRIPTS because two surfaces now use
     * it — the item-page knowledge graph and the dashboards' co-occurrence networks
     * — and it must NOT go in CHART_SCRIPTS: that list is bundled, and an item page
     * carrying both a knowledge graph and a dashboard would then ship the renderer
     * twice. As separate files Laminas de-duplicates them by src.
     *
     * @var string[]
     */
    const GRAPH_RENDERER_SCRIPTS = [
        'js/graph-canvas.js',
        'js/graph-force.js',
        'js/graph-chrome.js',
    ];

    /**
     * The chart-builder chain in load order: layouts first, then every builder
     * (each registers into `window.RV.charts`), then the registry last (which
     * maps the builders into CHART_MAP). Add a new chart's builder file HERE —
     * and nowhere else.
     *
     * @var string[]
     */
    const CHART_SCRIPTS = [
        'js/dashboard-layouts.js',
        'js/dashboard-charts-timeline.js',
        'js/dashboard-charts-pie.js',
        'js/dashboard-charts-bar.js',
        'js/dashboard-charts-histogram.js',
        'js/dashboard-charts-wordcloud.js',
        'js/dashboard-charts-gantt.js',
        'js/dashboard-charts-heatmap.js',
        'js/dashboard-charts-chord.js',
        'js/dashboard-charts-sankey.js',
        'js/dashboard-charts-sunburst.js',
        'js/dashboard-charts-stacked-timeline.js',
        'js/dashboard-charts-beeswarm.js',
        'js/dashboard-charts-map.js',
        'js/dashboard-charts-cluster-map.js',
        'js/dashboard-charts-affiliation-map.js',
        'js/dashboard-collab-network.js',
        'js/dashboard-charts-contributor-network.js',
        'js/dashboard-charts-stacked-area.js',
        'js/dashboard-charts-treemap.js',
        'js/dashboard-charts-choropleth.js',
        'js/dashboard-charts-radar.js',
        'js/dashboard-charts-communities.js',
        'js/dashboard-charts-boxplot.js',
        'js/dashboard-charts-time-chord.js',
        'js/dashboard-stat-cards.js',
        'js/dashboard-registry.js',
    ];

    /** Generated by `npm run build` from CHART_SCRIPTS in the exact order above. */
    const CHART_BUNDLE = 'js/dashboard-charts.bundle.js';

    /**
     * Controller chains, appended after the builder chain.
     *
     * @var array<string, string[]>
     */
    const CONTROLLERS = [
        'dashboard'   => ['js/dashboard.js'],
        'explorer'    => ['js/dashboard.js', 'js/dashboard-explorer.js'],
        'compare'     => ['js/dashboard-compare-unify.js', 'js/dashboard-compare.js'],
        'network'     => ['js/dashboard-network-explorer.js'],
        'whatsNew'    => ['js/dashboard-whats-new.js'],
        'semanticMap' => ['js/semantic-map.js'],
    ];

    /**
     * @param array $options {
     *     @var bool   $cdn        Inject the CSS + vendored library URLs/eager
     *                             scripts + dashboard-core.js prelude. Legacy
     *                             option name; use on site-page blocks. Default false.
     *     @var string $controller Controller chain to append after the builders:
     *                             'dashboard' (default), 'compare', or '' / null
     *                             for none (e.g. a block with its own controller).
     * }
     * @return self
     */
    public function __invoke(array $options = [])
    {
        $view = $this->getView();
        $cdn = !empty($options['cdn']);
        $controller = array_key_exists('controller', $options)
            ? $options['controller']
            : 'dashboard';

        $headLink = $view->headLink();
        $headScript = $view->headScript();
        if (!$this->i18nInjected) {
            $headScript->appendScript('window.RV_I18N=Object.assign('
                . json_encode(Module::clientTranslations($view),
                    JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
                . ',window.RV_I18N||{});');
            $this->i18nInjected = true;
        }
        if (!$this->mapConfigInjected) {
            $headScript->appendScript('window.RV_MAP_CONFIG=Object.assign('
                . json_encode([
                    'lightStyle' => (string) $view->setting(Module::SETTING_BASEMAP_LIGHT, ''),
                    'darkStyle' => (string) $view->setting(Module::SETTING_BASEMAP_DARK, ''),
                    'glyphs' => (string) $view->setting(Module::SETTING_MAP_GLYPHS, ''),
                    'attribution' => (string) $view->setting(Module::SETTING_BASEMAP_ATTRIBUTION, ''),
                ], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
                . ',window.RV_MAP_CONFIG||{});');
            $this->mapConfigInjected = true;
        }
        // Defer every script so the ~650 KiB ECharts/MapLibre prelude and the
        // chart-builder chain never block first paint. Deferred scripts still
        // execute in append order, after parsing but before DOMContentLoaded,
        // so the controllers' DOMContentLoaded init() finds every builder
        // already registered — same ordering guarantees as blocking <script>s.
        $defer = ['defer' => true];
        $asset = function ($path) use ($view) {
            return $view->assetUrl($path, 'DreVisualizations');
        };

        // Entity Network (MapLibre) block: a self-contained graph that needs the
        // MapLibre engine (already vendored for the module's maps) plus the theme
        // tokens from dashboard-core.js, but neither the ECharts prelude nor the
        // chart-builder chain. Hand the front end the MapLibre URL and load it on
        // demand through ns.ensureLibs (dashboard-core.js) — the SAME lazy loader
        // the dashboards use — so a page carrying BOTH a dashboard and this graph
        // loads MapLibre exactly once. Object.assign-merge into RV_LIBS so neither
        // block's entry shadows the other's, regardless of block order on the page.
        if (!empty($options['graph'])) {
            $headLink->appendStylesheet($asset('css/dre-visualizations.css'));
            $headScript->appendScript('window.RV_LIBS=Object.assign(' . json_encode([
                'maplibre'    => $asset(self::MAPLIBRE_JS),
                'maplibreCss' => $asset(self::MAPLIBRE_CSS),
            ], JSON_UNESCAPED_SLASHES) . ', window.RV_LIBS||{});');
            $headScript->appendFile($asset('js/dashboard-core.js'), 'text/javascript', $defer);
            // Chrome before controller: deferred scripts run in append order, so
            // entity-graph.js finds ns.egUI registered when its init() fires.
            foreach (self::ENTITY_GRAPH_SCRIPTS as $script) {
                $headScript->appendFile($asset($script), 'text/javascript', $defer);
            }
            return $this;
        }

        // Knowledge Graph block (item pages): the d3-force canvas renderer chain.
        // Deliberately NOT the ECharts prelude or the chart-builder bundle — the
        // graph needs neither, so an item page carrying just this block pulls
        // ~17 KiB of d3 instead of 1.1 MiB of ECharts.
        //
        // Module::addAssets has already emitted RV_LIBS and dashboard-core.js on
        // every item page (the only surface this block can appear on), but naming
        // them again costs nothing — Laminas de-duplicates a repeated script src,
        // and the RV_LIBS merge is idempotent — and it keeps the surface working if
        // the block is ever mounted somewhere that prelude does not run.
        //
        // The stylesheet is the one thing NOT repeated here: item pages inject it
        // through a media="print"→"all" swap to keep it off the critical render
        // path, and headLink cannot see that, so appending it would add a second,
        // render-blocking copy.
        if (!empty($options['knowledgeGraph'])) {
            $headScript->appendScript('window.RV_LIBS=Object.assign(' . json_encode([
                'd3' => array_map($asset, self::D3_SCRIPTS),
            ], JSON_UNESCAPED_SLASHES) . ', window.RV_LIBS||{});');
            $headScript->appendFile($asset('js/dashboard-core.js'), 'text/javascript', $defer);
            $graphScripts = array_merge(self::GRAPH_RENDERER_SCRIPTS, self::KNOWLEDGE_GRAPH_SCRIPTS);
            foreach ($graphScripts as $script) {
                $headScript->appendFile($asset($script), 'text/javascript', $defer);
            }
            return $this;
        }

        // Spatial Exploration block: the SAME MapLibre-only stack as the Entity
        // Network graph above (theme tokens from dashboard-core.js + ns.ensureLibs,
        // no ECharts prelude, no chart-builder chain), loading the spatial
        // controller instead. Object.assign-merge into RV_LIBS so a page carrying
        // this block AND a dashboard or graph loads MapLibre exactly once.
        if (!empty($options['spatial'])) {
            $headLink->appendStylesheet($asset('css/dre-visualizations.css'));
            $headScript->appendScript('window.RV_LIBS=Object.assign(' . json_encode([
                'maplibre'    => $asset(self::MAPLIBRE_JS),
                'maplibreCss' => $asset(self::MAPLIBRE_CSS),
            ], JSON_UNESCAPED_SLASHES) . ', window.RV_LIBS||{});');
            $headScript->appendFile($asset('js/dashboard-core.js'), 'text/javascript', $defer);
            $headScript->appendFile($asset('js/spatial-exploration.js'), 'text/javascript', $defer);
            return $this;
        }

        // Semantic Map block: one ECharts scatter and its own controller. Keep
        // the word-cloud, MapLibre, d3-force and dashboard builder bundle out of
        // this page; the controller lazy-loads ECharts when the block nears view.
        if (!empty($options['semanticMap'])) {
            $headLink->appendStylesheet($asset('css/dre-visualizations.css'));
            $headScript->appendScript('window.RV_LIBS=Object.assign(' . json_encode([
                'echarts' => $asset(self::ECHARTS_JS),
            ], JSON_UNESCAPED_SLASHES) . ', window.RV_LIBS||{});');
            $headScript->appendFile($asset('js/dashboard-core.js'), 'text/javascript', $defer);
            foreach (self::CONTROLLERS['semanticMap'] as $script) {
                $headScript->appendFile($asset($script), 'text/javascript', $defer);
            }
            return $this;
        }

        if ($cdn) {
            $headLink->appendStylesheet($asset('css/dre-visualizations.css'));
            if ($controller === 'dashboard') {
                // The default 'dashboard' surface (Collection Overview / Dashboard,
                // Publications) renders as a block on a content page, typically
                // below the fold. Rather than load the ~650 KiB ECharts/MapLibre
                // prelude here, hand the front end the library URLs; dashboard.js
                // injects them and renders only when the dashboard scrolls into
                // view (ns.ensureLibs + IntersectionObserver). dashboard-core.js
                // still loads (deferred) so the theme-token probe and watchers are
                // ready, but it pulls in no heavy library on its own.
                // Object.assign-merge (not ||) so an Entity Network graph block's
                // partial RV_LIBS on the same page can't shadow these (and vice-versa).
                $headScript->appendScript('window.RV_LIBS=Object.assign(' . json_encode([
                    'echarts'     => $asset(self::ECHARTS_JS),
                    'wordcloud'   => $asset(self::WORDCLOUD_JS),
                    'maplibre'    => $asset(self::MAPLIBRE_JS),
                    'maplibreCss' => $asset(self::MAPLIBRE_CSS),
                    // The co-occurrence networks (co-author, speakers) simulate with
                    // d3-force rather than an ECharts series. An ordered list: the
                    // loader executes it sequentially because d3-force resolves its
                    // dependencies off the shared `d3` global.
                    'd3'          => array_map($asset, self::D3_SCRIPTS),
                ], JSON_UNESCAPED_SLASHES) . ', window.RV_LIBS||{});');
                $headScript->appendFile($asset('js/dashboard-core.js'), 'text/javascript', $defer);
            } else {
                // Dedicated dashboard pages (compare / explorer / network /
                // whatsNew): the dashboard IS the page content and sits in the
                // viewport, so load the libraries eagerly (deferred) up front.
                // Their controllers render straight from their own fetch without
                // going through ns.ensureLibs, so d3 has to be here rather than
                // handed over as a URL — the Network Explorer's co-authorship tab
                // would otherwise find no simulation to build with.
                $headScript->appendFile($asset(self::ECHARTS_JS), 'text/javascript', $defer);
                $headScript->appendFile($asset(self::WORDCLOUD_JS), 'text/javascript', $defer);
                $headLink->appendStylesheet($asset(self::MAPLIBRE_CSS));
                $headScript->appendFile($asset(self::MAPLIBRE_JS), 'text/javascript', $defer);
                foreach (self::D3_SCRIPTS as $script) {
                    $headScript->appendFile($asset($script), 'text/javascript', $defer);
                }
                $headScript->appendFile($asset('js/dashboard-core.js'), 'text/javascript', $defer);
            }
        }

        // The d3-force renderer the co-occurrence network builders draw with. Before
        // the bundle, so ns.GraphCanvas / ns.ForceGraph / ns.graphChrome are
        // registered by the time a builder is called. De-duplicated by src, so an
        // item page carrying a knowledge graph as well loads each file once.
        foreach (self::GRAPH_RENDERER_SCRIPTS as $script) {
            $headScript->appendFile($asset($script), 'text/javascript', $defer);
        }

        $headScript->appendFile($asset(self::CHART_BUNDLE), 'text/javascript', $defer);

        if ($controller && isset(self::CONTROLLERS[$controller])) {
            foreach (self::CONTROLLERS[$controller] as $script) {
                $headScript->appendFile($asset($script), 'text/javascript', $defer);
            }
        }

        return $this;
    }
}
