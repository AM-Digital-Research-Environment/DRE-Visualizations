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
