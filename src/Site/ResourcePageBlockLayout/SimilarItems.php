<?php
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;
use Omeka\Site\ResourcePageBlockLayout\ResourcePageBlockLayoutInterface;

class SimilarItems implements ResourcePageBlockLayoutInterface
{
    public function getLabel(): string
    {
        return 'Similar Items'; // @translate
    }

    public function getCompatibleResourceNames(): array
    {
        return ['items'];
    }

    public function render(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        return $view->partial('common/resource-page-block-layout/similar-items', [
            'resource' => $resource,
        ]);
    }
}
