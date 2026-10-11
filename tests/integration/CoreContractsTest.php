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
        return (new SnapshotPublisher($root, 1, 'test', 0.0))->publish(static function ($dir): array {
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
    $check($response instanceof Laminas\Http\Response\Stream && $response->getBody() === '[]', 'Artifacts stream from the open file');
    $site->public = false;
    $check($request('current.json')->getStatusCode() === 404, 'Private site denied even for a privileged viewer');
    $site->public = true; $site->siteId = 2;
    $check($request('current.json')->getStatusCode() === 404, 'Noncanonical site denied');
    $site->siteId = 1;
    $shared = new Laminas\EventManager\SharedEventManager();
    (new DreVisualizations\Module())->attachListeners($shared);
    $fresh = static fn (): bool => $store->reading(fn () => $store->isFresh());
    foreach (['Item' => 'items', 'Media' => 'media', 'ItemSet' => 'item_sets', 'Site' => 'sites'] as $name => $resource) {
        $publish();
        $events = new Laminas\EventManager\EventManager($shared, ['Omeka\\Api\\Adapter\\' . $name . 'Adapter']);
        $apiRequest = new Omeka\Api\Request(Omeka\Api\Request::CREATE, $resource);
        $events->trigger('api.create.pre', null, ['request' => $apiRequest]);
        $check($request('current.json')->getStatusCode() === 200 && !$fresh(), $name . ' API write keeps serving the snapshot, now stale');
        try {
            $publish();
            throw new RuntimeException('Published during a source write');
        } catch (RuntimeException $e) {
            $check(str_contains($e->getMessage(), 'source write'), 'Active API write blocks publication');
        }
        $events->trigger('api.create.post', null, ['request' => $apiRequest, 'response' => new Omeka\Api\Response()]);
        $check($request('current.json')->getStatusCode() === 200 && !$fresh(), $name . ' write leaves a stale snapshot served after .post');
        $publish();
        $check($request('current.json')->getStatusCode() === 200 && $fresh(), $name . ' write releases its lock after .post');
    }

    // Updates compare what the public could see before (the database) and after (the entities).
    $db = Doctrine\DBAL\DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
    foreach (['CREATE TABLE resource (id INTEGER PRIMARY KEY, is_public INTEGER)',
        'CREATE TABLE value (id INTEGER, resource_id INTEGER, property_id INTEGER, type TEXT, lang TEXT, value TEXT, uri TEXT, value_resource_id INTEGER, is_public INTEGER)',
        'CREATE TABLE media (id INTEGER, item_id INTEGER)'] as $sql) $db->executeStatement($sql);
    $db->insert('resource', ['id' => 1, 'is_public' => 1]);
    $db->insert('resource', ['id' => 10, 'is_public' => 1]);
    $db->insert('media', ['id' => 10, 'item_id' => 1]);
    $db->insert('value', ['id' => 1, 'resource_id' => 1, 'property_id' => 1, 'type' => 'literal', 'value' => 'Title', 'is_public' => 1]);
    $db->insert('value', ['id' => 2, 'resource_id' => 1, 'property_id' => 2, 'type' => 'literal', 'value' => 'Abstract', 'is_public' => 1]);
    $services = new Laminas\ServiceManager\ServiceManager();
    $services->setService('Omeka\Connection', $db);
    $adapter = new class($services) {
        public function __construct(private Laminas\ServiceManager\ServiceManager $services) {}
        public function getServiceLocator() { return $this->services; }
    };
    $entity = static fn (bool $public, bool $abstractPublic = true, bool $mediaPublic = true): object => new class($public, $abstractPublic, $mediaPublic) {
        public function __construct(private bool $public, private bool $abstractPublic, private bool $mediaPublic) {}
        public function getId() { return 1; }
        public function isPublic() { return $this->public; }
        public function getValues() {
            $value = static fn (int $property, string $text, bool $public): object => new class($property, $text, $public) {
                public function __construct(private int $property, private string $text, private bool $public) {}
                public function getProperty() { return new class($this->property) { public function __construct(private int $id) {} public function getId() { return $this->id; } }; }
                public function getType() { return 'literal'; }
                public function getLang() { return null; }
                public function getValue() { return $this->text; }
                public function getUri() { return null; }
                public function getValueResource() { return null; }
                public function isPublic() { return $this->public; }
            };
            return [$value(1, 'Title', true), $value(2, 'Abstract', $this->abstractPublic)];
        }
        public function getMedia() {
            return [new class($this->mediaPublic) {
                public function __construct(private bool $public) {}
                public function getId() { return 10; }
                public function isPublic() { return $this->public; }
            }];
        }
    };
    $events = new Laminas\EventManager\EventManager($shared, ['Omeka\\Api\\Adapter\\ItemAdapter']);
    $update = static function (object $after, ?object $target = null) use ($events, $adapter): void {
        $apiRequest = (new Omeka\Api\Request(Omeka\Api\Request::UPDATE, 'items'))->setId(1);
        $events->trigger('api.update.pre', $target ?? $adapter, ['request' => $apiRequest]);
        $events->trigger('api.update.post', $target ?? $adapter, ['request' => $apiRequest, 'response' => new Omeka\Api\Response($after)]);
    };
    foreach ([
        'An update that keeps everything public keeps serving' => [$entity(true), 200],
        'Making the item private withdraws publication' => [$entity(false), 404],
        'Making a public value private withdraws publication' => [$entity(true, false), 404],
        'Making a public medium private withdraws publication' => [$entity(true, true, false), 404],
    ] as $message => [$after, $status]) {
        $publish();
        $update($after);
        $check($request('current.json')->getStatusCode() === $status, $message);
    }
    $check($store->reading(fn () => $store->refreshAllowed()), 'The automatic refresh may republish after a privatising write');
    $publish();
    $update($entity(true), new class {});
    $check($request('current.json')->getStatusCode() === 404, 'An update whose earlier state cannot be read is treated as privatising');

    // A write that throws never fires .post; its lock must die with the request.
    $events = new Laminas\EventManager\EventManager($shared, ['Omeka\\Api\\Adapter\\ItemAdapter']);
    $failed = new Omeka\Api\Request(Omeka\Api\Request::CREATE, 'items');
    $events->trigger('api.create.pre', null, ['request' => $failed]);
    unset($failed);
    gc_collect_cycles();
    $publish();
    $check($request('current.json')->getStatusCode() === 200, 'An abandoned write does not keep blocking publication');
    $head = (function () use ($plugins): Laminas\Http\Response {
        // dispatch(), unlike indexAction(), installs this request on the controller.
        $headController = new DataController();
        $headController->setPluginManager($plugins);
        $event = new Laminas\Mvc\MvcEvent();
        $event->setRouteMatch(new Laminas\Router\RouteMatch(['action' => 'index', 'path' => 'current.json']));
        $headController->setEvent($event);
        $headController->dispatch((new Laminas\Http\PhpEnvironment\Request())->setMethod('HEAD'), new Laminas\Http\PhpEnvironment\Response());
        return $event->getResult();
    })();
    $check($head->getStatusCode() === 200 && $head->getContent() === '', 'HEAD answers without a body');
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
