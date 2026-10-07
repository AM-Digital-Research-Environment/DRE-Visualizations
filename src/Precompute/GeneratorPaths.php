<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

/**
 * Where one generation's artifacts go and where its static inputs come from.
 * The output directories live inside the publisher's staging directory; the
 * inputs (country outlines, word-cloud and embedding inputs) ship with the
 * module; the layout cache persists between generations in the private store.
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
    ) {}

    /** The generation root: every output directory is one level below it. */
    public function generationDir(): string
    {
        return dirname($this->outputDir);
    }

    /** Scoped semantic-map inputs, committed next to the word-cloud inputs. */
    public function embeddingsInputDir(): string
    {
        return dirname($this->wordcloudsDir) . '/embeddings';
    }
}
