<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;


/** Shared immutable corpus input and artifact utilities for focused generators. */
abstract class DashboardGenerator
{
    protected Aggregators $aggregators;
    protected array $items = [];
    protected array $links = [];
    protected array $reverseLinks = [];
    protected array $childrenOf = [];
    protected array $itemYear = [];
    protected array $itemDate = [];
    protected array $temporal = [];
    protected array $geo = [];
    protected array $itemSets = [];
    protected array $templateLabels = [];
    protected array $literals = [];
    protected array $primaryMedia = [];
    protected array $mediaItems = [];
    protected $checkpoint;
    protected array $countryIndex = [];

    /** Lazily-discovered marcrel:* role terms — see marcrelTerms(). */
    protected ?array $marcrelTerms = null;

    /**
     * Extra literals (dcterms:identifier, dcterms:description, bibo:doi) for the
     * items of the featured-collections item sets only — used to split Museu
     * Afro-Digital by identifier prefix and to derive ILAM volume/issue/pages.
     * Keyed item id => ['ident'=>?, 'desc'=>?, 'doi'=>?], read from the shared
     * literal map by CollectionGalleryGenerator.
     */
    protected array $featuredLiterals = [];

    /**
     * Entity counts for the Collection Overview stat cards. The per-entity
     * index passes (EntityDashboardGenerator) count entities with ≥1 linked
     * item; Runner hands those counts (counts()) to the next generator's
     * constructor, and OverviewDashboardGenerator reads them — so Runner must
     * run EntityDashboardGenerator first.
     */
    protected array $statCounts = [];

    /** Safety bound on a single gallery's serialised records (matches the block). */
    protected const MAX_GALLERY_PHOTOS = 600;

    /**
     * Spatial Exploration picker cap: the high-cardinality picker types (People,
     * Organisations, Subjects) are trimmed to this many entities — the top N by
     * mapped-place count — so the precomputed payload stays lean. Projects and
     * Research Sections are bounded (~40 / ~6) and kept whole.
     */
    protected const SPATIAL_PICKER_CAP = 400;

    protected int $fileCount = 0;

    protected JsonArtifactWriter $artifacts;

    /** @var callable|null A log sink: fn(string $message): void */
    protected $logFn;

    protected readonly string $outputDir;
    protected readonly string $communitiesDir;
    protected readonly string $countriesGeojson;
    protected readonly string $knowledgeGraphsDir;
    protected readonly string $galleriesDir;
    protected readonly string $featuredDir;
    protected readonly string $itemSetDashboardsDir;
    protected readonly string $wordcloudsDir;
    public function __construct(
        protected readonly CorpusSnapshot $corpus,
        protected readonly AmiraProfile $profile,
        protected readonly GeneratorPaths $paths,
        ?callable $logFn = null,
        protected readonly ?array $corpusStats = null,
        ?callable $checkpoint = null,
        protected readonly array $sourceScope = [],
        array $statCounts = [],
        array $countryIndex = [],
    ) {
        $this->checkpoint = $checkpoint ?? static function (): void {};
        $this->logFn = $logFn;
        $this->artifacts = new JsonArtifactWriter();
        $this->statCounts = $statCounts;
        foreach (['items', 'links', 'reverseLinks', 'childrenOf', 'itemYear', 'itemDate', 'temporal', 'geo', 'itemSets', 'templateLabels', 'literals', 'primaryMedia', 'mediaItems'] as $key) $this->{$key} = $corpus->{$key};
        $this->outputDir = $paths->outputDir;
        $this->communitiesDir = $paths->communitiesDir;
        $this->countriesGeojson = $paths->countriesGeojson;
        $this->knowledgeGraphsDir = $paths->knowledgeGraphsDir;
        $this->galleriesDir = $paths->galleriesDir;
        $this->featuredDir = $paths->featuredDir;
        $this->itemSetDashboardsDir = $paths->itemSetDashboardsDir;
        $this->wordcloudsDir = $paths->wordcloudsDir;
        $this->aggregators = new Aggregators($profile->template('persons'), $profile->template('projects'), $profile->universityLabels(), $paths->layoutCacheDir, $this->checkpoint);
        $this->countryIndex = $countryIndex;
    }

    /** Resource classes the generators group by (the profile pins templates, not classes). */
    protected const CLASS_SECTION = 'frapo:ResearchGroup';
    protected const CLASS_ORGANISATION = 'foaf:Organization';

    /** @var array<string,array<int,array>> class term => items of that class */
    private array $byClass = [];
    /** @var array<string,int[]> memo for linkingItems() */
    private array $linking = [];

    abstract public function generate(): int;

    /** Items of one resource class, id => info, built once per generator. */
    protected function itemsOfClass(string $classTerm): array
    {
        return $this->byClass[$classTerm] ??= $this->itemsWhere(fn ($info) => ($info['class_term'] ?? '') === $classTerm);
    }

    /**
     * Item ids that credit a person: creator, contributor, author/editor lists
     * and every marcrel:* role present in the data. Membership (foaf:member)
     * makes someone part of a group, not the author of its items, so the
     * category overviews leave it out ($withMembership = false).
     *
     * @return string[]
     */
    protected function personCreditTerms(bool $withMembership = true): array
    {
        return array_merge(
            $withMembership
                ? ['dcterms:creator', 'dcterms:contributor', 'foaf:member', 'bibo:authorList', 'bibo:editorList']
                : ['dcterms:creator', 'dcterms:contributor', 'bibo:authorList', 'bibo:editorList'],
            $this->marcrelTerms()
        );
    }

