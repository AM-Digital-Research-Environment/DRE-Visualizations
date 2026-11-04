<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\FeaturedCollections\ContentMap;
use DreVisualizations\FeaturedCollections\Registry;
use DreVisualizations\Site\BlockRegistry;
use DreVisualizations\Site\PublishedData;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;
use Omeka\Api\Representation\ItemRepresentation;

/**
 * Label, resource types and template: BlockRegistry::RESOURCE_BLOCKS['similar-items'].
 *
 * Two lists of related records, each shown only when it has something to say:
 * "Closest in content", for an article of a featured collection with a
 * full-text map (FeaturedCollections\ContentMap), rendered here from the
 * committed map and the public gallery; and the cross-type semantic
 * recommendations from the metadata cards, loaded by the browser.
 */
class SimilarItems extends AbstractDreResourcePageBlockLayout
{
    const SLUG = 'similar-items';
    /** The closest articles listed on an article's page. */
    const CONTENT_NEIGHBOURS = 8;

    public function render(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        $content = $this->contentNeighbours($view, $resource);
        // Only mount a loader for data the published snapshot holds, on the
        // canonical site the data endpoint serves (see PublishedData).
        $semantic = PublishedData::available($view, 'embeddings/similar.json')
            ? $this->renderTemplate($view, ['resource' => $resource])
            : '';
        return $content . $semantic;
    }

    /** "Closest in content", or '' when the item is on no full-text map. */
    private function contentNeighbours(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        if (!$resource instanceof ItemRepresentation || !PublishedData::onCanonicalSite($view)) return '';
        foreach ($resource->itemSets() as $itemSet) {
            foreach (Registry::forItemSet($itemSet->id()) as $entry) {
                // A sub-collection (identifier prefix) shares its item set's map, if any, with its siblings.
                if ($entry['identifierPrefix'] !== null || ($map = ContentMap::load($entry['slug'])) === null) continue;
                $gallery = ContentMap::gallery('collection-' . $entry['slug']);
                if ($gallery === null) continue;
                $public = [];
                foreach ($gallery['photos'] as $photo) {
                    if (is_array($photo) && isset($photo['id'])) $public[(int) $photo['id']] = $photo;
                }
                $ids = array_slice(ContentMap::neighboursOf($map, $resource->id(), $public), 0, self::CONTENT_NEIGHBOURS);
                if (!$ids) continue;
                return $view->partial('common/resource-page-block-layout/partials/content-neighbours', [
                    'resource' => $resource,
                    'collection' => $entry,
                    'neighbours' => array_map(static fn (int $id): array => $public[$id], $ids),
                    'model' => is_string($map['model']['name'] ?? null) ? $map['model']['name'] : '',
                ] + BlockRegistry::viewVars(self::SLUG));
            }
        }
        return '';
    }
}
