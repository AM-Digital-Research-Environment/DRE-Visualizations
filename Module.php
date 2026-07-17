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
use Laminas\View\Model\ViewModel;
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

    public function getConfigForm(ViewModel $view)
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
                'Required when a basemap URL is configured. Enter plain text such as “© OpenStreetMap contributors”.',
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

        $view->setVariable('form', $form);
        return $services->get('ViewRenderer')->render(
            $view->setTemplate('dre-visualizations/config-form')
        );
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
            'echarts'     => $asset(DashboardAssets::ECHARTS_JS),
            'wordcloud'   => $asset(DashboardAssets::WORDCLOUD_JS),
            'maplibre'    => $asset(DashboardAssets::MAPLIBRE_JS),
            'maplibreCss' => $asset(DashboardAssets::MAPLIBRE_CSS),
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
