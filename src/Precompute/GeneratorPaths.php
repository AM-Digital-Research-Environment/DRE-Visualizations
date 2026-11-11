<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Where one generation's artifacts go and where its static inputs come from.
 * The output directories live inside the publisher's staging directory; the
 * country outlines and word-cloud inputs ship with the module, the embedding
 * inputs are downloaded into the private store (EmbeddingInputs), and the
 * layout cache persists between generations in that store too.
 */
final readonly class GeneratorPaths
{
    public function __construct(
        public string $outputDir,
        public string $communitiesDir,
        public string $countriesGeojson,
        public string $knowledgeGraphsDir,
        public string $galleriesDir,
        public string $featuredDir,
        public string $itemSetDashboardsDir,
        public string $wordcloudsDir,
        public ?string $layoutCacheDir = null,
        // The installed semantic-input build (EmbeddingInputs); null reads the
        // module's own data/embeddings, as the golden tests do.
        public ?string $embeddingsDir = null,
    ) {}

    /**
     * The standard layout of one generation: every output directory under
     * $generationDir (the publisher's staging directory), the two inputs that
     * ship with the module, and, when given, the store's layout cache and the
     * installed semantic-input build. The one place the directory names live.
     */
    public static function forGeneration(
        string $generationDir,
        string $countriesGeojson,
        string $wordcloudsDir,
        ?string $layoutCacheDir = null,
        ?string $embeddingsDir = null,
    ): self {
        return new self(
            $generationDir . '/item-dashboards', $generationDir . '/communities', $countriesGeojson,
            $generationDir . '/knowledge-graphs', $generationDir . '/photo-galleries', $generationDir . '/featured-collections',
            $generationDir . '/item-set-dashboards', $wordcloudsDir, $layoutCacheDir, $embeddingsDir,
        );
    }

    /** The same paths with another layout cache. */
    public function withLayoutCacheDir(string $layoutCacheDir): self
    {
        return new self($this->outputDir, $this->communitiesDir, $this->countriesGeojson, $this->knowledgeGraphsDir,
            $this->galleriesDir, $this->featuredDir, $this->itemSetDashboardsDir, $this->wordcloudsDir,
            $layoutCacheDir, $this->embeddingsDir);
    }

    /** The same paths reading the semantic inputs from another build (null: the module's own). */
    public function withEmbeddingsDir(?string $embeddingsDir): self
    {
        return new self($this->outputDir, $this->communitiesDir, $this->countriesGeojson, $this->knowledgeGraphsDir,
            $this->galleriesDir, $this->featuredDir, $this->itemSetDashboardsDir, $this->wordcloudsDir,
            $this->layoutCacheDir, $embeddingsDir);
    }

    /** The generation root: every output directory is one level below it. */
    public function generationDir(): string
    {
        return dirname($this->outputDir);
    }

    /** Scoped semantic-map inputs: the downloaded build, else the module's data/embeddings. */
    public function embeddingsInputDir(): string
    {
        return $this->embeddingsDir ?? dirname($this->wordcloudsDir) . '/embeddings';
    }
}
