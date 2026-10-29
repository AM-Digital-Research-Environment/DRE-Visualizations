<?php
declare(strict_types=1);
/**
 * The module inside a real Omeka S, against a real MariaDB: the one place the
 * other suites cannot reach. They declare the classes against Omeka's core
 * (check-module-contract.php), stub its plugins (CoreContractsTest) and read a
 * SQLite slice of its schema (DatabaseTest); none of them boots the
 * application, lets Omeka's own ModuleManager run the lifecycle hooks, or runs
 * the precompute's SQL against the server it meets in production.
 *
 *   php tests/integration/OmekaBootTest.php <omeka-root>
 *
 * runs each phase in a fresh process, because Omeka decides a module's state
 * (not installed, active, needs upgrade) once, at bootstrap:
 *
 *   omeka      Omeka installs itself on the empty database with its own
 *              Installer (schema, migrations, default vocabularies, first user,
 *              settings), as its install screen does.
 *   install    seed a public site, two linked items and saved item-page blocks
 *              through Omeka's API, then install the module with the
 *              ModuleManager: install() picks the only public site as canonical
 *              and places the Visualisations block in the saved item page.
 *   boot       the active module's services, routes (through the real
 *              ModuleRouteListener, which is what turned a matched dre-embed
 *              route into a themed 404 in 2.12.0) and controllers; the loader's
 *              SQL against MySQL; one regeneration job, run synchronously;
 *              then every page-block layout rendered on a seeded page and every
 *              item-page block on the seeded item.
 *   rewind     wind the installed version back to 2.28.0 and unplace the block.
 *   upgrade    the ModuleManager upgrade: the 2.29 withdrawal and the 2.38
 *              placement both run.
 *   uninstall  the ModuleManager uninstall: settings and generations go.
 *
 * Needs: OMEKA_ROOT's config/database.ini pointing at an empty database,
 * the module at modules/DreVisualizations, and DRE_VISUALIZATIONS_DATA_DIR set
 * outside the Omeka root. CI provides all three (.github/workflows/ci.yml,
 * job omeka-boot). EXPECTED_OMEKA_VERSION / EXPECTED_PHP_SERIES, when set, must
 * match what actually booted.
 */

use DreVisualizations\Job\PrecomputeDashboards;
use DreVisualizations\Module;
use DreVisualizations\Precompute\DataLoader;
use DreVisualizations\Precompute\SnapshotStore;
use DreVisualizations\Site\PublishedData;
use DreVisualizations\Site\ResourcePagePlacement;
use Laminas\Http\PhpEnvironment\Request;
use Laminas\Mvc\MvcEvent;
use Omeka\Entity\Job;
use Omeka\Module\Manager as ModuleManager;

const PHASES = ['omeka', 'install', 'boot', 'rewind', 'upgrade', 'uninstall'];
const MODULE_ID = 'DreVisualizations';
const SITE_SLUG = 'boot-test';
const PAGE_SLUG = 'all-blocks';
const REWIND_TO = '2.28.0';

$omeka = rtrim($argv[1] ?? (string) getenv('OMEKA_ROOT'), '/\\');
$phase = $argv[2] ?? null;
if ($omeka === '' || !is_file($omeka . '/bootstrap.php')) {
    fwrite(STDERR, "Usage: php tests/integration/OmekaBootTest.php <omeka-root>\n");
    exit(2);
}
if ($phase === null) {
    foreach (PHASES as $name) {
        echo "== $name\n";
        passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' '
            . escapeshellarg($omeka) . ' ' . $name, $status);
        if ($status !== 0) {
            fwrite(STDERR, "Omeka boot test failed in the $name phase.\n");
            exit(1);
        }
    }
    echo "Omeka boot integration passed.\n";
    exit(0);
}
if (!in_array($phase, PHASES, true)) {
    fwrite(STDERR, "Unknown phase: $phase\n");
    exit(2);
}

