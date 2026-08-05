<?php
namespace DreVisualizations;

use Laminas\Form\Element;
use Laminas\Form\Form;
use Omeka\Module\AbstractModule;
use Omeka\Permissions\Acl;
use Laminas\EventManager\SharedEventManagerInterface;
use Laminas\Mvc\MvcEvent;
use Laminas\Mvc\Controller\AbstractController;
use Laminas\ServiceManager\ServiceLocatorInterface;
use Laminas\View\Renderer\PhpRenderer;
use DreVisualizations\View\Helper\DashboardAssets;

class Module extends AbstractModule
{
    public const SETTING_SITE_ID = 'dre_visualizations_site_id';
    public const SETTING_BASEMAP_LIGHT = 'dre_visualizations_basemap_light';
    public const SETTING_BASEMAP_DARK = 'dre_visualizations_basemap_dark';
    public const SETTING_MAP_GLYPHS = 'dre_visualizations_map_glyphs';
    public const SETTING_BASEMAP_ATTRIBUTION = 'dre_visualizations_basemap_attribution';

    public function getConfig()
    {
        return include __DIR__ . '/config/module.config.php';
    }

    public function install(ServiceLocatorInterface $serviceLocator)
    {
        $ids = $serviceLocator->get('Omeka\Connection')->executeQuery(
            'SELECT id FROM site WHERE is_public = 1 ORDER BY id ASC'
        )->fetchFirstColumn();
        if (count($ids) === 1) {
            $serviceLocator->get('Omeka\Settings')->set(self::SETTING_SITE_ID, (int) $ids[0]);
        }
    }

    public function uninstall(ServiceLocatorInterface $serviceLocator)
    {
        $settings = $serviceLocator->get('Omeka\Settings');
        foreach ([
            self::SETTING_SITE_ID,
            self::SETTING_BASEMAP_LIGHT,
            self::SETTING_BASEMAP_DARK,
            self::SETTING_MAP_GLYPHS,
            self::SETTING_BASEMAP_ATTRIBUTION,
        ] as $key) {
            $settings->delete($key);
        }
    }

    public function getConfigForm(PhpRenderer $renderer)
    {
        $services = $this->getServiceLocator();
        $settings = $services->get('Omeka\Settings');
        $rows = $services->get('Omeka\Connection')->executeQuery(
            'SELECT id, title, slug FROM site WHERE is_public = 1 ORDER BY title ASC, id ASC'
        )->fetchAllNumeric();
        $options = [];
        foreach ($rows as $row) {
            $options[(int) $row[0]] = sprintf('%s (%s, #%d)', (string) $row[1], (string) $row[2], (int) $row[0]);
        }

        $form = new Form('dre-visualizations-config');
        $form->add([
            'name' => self::SETTING_SITE_ID,
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Canonical public site', // @translate
                'info' => 'Only public items assigned to this public site enter generated JSON. Regeneration fails closed until a site is selected.', // @translate
                'empty_option' => 'Select a public site', // @translate
                'value_options' => $options,
            ],
            'attributes' => [
                'id' => self::SETTING_SITE_ID,
                'value' => (string) $settings->get(self::SETTING_SITE_ID, ''),
                'required' => true,
            ],
        ]);
        foreach ([
            self::SETTING_BASEMAP_LIGHT => [
                'Light basemap style URL',
                'Optional HTTPS or same-origin MapLibre style JSON. Leave blank for the privacy-safe blank background.',
            ],
            self::SETTING_BASEMAP_DARK => [
                'Dark basemap style URL',
                'Optional HTTPS or same-origin MapLibre style JSON. The light style is used as a fallback when blank.',
            ],
            self::SETTING_MAP_GLYPHS => [
                'Map glyph URL template',
                'Optional HTTPS or same-origin MapLibre glyph template containing “{fontstack}” and “{range}”. Required for Entity Network labels.',
            ],
            self::SETTING_BASEMAP_ATTRIBUTION => [
                'Basemap attribution',
                'Required when a basemap URL is configured, but shown only when that style does not already credit its own sources. Most providers (CARTO included) do credit themselves, so this is normally an unused fallback rather than the text on the map.',
            ],
        ] as $name => [$label, $info]) {
            $form->add([
                'name' => $name,
                'type' => Element\Text::class,
                'options' => [
                    'label' => $label, // @translate
                    'info' => $info, // @translate
                ],
                'attributes' => [
                    'id' => $name,
                    'value' => (string) $settings->get($name, ''),
                ],
            ]);
        }

