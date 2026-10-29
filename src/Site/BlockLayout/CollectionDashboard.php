<?php
declare(strict_types=1);
namespace DreVisualizations\Site\BlockLayout;

/**
 * The full collection dashboard — every aggregate visualization across the
 * entire collection (timelines, gantt, heatmaps, sunburst, chord, networks,
 * maps, …). This is the exhaustive view; for the curated home-page version see
 * the "Collection Overview" block. Both read the same precomputed
 * collection-overview.json; this one renders it with the complete `section`
 * layout while Collection Overview uses the trimmed `collectionOverview` layout.
 *
 * Label, admin text and template come from
 * `DreVisualizations\Site\BlockRegistry::BLOCKS['collection-dashboard']`.
 */
class CollectionDashboard extends AbstractDreBlockLayout
{
    const SLUG = 'collection-dashboard';
}
