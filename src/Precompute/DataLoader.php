<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

use Doctrine\DBAL\Connection;

/** Loads one public site with streamed queries; all generators share this boundary. */
final class DataLoader
{
    /**
     * Literal properties kept per item. Generators may only read these terms:
     * DashboardGenerator::loadValueRows() rejects any other, so a consumer that
     * asks for a term nobody loads fails loudly instead of rendering empty
     * (publications keep their abstracts in bibo:abstract, everything else in
     * dcterms:abstract — 2.29.0 read the wrong one without noticing).
     */
    public const LITERAL_TERMS = ['bibo:authorList', 'bibo:editorList', 'dcterms:isPartOf', 'dcterms:publisher',
        'dcterms:spatial', 'dcterms:extent', 'bibo:content', 'dcterms:abstract', 'bibo:abstract',
        'dcterms:identifier', 'dcterms:description', 'bibo:doi'];
    public const DATE_TERMS = ['dcterms:issued', 'dcterms:created', 'dcterms:date', 'fabio:hasDateCollected'];
    /** Literal properties read for structure rather than kept as text. */
    private const STRUCTURAL_TERMS = ['dcterms:title', 'geo:lat', 'geo:long', 'dcterms:temporal'];

    private $checkpoint;
    public function __construct(private readonly Connection $connection, private readonly int $siteId, ?callable $checkpoint = null)
    {
        if ($siteId < 1) throw new \InvalidArgumentException('A positive canonical site id is required.');
        $this->checkpoint = $checkpoint ?? static function (): void {};
    }

    private function query(string $sql, array $params = []): iterable
    {
        ($this->checkpoint)();
        $result = $this->connection->executeQuery($sql, $params);
        $count = 0;
        try {
            while (($row = $result->fetchNumeric()) !== false) {
                if (($count++ % 256) === 0) ($this->checkpoint)();
                yield $row;
            }
        } finally { $result->free(); }
    }

    private function scope(string $column): string
    {
        return " JOIN item_site scope ON scope.item_id = $column AND scope.site_id = " . $this->siteId
            . ' JOIN site scoped_site ON scoped_site.id = scope.site_id AND scoped_site.is_public = 1'
            . " JOIN resource scoped_item ON scoped_item.id = $column AND scoped_item.is_public = 1";
    }

