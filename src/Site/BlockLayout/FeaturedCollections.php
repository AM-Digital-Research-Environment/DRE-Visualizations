<?php
declare(strict_types=1);
namespace DreVisualizations\Site\BlockLayout;

use Laminas\Form\Element;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\SitePageBlockRepresentation;
use Omeka\Api\Representation\SitePageRepresentation;
use Omeka\Api\Representation\SiteRepresentation;
use Omeka\Site\BlockLayout\AbstractBlockLayout;
use DreVisualizations\FeaturedCollections\Registry;
use DreVisualizations\Precompute\PublishedSnapshot;

/**
 * Featured Collections landing block.
 *
 * Renders the curated {@see Registry} as a grid of collection cards (cover
 * mosaic, title, tagline, description, partner credit, item/photo counts and a
 * "Browse →" call to action), each linking to that collection's detail page.
 * Mirrors the amira dashboard's /collections index.
 *
 * Per-collection counts and cover images come from the precompute
 * (featured-collections/index.json in private storage, built by Regenerate). The curated list itself never needs
 * editor configuration — add a collection to the Registry and it appears here.
 */
class FeaturedCollections extends AbstractBlockLayout
{
    /** Cover images shown in a card's mosaic. */
    const COVER_LIMIT = 4;

    public function getLabel()
    {
        return 'Featured Collections'; // @translate
    }

    public function form(PhpRenderer $view, SiteRepresentation $site,
        ?SitePageRepresentation $page = null, ?SitePageBlockRepresentation $block = null)
    {
        $data = $block ? $block->data() : [];

        $heading = new Element\Text('o:block[__blockIndex__][o:data][heading]');
        $heading->setAttribute('placeholder', $view->translate('Optional section heading'))
            ->setValue($data['heading'] ?? '');

        return '<div class="field">'
            . '<div class="field-meta"><label>' . $view->escapeHtml($view->translate('Heading')) . '</label>'
            . '<div class="field-description">'
            . $view->escapeHtml($view->translate('Optional heading shown above the collection grid. The collections themselves come from the module registry.'))
            . '</div></div>'
            . '<div class="inputs">' . $view->formText($heading) . '</div>'
            . '</div>';
    }

    public function render(PhpRenderer $view, SitePageBlockRepresentation $block,
        $templateViewScript = 'common/block-layout/featured-collections')
    {
        $site = $view->currentSite();
        if (!$site || !$site->isPublic() || $site->id() !== (int) $view->setting(\DreVisualizations\Module::SETTING_SITE_ID, 0)) return '';
        return $view->partial($templateViewScript, [
            'block'    => $block,
            'heading'  => (string) $block->dataValue('heading', ''),
            'entries'  => Registry::all(),
            'cardData' => $this->cardData($view),
        ]);
    }

    /**
     * Per-slug card data: `['itemCount'=>int, 'photoCount'=>?int, 'covers'=>string[]]`.
     * Reads the current protected snapshot.
     *
     * @return array<string,array{itemCount:int,photoCount:?int,covers:array<int,string>}>
     */
    private function cardData(PhpRenderer $view): array
    {
        $index = $this->loadIndex();
        $out = [];

        foreach (Registry::all() as $entry) {
            $slug = $entry['slug'];

            // Fast path: the precomputed index. Covers are stored as storage ids.
            if (isset($index[$slug]) && is_array($index[$slug])) {
                $row = $index[$slug];
                $covers = [];
                foreach (($row['covers'] ?? []) as $storage) {
                    $storage = (string) $storage;
                    if ($storage !== '') {
                        $covers[] = $view->dreFileUrl('large', $storage);
                    }
                }
                $out[$slug] = [
                    'itemCount'  => (int) ($row['itemCount'] ?? 0),
                    'photoCount' => isset($row['photoCount']) ? (int) $row['photoCount'] : null,
                    'covers'     => $covers,
                ];
                continue;
            }

            $out[$slug] = ['itemCount' => 0, 'photoCount' => null, 'covers' => []];
        }
        return $out;
    }

    private function loadIndex(): array
    {
        $dataDir = \DreVisualizations\Precompute\SnapshotStore::tryDefault()?->directory;
        $data = $dataDir === null ? null : PublishedSnapshot::readJson($dataDir, 'featured-collections/index.json');
        return is_array($data) ? $data : [];
    }
}
