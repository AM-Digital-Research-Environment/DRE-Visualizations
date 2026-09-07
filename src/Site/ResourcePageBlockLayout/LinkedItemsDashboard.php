<?php
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\Precompute\PublishedSnapshot;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;
use Omeka\Site\ResourcePageBlockLayout\ResourcePageBlockLayoutInterface;

class LinkedItemsDashboard implements ResourcePageBlockLayoutInterface
{
    private string $dataDir;

    public function __construct(?string $dataDir = null)
    {
        $this->dataDir = $dataDir ?? dirname(__DIR__, 3) . '/asset/data';
    }

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
        if (PublishedSnapshot::path($this->dataDir, 'item-dashboards/' . $resource->id() . '.json') === null) {
            return '';
        }

        return $view->partial('common/resource-page-block-layout/linked-items-dashboard', [
            'resource' => $resource,
        ]);
    }
}
