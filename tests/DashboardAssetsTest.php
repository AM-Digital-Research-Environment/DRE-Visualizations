<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

// The helper extends Laminas' AbstractHelper; a stand-in keeps this harness free of Omeka.
if (!class_exists(\Laminas\View\Helper\AbstractHelper::class)) {
    eval('namespace Laminas\View\Helper; abstract class AbstractHelper { protected $view; public function setView($v) { $this->view = $v; return $this; } public function getView() { return $this->view; } }');
}

use DreVisualizations\Site\AssetPlans;
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

/** A head that records script files and JSON payloads in order and drops a repeated src, as Laminas does. */
final class AssetsTestHead
{
    public array $files = [];
    public array $payloads = [];
    public array $stylesheets = [];
    public function appendFile($src, $type = null, $attrs = []): self
    {
        if (!in_array($src, $this->files, true)) $this->files[] = $src;
        return $this;
    }
    public function appendScript($script, $type = 'text/javascript', $attrs = []): self
    {
        $this->payloads[] = ['type' => $type, 'id' => $attrs['id'] ?? null, 'json' => json_decode($script, true)];
        return $this;
    }
    public function appendStylesheet($href): self
    {
        if (!in_array($href, $this->stylesheets, true)) $this->stylesheets[] = $href;
        return $this;
    }
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
    // The i18n and basemap payload needs Omeka services; it is not what is tested here.
    (new ReflectionProperty(DashboardAssets::class, 'pageConfigInjected'))->setValue($helper, true);
    return $helper;
}

// An item-page block asks for its plan before Module::addAssets runs: DRE-theme
// renders the blocks before `view.show.before`, so the prelude must still come first.
$view = new AssetsTestView();
$helper = assetsHelper($view);
$helper(['plan' => 'dashboard']);
$helper(['plan' => 'prelude']); // Module::addAssets, later
$core = array_search('js/dashboard-core.min.js', $view->head->files, true);
$first = array_search('js/graph-canvas.js', $view->head->files, true);
$controller = array_search('js/dashboard.js', $view->head->files, true);
assetsCheck($core !== false && $first !== false && $core < $first,
    'the core precedes the graph renderers when a block asks first');
assetsCheck($controller !== false && $core < $controller, 'the core precedes the dashboard controller');
assetsCheck(count(array_keys($view->head->files, 'js/dashboard-core.min.js', true)) === 1, 'the core is emitted once');
assetsCheck(count($view->head->payloads) === 1, 'a plan emitted twice publishes its library URLs once');
assetsCheck($view->head->stylesheets === ['css/dre-visualizations.min.css'], 'the minified stylesheet is linked once');

// The usual order (prelude by the listener, then the block) is unchanged.
$view = new AssetsTestView();
$helper = assetsHelper($view);
$helper(['plan' => 'prelude']);
$helper(['plan' => 'dashboard']);
assetsCheck(array_search('js/dashboard-core.min.js', $view->head->files, true) === 0,
    'with the prelude already emitted, nothing is moved');

// The configuration travels as JSON payloads with distinct ids.
$payload = $view->head->payloads[0] ?? [];
assetsCheck(($payload['type'] ?? '') === 'application/json' && ($payload['id'] ?? '') === 'rv-config-1',
    'library URLs are inert JSON, never inline script');
assetsCheck(($payload['json']['libs']['d3'] ?? null) === AssetPlans::manifest()['libs']['d3'],
    'the d3 stack is published as its ordered list');

// The network explorer loads its libraries eagerly, before the core.
$view = new AssetsTestView();
$helper = assetsHelper($view);
$helper(['plan' => 'network']);
$files = $view->head->files;
assetsCheck(array_search('vendor/echarts.min.js', $files, true) < array_search('js/dashboard-core.min.js', $files, true)
    && array_search('vendor/d3-force.min.js', $files, true) < array_search('js/dashboard-core.min.js', $files, true),
    'an eager library loads before the core');
assetsCheck(end($files) === 'js/dashboard-network-explorer.js', 'the controller loads last');

// A wrong name fails loudly instead of loading nothing.
foreach ([['plan' => 'no-such-plan'], ['cdn' => true], ['plan' => 'dashboard', 'controller' => 'x']] as $options) {
    $threw = false;
    try { assetsHelper(new AssetsTestView())($options); } catch (InvalidArgumentException) { $threw = true; }
    assetsCheck($threw, 'rejects ' . json_encode($options));
}

// Every plan resolves to files that exist, and every `after` names a plan.
$manifest = AssetPlans::manifest();
$root = dirname(__DIR__) . '/asset/';
assetsCheck(is_file($root . $manifest['stylesheet']), 'the stylesheet exists');
foreach ($manifest['plans'] as $name => $plan) {
    $missing = array_filter(AssetPlans::scripts($name), static fn (string $path): bool => !is_file($root . $path));
    assetsCheck($missing === [], "plan $name: every script exists" . ($missing ? ' (missing ' . implode(', ', $missing) . ')' : ''));
    if (isset($plan['after'])) assetsCheck(isset($manifest['plans'][$plan['after']]), "plan $name: after names a plan");
    foreach ($plan['publish'] ?? [] as $key) {
        assetsCheck(isset($manifest['libs'][$key]), "plan $name: publishes a known library ($key)");
    }
}
foreach ($manifest['libs'] as $key => $paths) {
    foreach ((array) $paths as $path) assetsCheck(is_file($root . $path), "library $key: $path exists");
}

if ($failures) {
    fwrite(STDERR, "$failures dashboard-assets check(s) failed\n");
    exit(1);
}
echo "Dashboard assets passed.\n";
