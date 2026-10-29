<?php
declare(strict_types=1);
namespace DreVisualizations\Site;

/**
 * The one place a block is described.
 *
 * A block used to be declared in five places that only a lint reconciled: the
 * invokable in config/module.config.php, the label, description and template in
 * its BlockLayout class, a second label plus the embed kind in
 * EmbedController::BLOCKS, the data-embed-slug literal in its template, and the
 * asset options its template passed to DashboardAssets. Now the slug is the
 * spine. It is at once the key of these tables, the template name
 * (common/block-layout/<slug> or common/resource-page-block-layout/<slug>), the
 * embed route segment (/s/:site/dre-embed/<slug>) and the data-embed-slug the
 * block stamps, which its template reads from the `$slug` view variable.
 *
 * The invokable stays literal in config/module.config.php as well: module
 * config is merged while Omeka is still bootstrapping, before this class is
 * reliably autoloadable. tests/BlockRegistryTest.php fails when the config, the
 * classes, the templates and this table disagree.
 *
 * Labels and descriptions keep their `// @translate` markers here: that is what
 * scripts/extract-translations.mjs reads into language/template.pot.
 */
final class BlockRegistry
{
    /**
     * Site-page blocks, slug => row:
     *   invokable   the layout name Omeka stores on saved pages (never rename it)
     *   class       the BlockLayout class, whose SLUG is this key
     *   label       admin label
     *   description the admin form's text for a block with nothing to configure,
     *               or null for a block whose class builds its own form
     *   plan        the DashboardAssets plan in config/asset-plans.json
     *   embed       null, or how /dre-embed serves it: its gallery label and
     *               kind ('dashboard': built by dashboard.js from a layout of chart
     *               keys, so single charts embed too, with the artifact itemId and
     *               layout; 'widget': one self-contained controller, whole only).
     *               Embeddable blocks are zero-configuration: the embed route has
     *               no $block.
     */
    public const BLOCKS = [
        'collection-dashboard' => [
            'invokable'   => 'dreCollectionDashboard',
            'class'       => BlockLayout\CollectionDashboard::class,
            'label'       => 'Collection Dashboard', // @translate
            'description' => 'The full set of aggregate visualisations across the entire collection. For a curated, home-page-friendly subset use the "Collection Overview" block instead. No configuration needed.', // @translate
            'plan'        => 'dashboard',
            'embed'       => [
                'label' => 'Collection dashboard', // @translate
                'kind' => 'dashboard', 'itemId' => 'collection-overview', 'layout' => 'section',
            ],
        ],
        'collection-overview' => [
            'invokable'   => 'dreCollectionOverview',
            'class'       => BlockLayout\CollectionOverview::class,
            'label'       => 'Collection Overview', // @translate
            'description' => 'A curated overview for the home page: summary cards, the Africa Multiple Research Centres (AMRCs) & partners map, research sections, the section × university breakdown, an item timeline, resource types, languages, subjects and a map of items by country. For the full set of visualisations use the "Collection Dashboard" block instead. No configuration needed.', // @translate
            'plan'        => 'dashboard',
            'embed'       => [
                'label' => 'Collection overview', // @translate
                'kind' => 'dashboard', 'itemId' => 'collection-overview', 'layout' => 'collectionOverview',
            ],
        ],
        'compare-entity' => [
            'invokable'   => 'dreCompareEntity',
            'class'       => BlockLayout\CompareEntity::class,
            'label'       => 'Compare (any entity)', // @translate
            'description' => 'Side-by-side comparison of any two entities of the same type (projects, people, institutions, subjects, languages, genres), with an in-page type switcher. No configuration needed.', // @translate
            'plan'        => 'compare',
            'embed'       => [
                'label' => 'Compare two of anything', // @translate
                'kind' => 'widget',
            ],
        ],
        'compare-genres' => [
            'invokable'   => 'dreCompareGenres',
            'class'       => BlockLayout\CompareGenres::class,
            'label'       => 'Compare Genres', // @translate
            'description' => 'Side-by-side comparison of two genres. No configuration needed.', // @translate
            'plan'        => 'compare',
            'embed'       => [
                'label' => 'Compare two genres', // @translate
                'kind' => 'widget',
            ],
        ],
        'discursive-communities' => [
            'invokable'   => 'dreDiscursiveCommunities',
            'class'       => BlockLayout\DiscursiveCommunities::class,
            'label'       => 'Discursive Communities', // @translate
            'description' => 'Collection-wide entity network: people, organisations, places, subjects and tags that co-occur across the research items, rendered as an explorable force-directed graph (MapLibre GL, positions precomputed) and coloured by entity type. No configuration needed.', // @translate
            'plan'        => 'entityGraph',
            'embed'       => [
                'label' => 'Discursive communities (entity network)', // @translate
                'kind' => 'widget',
            ],
        ],
        'featured-collections' => [
            'invokable'   => 'dreFeaturedCollections',
            'class'       => BlockLayout\FeaturedCollections::class,
            'label'       => 'Featured Collections', // @translate
            'description' => null,
            'plan'        => 'featuredCollections',
            'embed'       => null,
        ],
        'network-explorer' => [
            'invokable'   => 'dreNetworkExplorer',
            'class'       => BlockLayout\NetworkExplorer::class,
            'label'       => 'Network Explorer', // @translate
            'description' => 'Collection-wide network explorer for contributors, co-authorship, people-institution affiliations, and institution collaborations. No configuration needed.', // @translate
            'plan'        => 'network',
            'embed'       => [
                'label' => 'Network explorer', // @translate
                'kind' => 'widget',
            ],
        ],
        'photo-browse' => [
            'invokable'   => 'drePhotoBrowse',
            'class'       => BlockLayout\PhotoBrowse::class,
            'label'       => 'Photo Browsing', // @translate
            'description' => null,
            'plan'        => 'photoBrowse',
            'embed'       => null,
        ],
        'podcasts' => [
            'invokable'   => 'drePodcasts',
            'class'       => BlockLayout\Podcasts::class,
            'label'       => 'Podcasts', // @translate
            'description' => 'Analytics for the cluster podcast episodes: a word cloud built from the episode transcripts, the most frequent speakers, episode length, the publication timeline, and the series breakdown. No configuration needed.', // @translate
            'plan'        => 'dashboard',
            'embed'       => [
                'label' => 'Podcasts', // @translate
                'kind' => 'dashboard', 'itemId' => 'podcasts', 'layout' => 'podcasts',
            ],
        ],
        'project-explorer' => [
            'invokable'   => 'dreProjectExplorer',
            'class'       => BlockLayout\ProjectExplorer::class,
            'label'       => 'Project Explorer', // @translate
            'description' => 'A project selector that retunes a full dashboard beneath it. No configuration needed.', // @translate
            'plan'        => 'explorer',
            'embed'       => [
                'label' => 'Project explorer', // @translate
                'kind' => 'widget',
            ],
        ],
        'publications' => [
            'invokable'   => 'drePublications',
            'class'       => BlockLayout\Publications::class,
            'label'       => 'Publications', // @translate
            'description' => 'Bibliographic analytics across all publications (articles, books, chapters, …): by-template breakdown, top venues and authors, co-author network and keyword co-occurrence. No configuration needed.', // @translate
            'plan'        => 'dashboard',
            'embed'       => [
                'label' => 'Publications', // @translate
                'kind' => 'dashboard', 'itemId' => 'publications', 'layout' => 'publications',
            ],
        ],
        'semantic-map' => [
            'invokable'   => 'dreSemanticMap',
            'class'       => BlockLayout\SemanticMap::class,
            'label'       => 'Semantic Map', // @translate
            'description' => 'Explore podcasts, videos, publications, projects, research sections, and research items in one multilingual semantic space. No configuration needed.', // @translate
            'plan'        => 'semanticMap',
            'embed'       => [
                'label' => 'Records by similarity', // @translate
                'kind' => 'widget',
            ],
        ],
        'spatial-exploration' => [
            'invokable'   => 'dreSpatialExploration',
            'class'       => BlockLayout\SpatialExploration::class,
            'label'       => 'Spatial Exploration', // @translate
            'description' => 'Collection-wide map of every geocoded place the research items reference (origins and current locations), as bubbles sized by how many items mention each place. A sidebar lets visitors filter the map to a single project, research section, person, organisation or subject, and a country dropdown zooms in. Positions are precomputed (MapLibre GL). No configuration needed.', // @translate
            'plan'        => 'spatial',
            'embed'       => [
                'label' => 'Spatial exploration (map of places)', // @translate
                'kind' => 'widget',
            ],
        ],
        'whats-new' => [
            'invokable'   => 'dreWhatsNew',
            'class'       => BlockLayout\WhatsNew::class,
            'label'       => "What's New", // @translate
            'description' => 'Recent additions and the most-active projects, in 3 / 6 / 12-month windows. No configuration needed.', // @translate
            'plan'        => 'whatsNew',
            'embed'       => [
                'label' => "What's new", // @translate
                'kind' => 'widget',
            ],
        ],
        'youtube' => [
            'invokable'   => 'dreYoutube',
            'class'       => BlockLayout\YouTube::class,
            'label'       => 'YouTube', // @translate
            'description' => 'Analytics for the cluster YouTube channel: videos by year, the language mix and how it shifts over time, the channel\'s playlists, and any credited speakers. No configuration needed.', // @translate
            'plan'        => 'dashboard',
            'embed'       => [
                'label' => 'YouTube', // @translate
                'kind' => 'dashboard', 'itemId' => 'youtube', 'layout' => 'youtube',
            ],
        ],
    ];

