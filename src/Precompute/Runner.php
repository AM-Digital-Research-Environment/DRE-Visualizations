<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;


use Doctrine\DBAL\Connection;

/** Loads once, then coordinates independent corpus-to-artifact generators. */
final class Runner
{
    private $checkpoint;
    private $logFn;
    private JsonArtifactWriter $artifacts;

    public function __construct(
        private readonly Connection $connection,
        private readonly int $siteId,
        private readonly AmiraProfile $profile,
        private readonly string $outputDir,
        private readonly string $communitiesDir,
        private readonly string $countriesGeojson,
        private readonly string $knowledgeGraphsDir,
        private readonly string $galleriesDir,
        private readonly string $featuredDir,
        private readonly string $itemSetDashboardsDir,
        private readonly string $wordcloudsDir,
        ?callable $logFn = null,
        private readonly ?array $corpusStats = null,
        ?callable $checkpoint = null,
        private readonly array $sourceScope = [],
        // Persists ForceAtlas2 layouts between generations. Defaults to the
        // store root three levels above <store>/generations/<id>/item-dashboards.
        private readonly ?string $layoutCacheDir = null,
    ) {
        $this->checkpoint = $checkpoint ?? static function (): void {};
        $this->logFn = $logFn;
        $this->artifacts = new JsonArtifactWriter();
    }

    public function run(): array
    {
        $this->artifacts->ensureDirectory($this->outputDir);
        $data = (new DataLoader($this->connection, $this->siteId, $this->checkpoint))->load($this->logFn);
        $paths = new GeneratorPaths(
            $this->outputDir, $this->communitiesDir, $this->countriesGeojson, $this->knowledgeGraphsDir,
            $this->galleriesDir, $this->featuredDir, $this->itemSetDashboardsDir, $this->wordcloudsDir,
            $this->layoutCacheDir ?? dirname($this->outputDir, 3) . '/layout-cache',
        );
        foreach (['map', 'similar', 'report'] as $name) {
            $input = ScopedInput::read($paths->embeddingsInputDir() . '/' . $name . '.php', $this->sourceScope);
            if ($input !== null) $this->artifacts->write($paths->generationDir() . '/embeddings/' . $name . '.json', $input);
        }
        $aggregators = new Aggregators();
        $countries = $aggregators->buildCountryIndex($data->geo, $aggregators->loadCountryFeatures($this->countriesGeojson));
        foreach ($data->items as $id => $item) {
            ($this->checkpoint)();
            $parents = [];
            foreach ($data->links[$id] ?? [] as [$term, , $target]) {
                if ($term === 'dcterms:isPartOf' && ($data->items[$target]['template_id'] ?? null) === $this->profile->template('projects'))
                    $parents[] = ['id' => $target, 'name' => $data->items[$target]['title']];
            }
            $this->artifacts->write($paths->generationDir() . '/item-contexts/' . $id . '.json', [
                'itemId' => $id, 'year' => $data->itemYear[$id] ?? null, 'parents' => $parents,
                // Publications keep their abstract in bibo:abstract; everything else in dcterms:abstract.
                'abstract' => $data->literals[$id]['dcterms:abstract'][0] ?? $data->literals[$id]['bibo:abstract'][0] ?? '',
            ]);
        }
        $count = 0;
        // Order matters: each generator receives the stat counts gathered so far
        // (OverviewDashboardGenerator reads EntityDashboardGenerator's).
        $stats = [];
        foreach ([EntityDashboardGenerator::class, OverviewDashboardGenerator::class, MediaDashboardGenerator::class, CollectionGalleryGenerator::class] as $class) {
            ($this->checkpoint)();
            $generator = new $class($data, $this->profile, $paths, $this->logFn, $this->corpusStats, $this->checkpoint, $this->sourceScope, $stats, $countries);
            $count += $generator->generate();
            $stats = $generator->counts();
        }
        $log = function (string $message): void {
            ($this->checkpoint)();
            if ($this->logFn) ($this->logFn)($message);
        };
        $count += (new ItemSetDashboardGenerator($this->artifacts, $this->itemSetDashboardsDir, $log))->generate($data);
        $count += (new KnowledgeGraphGenerator($this->artifacts, $this->knowledgeGraphsDir, $log))->generate($data);
        return ['files' => $count, 'sourceCounts' => $data->sourceCounts(), 'warnings' => []];
    }
}
