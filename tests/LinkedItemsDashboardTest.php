<?php
declare(strict_types=1);

namespace Laminas\View\Renderer {
    class PhpRenderer
    {
        public int $calls = 0;
        public function partial(string $template, array $values): string
        {
            ++$this->calls;
            return 'dashboard:' . $values['resource']->id();
        }
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
    require __DIR__ . '/../src/Precompute/PublishedSnapshot.php';
    require __DIR__ . '/../src/Site/ResourcePageBlockLayout/LinkedItemsDashboard.php';

    use DreVisualizations\Site\ResourcePageBlockLayout\LinkedItemsDashboard;
    use Laminas\View\Renderer\PhpRenderer;
    use Omeka\Api\Representation\AbstractResourceEntityRepresentation;

    $root = sys_get_temp_dir() . '/dre-dashboard-block-' . bin2hex(random_bytes(6));
    $generation = '20260907T124333Z-5496674232ab';
    $published = $root . '/generations/' . $generation;
    mkdir($published . '/item-dashboards', 0777, true);
    mkdir($published . '/knowledge-graphs', 0777, true);
    mkdir($root . '/item-dashboards', 0777, true);
    $view = new PhpRenderer();
    $block = new LinkedItemsDashboard($root);
    $item = new AbstractResourceEntityRepresentation(32328);
    $checks = 0;
    $check = static function (bool $condition, string $message) use (&$checks): void {
        if (!$condition) {
            throw new \RuntimeException($message);
        }
        ++$checks;
    };
    try {
        $check($block->render($view, $item) === '', 'Missing data must not create a loader.');
        $check($view->calls === 0, 'Ineligible items must not render the asset-loading partial.');

        file_put_contents($root . '/current.json', json_encode(['generationId' => $generation]));
        file_put_contents($published . '/knowledge-graphs/32328.json', '{"nodes":[]}');
        $check($block->render($view, $item) === '', 'A knowledge graph does not imply a dashboard.');

        file_put_contents($root . '/item-dashboards/32328.json', '{}');
        $check($block->render($view, $item) === '', 'A stale flat dashboard must not override the published generation.');

        file_put_contents($published . '/item-dashboards/32328.json', '{}');
        $check($block->render($view, $item) === 'dashboard:32328', 'A published dashboard must render.');
        $check($view->calls === 1, 'Eligible dashboard must render exactly once.');

        unlink($published . '/item-dashboards/32328.json');
        $check($block->render($view, $item) === '', 'Removal from the current snapshot must take effect immediately.');

        unlink($root . '/current.json');
        $check($block->render($view, $item) === 'dashboard:32328', 'Legacy flat publication remains supported.');
        echo "LinkedItemsDashboard: $checks checks passed.\n";
    } finally {
        foreach ([
            $root . '/current.json',
            $published . '/knowledge-graphs/32328.json',
            $published . '/item-dashboards/32328.json',
            $root . '/item-dashboards/32328.json',
        ] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        foreach ([$published . '/knowledge-graphs', $published . '/item-dashboards', $published, $root . '/generations', $root . '/item-dashboards', $root] as $directory) {
            rmdir($directory);
        }
    }
}