        return $renderer->render('dre-visualizations/config-form', ['form' => $form]);
    }

    public function handleConfigForm(AbstractController $controller)
    {
        $siteId = (int) $controller->getRequest()->getPost(self::SETTING_SITE_ID, 0);
        $connection = $this->getServiceLocator()->get('Omeka\Connection');
        $exists = (bool) $connection->executeQuery(
            'SELECT 1 FROM site WHERE id = ? AND is_public = 1',
            [$siteId]
        )->fetchOne();
        if (!$exists) {
            $controller->messenger()->addError('Select a public canonical site.'); // @translate
            return false;
        }
        $post = $controller->getRequest()->getPost();
        $light = trim((string) $post->get(self::SETTING_BASEMAP_LIGHT, ''));
        $dark = trim((string) $post->get(self::SETTING_BASEMAP_DARK, ''));
        $glyphs = trim((string) $post->get(self::SETTING_MAP_GLYPHS, ''));
        $attribution = trim((string) $post->get(self::SETTING_BASEMAP_ATTRIBUTION, ''));
        foreach ([$light, $dark, $glyphs] as $url) {
            if ($url !== '' && !$this->isAllowedBasemapUrl($url)) {
                $controller->messenger()->addError(
                    'Basemap styles must use HTTPS or a same-origin absolute path beginning with “/”.' // @translate
                );
                return false;
            }
        }
        if ($glyphs !== '' && (!str_contains($glyphs, '{fontstack}') || !str_contains($glyphs, '{range}'))) {
            $controller->messenger()->addError('The map glyph URL must contain “{fontstack}” and “{range}”.'); // @translate
            return false;
        }
        if (($light !== '' || $dark !== '' || $glyphs !== '') && $attribution === '') {
            $controller->messenger()->addError('Basemap attribution is required when a style URL is configured.'); // @translate
            return false;
        }

        $settings = $this->getServiceLocator()->get('Omeka\Settings');
        $settings->set(self::SETTING_SITE_ID, $siteId);
        $settings->set(self::SETTING_BASEMAP_LIGHT, $light);
        $settings->set(self::SETTING_BASEMAP_DARK, $dark);
        $settings->set(self::SETTING_MAP_GLYPHS, $glyphs);
        $settings->set(self::SETTING_BASEMAP_ATTRIBUTION, $attribution);
        return true;
    }

    private function isAllowedBasemapUrl(string $url): bool
    {
        if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
            return true;
        }
        return filter_var($url, FILTER_VALIDATE_URL) !== false
            && strtolower((string) parse_url($url, PHP_URL_SCHEME)) === 'https';
    }

    /** Translated strings used by controls that JavaScript creates at runtime. */
    public static function clientTranslations($view): array
    {
        return [
            'loading' => $view->translate('Loading…'),
            'loadingComparison' => $view->translate('Loading comparison…'),
            'noData' => $view->translate('No data'),
            'noVisualizationData' => $view->translate('No data available for this visualization.'),
            'noProjectData' => $view->translate('No data for this project.'),
            'projectLoadError' => $view->translate('Could not load this project.'),
            'saveImage' => $view->translate('Save as image'),
            'downloadCsv' => $view->translate('Download chart data as CSV'),
            'showPatterns' => $view->translate('Show patterns'),
            'hidePatterns' => $view->translate('Hide patterns'),
            'copyEmbed' => $view->translate('Copy embed code'),
            'copied' => $view->translate('Copied'),
            'resetView' => $view->translate('Reset view'),
            'searchEntities' => $view->translate('Search entities'),
            'close' => $view->translate('Close'),
            'previous' => $view->translate('Previous'),
            'next' => $view->translate('Next'),
            'series' => $view->translate('Series'),
            'category' => $view->translate('Category'),
            'value' => $view->translate('Value'),
            'locations' => $view->translate('Locations'),
            'origin' => $view->translate('Origin'),
            'currentLocation' => $view->translate('Current location'),

            // Knowledge graph (the d3-force canvas: graph-force.js + the kgUI chrome).
            'graphCanvasLabel' => $view->translate('Network graph. Use the arrow keys to move between connected entities and Enter to open one.'),
            'kgCanvasLabel' => $view->translate('Knowledge graph. Use the arrow keys to move between connected entities and Enter to select one.'),
            'kgHint' => $view->translate('Click an entity to focus it and name its connections; the panel that opens links to its record. Drag to rearrange — a dragged node stays where you put it (Alt-click to release). Double-click the background or Ctrl + scroll to zoom.'),
            'kgNoRelationships' => $view->translate('No relationships found.'),
            'kgLoadError' => $view->translate('Failed to load knowledge graph.'),
            'kgNoEngine' => $view->translate('Graph library failed to load.'),
            'kgListToggle' => $view->translate('Relationships as a list'),
            'kgFilters' => $view->translate('Toggle graph filters'),
            'kgFiltersTitle' => $view->translate('Filters'),
            'kgResetFilters' => $view->translate('Reset filters'),
            'kgMaxCommonality' => $view->translate('Max. commonality'),
            'kgMaxCommonalityHelp' => $view->translate('Hide connections through resources shared by too many items'),
            'kgMinStrength' => $view->translate('Min. connection strength'),
            'kgMinStrengthHelp' => $view->translate('Only show shared items with strong distinctive links'),
            'kgMaxNeighbours' => $view->translate('Max. neighbours'),
            'kgMaxNeighboursHelp' => $view->translate('Limit the number of visible nodes'),
            'kgLabelsLabel' => $view->translate('Show every label'),
            'kgLabelsTitle' => $view->translate('Show every label — otherwise labels are placed where they fit'),
            'kgHalosLabel' => $view->translate('Toggle community colours'),
            'kgHalosTitle' => $view->translate('Community colours — rings group entities that co-occur'),
            'kgFreezeLabel' => $view->translate('Freeze the layout'),
            'kgFreezeTitle' => $view->translate('Freeze the layout — stops the nodes settling'),
            'kgResumeLabel' => $view->translate('Resume the layout'),
            'kgUnpinLabel' => $view->translate('Release all pinned nodes'),
            'kgUnpinTitle' => $view->translate('Release every node you dragged'),
            'kgConnection' => $view->translate('connection in view'),
            'kgConnections' => $view->translate('connections in view'),
            'kgSharedBy' => $view->translate('Shared by'),
            'kgOfItems' => $view->translate('of items'),
            'kgResourceSharedBy' => $view->translate('Resource shared by'),
            'kgSharedLink' => $view->translate('shared link'),
            'kgSharedLinks' => $view->translate('shared links'),
            'kgStrength' => $view->translate('strength'),
            'kgPinnedHint' => $view->translate('Pinned — Alt-click to release'),
            'kgClickToFocus' => $view->translate('Click to focus'),
            'kgEnterToOpen' => $view->translate('Press Enter to select.'),
            'kgOpenRecord' => $view->translate('Open this record'),
            'kgVia' => $view->translate('Connected via'),
            'kgEdgeLabelsLabel' => $view->translate('Name every connection'),
            'kgEdgeLabelsTitle' => $view->translate('Name every connection — otherwise only the selected entity’s are named'),

            // Co-occurrence networks (the co-author and speaker graphs, which share
            // the d3-force renderer with the knowledge graph above).
            'communitiesCanvasLabel' => $view->translate('Co-occurrence network. Use the arrow keys to move between connected people and Enter to select one.'),
            'communitiesHint' => $view->translate('Click a person to focus their collaborators; the panel that opens links to their record. Toggle a cluster in the legend to isolate it. Drag to rearrange — a dragged node stays where you put it (Alt-click to release). Double-click the background or Ctrl + scroll to zoom.'),
            'community' => $view->translate('Community'),
            'relCoauthor' => $view->translate('Co-authorship'),
            'relMixed' => $view->translate('Author–editor'),
            'relCoeditor' => $view->translate('Co-editorship'),
            'relationship' => $view->translate('Relationship'),
            'roleAuthor' => $view->translate('author'),
            'roleEditor' => $view->translate('editor'),
            'roleBoth' => $view->translate('author & editor'),
            'externalName' => $view->translate('external name'),
            'publications' => $view->translate('publications'),
            'items' => $view->translate('items'),
            'shared' => $view->translate('shared'),
            'source' => $view->translate('Source'),
            'target' => $view->translate('Target'),

            // Entity Network (Discursive Communities) chrome.
            'degCanvasLabel' => $view->translate('Entity co-occurrence network. Use the arrow keys to move between connected entities and Enter to select one.'),
            'degEnterToSelect' => $view->translate('Press Enter to select.'),
            'degListToggle' => $view->translate('Entities as a list'),
            'degCluster' => $view->translate('Cluster'),
            'degAllClusters' => $view->translate('All'),
            'degCsvTitle' => $view->translate('Download the visible entities as CSV'),
            'degLabel' => $view->translate('Entity'),
            'degLink' => $view->translate('link'),
            'degLinks' => $view->translate('links'),
            'degSection' => $view->translate('Section'),
            'degUrl' => $view->translate('URL'),
            'degMultipleSections' => $view->translate('Multiple sections'),
            'fullscreen' => $view->translate('Fullscreen'),
            'exitFullscreen' => $view->translate('Exit fullscreen'),
            'item' => $view->translate('item'),
            'language' => $view->translate('Language'),
            'words' => $view->translate('Words'),
            'langAll' => $view->translate('All'),
            'langEnglish' => $view->translate('English'),
            'langFrench' => $view->translate('French'),
            'langGerman' => $view->translate('German'),
            'langPortuguese' => $view->translate('Portuguese'),
            'semanticColorBy' => $view->translate('Colour by'),
            'semanticType' => $view->translate('Resource type'),
            'semanticCluster' => $view->translate('Semantic cluster'),
            'semanticSearch' => $view->translate('Find a record on the map'),
            'semanticSearchPlaceholder' => $view->translate('Search titles'),
            'semanticMapAria' => $view->translate('Semantic map of public collection records. Nearby points have similar metadata and descriptions.'),
            'semanticLowSignal' => $view->translate('Faint points have too little descriptive metadata for recommendations.'),
            'semanticLoadError' => $view->translate('The semantic map is not available yet. Run the embeddings workflow and try again.'),
            'semanticNoSearchResults' => $view->translate('No matching records.'),
            'semanticSimilarity' => $view->translate('similar'),
            'semanticMapTitle' => $view->translate('Semantic map'),
            'semanticMapIntro' => $view->translate('Nearby records use similar language, subjects, places, and descriptions. The map joins every resource type in one multilingual space.'),
            'semanticSharedSpace' => $view->translate('Shared semantic space'),
            'semanticRecords' => $view->translate('records'),
            'semanticLowSignalCount' => $view->translate('low-signal'),
        ];
    }

    public function onBootstrap(MvcEvent $event)
    {
        parent::onBootstrap($event);

        // Let editors and admins reach the maintenance / regenerate page.
        // The /admin/ parent route already enforces authentication; this just
        // narrows which logged-in roles pass the controller ACL check.
        $acl = $event->getApplication()->getServiceManager()->get('Omeka\Acl');
        $acl->allow(
            [Acl::ROLE_EDITOR, Acl::ROLE_SITE_ADMIN, Acl::ROLE_GLOBAL_ADMIN],
            [Controller\Admin\MaintenanceController::class]
        );

        // The embed endpoint is served into third-party pages via <iframe>, so it
        // must be reachable by everyone — including anonymous visitors. Grant the
        // null (all) role access to the site-facing embed controller only; the
        // public site route itself still scopes it to a published site.
        $acl->allow(null, [Controller\Site\EmbedController::class]);

        // Allow that widget to be framed cross-origin (slides, project sites, …):
        // on the /dre-embed routes only, swap the site's X-Frame-Options for a
        // permissive CSP frame-ancestors. See relaxEmbedFraming().
        $event->getApplication()->getEventManager()->attach(
            MvcEvent::EVENT_FINISH,
            [$this, 'relaxEmbedFraming'],
            100
        );
    }

    /**
     * Replace X-Frame-Options with a permissive CSP frame-ancestors on the
     * /dre-embed routes, so the public, read-only widget can be framed on other
     * origins. X-Frame-Options only understands DENY / SAMEORIGIN — it cannot
     * allowlist origins — which is why the CSP frame-ancestors form is needed.
     *
     * Effective only when the header is set by Omeka/PHP. If the reverse proxy
     * (nginx) adds `X-Frame-Options ... always`, that overrides PHP and must be
     * relaxed for the /dre-embed path there too — but this CSP is then already in
     * place, so only the X-Frame-Options removal is left to do at the proxy.
     */
    public function relaxEmbedFraming(MvcEvent $event)
    {
        $match = $event->getRouteMatch();
        if (!$match || strpos((string) $match->getMatchedRouteName(), 'site/dre-embed') !== 0) {
            return;
        }
        $response = $event->getResponse();
        if (!$response instanceof \Laminas\Http\Response) {
            return;
        }
        $headers = $response->getHeaders();
        $xfo = $headers->get('X-Frame-Options');
        if ($xfo) {
            foreach (($xfo instanceof \Traversable ? iterator_to_array($xfo) : [$xfo]) as $header) {
                $headers->removeHeader($header);
            }
        }
        // Public read-only widget — any parent may frame it. Swap in an explicit
        // allowlist (e.g. "frame-ancestors 'self' https://slides.example") here if
        // embedding should ever be restricted.
        $headers->addHeaderLine('Content-Security-Policy', 'frame-ancestors *');
    }

    public function attachListeners(SharedEventManagerInterface $sharedEventManager)
    {
        $sharedEventManager->attach(
            'Omeka\Controller\Site\Item',
            'view.show.before',
            [$this, 'addAssets']
        );
        $sharedEventManager->attach(
            'Omeka\Controller\Site\ItemSet',
            'view.show.before',
            [$this, 'addAssets']
        );
    }

    public function addAssets($event)
    {
        $view = $event->getTarget();
        $asset = function ($path) use ($view) {
            return $view->assetUrl($path, 'DreVisualizations');
        };

        $view->headScript()->appendScript('window.RV_MAP_CONFIG=Object.assign('
            . json_encode([
                'lightStyle' => (string) $view->setting(self::SETTING_BASEMAP_LIGHT, ''),
                'darkStyle' => (string) $view->setting(self::SETTING_BASEMAP_DARK, ''),
                'glyphs' => (string) $view->setting(self::SETTING_MAP_GLYPHS, ''),
                'attribution' => (string) $view->setting(self::SETTING_BASEMAP_ATTRIBUTION, ''),
            ], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
            . ',window.RV_MAP_CONFIG||{});');

        // One translated client dictionary for labels created after page load.
        // Server-rendered loading states already use translate() in their views.
        $view->headScript()->appendScript('window.RV_I18N=Object.assign('
            . json_encode(self::clientTranslations($view),
                JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
            . ',window.RV_I18N||{});');

        // dre-visualizations.css styles the (below-the-fold) viz blocks and their
        // loading spinner. Inject it non-render-blocking via the media="print"→
        // "all" swap so it never sits on the item page's critical render path.
        // The viz blocks need JS to render anyway, so a JS-gated stylesheet costs
        // no real no-script fallback.
        $cssHref = json_encode($asset('css/dre-visualizations.css'), JSON_UNESCAPED_SLASHES);
        $view->headScript()->appendScript(
            '(function(){var l=document.createElement("link");l.rel="stylesheet";'
            . 'l.media="print";l.href=' . $cssHref . ';'
            . 'l.onload=function(){this.onload=null;this.media="all";};'
            . 'document.head.appendChild(l);})();'
        );

        // Hand the heavy library URLs to the front end instead of eager-loading
        // ~660 KiB of ECharts + MapLibre on every item/item-set page. The viz
        // controllers (dashboard.js, knowledge-graph.js, sibling-sparkline.js)
        // call ns.ensureLibs() to pull them in only when a block actually needs
        // to render — on scroll into view, or once an async block resolves as
        // applicable. Mirrors the lazy 'dashboard' surface in DashboardAssets.
        $view->headScript()->appendScript('window.RV_LIBS=window.RV_LIBS||' . json_encode([
            'echarts'        => $asset(DashboardAssets::ECHARTS_JS),
            'wordcloud'      => $asset(DashboardAssets::WORDCLOUD_JS),
            'maplibre'       => $asset(DashboardAssets::MAPLIBRE_JS),
            'maplibreWorker' => $asset(DashboardAssets::MAPLIBRE_WORKER_JS),
            'maplibreCss'    => $asset(DashboardAssets::MAPLIBRE_CSS),
            // The knowledge graph simulates with d3-force instead of ECharts, so
            // an item page carrying only that block pulls ~17 KiB rather than the
            // 1.1 MiB ECharts bundle. An ordered list: the loader executes it
            // sequentially because d3-force needs its deps on the `d3` global.
            'd3'             => array_map($asset, DashboardAssets::D3_SCRIPTS),
        ], JSON_UNESCAPED_SLASHES) . ';');

        // dashboard-core.js defines ns.ensureLibs + the shared chart helpers;
        // deferred so it never blocks first paint, and it pulls in no heavy
        // library on its own. Blocks append their builder chain (and controller)
        // after it via the DashboardAssets helper; deferred scripts run in append
        // order, so the registry is built before any controller's init() fires.
        $view->headScript()->appendFile(
            $asset('js/dashboard-core.js'), 'text/javascript', ['defer' => true]
        );
    }
}
