<?php
declare(strict_types=1);
namespace DreVisualizations\Site\BlockLayout;

use DreVisualizations\Site\BlockRegistry;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\SitePageBlockRepresentation;
use Omeka\Api\Representation\SitePageRepresentation;
use Omeka\Api\Representation\SiteRepresentation;
use Omeka\Site\BlockLayout\AbstractBlockLayout;

/**
 * A site-page block described by its BlockRegistry row: label, admin text and
 * template all come from `BlockRegistry::BLOCKS[static::SLUG]`, so a block with
 * nothing to configure is a class whose whole body is `const SLUG = '…';`.
 * A block with a form overrides form() (and render() for its own variables).
 */
abstract class AbstractDreBlockLayout extends AbstractBlockLayout
{
    /** The block's key in BlockRegistry::BLOCKS. */
    const SLUG = '';

    public function getLabel()
    {
        return BlockRegistry::get(static::SLUG)['label'];
    }

    public function form(PhpRenderer $view, SiteRepresentation $site,
        ?SitePageRepresentation $page = null, ?SitePageBlockRepresentation $block = null)
    {
        $description = BlockRegistry::get(static::SLUG)['description'];
        return $description === null ? '' : '<p>' . $view->escapeHtml($view->translate($description)) . '</p>';
    }

    public function render(PhpRenderer $view, SitePageBlockRepresentation $block,
        $templateViewScript = null)
    {
        return $view->partial($templateViewScript ?? BlockRegistry::template(static::SLUG),
            ['block' => $block] + BlockRegistry::viewVars(static::SLUG));
    }
}