// tests/lib/strict-errors.php ignores only deprecations raised under vendor/.
// A booted Omeka also runs its own application/ code, whose deprecations on a
// newer PHP are not this module's either; everything else fails the run, and
// so does any diagnostic raised from the module's own files.
$moduleRoot = str_replace('\\', '/', (string) realpath($omeka . '/modules/' . MODULE_ID));
error_reporting(E_ALL);
set_error_handler(static function (int $severity, string $message, string $file, int $line) use ($moduleRoot): bool {
    if (!(error_reporting() & $severity)) return false;
    $ours = $moduleRoot !== '' && str_starts_with(str_replace('\\', '/', $file), $moduleRoot . '/');
    if (($severity & (E_DEPRECATED | E_USER_DEPRECATED)) && !$ours) return true;
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$check = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
    echo "ok: $message\n";
};

require $omeka . '/bootstrap.php';
$application = \Omeka\Mvc\Application::init(require $omeka . '/application/config/application.config.php');
$services = $application->getServiceManager();
// No one is logged in on the command line: let every privilege through, as an
// administrator's would be, so the API and the ModuleManager act.
$services->get('Omeka\Acl')->allow();

if ($phase === 'omeka') {
    $expected = trim((string) getenv('EXPECTED_OMEKA_VERSION'));
    if ($expected !== '') $check(\Omeka\Module::VERSION === $expected, "Omeka S $expected booted");
    $series = trim((string) getenv('EXPECTED_PHP_SERIES'));
    if ($series !== '') $check(PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION === $series, "PHP $series is running");
    // The module manager is what records whether Omeka is installed.
    $services->get('Omeka\ModuleManager');
    $check(!$services->get('Omeka\Status')->isInstalled(), 'The database starts empty');
    // The install screen's form, filled in. The administrator never logs in:
    // the password is random and not kept.
    $installer = $services->get('Omeka\Installer');
    $installer->registerVars('Omeka\Installation\Task\CreateFirstUserTask', [
        'name' => 'Boot test', 'email' => 'boot-test@example.com',
        'password-confirm' => ['password' => bin2hex(random_bytes(16))],
    ]);
    $installer->registerVars('Omeka\Installation\Task\AddDefaultSettingsTask', [
        'administrator_email' => 'boot-test@example.com', 'installation_title' => 'DRE Visualizations boot test',
        'time_zone' => 'UTC', 'locale' => 'en_US',
    ]);
    $installed = $installer->install();
    if (!$installed) echo implode("\n", $installer->getErrors()) . "\n";
    $check($installed, 'Omeka S installs itself with its own Installer');
    echo "Phase omeka passed.\n";
    exit(0);
}

$modules = $services->get('Omeka\ModuleManager');
$module = $modules->getModule(MODULE_ID);
$check($module !== null, 'Omeka finds the module in modules/' . MODULE_ID);
$api = $services->get('Omeka\ApiManager');
$connection = $services->get('Omeka\Connection');
$settings = $services->get('Omeka\Settings');

/** The seeded site, page and items, by slug and title. */
$fixture = static function () use ($api): array {
    $site = $api->read('sites', ['slug' => SITE_SLUG])->getContent();
    $items = [];
    foreach ($api->search('items', ['site_id' => $site->id(), 'sort_by' => 'id'])->getContent() as $item) {
        $items[$item->displayTitle()] = $item;
    }
    return [$site, $items];
};

/** The Visualisations block's state in the site's saved item-page configuration. */
$placement = static fn (int $siteId): string => ResourcePagePlacement::states($connection)[$siteId] ?? 'unknown';

switch ($phase) {
    case 'install':
        $check($module->getState() === ModuleManager::STATE_NOT_INSTALLED, 'The module starts not installed');

        $site = $api->create('sites', [
            'o:slug' => SITE_SLUG, 'o:title' => 'Boot test', 'o:theme' => 'default', 'o:is_public' => true,
        ])->getContent();
        $property = static fn (string $term): int => $api->search('properties', ['term' => $term])->getContent()[0]->id();
        $title = $property('dcterms:title');
        $subject = $api->create('items', [
            'o:is_public' => true, 'o:site' => [['o:id' => $site->id()]],
            'dcterms:title' => [['type' => 'literal', 'property_id' => $title, '@value' => 'Boot test subject']],
        ])->getContent();
        $api->create('items', [
            'o:is_public' => true, 'o:site' => [['o:id' => $site->id()]],
            'dcterms:title' => [['type' => 'literal', 'property_id' => $title, '@value' => 'Boot test work']],
            'dcterms:subject' => [['type' => 'resource', 'property_id' => $property('dcterms:subject'),
                'value_resource_id' => $subject->id()]],
        ]);
        // An administrator saved the Resource pages screen once, before the
        // module existed: Omeka now ignores the module's default placement.
        $siteSettings = $services->get('Omeka\Settings\Site');
        $siteSettings->setTargetId($site->id());
        $siteSettings->set('theme_settings_default', ['resource_page_blocks' => ['items' => ['main' => ['values', 'linkedResources']]]]);
        $check($placement($site->id()) === ResourcePagePlacement::STATE_MISSING, 'The saved item page lacks the Visualisations block');

        $modules->install($module);
        $check($module->getState() === ModuleManager::STATE_ACTIVE, 'The ModuleManager installs and activates the module');
        $check((int) $settings->get(Module::SETTING_SITE_ID) === $site->id(), 'install() takes the only public site as canonical');
        $check($placement($site->id()) === ResourcePagePlacement::STATE_PRESENT, 'install() places the block in the saved item page');
        break;

    case 'boot':
        $check($module->getState() === ModuleManager::STATE_ACTIVE, 'The installed module boots active');
        $check($module->getIni('version') === $module->getDb('version'), 'module.ini and the installed version agree');
        $check($services->get('ModuleManager')->getModule(MODULE_ID) instanceof Module, 'Laminas loads the module class');
        [$site, $items] = $fixture();
        $check(count($items) === 2, 'The seeded site and items read back through the API');

        // Routes, resolved the way a request is: the match, then the real
        // ModuleRouteListener, then the controller manager.
        $router = $services->get('Router');
        $routeListener = $services->get('ModuleRouteListener');
        $controllers = $services->get('ControllerManager');
        foreach ([
            '/s/' . SITE_SLUG . '/dre-data/current.json' => 'site/dre-data',
            '/s/' . SITE_SLUG . '/dre-basemap/light' => 'site/dre-basemap',
            '/s/' . SITE_SLUG . '/dre-embed' => 'site/dre-embed',
            '/s/' . SITE_SLUG . '/dre-embed/collection-overview' => 'site/dre-embed/block',
            '/admin/dre-visualizations/maintenance' => 'admin/dre-visualizations/maintenance',
        ] as $path => $routeName) {
            $request = new Request();
            $request->setUri('https://example.test' . $path);
            $match = $router->match($request);
            $check($match !== null && $match->getMatchedRouteName() === $routeName, "$path matches $routeName");
            $event = new MvcEvent();
            $event->setRouteMatch($match);
            $routeListener->onRoute($event);
            $controller = (string) $match->getParam('controller');
            $check($controllers->has($controller), "$path dispatches to a registered controller ($controller)");
        }

        // The loader's queries against the real schema on the real server.
        $corpus = (new DataLoader($connection, $site->id()))->load();
        $check(count($corpus->items) === 2, 'DataLoader reads the public items of the site from MariaDB');

        // A page carrying every page-block layout the module registers. Written
        // before the regeneration: once a snapshot is published, a write would
        // queue an automatic refresh when this process ends.
        $layouts = $services->get('Omeka\BlockLayoutManager');
        $names = [];
        foreach ($services->get('Config')['block_layouts'] ?? [] as $kind => $entries) {
            if (!in_array($kind, ['invokables', 'factories'], true)) continue;
            foreach ($entries as $name => $class) {
                if (str_starts_with((string) $class, 'DreVisualizations\\')) $names[] = $name;
            }
        }
        $check(count($names) >= 10, count($names) . ' page-block layouts are registered');
        foreach ($names as $name) {
            $check(str_starts_with(get_class($layouts->get($name)), 'DreVisualizations\\'), "$name resolves to the module's layout");
        }
        // Pages saved before the dre prefix keep their old layout names.
        foreach ($services->get('Config')['block_layouts']['aliases'] ?? [] as $alias => $target) {
            if (!in_array($target, $names, true)) continue;
            $check(get_class($layouts->get($alias)) === get_class($layouts->get($target)), "The saved name $alias still resolves to $target");
        }
        $api->create('site_pages', [
            'o:site' => ['o:id' => $site->id()], 'o:slug' => PAGE_SLUG, 'o:title' => 'Every block', 'o:is_public' => true,
            'o:block' => array_map(static fn (string $name): array => ['o:layout' => $name, 'o:data' => []], $names),
        ]);

        // Regenerate now, as the maintenance page does, but in this process.
        $job = $services->get('Omeka\Job\Dispatcher')->dispatch(
            PrecomputeDashboards::class, null, $services->get('Omeka\Job\DispatchStrategy\Synchronous'));
        if ($job->getStatus() !== Job::STATUS_COMPLETED) echo $job->getLog() . "\n";
        $check($job->getStatus() === Job::STATUS_COMPLETED, 'The regeneration job completes against MariaDB');
        $store = SnapshotStore::tryDefault();
        $check($store !== null && $store->manifest() !== null, 'The regeneration publishes a snapshot');

        $renderer = $services->get('ViewRenderer');
        $services->get('ViewHelperManager')->get('currentSite')->setSite($site);
        $services->get('Omeka\Settings\Site')->setTargetId($site->id());
        $page = $api->read('site_pages', ['site' => $site->id(), 'slug' => PAGE_SLUG])->getContent();
        $check(count($page->blocks()) === count($names), 'The page hydrates one block per layout');
        $rendered = 0;
        foreach ($page->blocks() as $block) {
            $html = $layouts->get($block->layout())->render($renderer, $block);
            $check(is_string($html), $block->layout() . ' renders');
            if (trim($html) !== '') $rendered++;
        }
        $check($rendered > 0, "$rendered page blocks render markup");

        $itemLayouts = $services->get('Omeka\ResourcePageBlockLayoutManager');
        $work = $items['Boot test work'];
        foreach ($services->get('Config')['resource_page_block_layouts'] ?? [] as $kind => $entries) {
            if (!in_array($kind, ['invokables', 'factories'], true)) continue;
            foreach ($entries as $name => $class) {
                if (!str_starts_with((string) $class, 'DreVisualizations\\')) continue;
                $layout = $itemLayouts->get($name);
                if (!in_array('items', $layout->getCompatibleResourceNames(), true)) continue;
                $check(is_string($layout->render($renderer, $work)), "$name renders on an item page");
            }
        }
        $graph = 'knowledge-graphs/' . $work->id() . '.json';
        if (PublishedData::has($graph)) {
            $html = $itemLayouts->get('dreKnowledgeGraph')->render($renderer, $work);
            $check(str_contains($html, 'knowledge-graph'), 'The published knowledge graph mounts its block on the item page');
        } else {
            echo "note: no $graph in this snapshot; the knowledge-graph markup was not checked\n";
        }
        break;

    case 'rewind':
        [$site] = $fixture();
        $connection->executeStatement('UPDATE module SET version = ? WHERE id = ?', [REWIND_TO, MODULE_ID]);
        $siteSettings = $services->get('Omeka\Settings\Site');
        $siteSettings->setTargetId($site->id());
        $siteSettings->set('theme_settings_default', ['resource_page_blocks' => ['items' => ['main' => ['values']]]]);
        $check($placement($site->id()) === ResourcePagePlacement::STATE_MISSING, 'The block is unplaced again');
        break;

    case 'upgrade':
        [$site] = $fixture();
        $check($module->getState() === ModuleManager::STATE_NEEDS_UPGRADE, 'A ' . REWIND_TO . ' install needs an upgrade');
        $check(SnapshotStore::tryDefault()?->manifest() !== null, 'A snapshot is published before the upgrade');
        $modules->upgrade($module);
        $check($module->getState() === ModuleManager::STATE_ACTIVE, 'The ModuleManager upgrades the module and keeps it active');
        $installed = $connection->fetchOne('SELECT version FROM module WHERE id = ?', [MODULE_ID]);
        $check($installed === $module->getIni('version'), "The installed version is now $installed");
        $check(SnapshotStore::tryDefault()?->manifest() === null, 'Upgrading from before 2.29 withdraws the publication');
        $check($placement($site->id()) === ResourcePagePlacement::STATE_PRESENT, 'Upgrading through 2.38 places the block again');
        break;

    case 'uninstall':
        $check($module->getState() === ModuleManager::STATE_ACTIVE, 'The upgraded module boots active');
        $store = SnapshotStore::tryDefault();
        $modules->uninstall($module);
        $check($module->getState() === ModuleManager::STATE_NOT_INSTALLED, 'The ModuleManager uninstalls the module');
        $check($connection->fetchOne('SELECT COUNT(*) FROM module WHERE id = ?', [MODULE_ID]) == 0, 'The module row is gone');
        foreach (Module::SETTINGS as $key) {
            $check($connection->fetchOne('SELECT COUNT(*) FROM setting WHERE id = ?', [$key]) == 0, "Setting $key is removed");
        }
        $check($store === null || !is_dir($store->directory . '/generations'), 'Uninstalling removes the generated data');
        break;
}
echo "Phase $phase passed.\n";
