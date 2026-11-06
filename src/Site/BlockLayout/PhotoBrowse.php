<?php
declare(strict_types=1);
namespace DreVisualizations\Site\BlockLayout;

use Laminas\Form\Element;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\SitePageBlockRepresentation;
use Omeka\Api\Representation\SitePageRepresentation;
use Omeka\Api\Representation\SiteRepresentation;
use DreVisualizations\Site\BlockRegistry;
use DreVisualizations\FeaturedCollections\ContentMap;
use DreVisualizations\FeaturedCollections\Registry;
use DreVisualizations\Precompute\AmiraProfile;

/**
 * Photo Browsing site-page block.
 *
 * The editor picks one (image-heavy) item set; the view server-renders that
 * set's image-bearing items into masonry / map / timeline browsers with a
 * lightbox. Thumbnails come straight from Omeka S derivatives, coordinates from
 * geo:lat/geo:long, dates from the usual date properties.
 *
 * Optionally the editor instead picks a **Featured collection** (see
 * {@see Registry}); the block then pulls its records (an item set or a research
 * project), an optional sub-collection filter (e.g. one of Museu Afro-Digital's
 * three sub-collections, split by dcterms:identifier prefix), the grouping mode
 * (journal issues for ILAM) and the allowed views from the registry — so the
 * three Museu pages can all draw from one project yet show different
 * sub-collections, and ILAM renders as issues with a table of contents.
 *
 * Or the editor picks a **Project**: the gallery then shows every record of
 * that research project (photo-galleries/project-<item id>.json), whichever of
 * its collections holds it. The project item page shows the same gallery in
 * its Visualisations block ({@see self::projectGalleryVars()}).
 *
 * Editorial control by design (Phase 6): drop one block per gallery on any
 * curated site page. The rendering engine (asset/js/item-set-photo-views.js) is
 * surface-agnostic.
 */
class PhotoBrowse extends AbstractDreBlockLayout
{
    const SLUG = 'photo-browse';

    /** Available view modes, in toggle order. */
    const VIEWS = ['masonry', 'map', 'timeline'];

    public function form(PhpRenderer $view, SiteRepresentation $site,
        ?SitePageRepresentation $page = null, ?SitePageBlockRepresentation $block = null)
    {
        $data = $block ? $block->data() : [];

        // A curated featured collection (optional). When set, it supplies the
        // item set, sub-collection filter, grouping and views — so the editor
        // need not pick an item set, and the three Museu sub-collections (same
        // item set 6295) are told apart by the chosen entry.
        $featured = new Element\Select('o:block[__blockIndex__][o:data][featured_collection]');
        $featured->setValueOptions(Registry::selectOptions())
            ->setEmptyOption($view->translate('— None (plain item-set gallery) —'))
            ->setValue($data['featured_collection'] ?? '');

        $project = new Element\Select('o:block[__blockIndex__][o:data][project]');
        $project->setValueOptions($this->projectOptions($view, $site))
            ->setEmptyOption($view->translate('Select a project…'))
            ->setAttribute('class', 'chosen-select')
            ->setValue($data['project'] ?? '');

        // Item-set options: prefer the sets assigned to this site; fall back to
        // every item set when the site has none assigned (research collections
        // often are not site-scoped). Sorted by title for a usable dropdown.
        $valueOptions = $this->itemSetOptions($view, $site);

        $itemSet = new Element\Select('o:block[__blockIndex__][o:data][item_set]');
        $itemSet->setValueOptions($valueOptions)
            ->setEmptyOption($view->translate('Select an item set…'))
            ->setAttribute('class', 'chosen-select')
            ->setValue($data['item_set'] ?? '');

        $heading = new Element\Text('o:block[__blockIndex__][o:data][heading]');
        $heading->setAttribute('placeholder', $view->translate('Optional gallery title'))
            ->setValue($data['heading'] ?? '');

        $defaultView = new Element\Select('o:block[__blockIndex__][o:data][default_view]');
        $defaultView->setValueOptions([
            'masonry'  => $view->translate('Grid (masonry)'),
            'map'      => $view->translate('Map'),
            'timeline' => $view->translate('Timeline'),
        ])->setValue($data['default_view'] ?? 'masonry');

        return $this->field($view,
                $view->translate('Featured collection'),
                $view->translate('Optional. Pick a curated collection to apply its item set, sub-collection filter, journal-issue grouping and views automatically. Leave as “None” to configure a plain gallery below.'),
                $view->formSelect($featured))
            . $this->field($view,
                $view->translate('Project'),
                $view->translate('A research project whose images to display, from all of its collections. Ignored when a Featured collection is selected above.'),
                $view->formSelect($project))
            . $this->field($view,
                $view->translate('Item set'),
                $view->translate('The image-heavy item set to display as a photo gallery. Ignored when a Featured collection or a Project is selected above.'),
                $view->formSelect($itemSet))
            . $this->field($view,
                $view->translate('Gallery title'),
                $view->translate('Optional heading shown above the gallery.'),
                $view->formText($heading))
            . $this->field($view,
                $view->translate('Default view'),
                $view->translate('Which browser opens first. Timeline needs dated items; Map needs coordinates (and is off for journal-issue collections). Each is hidden automatically when it does not apply.'),
                $view->formSelect($defaultView));
    }

