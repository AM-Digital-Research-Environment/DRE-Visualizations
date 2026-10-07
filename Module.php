<?php
declare(strict_types=1);
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
    /**
     * API request => shared source-write lock, released after the corresponding
     * write. Weak keys: when a write throws, `.post` never fires, but the request
     * object is freed with its caller, which frees the handle and so the lock.
     */
    private ?\WeakMap $sourceWriteLocks = null;
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

    public function upgrade($oldVersion, $newVersion, ServiceLocatorInterface $serviceLocator)
    {
        self::registerAutoloader();
        // A published snapshot keeps being served across upgrades unless this
        // version reads a different artifact schema; SnapshotStore::manifest()
        // rejects those by itself (see SnapshotPublisher::SCHEMA_VERSION).
        if (version_compare((string) $oldVersion, '2.29.0', '<')) {
            // Before 2.29.0 generated JSON lived under the public asset/data
            // directory and bypassed the manifest; nothing may serve it now.
            Precompute\LegacyPublicOutputs::purge(__DIR__ . '/asset/data');
            $this->withdrawSnapshots();
        }
    }

    public function uninstall(ServiceLocatorInterface $serviceLocator)
    {
        self::registerAutoloader();
        $this->withdrawSnapshots();
        // Reclaim the generated data. The store directory itself stays: it may
        // be a mounted volume, and the tombstone keeps it fail-closed.
        $store = Precompute\SnapshotStore::tryDefault();
        if ($store !== null) {
            $store->locked(static function () use ($store): void {
                foreach (['generations', 'layout-cache'] as $dir) {
                    if (is_dir($store->directory . '/' . $dir)) {
                        Precompute\SafeFilesystem::removeTree($store->directory . '/' . $dir, $store->directory);
                    }
                }
            });
        }
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

    /**
     * Omeka loads only active modules, yet runs upgrade() on a needs_upgrade
     * module and uninstall() on a deactivated one. There the src/ autoloader was
     * never registered (nor the module config merged), so register it before
     * touching any module class.
     */
    private static function registerAutoloader(): void
    {
        static $registered = false;
        if ($registered) return;
        $registered = true;
        spl_autoload_register(static function (string $class): void {
            $prefix = __NAMESPACE__ . '\\';
            if (!str_starts_with($class, $prefix)) return;
            $path = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($path)) require_once $path;
        });
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
        if ((int) $settings->get(self::SETTING_SITE_ID, 0) !== $siteId) $this->withdrawSnapshots();
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

    /**
     * Translated strings used by controls that JavaScript creates at runtime.
     *
     * Every key comes from config/client-strings.json, generated by `npm run
     * build` from each literal `ns.t('key', 'English')` / `ns.plural(...)` call
     * and the chart registry (scripts/lib/client-strings.mjs), so the list
     * cannot drift from the code: the English in the JavaScript is the source
     * text a translation catalog keys on. To change a wording, change it in the
     * JavaScript and rebuild; there is deliberately no server-side override
     * list, because one silently undid the 2.27.0 copy edit for every key it
     * named.
     */
    public static function clientTranslations($view): array
    {
        static $generated = null;
        if ($generated === null) {
            $data = json_decode((string) @file_get_contents(__DIR__ . '/config/client-strings.json'), true);
            $generated = is_array($data['strings'] ?? null) ? $data['strings'] : [];
        }
        $strings = [];
        foreach ($generated as $key => $english) {
            if (is_string($key) && is_string($english)) $strings[$key] = $view->translate($english);
        }
        return $strings;
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
        $acl->allow(null, [Controller\Site\EmbedController::class, Controller\Site\DataController::class]);

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
        // Invalidate before AND after writes, so an overlapping job cannot publish a mixed snapshot.
        foreach (['Item', 'Media', 'ItemSet', 'Site', 'ValueAnnotation', 'ResourceTemplate', 'Property', 'ResourceClass'] as $resource) {
            foreach (['create', 'update', 'delete', 'batch_create', 'batch_update', 'batch_delete'] as $operation) {
                foreach (['pre', 'post'] as $phase) {
                    $sharedEventManager->attach('Omeka\\Api\\Adapter\\' . $resource . 'Adapter',
                        'api.' . $operation . '.' . $phase, [$this, 'invalidateForApiWrite']);
                }
            }
        }
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

    public function withdrawSnapshots(): void
    {
        $store = $this->storeForWithdrawal();
        $store?->withdraw();
    }

    /**
     * The store a write must withdraw, or null when nothing was ever published
     * there. A missing or unwritable store with no publication cannot serve
     * stale data, so Omeka writes go through; a publication that cannot be
     * withdrawn still blocks them (the exception propagates).
     */
    private function storeForWithdrawal(): ?Precompute\SnapshotStore
    {
        try {
            return new Precompute\SnapshotStore(Precompute\SnapshotStore::defaultDirectory());
        } catch (\RuntimeException $e) {
            if (Precompute\SnapshotStore::hasPublicationAtDefaultPath()) throw $e;
            return null;
        }
    }

    public function invalidateForApiWrite($event): void
    {
        $store = $this->storeForWithdrawal();
        if ($store === null) return;
        $request = $event->getParam('request');
        if (!is_object($request)) {
            $store->withdraw();
            return;
        }
        $this->sourceWriteLocks ??= new \WeakMap();
        if (str_ends_with($event->getName(), '.pre')) {
            $this->sourceWriteLocks[$request] = $store->beginWrite();
        } elseif (isset($this->sourceWriteLocks[$request])) {
            $lock = $this->sourceWriteLocks[$request];
            unset($this->sourceWriteLocks[$request]);
            $store->endWrite($lock);
        } else {
            $store->withdraw();
        }
    }

    public function addAssets($event)
    {
        $event->getTarget()->dashboardAssets(['cdn' => true, 'controller' => '', 'preludeOnly' => true]);
    }
}
