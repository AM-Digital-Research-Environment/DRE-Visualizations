<?php
declare(strict_types=1);

namespace DreVisualizations\FeaturedCollections;

use DreVisualizations\Precompute\AmiraProfile;

/**
 * Featured-collections registry — the single source of truth for the curated
 * "collections" experience: the landing-page card grid (FeaturedCollections
 * block) AND each per-collection detail gallery (PhotoBrowse block, when an
 * editor picks a featured collection). The precompute reads it too, so counts,
 * covers, sub-collection splits and journal-issue grouping never drift between
 * the three.
 *
 * Mirrors the amira dashboard's src/lib/utils/collectionsRegistry.ts. Content
 * and installation-local ids live in config/amira-profile.json; this class
 * provides normalised query helpers for views and generators.
 *
 * A few collections are special:
 *   - ILAM groups its 1,032 articles into journal issues (grouping = 'issue'):
 *     each card is one issue (Vol. N No. M), clicking opens a table of contents.
 *     Its DOI (`bibo:doi`, …amj.vNiM…) encodes the volume/issue; a map view is
 *     pointless (one host location) so it is disabled.
 *   - Museu Afro-Digital is one Omeka item set (6295) holding three distinct
 *     sub-collections; each registry entry pins an `identifierPrefix` so the
 *     gallery shows only that sub-collection's items (split by the
 *     `dcterms:identifier` prefix: APMESTRENO / TRABNEGRBA / ORIXAFGM).
 *   - DECCA and Jambo are record-label producers (`producerId`) of image-less
 *     Audio recordings inside the DigiRet collection (6262), not item sets of
 *     their own. They are featured as link-out cards (`externalUrl`): the card
 *     shows a count and links to the producer-filtered Omeka listing, with no
 *     in-module photo gallery.
 */
final class Registry
{
    /**
     * @return list<array{
     *   slug:string, pageSlug:string, itemSetId:int, identifierPrefix:?string,
     *   title:string, tagline:?string, description:string, partner:?string,
     *   thumbnail:?string, externalUrl:?string, producerId:?int,
     *   views:array{masonry:bool,map:bool,timeline:bool},
     *   grouping:string, dedupe:bool
     * }>
     */
    public static function all(): array
    {
        static $entries = null;
        if ($entries === null) {
            $profile = AmiraProfile::fromFile(dirname(__DIR__, 2) . '/config/amira-profile.json');
            $entries = array_map([self::class, 'normalize'], $profile->featuredCollections());
        }
        return $entries;
    }

    /** A registry entry by slug, or null. */
    public static function bySlug(string $slug): ?array
    {
        foreach (self::all() as $entry) {
            if ($entry['slug'] === $slug) {
                return $entry;
            }
        }
        return null;
    }

    /** All entries that draw from a given item set (Museu's three share 6295). */
    public static function forItemSet(int $itemSetId): array
    {
        return array_values(array_filter(
            self::all(),
            static fn (array $e): bool => $e['itemSetId'] === $itemSetId
        ));
    }

    /** Distinct item-set ids referenced by the registry — used by the precompute. */
    public static function itemSetIds(): array
    {
        $ids = [];
        foreach (self::all() as $entry) {
            $ids[$entry['itemSetId']] = true;
        }
        return array_keys($ids);
    }

    /** `slug => title`, for a block's editor dropdown. */
    public static function selectOptions(): array
    {
        $opts = [];
        foreach (self::all() as $entry) {
            $opts[$entry['slug']] = $entry['title'];
        }
        return $opts;
    }

    /** Fill defaults so callers can read every key without isset() noise. */
    private static function normalize(array $e): array
    {
        return [
            'slug' => (string) $e['slug'],
            // Cards link to the Omeka page that hosts this collection's gallery;
            // defaults to the slug (create the page with a matching slug).
            'pageSlug' => (string) ($e['pageSlug'] ?? $e['slug']),
            'itemSetId' => (int) $e['itemSetId'],
            'identifierPrefix' => isset($e['identifierPrefix']) ? (string) $e['identifierPrefix'] : null,
            'title' => (string) $e['title'],
            'tagline' => isset($e['tagline']) ? (string) $e['tagline'] : null,
            'description' => (string) ($e['description'] ?? ''),
            'partner' => isset($e['partner']) ? (string) $e['partner'] : null,
            'thumbnail' => isset($e['thumbnail']) ? (string) $e['thumbnail'] : null,
            // Link-out card: when set, the card links here instead of to an
            // in-module detail page (used for collections with no photo gallery,
            // e.g. the audio producer subsets DECCA / Jambo). A value starting
            // with "http" is used as-is; otherwise it is resolved against the
            // current site root in the view.
            'externalUrl' => isset($e['externalUrl']) ? (string) $e['externalUrl'] : null,
            // Producer (Organisation) item id: when set, the collection is the
            // subset of `itemSetId` whose items credit this org via marcrel:prn,
            // rather than the whole item set. Counted by the precompute.
            'producerId' => isset($e['producerId']) ? (int) $e['producerId'] : null,
            'views' => [
                'masonry' => (bool) ($e['views']['masonry'] ?? true),
                'map' => (bool) ($e['views']['map'] ?? true),
                'timeline' => (bool) ($e['views']['timeline'] ?? true),
            ],
            'grouping' => ($e['grouping'] ?? 'photo') === 'issue' ? 'issue' : 'photo',
            'dedupe' => (bool) ($e['dedupe'] ?? false),
        ];
    }
}
