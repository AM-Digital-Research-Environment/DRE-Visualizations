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
    $module = new DreVisualizations\Module();
    if ($hook === 'upgrade') {
        $put($moduleDir . '/asset/data/geo/countries.geojson');
        $put($moduleDir . '/asset/data/item-dashboards/projects-index.json');
        $put($moduleDir . '/asset/data/generations/old/network-explorer.json');
        $put($moduleDir . '/asset/data/current.json');
        $module->upgrade('2.28.5', '2.29.1', $services);
        $check(array_values(array_diff(scandir($moduleDir . '/asset/data'), ['.', '..'])) === ['geo'],
            'Upgrade purges old public outputs and keeps static geography');
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
