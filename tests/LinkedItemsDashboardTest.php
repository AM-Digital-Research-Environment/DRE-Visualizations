<?php
declare(strict_types=1);

namespace Laminas\View\Renderer {
    class PhpRenderer
    {
        public int $calls = 0;
        public array $last = [];
        public function partial(string $template, array $values): string
        {
            ++$this->calls;
            $this->last = $values;
            return 'dashboard:' . $values['resource']->id();
        }
        public bool $canonical = true;
        public function currentSite(): object
        {
            return new class($this->canonical) {
                public function __construct(private bool $canonical) {}
                public function id(): int { return $this->canonical ? 1 : 2; }
                public function isPublic(): bool { return true; }
            };
        }
        public function setting(string $key, mixed $default = null): mixed { return 1; }
    }
}
namespace Omeka\Api\Representation {
    class AbstractResourceEntityRepresentation
    {
        public function __construct(private int $id) {}
        public function id(): int { return $this->id; }
    }
}
namespace Omeka\Site\ResourcePageBlockLayout {
    interface ResourcePageBlockLayoutInterface {}
}
namespace {
    require_once __DIR__ . '/bootstrap.php';
    require __DIR__ . '/../src/Precompute/PublishedSnapshot.php';
    require __DIR__ . '/../src/Site/ResourcePageBlockLayout/LinkedItemsDashboard.php';
    // Module only supplies the setting-name constant PublishedData reads.
    if (!class_exists('DreVisualizations\\Module', false)) {
        eval('namespace DreVisualizations; class Module { public const SETTING_SITE_ID = "dre_visualizations_site_id"; }');
    }

    use DreVisualizations\Site\ResourcePageBlockLayout\LinkedItemsDashboard;
    use Laminas\View\Renderer\PhpRenderer;
    use Omeka\Api\Representation\AbstractResourceEntityRepresentation;

    $root = sys_get_temp_dir() . '/dre-dashboard-block-' . bin2hex(random_bytes(6));
    $generation = '20260907T124333Z-5496674232ab';
    $published = $root . '/generations/' . $generation;
    mkdir($published . '/item-dashboards', 0777, true);
    mkdir($published . '/knowledge-graphs', 0777, true);
    mkdir($published . '/photo-galleries', 0777, true);
    mkdir($root . '/item-dashboards', 0777, true);
    $view = new PhpRenderer();
    $block = new LinkedItemsDashboard($root);
    $item = new AbstractResourceEntityRepresentation(32328);
    try {
        verify($block->render($view, $item) === '', 'Missing data must not create a loader.');
        verify($view->calls === 0, 'Ineligible items must not render the asset-loading partial.');

        $manifest = ['schemaVersion' => \DreVisualizations\Precompute\SnapshotPublisher::SCHEMA_VERSION,
            'generationId' => $generation, 'revision' => (new \DreVisualizations\Precompute\SnapshotStore($root))->revision()];
        file_put_contents($root . '/current.json', json_encode($manifest));
        file_put_contents($published . '/knowledge-graphs/32328.json', '{"nodes":[]}');
        verify($block->render($view, $item) === '', 'A knowledge graph does not imply a dashboard.');

        file_put_contents($root . '/item-dashboards/32328.json', '{}');
        verify($block->render($view, $item) === '', 'A stale flat dashboard must not override the published generation.');

        file_put_contents($published . '/item-dashboards/32328.json', '{}');
        verify($block->render($view, $item) === 'dashboard:32328', 'A published dashboard must render.');
        verify($view->calls === 1, 'Eligible dashboard must render exactly once.');
        verify($view->last['dashboard'] === true && $view->last['gallery'] === null, 'An item without a project gallery shows the dashboard alone.');

        // A research project's gallery (photo-galleries/project-<id>.json).
        $photo = ['id' => 5, 'title' => 'Photo', 'storage' => 'abc', 'ext' => 'jpg'];
        file_put_contents($published . '/photo-galleries/project-32328.json', json_encode(['total' => 1, 'photos' => [$photo]]));
        verify($block->render($view, $item) === 'dashboard:32328' && $view->last['dashboard'] === true
            && ($view->last['gallery']['photos'][0]['id'] ?? null) === 5, 'A project shows its gallery under its dashboard.');
        rename($published . '/item-dashboards/32328.json', $published . '/item-dashboards/32328.tmp');
        verify($block->render($view, $item) === 'dashboard:32328' && $view->last['dashboard'] === false
            && $view->last['gallery'] !== null, 'A project gallery shows without a dashboard.');
        file_put_contents($published . '/photo-galleries/project-32328.json', json_encode(['total' => 0, 'photos' => []]));
        verify($block->render($view, $item) === '', 'An empty gallery and no dashboard render nothing.');
        unlink($published . '/photo-galleries/project-32328.json');
        rename($published . '/item-dashboards/32328.tmp', $published . '/item-dashboards/32328.json');

        $view->canonical = false;
        verify($block->render($view, $item) === '', 'A non-canonical site must not mount a loader the data endpoint refuses.');
        $view->canonical = true;

        file_put_contents($root . '/current.json', json_encode(['schemaVersion' => 0] + $manifest));
        verify($block->render($view, $item) === '', 'A snapshot of another artifact schema must not render.');
        file_put_contents($root . '/current.json', json_encode($manifest));

        unlink($published . '/item-dashboards/32328.json');
        verify($block->render($view, $item) === '', 'Removal from the current snapshot must take effect immediately.');

        unlink($root . '/current.json');
        verify($block->render($view, $item) === '', 'Missing manifest never exposes legacy flat publication.');
        echo "LinkedItemsDashboard passed.\n";
    } finally {
        foreach ([
            $root . '/current.json',
            $root . '/revision.json',
            $root . '/.policy.lock',
            $published . '/knowledge-graphs/32328.json',
            $published . '/item-dashboards/32328.json',
            $published . '/item-dashboards/32328.tmp',
            $published . '/photo-galleries/project-32328.json',
            $root . '/item-dashboards/32328.json',
        ] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        foreach ([$published . '/knowledge-graphs', $published . '/item-dashboards', $published . '/photo-galleries', $published, $root . '/generations', $root . '/item-dashboards', $root] as $directory) {
            rmdir($directory);
        }
    }
}