    /**
     * Resource-page blocks, slug => row: invokable, class (whose SLUG is this
     * key), label, the resource types it applies to, and its plan. Each class
     * keeps its own render() for the condition that decides whether it shows.
     */
    public const RESOURCE_BLOCKS = [
        'item-set-dashboard' => [
            'invokable'   => 'dreItemSetDashboard',
            'class'       => ResourcePageBlockLayout\ItemSetDashboard::class,
            'label'       => 'Item Set Dashboard', // @translate
            'resources'   => ['item_sets'],
            'plan'        => 'dashboard',
        ],
        'knowledge-graph' => [
            'invokable'   => 'dreKnowledgeGraph',
            'class'       => ResourcePageBlockLayout\KnowledgeGraph::class,
            'label'       => 'Knowledge Graph', // @translate
            'resources'   => ['items'],
            'plan'        => 'knowledgeGraph',
        ],
        'linked-items-dashboard' => [
            'invokable'   => 'dreLinkedItemsDashboard',
            'class'       => ResourcePageBlockLayout\LinkedItemsDashboard::class,
            'label'       => 'Visualisations', // @translate
            'resources'   => ['items'],
            'plan'        => 'dashboard',
        ],
        'sibling-items-sparkline' => [
            'invokable'   => 'dreSiblingItemsSparkline',
            'class'       => ResourcePageBlockLayout\SiblingItemsSparkline::class,
            'label'       => 'Sibling Items Sparkline', // @translate
            'resources'   => ['items'],
            'plan'        => 'siblingSparkline',
        ],
        'similar-items' => [
            'invokable'   => 'dreSimilarItems',
            'class'       => ResourcePageBlockLayout\SimilarItems::class,
            'label'       => 'Similar Items', // @translate
            'resources'   => ['items'],
            'plan'        => 'similarItems',
        ],
    ];