    public function load(?callable $log = null): CorpusSnapshot
    {
        $log ??= static function (string $message): void {};
        $items = $titleProperties = $properties = [];
        foreach ($this->query('SELECT p.id, vo.prefix, p.local_name, p.label FROM property p'
            . ' JOIN vocabulary vo ON vo.id = p.vocabulary_id') as $r) {
            $properties[(int) $r[0]] = [$r[1] . ':' . $r[2], (string) $r[3]];
        }
        $log('Loading public items for canonical site ' . $this->siteId);
        foreach ($this->query('SELECT r.id, r.resource_template_id, vo.prefix, rc.local_name, rc.label, r.created, rt.title_property_id'
            . ' FROM item i JOIN resource r ON r.id = i.id' . $this->scope('i.id')
            . ' LEFT JOIN resource_class rc ON rc.id = r.resource_class_id'
            . ' LEFT JOIN vocabulary vo ON vo.id = rc.vocabulary_id'
            . ' LEFT JOIN resource_template rt ON rt.id = r.resource_template_id ORDER BY r.id') as $r) {
            $id = (int) $r[0];
            $items[$id] = ['title' => 'Item ' . $id, 'template_id' => $r[1] === null ? null : (int) $r[1],
                'class_term' => $r[2] ? $r[2] . ':' . $r[3] : '', 'class_label' => (string) $r[4],
                'created' => substr((string) $r[5], 0, 10), 'public' => true];
            $titleProperties[$id] = $r[6] ? (int) $r[6] : null;
        }
        if (!$items) throw new \RuntimeException('The canonical site is private or empty; no snapshot can be published.');
        $links = $literals = $dates = $coordinates = $temporal = $titled = [];
        $literalTerms = array_fill_keys(self::LITERAL_TERMS, true);
        $dateTerms = array_fill_keys(self::DATE_TERMS, true);
        // Only fetch the literal properties something reads (plus every link):
        // the value table also holds long text — transcripts aside, notes and
        // descriptions nobody aggregates — and pdo_mysql buffers the whole result.
        $wanted = array_fill_keys([...self::LITERAL_TERMS, ...self::DATE_TERMS, ...self::STRUCTURAL_TERMS], true);
        $propertyIds = array_fill_keys(array_filter($titleProperties), true);
        foreach ($properties as $propertyId => [$term]) {
            if (isset($wanted[$term])) $propertyIds[$propertyId] = true;
        }
        $propertyFilter = implode(',', array_map('intval', array_keys($propertyIds))) ?: '0';
        $log('Loading public values and relationship indexes');
        foreach ($this->query('SELECT v.resource_id, v.property_id, v.value_resource_id, v.value, v.uri, v.id'
            . ' FROM value v' . $this->scope('v.resource_id') . ' WHERE v.is_public = 1'
            . ' AND (v.value_resource_id IS NOT NULL OR v.property_id IN (' . $propertyFilter . '))'
            . ' ORDER BY v.resource_id, v.id') as $r) {
            $id = (int) $r[0];
            if (!isset($items[$id], $properties[(int) $r[1]])) continue;
            [$term, $label] = $properties[(int) $r[1]];
            $value = $r[3] !== null && $r[3] !== '' ? (string) $r[3] : (string) $r[4];
            if ($r[2] !== null) {
                if (isset($items[(int) $r[2]])) $links[$id][] = [$term, $label, (int) $r[2]];
                continue;
            }
            // Cached resource.title may originate from a private value. Only use a visible title value.
            if (!isset($titled[$id]) && ($titleProperties[$id] ? (int) $r[1] === $titleProperties[$id] : $term === 'dcterms:title') && $value !== '') {
                $items[$id]['title'] = $value;
                $titled[$id] = true;
            }
            if (isset($literalTerms[$term]) && $value !== '') $literals[$id][$term][] = $value;
            if (isset($dateTerms[$term])) $dates[] = [$id, $value, $term, $r[5]];
            if ($term === 'geo:lat' || $term === 'geo:long') $coordinates[] = [$id, '', $term, $value, $r[5]];
            if ($term === 'dcterms:temporal' && !isset($temporal[$id]) && substr_count($value, '/') === 1) {
                $temporal[$id] = array_map('trim', explode('/', $value));
            }
        }
        $selected = DataSelection::preferredDates($dates);
        unset($dates);
        $geo = DataSelection::coherentCoordinates($coordinates);
        foreach ($geo as $id => &$point) $point['name'] = $items[$id]['title'];
        unset($point, $coordinates);
        $itemSets = $templateLabels = [];
        foreach ($this->query('SELECT membership.item_id, membership.item_set_id FROM item_item_set membership'
            . $this->scope('membership.item_id') . ' JOIN resource set_resource ON set_resource.id = membership.item_set_id'
            . ' AND set_resource.is_public = 1 ORDER BY membership.item_set_id, membership.item_id') as $r) {
            $itemSets[(int) $r[1]][] = (int) $r[0];
        }
        foreach ($this->query('SELECT id, label FROM resource_template ORDER BY id') as $r) $templateLabels[(int) $r[0]] = (string) $r[1];
        $primaryMedia = $mediaItems = $seen = [];
        foreach ($this->query('SELECT m.item_id, m.storage_id, m.extension, m.has_thumbnails, m.has_original, m.id, i.primary_media_id'
            . ' FROM media m JOIN resource mr ON mr.id = m.id AND mr.is_public = 1 JOIN item i ON i.id = m.item_id'
            . $this->scope('m.item_id') . ' ORDER BY m.item_id, m.position, m.id') as $r) {
            $id = (int) $r[0];
            $mediaItems[$id] = true;
            if (isset($seen[$id]) || ($r[6] !== null && (int) $r[6] !== (int) $r[5])) continue;
            $seen[$id] = true;
            if ((int) $r[3] === 1 && $r[1]) $primaryMedia[$id] = ['storage' => (string) $r[1], 'ext' => (int) $r[4] === 1 ? (string) $r[2] : ''];
        }
        ($this->checkpoint)();
        return CorpusSnapshot::fromArray((new PublicCorpus($this->siteId))->project([
            'items' => $items, 'links' => $links, 'reverseLinks' => [], 'childrenOf' => [],
            'itemYear' => $selected['itemYear'], 'itemDate' => $selected['itemDate'], 'temporal' => $temporal,
            'geo' => $geo, 'itemSets' => $itemSets, 'templateLabels' => $templateLabels, 'literals' => $literals,
            'primaryMedia' => $primaryMedia, 'mediaItems' => $mediaItems,
        ], array_keys($items)));
    }
}
