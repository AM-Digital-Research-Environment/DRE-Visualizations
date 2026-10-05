<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

use DreVisualizations\FeaturedCollections\Registry;

final class CollectionGalleryGenerator extends DashboardGenerator
{
    public function generate(): int
    {
        $this->loadFeaturedLiterals();
        $this->generatePhotoGalleries();
        $this->generateFeaturedCollections();
        return $this->fileCount;
    }

    protected function generatePhotoGalleries(): void
    {
        $this->log('=== Photo Galleries ===');
        $this->artifacts->ensureDirectory($this->galleriesDir);

        // Registry sets get extra per-photo fields: the identifier (so the
        // PhotoBrowse view can split a shared set into sub-collections) and, for
        // journal collections, the volume/issue/pages/creator the issue TOC
        // needs. Issue sets are NOT capped — every article must be present for a
        // complete table of contents.
        $issueSets = [];
        $prefixSets = [];
        foreach (Registry::all($this->profile) as $rc) {
            if ($rc['grouping'] === 'issue') {
                $issueSets[$rc['itemSetId']] = true;
            }
            if ($rc['identifierPrefix'] !== null) {
                $prefixSets[$rc['itemSetId']] = true;
            }
        }

        $setCount = 0;
        $galleries = [];
        foreach ($this->itemSets as $setId => $itemIds) $galleries[] = [$setId, $setId, $itemIds];
        foreach (Registry::all($this->profile) as $entry) {
            $ids = array_values(array_filter($this->itemSets[$entry['itemSetId']] ?? [], function ($id) use ($entry): bool {
                return ($entry['identifierPrefix'] === null || str_starts_with($this->featuredLiterals[$id]['ident'] ?? '', $entry['identifierPrefix']))
                    && ($entry['producerId'] === null || $this->itemHasProducer($id, $entry['producerId']));
            }));
            $galleries[] = ['collection-' . $entry['slug'], $entry['itemSetId'], $ids];
        }
        foreach ($galleries as [$galleryId, $setId, $itemIds]) {
            $isIssue = isset($issueSets[$setId]);
            $isPrefix = isset($prefixSets[$setId]);
            $cap = $isIssue ? PHP_INT_MAX : self::MAX_GALLERY_PHOTOS;
            $photos = [];
            $total = 0;
            foreach ($itemIds as $itemId) {
                $media = $this->primaryMedia[$itemId] ?? null;
                if ($media === null) {
                    continue; // not an image-bearing item
                }
                if (!($this->items[$itemId]['public'] ?? false)) {
                    continue; // never expose a non-public item in a gallery
                }
                $total++;
                if (count($photos) >= $cap) {
                    continue; // cap what we serialise, but keep counting the true total
                }

                // Origin place + coordinates: first linked dcterms:spatial → Location.
                $place = null;
                $lat = null;
                $lon = null;
                foreach ($this->links[$itemId] ?? [] as [$term, , $vrid]) {
                    if ($term === 'dcterms:spatial') {
                        $place = $this->items[$vrid]['title'] ?? null;
                        if (isset($this->geo[$vrid])) {
                            $lat = $this->geo[$vrid]['lat'];
                            $lon = $this->geo[$vrid]['lon'];
                        }
                        break; // first spatial wins (mirrors the block)
                    }
                }
                // No linked place → fall back to a literal dcterms:spatial label.
                if ($place === null && isset($this->literals[$itemId]['dcterms:spatial'][0])) {
                    $place = $this->literals[$itemId]['dcterms:spatial'][0];
                }

                $rec = [
                    'id'      => $itemId,
                    'title'   => $this->items[$itemId]['title'] ?? ('Item ' . $itemId),
                    'storage' => $media['storage'],
                    'ext'     => $media['ext'],
                    'year'    => isset($this->itemYear[$itemId]) ? (int) $this->itemYear[$itemId] : null,
                    'date'    => $this->itemDate[$itemId] ?? null,
                    'place'   => $place,
                    'lat'     => $lat,
                    'lon'     => $lon,
                ];
                if ($isPrefix) {
                    $rec['ident'] = $this->featuredLiterals[$itemId]['ident'] ?? '';
                }
                if ($isIssue) {
                    [$vol, $iss] = $this->parseVolIssue($this->featuredLiterals[$itemId]['doi'] ?? null);
                    $rec['volume']  = $vol;
                    $rec['issue']   = $iss;
                    $rec['pages']   = $this->parsePages($this->featuredLiterals[$itemId]['desc'] ?? null);
                    $rec['creator'] = $this->firstCreator($itemId);
                }
                $photos[] = $rec;
            }

            if (!$photos) {
                continue; // item set with no image-bearing public items — skip
            }

            $this->writeJson($this->galleriesDir . '/' . $galleryId . '.json', [
                'total' => $total,
                'photos' => $photos,
            ]);
            $this->fileCount++;
            $setCount++;
        }
        $this->log('  ' . $setCount . ' photo galleries written');
    }

