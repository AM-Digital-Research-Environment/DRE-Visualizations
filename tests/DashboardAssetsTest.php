<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

// The helper extends Laminas' AbstractHelper; a stand-in keeps this harness free of Omeka.
if (!class_exists(\Laminas\View\Helper\AbstractHelper::class)) {
    eval('namespace Laminas\View\Helper; abstract class AbstractHelper { protected $view; public function setView($v) { $this->view = $v; return $this; } public function getView() { return $this->view; } }');
}

use DreVisualizations\View\Helper\DashboardAssets;

$failures = 0;
function assetsCheck(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $message\n");
}

/** A head that records script files in order and drops a repeated src, as Laminas' HeadScript does. */
final class AssetsTestHead
{
    public array $files = [];
    public function appendFile($src, $type = null, $attrs = []): self
    {
        if (!in_array($src, $this->files, true)) $this->files[] = $src;
        return $this;
    }
    public function appendScript($script): self { return $this; }
    public function appendStylesheet($href): self { return $this; }
}

final class AssetsTestView
{
    public AssetsTestHead $head;
    public function __construct() { $this->head = new AssetsTestHead(); }
    public function headScript(): AssetsTestHead { return $this->head; }
    public function headLink(): AssetsTestHead { return $this->head; }
    public function assetUrl(string $path, ?string $module = null): string { return $path; }
    public function currentSite() { return null; }
}

function assetsHelper(AssetsTestView $view): DashboardAssets
{
    $helper = new DashboardAssets();
    $helper->setView($view);
    // The i18n and basemap scripts need Omeka services; they are not what is tested here.
    foreach (['i18nInjected', 'mapConfigInjected'] as $flag) {
        $property = new ReflectionProperty(DashboardAssets::class, $flag);
        $property->setValue($helper, true);
    }
    return $helper;
}

// An item-page block asks for its builders only (`assets => []` in the partial),
// counting on Module::addAssets for the prelude. DRE-theme renders the blocks
// before `view.show.before`, so the prelude must still come first.
$view = new AssetsTestView();
$helper = assetsHelper($view);
$helper([]);
$helper(['cdn' => true, 'controller' => '', 'preludeOnly' => true]); // Module::addAssets, later
$core = array_search('js/dashboard-core.js', $view->head->files, true);
$first = array_search('js/graph-canvas.js', $view->head->files, true);
$controller = array_search('js/dashboard.js', $view->head->files, true);
assetsCheck($core !== false && $first !== false && $core < $first,
    'dashboard-core.js precedes the graph renderers when a block asks first');
assetsCheck($controller !== false && $core < $controller, 'dashboard-core.js precedes the dashboard controller');
assetsCheck(count(array_keys($view->head->files, 'js/dashboard-core.js', true)) === 1, 'dashboard-core.js is emitted once');

// The usual order (prelude by the listener, then the block) is unchanged.
$view = new AssetsTestView();
$helper = assetsHelper($view);
$helper(['cdn' => true, 'controller' => '', 'preludeOnly' => true]);
$helper([]);
assetsCheck(array_search('js/dashboard-core.js', $view->head->files, true) === 0,
    'with the prelude already emitted, nothing is moved');

if ($failures) {
    fwrite(STDERR, "$failures dashboard-assets check(s) failed\n");
    exit(1);
}
echo "Dashboard assets passed.\n";