    /** @return string[] Terms that credit an organisation: funding, holding, and marcrel:* roles. */
    protected function institutionCreditTerms(): array
    {
        return array_merge(['frapo:isFundedBy', 'dcterms:provenance'], $this->marcrelTerms());
    }

    /**
     * Items linking to an entity through any of the terms — memoised, since
     * the radar pass, the dashboard pass and the spatial picker each ask for
     * the same entity.
     *
     * @return int[]
     */
    protected function linkingItems(int $entityId, array $terms): array
    {
        return $this->linking[$entityId . '|' . implode(',', $terms)]
            ??= $this->aggregators->findItemsLinkingTo($entityId, $this->reverseLinks, $terms);
    }
    public function counts(): array { return $this->statCounts; }

    protected function log(string $msg): void
    {
        ($this->checkpoint)();
        if ($this->logFn !== null) {
            ($this->logFn)($msg);
        }
    }

    protected function save(int|string $id, array $dashboard): void
    {
        $this->writeJson($this->outputDir . '/' . $id . '.json', $dashboard);
        $this->fileCount++;
    }

    protected function saveIndex(string $file, array $index): void
    {
        usort($index, static fn ($a, $b) => strcmp((string) $a['name'], (string) $b['name'])
            ?: ((int) ($a['id'] ?? 0) <=> (int) ($b['id'] ?? 0)));
        $this->writeJson($this->outputDir . '/' . $file, $index);
        $this->log('  ' . $file . ': ' . count($index) . ' entries');
    }

    protected function writeJson(string $path, array $payload): void
    {
        ($this->checkpoint)();
        $this->artifacts->write($path, $payload);
    }

    protected function addStandardCharts(array &$dashboard, int $entityId, string $entityTitle, array $itemIds): void
    {
        if ($v = $this->aggregators->buildHeatmap($itemIds, $this->links, $this->items)) {
            $dashboard['heatmap'] = $v;
        }
        if ($v = $this->aggregators->buildChord($itemIds, $this->links, $this->items)) {
            $dashboard['chord'] = $v;
        }
        if ($v = $this->aggregators->buildStackedTimeline($itemIds, $this->links, $this->items, $this->itemYear)) {
            $dashboard['stackedTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildSankey($itemIds, $this->links, $this->items)) {
            $dashboard['sankey'] = $v;
        }
        if ($v = $this->aggregators->buildSunburst($itemIds, $this->links, $this->items)) {
            $dashboard['sunburst'] = $v;
        }
        if ($v = $this->aggregators->buildRoles($itemIds, $this->links, $this->items)) {
            $dashboard['roles'] = $v;
        }
        if ($v = $this->aggregators->buildContributorNetwork($entityId, $entityTitle, $itemIds, $this->items, $this->links, $this->childrenOf)) {
            $dashboard['contributorNetwork'] = $v;
        }
        if ($v = $this->aggregators->buildSubjectTrends($itemIds, $this->links, $this->items, $this->itemYear)) {
            $dashboard['subjectTrends'] = $v;
        }
        if ($v = $this->aggregators->buildLanguageTimeline($itemIds, $this->links, $this->items, $this->itemYear)) {
            $dashboard['languageTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildTreemap($itemIds, $this->links, $this->items, $this->childrenOf, $entityTitle)) {
            $dashboard['treemap'] = $v;
        }
        if ($v = $this->aggregators->buildGeoFlows($itemIds, $this->links, $this->items, $this->geo)) {
            $dashboard['geoFlows'] = $v;
        }
        if ($v = $this->aggregators->buildChoropleth($itemIds, $this->links, $this->countryIndex)) {
            $dashboard['choropleth'] = $v;
        }
        if ($v = $this->aggregators->buildTimeChord($itemIds, $this->links, $this->items, $this->itemYear)) {
            $dashboard['timeChord'] = $v;
        }
    }

    protected function publicationIds(): array
    {
        return array_values($this->itemSets[$this->profile->itemSet('publications')] ?? []);
    }

    protected function podcastIds(): array
    {
        return array_values($this->itemSets[$this->profile->itemSet('podcasts')] ?? []);
    }

    protected function youtubeIds(): array
    {
        return array_values($this->itemSets[$this->profile->itemSet('youtube')] ?? []);
    }

    protected function itemsWhere(callable $pred): array
    {
        $out = [];
        foreach ($this->items as $id => $info) {
            if ($pred($info)) {
                $out[$id] = $info;
            }
        }
        return $out;
    }

    protected function loadValueRows(array $ids, array $terms): array
    {
        $unloaded = array_diff($terms, DataLoader::LITERAL_TERMS);
        if ($unloaded) {
            throw new \LogicException('DataLoader does not load ' . implode(', ', $unloaded) . '; add it to DataLoader::LITERAL_TERMS.');
        }
        $rows = [];
        foreach ($ids as $id) foreach ($terms as $term) {
            foreach ($this->literals[$id][$term] ?? [] as $value) $rows[] = [$id, $term, $value];
        }
        return $rows;
    }
    protected function marcrelTerms(): array
    {
        if ($this->marcrelTerms !== null) {
            return $this->marcrelTerms;
        }
        $terms = [];
        foreach ($this->reverseLinks as $rev) {
            foreach ($rev as $t => $_) {
                if (str_starts_with($t, 'marcrel:')) {
                    $terms[$t] = $t;
                }
            }
        }
        return $this->marcrelTerms = array_values($terms);
    }
}
