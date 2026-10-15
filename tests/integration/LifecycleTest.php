<?php
declare(strict_types=1);
// Omeka loads only active modules, yet calls upgrade() on a needs_upgrade module
// and uninstall() on a deactivated one: no module autoloader, no merged config.
// Reproduce exactly that — Omeka's vendor, never tests/bootstrap.php — once per
// hook in a fresh process, against a disposable copy because upgrade() purges the
// module's own asset/data.
$omeka = rtrim($argv[1] ?? (string) getenv('OMEKA_ROOT'), '/\\');
$hook = $argv[2] ?? null;
if ($hook === null) {
    $failed = false;
    foreach (['upgrade', 'upgrade-compatible', 'uninstall'] as $name) {
        passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' '
            . escapeshellarg($omeka) . ' ' . $name, $status);
        $failed = $failed || $status !== 0;
    }
    if (!$failed) echo "Unloaded lifecycle hooks passed.\n";
    exit($failed ? 1 : 0);
}
require $omeka . '/vendor/autoload.php';
// Warnings fail the run here too; this harness deliberately skips bootstrap.php.
require __DIR__ . '/../lib/strict-errors.php';

$check = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
    echo "ok: $message\n";
};
$put = static function (string $path, string $content = '{}'): void {
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0777, true);
    file_put_contents($path, $content);
};
$root = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . '/dre-lifecycle-' . bin2hex(random_bytes(6));
$moduleDir = $tmp . '/DreVisualizations';
try {
    $put($moduleDir . '/Module.php', (string) file_get_contents($root . '/Module.php'));
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root . '/src', FilesystemIterator::SKIP_DOTS)) as $file) {
        $put($moduleDir . '/src/' . substr($file->getPathname(), strlen($root . '/src/')), (string) file_get_contents($file->getPathname()));
    }
    putenv('DRE_VISUALIZATIONS_DATA_DIR=' . $tmp . '/store');
    $check(!class_exists('DreVisualizations\Precompute\SnapshotStore'), 'Module classes start unloaded before ' . $hook . '(), as in Omeka');
    require $moduleDir . '/Module.php';
    $settings = new class {
        public array $deleted = [];
        public function delete($key) { $this->deleted[] = $key; }
    };
    $services = new Laminas\ServiceManager\ServiceManager();
    $services->setService('Omeka\Settings', $settings);
    // The slice of Omeka's schema the 2.38.0 placement of the Visualisations
    // block reads and writes (Site\ResourcePagePlacement).
    $connection = Doctrine\DBAL\DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
    // Doctrine's PDOSqlite driver registers its SQL functions through the PHP
    // 8.5-deprecated sqliteCreateFunction(); that notice is core's vendor, not ours.
    $reporting = error_reporting(error_reporting() & ~E_DEPRECATED);
    try {
        $connection->connect();
    } finally {
        error_reporting($reporting);
    }
    $connection->executeStatement('CREATE TABLE site (id INTEGER PRIMARY KEY, theme TEXT, is_public INTEGER)');
    $connection->executeStatement('CREATE TABLE site_setting (id TEXT, site_id INTEGER, value TEXT)');
    $services->setService('Omeka\Connection', $connection);
    $module = new DreVisualizations\Module();
    if ($hook === 'upgrade') {
        $put($moduleDir . '/asset/data/geo/countries.geojson');
        $put($moduleDir . '/asset/data/item-dashboards/projects-index.json');
        $put($moduleDir . '/asset/data/generations/old/network-explorer.json');
        $put($moduleDir . '/asset/data/current.json');
        $themeDefaults = [
            'items' => ['left' => [], 'main' => ['mediaEmbeds', 'values', 'itemSets', 'sitePages', 'mediaList', 'linkedResources'], 'right' => []],
            'item_sets' => ['main' => ['values']],
            'media' => ['main' => ['mediaRender', 'values']],
        ];
        $withBlockOnTheRight = $themeDefaults;
        $withBlockOnTheRight['items']['right'] = ['dreLinkedItemsDashboard'];
        $sites = [
            // [theme, setting id => saved value]
            1 => ['DRE-theme', ['theme_settings_dre-theme' => ['logo' => 7, 'resource_page_blocks' => $themeDefaults]]],
            2 => ['DRE-theme', []],
            3 => ['DRE-theme', ['theme_settings_dre-theme' => ['resource_page_blocks' => $withBlockOnTheRight]]],
            4 => ['DRE-theme', ['theme_settings_default' => ['resource_page_blocks' => $themeDefaults]]],
            5 => ['default', ['theme_settings_default' => ['accent' => '#000', 'resource_page_blocks' => []]]],
        ];
        foreach ($sites as $id => [$theme, $saved]) {
            $connection->insert('site', ['id' => $id, 'theme' => $theme, 'is_public' => 1]);
            foreach ($saved as $key => $value) {
                $connection->insert('site_setting', ['id' => $key, 'site_id' => $id, 'value' => json_encode($value)]);
            }
        }
        $stored = static fn (int $site, string $key): mixed => json_decode((string) $connection->fetchOne(
            'SELECT value FROM site_setting WHERE site_id = ? AND id = ?', [$site, $key]), true);
        $before = $connection->fetchAllAssociative('SELECT * FROM site_setting WHERE site_id <> 1 ORDER BY site_id, id');

        $module->upgrade('2.28.5', '2.29.1', $services);
        $check(array_values(array_diff(scandir($moduleDir . '/asset/data'), ['.', '..'])) === ['geo'],
            'Upgrade purges old public outputs and keeps static geography');
        $site1 = $stored(1, 'theme_settings_dre-theme');
        $check($site1['resource_page_blocks']['items']['main'] === ['mediaEmbeds', 'values', 'itemSets', 'sitePages',
            'mediaList', 'dreLinkedItemsDashboard', 'linkedResources'],
            'Upgrade adds the Visualisations block to a saved item-page configuration, after the record blocks');
        $check($site1['logo'] === 7 && $site1['resource_page_blocks']['media'] === $themeDefaults['media'],
            'Upgrade keeps every other theme setting and resource');
        $check($connection->fetchAllAssociative('SELECT * FROM site_setting WHERE site_id <> 1 ORDER BY site_id, id') === $before,
            'Upgrade leaves unsaved, already-placed, inactive-theme and empty configurations alone');
        $afterFirst = $connection->fetchAllAssociative('SELECT * FROM site_setting ORDER BY site_id, id');
        $module->upgrade('2.37.2', '2.38.0', $services);
        $check($connection->fetchAllAssociative('SELECT * FROM site_setting ORDER BY site_id, id') === $afterFirst,
            'Placing the block again changes nothing');
        // An administrator then removes it; a later upgrade does not put it back.
        $connection->update('site_setting', ['value' => json_encode(['resource_page_blocks' => $themeDefaults])],
            ['site_id' => 1, 'id' => 'theme_settings_dre-theme']);
        $module->upgrade('2.38.0', '2.38.1', $services);
        $check(!in_array('dreLinkedItemsDashboard', $stored(1, 'theme_settings_dre-theme')['resource_page_blocks']['items']['main'], true),
            'Upgrades from 2.38.0 on respect an administrator who removed the block');
        $check(DreVisualizations\Site\ResourcePagePlacement::repair($connection, [2, 3, 4, 5]) === []
            && DreVisualizations\Site\ResourcePagePlacement::repair($connection, [1]) === [1],
            'The maintenance repair touches only the sites it is given');
    } elseif ($hook === 'upgrade-compatible') {
        // A release that keeps the artifact schema keeps serving the snapshot.
        // The 'upgrade' run proves the unloaded case; here the fixture itself
        // needs the publisher, so load the copied sources first.
        spl_autoload_register(static function (string $class) use ($moduleDir): void {
            $path = $moduleDir . '/src/' . str_replace('\\', '/', substr($class, strlen('DreVisualizations\\'))) . '.php';
            if (str_starts_with($class, 'DreVisualizations\\') && is_file($path)) require_once $path;
        });
        $published = (new DreVisualizations\Precompute\SnapshotPublisher($tmp . '/store', 1, '2.29.1'))->publish(static function ($dir): array {
            $writer = new DreVisualizations\Precompute\JsonArtifactWriter();
            $writer->write($dir . '/item-dashboards/projects-index.json', []);
            $writer->write($dir . '/item-dashboards/collection-overview.json', ['totalItems' => 1]);
            $writer->write($dir . '/network-explorer.json', []);
            return ['sourceCounts' => ['items' => 1]];
        });
        $module->upgrade('2.29.1', '2.30.0', $services);
        $store = new DreVisualizations\Precompute\SnapshotStore($tmp . '/store');
        $check(($store->reading(fn () => $store->manifest())['generationId'] ?? null) === $published['generationId'],
            'A schema-compatible upgrade keeps serving the published snapshot');
        return;
    } else {
        $put($tmp . '/store/generations/20260101T000000Z-aaaaaaaaaaaa/network-explorer.json');
        $put($tmp . '/store/layout-cache/abc.json');
        $module->uninstall($services);
        $check(in_array(DreVisualizations\Module::SETTING_SITE_ID, $settings->deleted, true), 'Uninstall removes module settings');
        $check(!is_dir($tmp . '/store/generations') && !is_dir($tmp . '/store/layout-cache'), 'Uninstall removes generated data from the private store');
    }
    $state = json_decode((string) file_get_contents($tmp . '/store/current.json'), true);
    $check(($state['withdrawn'] ?? false) === true, ucfirst($hook) . ' withdraws publication');
} finally {
    putenv('DRE_VISUALIZATIONS_DATA_DIR');
    if (is_dir($tmp)) {
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
            $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
        }
        rmdir($tmp);
    }
}
