<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\Site\BlockRegistry;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Site\ResourcePageBlockLayout\ResourcePageBlockLayoutInterface;

/**
 * A resource-page block described by its BlockRegistry::RESOURCE_BLOCKS row
 * (label, resource types, template, asset plan). Subclasses keep render() for
 * the condition that decides whether the block shows, and call renderTemplate().
 */
abstract class AbstractDreResourcePageBlockLayout implements ResourcePageBlockLayoutInterface
{
    /** The block's key in BlockRegistry::RESOURCE_BLOCKS. */
    const SLUG = '';

    public function getLabel(): string
    {
        return BlockRegistry::resource(static::SLUG)['label'];
    }

    public function getCompatibleResourceNames(): array
    {
        return BlockRegistry::resource(static::SLUG)['resources'];
    }

    /** The block's template with its variables plus the registry's slug and plan. */
    protected function renderTemplate(PhpRenderer $view, array $vars): string
    {
        return $view->partial(BlockRegistry::resourceTemplate(static::SLUG),
            $vars + BlockRegistry::viewVars(static::SLUG));
    }
}
