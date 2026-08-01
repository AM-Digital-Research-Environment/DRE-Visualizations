<?php
namespace DreVisualizations\Site\BlockLayout;

use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\SitePageBlockRepresentation;
use Omeka\Api\Representation\SitePageRepresentation;
use Omeka\Api\Representation\SiteRepresentation;
use Omeka\Site\BlockLayout\AbstractBlockLayout;

class SemanticMap extends AbstractBlockLayout
{
    public function getLabel()
    {
        return 'Semantic Map'; // @translate
    }

    public function form(PhpRenderer $view, SiteRepresentation $site,
        ?SitePageRepresentation $page = null, ?SitePageBlockRepresentation $block = null)
    {
        return '<p>' . $view->translate('Explore podcasts, videos, publications, projects, research sections, and research items in one multilingual semantic space. No configuration needed.') . '</p>';
    }

    public function render(PhpRenderer $view, SitePageBlockRepresentation $block,
        $templateViewScript = 'common/block-layout/semantic-map')
    {
        return $view->partial($templateViewScript, ['block' => $block]);
    }
}
