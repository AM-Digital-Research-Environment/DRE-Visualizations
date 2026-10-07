<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\Precompute\PublishedSnapshot;
use DreVisualizations\Precompute\SnapshotStore;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;
use Omeka\Site\ResourcePageBlockLayout\ResourcePageBlockLayoutInterface;

class LinkedItemsDashboard implements ResourcePageBlockLayoutInterface
{
    /** Resolved lazily: a storage fault must hide the block, not fail every item page. */
    public function __construct(private ?string $dataDir = null) {}

    public function getLabel(): string
    {
        return 'Visualisations'; // @translate
    }

    public function getCompatibleResourceNames(): array
    {
        return ['items'];
    }

    public function render(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        // The publisher is authoritative: not every item has an aggregate
        // dashboard. In particular, research records may have a knowledge graph
        // without a dashboard. Do not mount a loader for a nonexistent artifact.
        $this->dataDir ??= SnapshotStore::tryDefault()?->directory;
        if ($this->dataDir === null
            || PublishedSnapshot::path($this->dataDir, 'item-dashboards/' . $resource->id() . '.json') === null) {
            return '';
        }

        return $view->partial('common/resource-page-block-layout/linked-items-dashboard', [
            'resource' => $resource,
        ]);
    }
}
