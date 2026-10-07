<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\Site\PublishedData;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;
use Omeka\Site\ResourcePageBlockLayout\ResourcePageBlockLayoutInterface;

class SiblingItemsSparkline implements ResourcePageBlockLayoutInterface
{
    public function getLabel(): string
    {
        return 'Sibling Items Sparkline'; // @translate
    }

    public function getCompatibleResourceNames(): array
    {
        return ['items'];
    }

    public function render(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        // Only mount a loader for data the published snapshot holds, on the
        // canonical site the data endpoint serves (see PublishedData).
        if (!PublishedData::available($view, 'item-contexts/' . $resource->id() . '.json')) {
            return '';
        }
        return $view->partial('common/resource-page-block-layout/sibling-items-sparkline', [
            'resource' => $resource,
        ]);
    }
}
