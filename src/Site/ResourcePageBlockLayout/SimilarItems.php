<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\Site\PublishedData;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;

/** Label, resource types and template: BlockRegistry::RESOURCE_BLOCKS['similar-items']. */
class SimilarItems extends AbstractDreResourcePageBlockLayout
{
    const SLUG = 'similar-items';

    public function render(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        // Only mount a loader for data the published snapshot holds, on the
        // canonical site the data endpoint serves (see PublishedData).
        if (!PublishedData::available($view, 'embeddings/similar.json')) {
            return '';
        }
        return $this->renderTemplate($view, [
            'resource' => $resource,
        ]);
    }
}
