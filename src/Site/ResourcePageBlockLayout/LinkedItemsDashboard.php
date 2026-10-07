<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\Site\PublishedData;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;
use Omeka\Site\ResourcePageBlockLayout\ResourcePageBlockLayoutInterface;

class LinkedItemsDashboard implements ResourcePageBlockLayoutInterface
{
    /** $dataDir overrides the default store (tests); resolved per render, so a storage fault hides the block. */
    public function __construct(private readonly ?string $dataDir = null) {}

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
        if (!PublishedData::available($view, 'item-dashboards/' . $resource->id() . '.json', $this->dataDir)) {
            return '';
        }

        return $view->partial('common/resource-page-block-layout/linked-items-dashboard', [
            'resource' => $resource,
        ]);
    }
}