    /** A site-page block's row; an unknown slug throws. */
    public static function get(string $slug): array
    {
        return self::BLOCKS[$slug] ?? throw new \InvalidArgumentException('Unknown DRE Visualizations block: ' . $slug);
    }

    /** A resource-page block's row; an unknown slug throws. */
    public static function resource(string $slug): array
    {
        return self::RESOURCE_BLOCKS[$slug] ?? throw new \InvalidArgumentException('Unknown DRE Visualizations resource-page block: ' . $slug);
    }

    public static function template(string $slug): string
    {
        self::get($slug);
        return 'common/block-layout/' . $slug;
    }

    public static function resourceTemplate(string $slug): string
    {
        self::resource($slug);
        return 'common/resource-page-block-layout/' . $slug;
    }

    /**
     * The variables every block template receives, from the page and the embed
     * route alike: its slug (the data-embed-slug it stamps) and its asset plan.
     *
     * @return array{slug: string, plan: string}
     */
    public static function viewVars(string $slug): array
    {
        $row = self::BLOCKS[$slug] ?? self::resource($slug);
        return ['slug' => $slug, 'plan' => $row['plan']];
    }

    /**
     * The embeddable blocks, slug => [label, template, kind, itemId?, layout?],
     * the shape EmbedController and the gallery read.
     *
     * @return array<string, array{label: string, template: string, kind: string, itemId?: string, layout?: string}>
     */
    public static function embeddable(): array
    {
        $blocks = [];
        foreach (self::BLOCKS as $slug => $row) {
            if ($row['embed'] !== null) $blocks[$slug] = ['template' => $slug] + $row['embed'];
        }
        return $blocks;
    }
}
