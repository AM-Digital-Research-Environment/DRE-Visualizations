<?php
declare(strict_types=1);
require rtrim($argv[1], '/\\') . '/vendor/autoload.php';
require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__, 2) . '/Module.php';

use DreVisualizations\Precompute\{SnapshotStore, SnapshotPublisher, JsonArtifactWriter};
use DreVisualizations\Controller\Site\DataController;
use Laminas\Mvc\Controller\Plugin\AbstractPlugin;

$root = sys_get_temp_dir() . '/dre-core-' . bin2hex(random_bytes(6));
putenv('DRE_VISUALIZATIONS_DATA_DIR=' . $root);
$store = new SnapshotStore($root);
$site = new class {
    public int $siteId = 1;
    public bool $public = true;
    public function id() { return $this->siteId; }
    public function isPublic() { return $this->public; }
};
$plugins = new Laminas\Mvc\Controller\PluginManager(new Laminas\ServiceManager\ServiceManager());
$plugins->setService('currentSite', new class($site) extends AbstractPlugin {
    public function __construct(private object $site) {}
    public function __invoke() { return $this->site; }
});
$plugins->setService('settings', new class extends AbstractPlugin {
    public function __invoke() { return $this; }
    public function get($key, $default = null) { return 1; }
});
$controller = new DataController();
$controller->setPluginManager($plugins);
$request = static function (string $path) use ($controller): Laminas\Http\Response {
    $event = new Laminas\Mvc\MvcEvent();
    $event->setRequest((new Laminas\Http\PhpEnvironment\Request())->setMethod('GET'));
    $event->setResponse(new Laminas\Http\PhpEnvironment\Response());
    $event->setRouteMatch(new Laminas\Router\RouteMatch(['path' => $path]));
    $controller->setEvent($event);
    return $controller->indexAction();
};
$check = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
    echo "ok: $message\n";
};
try {
    $source = $request('source.json');
    $check($source->getStatusCode() === 200 && isset(json_decode($source->getContent(), true)['revision']), 'Source endpoint exposes the canonical revision');
    $publish = static function () use ($root): array {
        return (new SnapshotPublisher($root, 1, 'test'))->publish(static function ($dir): array {
            $writer = new JsonArtifactWriter();
            $writer->write($dir . '/item-dashboards/projects-index.json', []);
            $writer->write($dir . '/item-dashboards/collection-overview.json', ['totalItems' => 1]);
            $writer->write($dir . '/network-explorer.json', []);
            return ['sourceCounts' => ['items' => 1]];
        });
    };
    $old = $publish();
    $current = $publish();
    $check($request('generations/' . $old['generationId'] . '/network-explorer.json')->getStatusCode() === 404, 'Retained old URL is inaccessible');
    $response = $request('generations/' . $current['generationId'] . '/network-explorer.json');
    $check($response->getStatusCode() === 200 && str_contains($response->getHeaders()->get('Cache-Control')->getFieldValue(), 'no-store'), 'Current artifact is served with no-store');
    $site->public = false;
    $check($request('current.json')->getStatusCode() === 404, 'Private site denied even for a privileged viewer');
    $site->public = true; $site->siteId = 2;
    $check($request('current.json')->getStatusCode() === 404, 'Noncanonical site denied');
    $site->siteId = 1;
    $shared = new Laminas\EventManager\SharedEventManager();
    (new DreVisualizations\Module())->attachListeners($shared);
    foreach (['Item', 'Media', 'ItemSet', 'Site'] as $name) {
        $publish();
        $events = new Laminas\EventManager\EventManager($shared, ['Omeka\\Api\\Adapter\\' . $name . 'Adapter']);
        $events->trigger('api.update.pre');
        $check($request('current.json')->getStatusCode() === 404, $name . ' API event withdraws publication');
        try {
            $publish();
            throw new RuntimeException('Published during a source write');
        } catch (RuntimeException $e) {
            $check(str_contains($e->getMessage(), 'source write'), 'Active API write blocks publication');
        }
        $events->trigger('api.update.post');
    }
    $config = (new DreVisualizations\Module())->getConfig();
    $route = Laminas\Router\Http\Segment::factory($config['router']['routes']['site']['child_routes']['dre-data']['options']);
    $url = $route->assemble(['path' => 'generations/' . $current['generationId'] . '/network-explorer.json']);
    $http = new Laminas\Http\Request(); $http->setUri('https://example.test' . $url);
    $check($route->match($http)?->getParam('path') === 'generations/' . $current['generationId'] . '/network-explorer.json', 'Nested data path routes and assembles correctly');
} finally {
    if (is_dir($root)) {
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $entry) {
            $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
        }
        rmdir($root);
    }
    putenv('DRE_VISUALIZATIONS_DATA_DIR');
}
echo "Omeka core integration passed.\n";