    public function render(PhpRenderer $view, SitePageBlockRepresentation $block,
        $templateViewScript = null)
    {
        $site = $view->currentSite();
        if (!$site || !$site->isPublic() || $site->id() !== (int) $view->setting(\DreVisualizations\Module::SETTING_SITE_ID, 0)) return '';
        // A featured collection wins over a project, and a project over an
        // explicit item set.
        $entry = null;
        $slug = (string) $block->dataValue('featured_collection', '');
        if ($slug !== '') {
            $entry = Registry::bySlug($slug);
        }
        $projectId = $entry === null ? (int) $block->dataValue('project', 0) : 0;

        // Auto-apply: when no collection or project was picked but the chosen
        // item set maps to exactly one whole-set registry entry (ILAM; a
        // prefix-split sub-collection is ambiguous and must be chosen), use it.
        // So those existing gallery pages gain issue grouping / partner credit
        // without re-wiring.
        $rawSet = (int) $block->dataValue('item_set', 0);
        if ($entry === null && $projectId < 1 && $rawSet > 0) {
            $candidates = Registry::forItemSet($rawSet);
            if (count($candidates) === 1 && $candidates[0]['identifierPrefix'] === null) {
                $entry = $candidates[0];
            }
        }

        // The published gallery: photo-galleries/<key>.json.
        if ($entry !== null) {
            $galleryKey = 'collection-' . $entry['slug'];
        } elseif ($projectId > 0) {
            $galleryKey = 'project-' . $projectId;
        } else {
            $galleryKey = $rawSet > 0 ? (string) $rawSet : null;
        }

        $grouping = $entry ? $entry['grouping'] : 'photo';
        $prefix = $entry ? ($entry['identifierPrefix'] ?? null) : null;
        $partner = $entry ? ($entry['partner'] ?? null) : null;
        // Heading: only the editor's explicit heading. Featured-collection pages
        // already carry a Page Title block with the collection name, so the
        // gallery does not repeat it (it shows the partner credit + counts).
        $heading = (string) $block->dataValue('heading', '');

        // Allowed views: the registry can opt a collection out of map/timeline.
        $allowedViews = $entry ? $entry['views'] : ['masonry' => true, 'map' => true, 'timeline' => true];
        if ($grouping === 'issue') {
            // Issue collections (ILAM) keep the masonry issue grid as the default
            // and gain a chronological timeline of issues (each cover placed by
            // its year, click opens the table of contents). Map stays off — a
            // journal has a single host location.
            $allowedViews = [
                'masonry'  => true,
                'map'      => false,
                'timeline' => $allowedViews['timeline'] ?? true,
            ];
        }

        $defaultView = $block->dataValue('default_view', 'masonry');
        if (!in_array($defaultView, self::VIEWS, true)) {
            $defaultView = 'masonry';
        }

        return $view->partial($templateViewScript ?? BlockRegistry::template(self::SLUG), [
            'galleryKey'      => $galleryKey,
            'heading'         => $heading,
            'defaultView'     => $defaultView,
            'precomputed'     => $galleryKey !== null ? ContentMap::gallery($galleryKey) : null,
            'identifierPrefix' => $prefix,
            'grouping'        => $grouping,
            'partner'         => $partner,
            'allowedViews'    => $allowedViews,
            // The "By content" view: a committed full-text map, when the
            // collection has one (FeaturedCollections\ContentMap).
            'contentMap'      => $entry ? ContentMap::load($entry['slug']) : null,
            // Its Words view: the committed word counts, when there are any.
            'contentWords'    => $entry ? ContentMap::wordsAsset($entry['slug']) : null,
        ] + BlockRegistry::viewVars(self::SLUG));
    }

