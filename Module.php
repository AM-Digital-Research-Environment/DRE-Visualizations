<?php
declare(strict_types=1);
namespace DreVisualizations;

use DreVisualizations\Form\ConfigForm;
use DreVisualizations\Form\ConfigValues;
use DreVisualizations\Listener\EmbedFraming;
use DreVisualizations\Listener\SnapshotInvalidation;
use DreVisualizations\Service\CanonicalSite;
use Laminas\EventManager\SharedEventManagerInterface;
use Laminas\Mvc\Controller\AbstractController;
use Laminas\Mvc\MvcEvent;
use Laminas\ServiceManager\ServiceLocatorInterface;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Module\AbstractModule;
use Omeka\Permissions\Acl;

/**
 * Module wiring only: lifecycle hooks, configuration, ACL and listeners. The
 * behaviour lives in src/ (Listener\, Form\, Service\, Precompute\).
 */
class Module extends AbstractModule
{
    public const SETTING_SITE_ID = 'dre_visualizations_site_id';
    public const SETTING_BASEMAP_LIGHT = 'dre_visualizations_basemap_light';
    public const SETTING_BASEMAP_DARK = 'dre_visualizations_basemap_dark';
    public const SETTING_MAP_GLYPHS = 'dre_visualizations_map_glyphs';
    public const SETTING_BASEMAP_ATTRIBUTION = 'dre_visualizations_basemap_attribution';
    /** Lets the configuration page start the embeddings workflow; never rendered back. */
    public const SETTING_GITHUB_TOKEN = 'dre_visualizations_github_token';
    public const SETTINGS = [self::SETTING_SITE_ID, self::SETTING_BASEMAP_LIGHT, self::SETTING_BASEMAP_DARK,
        self::SETTING_MAP_GLYPHS, self::SETTING_BASEMAP_ATTRIBUTION, self::SETTING_GITHUB_TOKEN];

    private ?SnapshotInvalidation $invalidation = null;

    public function getConfig()
    {
        return include __DIR__ . '/config/module.config.php';
    }

    public function install(ServiceLocatorInterface $serviceLocator)
    {
        self::registerAutoloader();
        $connection = $serviceLocator->get('Omeka\Connection');
        $ids = $connection->executeQuery(
            'SELECT id FROM site WHERE is_public = 1 ORDER BY id ASC'
        )->fetchFirstColumn();
        if (count($ids) === 1) {
            $serviceLocator->get('Omeka\Settings')->set(self::SETTING_SITE_ID, (int) $ids[0]);
        }
        // A site whose item-page blocks were saved ignores the module default
        // (config resource_page_blocks_default): add the Visualisations there.
        Site\ResourcePagePlacement::repair($connection);
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
            SnapshotInvalidation::withdraw();
        }
        if (version_compare((string) $oldVersion, '2.38.0', '<')) {
            // Project dashboards live on the project item page, so the
            // Visualisations block must be there on every site, including those
            // whose saved Resource pages configuration predates it.
            Site\ResourcePagePlacement::repair($serviceLocator->get('Omeka\Connection'));
        }
    }

    public function uninstall(ServiceLocatorInterface $serviceLocator)
    {
        self::registerAutoloader();
        SnapshotInvalidation::withdraw();
        // Reclaim the generated data. The store directory itself stays: it may
        // be a mounted volume, and the tombstone keeps it fail-closed.
        $store = Precompute\SnapshotStore::tryDefault();
        $store?->locked(static function () use ($store): void {
            foreach (['generations', 'layout-cache'] as $dir) {
                if (is_dir($store->directory . '/' . $dir)) {
                    Precompute\SafeFilesystem::removeTree($store->directory . '/' . $dir, $store->directory);
                }
            }
        });
        $settings = $serviceLocator->get('Omeka\Settings');
        foreach (self::SETTINGS as $key) {
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
        $values = [];
        foreach (array_diff(self::SETTINGS, [self::SETTING_GITHUB_TOKEN]) as $key) {
            $values[$key] = (string) $settings->get($key, '');
        }
        $workflow = Precompute\EmbeddingWorkflow::fromServices($services);
        $form =new ConfigForm($services->get(CanonicalSite::class)->publicSiteOptions(), $values, $workflow->hasToken());
        $site = $services->get(CanonicalSite::class)->publicSite();
        return $renderer->render('dre-visualizations/config-form', [
            'form' => $form,
            'hasToken' => $workflow->hasToken(),
            'latest' => $workflow->latestRun(),
            'embeddings' => Controller\Admin\MaintenanceController::embeddingStatus(
                Precompute\SnapshotStore::tryDefault(), $site === null ? 0 : (int) $site['id']
            ),
        ]);
    }

    public function handleConfigForm(AbstractController $controller)
    {
        $services = $this->getServiceLocator();
        $post = $controller->getRequest()->getPost()->toArray();
        $siteId = is_scalar($post[self::SETTING_SITE_ID] ?? null) ? (int) $post[self::SETTING_SITE_ID] : 0;
        if (!$services->get(CanonicalSite::class)->isPublicSite($siteId)) {
            $controller->messenger()->addError('Select a public canonical site.'); // @translate
            return false;
        }
        $values = ConfigValues::fromPost($post);
        if (is_string($values)) {
            $controller->messenger()->addError($values);
            return false;
        }

        $settings = $services->get('Omeka\Settings');
        // A different site means a different public corpus: stop serving the old one.
        if ((int) $settings->get(self::SETTING_SITE_ID, 0) !== $values->siteId) SnapshotInvalidation::withdraw();
        $settings->set(self::SETTING_SITE_ID, $values->siteId);
        foreach ($values->settings as $key => $value) {
            $settings->set($key, $value);
        }
        if ($values->githubToken === '') {
            $settings->delete(self::SETTING_GITHUB_TOKEN);
        } elseif ($values->githubToken !== null) {
            $settings->set(self::SETTING_GITHUB_TOKEN, $values->githubToken);
        }

        if ($values->rebuild) {
            // The settings are saved whatever happens to the build.
            Controller\Admin\MaintenanceController::reportRebuild(
                $controller, Precompute\EmbeddingWorkflow::fromServices($services)->dispatch()
            );
        }
        return true;
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
        // null (all) role access to the site-facing embed and data controllers
        // only; the public site route itself still scopes them to a published site.
        $acl->allow(null, [Controller\Site\EmbedController::class, Controller\Site\DataController::class]);

        // Allow that widget to be framed cross-origin (slides, project sites, …).
        $event->getApplication()->getEventManager()->attach(MvcEvent::EVENT_FINISH, new EmbedFraming(), 100);
    }

    public function attachListeners(SharedEventManagerInterface $sharedEventManager)
    {
        // Mark the snapshot stale (or withdraw it, when a write makes something private)
        // before AND after writes, so an overlapping job cannot publish a mixed snapshot.
        $this->invalidation ??= new SnapshotInvalidation();
        foreach (SnapshotInvalidation::RESOURCES as $resource) {
            foreach (SnapshotInvalidation::OPERATIONS as $operation) {
                foreach (['pre', 'post'] as $phase) {
                    $sharedEventManager->attach('Omeka\\Api\\Adapter\\' . $resource . 'Adapter',
                        'api.' . $operation . '.' . $phase, $this->invalidation);
                }
            }
        }
        foreach (['Omeka\Controller\Site\Item', 'Omeka\Controller\Site\ItemSet'] as $controller) {
            $sharedEventManager->attach($controller, 'view.show.before', [$this, 'addAssets']);
        }
    }

    public function addAssets($event)
    {
        $event->getTarget()->dashboardAssets(['plan' => 'prelude']);
    }
}