    protected function loadFeaturedLiterals(): void
    {
        $setIds = array_unique(array_column(Registry::all($this->profile), 'itemSetId'));
        $itemIds = [];
        foreach ($setIds as $sid) {
            foreach ($this->itemSets[$sid] ?? [] as $iid) {
                $itemIds[$iid] = true;
            }
        }
        if (!$itemIds) {
            return;
        }
        $rows = $this->loadValueRows(array_keys($itemIds), ['dcterms:identifier', 'dcterms:description', 'bibo:doi']);
        $key = ['dcterms:identifier' => 'ident', 'dcterms:description' => 'desc', 'bibo:doi' => 'doi'];
        foreach ($rows as $r) {
            $k = $key[(string) $r[1]] ?? null;
            if ($k === null) {
                continue;
            }
            $iid = (int) $r[0];
            // First value per key wins (mirrors how the view reads value(0)).
            if (!isset($this->featuredLiterals[$iid][$k])) {
                $this->featuredLiterals[$iid][$k] = (string) $r[2];
            }
        }
        $this->log('  featured literals: ' . count($this->featuredLiterals) . ' items');
    }

    protected function generateFeaturedCollections(): void
    {
        $this->log('=== Featured Collections ===');
        $this->artifacts->ensureDirectory($this->featuredDir);

        $index = [];
        foreach (Registry::all($this->profile) as $entry) {
            $setId = $entry['itemSetId'];
            $prefix = $entry['identifierPrefix'];
            $producerId = $entry['producerId'];
            $isIssue = $entry['grouping'] === 'issue';
            $itemCount = 0;
            $photoItems = 0;
            $covers = [];
            $issues = [];
            foreach ($this->itemSets[$setId] ?? [] as $itemId) {
                if (!($this->items[$itemId]['public'] ?? false)) {
                    continue;
                }
                if ($prefix !== null
                    && !str_starts_with((string) ($this->featuredLiterals[$itemId]['ident'] ?? ''), $prefix)
                ) {
                    continue;
                }
                // Producer subset (DECCA / Jambo): keep only items crediting this
                // org via marcrel:prn (Production company).
                if ($producerId !== null && !$this->itemHasProducer($itemId, $producerId)) {
                    continue;
                }
                $itemCount++;
                if ($isIssue) {
                    [$vol, $iss] = $this->parseVolIssue($this->featuredLiterals[$itemId]['doi'] ?? null);
                    if ($vol !== null && $iss !== null) {
                        $issues[$vol . '.' . $iss] = true;
                    }
                }
                $media = $this->primaryMedia[$itemId] ?? null;
                if ($media !== null) {
                    $photoItems++;
                    if (count($covers) < 4) {
                        $covers[] = $media['storage'];
                    }
                }
            }
            $index[$entry['slug']] = [
                'itemCount'  => $itemCount,
                // Producer subsets are image-less audio: report no photo count so
                // the card footer reads "N items", not "0 photos · N items".
                'photoCount' => $isIssue ? count($issues) : ($producerId !== null ? null : $photoItems),
                'covers'     => $covers,
            ];
        }

        $this->writeJson($this->featuredDir . '/index.json', $index);
        $this->fileCount++;
        $this->log('  ' . count($index) . ' featured collections indexed');
    }

    protected function parseVolIssue(?string $doi): array
    {
        if ($doi !== null && preg_match('/v(\d+)i(\d+)/i', $doi, $m)) {
            return [(int) $m[1], (int) $m[2]];
        }
        return [null, null];
    }

    protected function parsePages(?string $text): ?string
    {
        if ($text !== null
            && preg_match('/pages?\s*[:\-]?\s*([0-9ivxlcdm]+(?:\s*[\x{2013}\-]\s*[0-9ivxlcdm]+)?)/iu', $text, $m)
        ) {
            return preg_replace('/\s+/', '', $m[1]);
        }
        return null;
    }

    protected function itemHasProducer(int $itemId, int $producerId): bool
    {
        foreach ($this->links[$itemId] ?? [] as [$term, , $vrid]) {
            if ($term === 'marcrel:prn' && $vrid === $producerId) {
                return true;
            }
        }
        return false;
    }

    protected function firstCreator(int $itemId): ?string
    {
        foreach ($this->links[$itemId] ?? [] as [$term, , $vrid]) {
            if (in_array($term, ['marcrel:aut', 'dcterms:creator', 'dcterms:contributor'], true)) {
                $name = $this->items[$vrid]['title'] ?? null;
                if ($name !== null && $name !== '') {
                    return $name;
                }
            }
        }
        return null;
    }
}