    /**
     * The template variables of a research project's gallery, for the project
     * item page's Visualisations block: every view its records allow, and none
     * of a featured collection's extras. $precomputed is the published
     * photo-galleries/project-<item id>.json.
     *
     * @param array{total:int,photos:array} $precomputed
     */
    public static function projectGalleryVars(int $projectId, array $precomputed, string $heading): array
    {
        return [
            'galleryKey'       => 'project-' . $projectId,
            'heading'          => $heading,
            'defaultView'      => 'masonry',
            'precomputed'      => $precomputed,
            'identifierPrefix' => null,
            'grouping'         => 'photo',
            'partner'          => null,
            'allowedViews'     => ['masonry' => true, 'map' => true, 'timeline' => true],
            'contentMap'       => null,
            'contentWords'     => null,
        ] + BlockRegistry::viewVars(self::SLUG);
    }

    /**
     * Research projects by title: this site's, else every project. Read as
     * scalars, so the form costs one query rather than a representation per
     * project.
     *
     * @return array<int,string> project item id => title
     */
    private function projectOptions(PhpRenderer $view, SiteRepresentation $site): array
    {
        $template = AmiraProfile::fromFile(dirname(__DIR__, 3) . '/config/amira-profile.json')->template('projects');
        $query = ['resource_template_id' => $template];
        $titles = $view->api()->search('items', $query + ['site_id' => $site->id()], ['returnScalar' => 'title'])->getContent()
            ?: $view->api()->search('items', $query, ['returnScalar' => 'title'])->getContent();
        $opts = [];
        foreach ($titles as $id => $title) {
            $title = trim((string) $title);
            $opts[(int) $id] = $title !== '' ? $title : sprintf($view->translate('Project %s'), $id);
        }
        natcasesort($opts);
        return $opts;
    }

    /** Build the `field` markup Omeka's page editor expects. */
    private function field(PhpRenderer $view, string $label, string $description, string $input): string
    {
        return '<div class="field">'
            . '<div class="field-meta">'
            . '<label>' . $view->escapeHtml($label) . '</label>'
            . '<div class="field-description">' . $view->escapeHtml($description) . '</div>'
            . '</div>'
            . '<div class="inputs">' . $input . '</div>'
            . '</div>';
    }

    /** @return array<int|string,string> item-set id => title */
    private function itemSetOptions(PhpRenderer $view, SiteRepresentation $site): array
    {
        $build = function (array $itemSets): array {
            $opts = [];
            foreach ($itemSets as $itemSet) {
                $opts[$itemSet->id()] = $itemSet->displayTitle();
            }
            natcasesort($opts);
            return $opts;
        };

        $siteSets = $view->api()->search('item_sets', ['site_id' => $site->id()])->getContent();
        $opts = $build($siteSets);
        if ($opts) {
            return $opts;
        }
        // No site-assigned sets — offer all of them.
        return $build($view->api()->search('item_sets')->getContent());
    }
}
