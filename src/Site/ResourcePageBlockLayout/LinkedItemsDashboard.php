<?php
declare(strict_types=1);
namespace DreVisualizations\Site\ResourcePageBlockLayout;

use DreVisualizations\FeaturedCollections\ContentMap;
use DreVisualizations\FeaturedCollections\Registry;
use DreVisualizations\Site\PublishedData;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\AbstractResourceEntityRepresentation;

/** Label, resource types and template: BlockRegistry::RESOURCE_BLOCKS['linked-items-dashboard']. */
class LinkedItemsDashboard extends AbstractDreResourcePageBlockLayout
{
    const SLUG = 'linked-items-dashboard';

    /** $dataDir overrides the default store (tests); resolved per render, so a storage fault hides the block. */
    public function __construct(private readonly ?string $dataDir = null) {}

    public function render(PhpRenderer $view, AbstractResourceEntityRepresentation $resource): string
    {
        // The publisher is authoritative: not every item has an aggregate
        // dashboard. In particular, research records may have a knowledge graph
        // without a dashboard. Do not mount a loader for a nonexistent artifact.
        $dashboard = PublishedData::available($view, 'item-dashboards/' . $resource->id() . '.json', $this->dataDir);
        // A research project's images, from all of its collections
        // (photo-galleries/project-<item id>.json, written for projects only).
        $gallery = PublishedData::onCanonicalSite($view)
            ? ContentMap::gallery('project-' . $resource->id(), $this->dataDir)
            : null;
        // A project whose collection is a featured one (ILAM) shows that
        // collection's gallery instead: its articles grouped by journal issue,
        // with the full-text views, rather than every cover as a photo.
        $featured = null;
        if ($gallery !== null && $gallery['photos']) {
            $featured = $this->featuredEntry($view, (int) $resource->id());
            $collection = $featured === null ? null : ContentMap::gallery('collection-' . $featured['slug'], $this->dataDir);
            if ($collection !== null && $collection['photos']) {
                $gallery = $collection;
            } else {
                $featured = null;
            }
        }
        if (!$dashboard && ($gallery === null || !$gallery['photos'])) {
            return '';
        }

        return $this->renderTemplate($view, [
            'resource' => $resource,
            'dashboard' => $dashboard,
            'gallery' => $gallery && $gallery['photos'] ? $gallery : null,
            'featured' => $featured,
        ]);
    }

    /**
     * The featured collection whose item set names this project in
     * dcterms:isPartOf, or null. A set the viewer may not read (a private
     * one) or any read failure falls back to the project's own gallery.
     */
    private function featuredEntry(PhpRenderer $view, int $projectId): ?array
    {
        try {
            return Registry::forProject($projectId, static function (int $setId) use ($view): array {
                $set = $view->api()->read('item_sets', $setId)->getContent();
                $ids = [];
                foreach ($set->value('dcterms:isPartOf', ['all' => true]) as $value) {
                    $target = $value->valueResource();
                    if ($target !== null) {
                        $ids[] = (int) $target->id();
                    }
                }
                return $ids;
            });
        } catch (\Throwable) {
            return null;
        }
    }
}
