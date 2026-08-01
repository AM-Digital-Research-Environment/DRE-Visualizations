<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute;

use RuntimeException;

/** Validated single source for AMIRA installation-local record identifiers. */
final class AmiraProfile
{
    private function __construct(private readonly array $data)
    {
        $this->validate();
    }

    public static function fromFile(string $path): self
    {
        $raw = is_readable($path) ? file_get_contents($path) : false;
        if ($raw === false) {
            throw new RuntimeException('AMIRA profile is not readable: ' . $path);
        }
        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new RuntimeException('AMIRA profile is not valid JSON: ' . $e->getMessage(), 0, $e);
        }
        if (!is_array($data)) {
            throw new RuntimeException('AMIRA profile must contain a JSON object.');
        }
        return new self($data);
    }

    public function template(string $key): int
    {
        return $this->id('templates', $key);
    }

    public function itemSet(string $key): int
    {
        return $this->id('itemSets', $key);
    }

    public function overview(string $key): int
    {
        return $this->id('overviewItems', $key);
    }

    public function templateResourceType(?int $templateId): ?string
    {
        if ($templateId === null) return null;
        $value = $this->data['templateResourceTypes'][(string) $templateId] ?? null;
        return is_string($value) && $value !== '' ? $value : null;
    }

    public function syntheticType(string $key): string
    {
        $value = $this->data['syntheticTypes'][$key] ?? null;
        if (!is_string($value) || $value === '') {
            throw new RuntimeException('AMIRA profile synthetic type is missing: ' . $key);
        }
        return $value;
    }

    /** @return array<int,array{section:string,university:string}> */
    public function externalCollections(): array
    {
        $resolved = [];
        foreach ($this->data['externalCollections'] as $route) {
            $resolved[$this->itemSet($route['itemSetKey'])] = [
                'section' => $route['section'],
                'university' => $route['university'],
            ];
        }
        return $resolved;
    }

    /** @return array<int,string> */
    public function clusterCategoryAuthorities(): array
    {
        return array_combine(
            array_map('intval', array_keys($this->data['clusterCategoryAuthorities'])),
            array_values($this->data['clusterCategoryAuthorities'])
        ) ?: [];
    }

    /** @return list<array{id:string,itemSet:int,field:string}> */
    public function wordcloudCorpora(): array
    {
        return array_map(fn (array $corpus): array => [
            'id' => $corpus['id'],
            'itemSet' => $this->itemSet($corpus['itemSetKey']),
            'field' => $corpus['field'],
        ], $this->data['wordcloudCorpora']);
    }

    /**
     * Public Omeka corpora that share the semantic embedding space. Each entry
     * resolves exactly one selector: an item set for media/publications or a
     * resource template for entity types spread across many sets.
     *
     * @return list<array{id:string,label:string,selector:string,selectorId:int,textFields:list<string>}>
     */
    public function embeddingCorpora(): array
    {
        return array_map(function (array $corpus): array {
            $itemSetKey = $corpus['itemSetKey'] ?? null;
            $selector = is_string($itemSetKey) ? 'itemSet' : 'template';
            $selectorId = $selector === 'itemSet'
                ? $this->itemSet($itemSetKey)
                : $this->template($corpus['templateKey']);
            return [
                'id' => $corpus['id'],
                'label' => $corpus['label'],
                'selector' => $selector,
                'selectorId' => $selectorId,
                'textFields' => array_values($corpus['textFields']),
            ];
        }, $this->data['embeddingCorpora']);
    }

    /** @return list<array> */
    public function featuredCollections(): array
    {
        return array_map(function (array $collection): array {
            $collection['itemSetId'] = $this->itemSet($collection['itemSetKey']);
            unset($collection['itemSetKey']);
            $filter = $collection['externalFilter'] ?? null;
            if (is_array($filter)) {
                $propertyId = $this->id('properties', $filter['propertyKey']);
                $producerId = $this->id('authorities', $filter['resourceKey']);
                $collection['producerId'] = $producerId;
                $collection['externalUrl'] = sprintf(
                    '/item?property[0][property]=%d&property[0][type]=res&property[0][text]=%d',
                    $propertyId,
                    $producerId
                );
                unset($collection['externalFilter']);
            }
            return $collection;
        }, $this->data['featuredCollections']);
    }

    /** @return array<string,string> */
    public function universityLabels(): array
    {
        return $this->data['universityLabels'];
    }

    private function id(string $section, string $key): int
    {
        $value = $this->data[$section][$key] ?? null;
        if (!is_int($value) || $value < 1) {
            throw new RuntimeException(sprintf('AMIRA profile %s.%s must be a positive integer.', $section, $key));
        }
        return $value;
    }

    private function validate(): void
    {
        if (($this->data['schemaVersion'] ?? null) !== 1) {
            throw new RuntimeException('Unsupported AMIRA profile schema version.');
        }
        $required = [
            'templates' => ['organisation', 'location', 'persons', 'projects', 'authority', 'sections', 'researchItems'],
            'itemSets' => ['genre', 'language', 'resourceType', 'targetAudience', 'person', 'institution', 'subject', 'project', 'publications', 'podcasts', 'youtube', 'youtubePlaylists', 'ilam', 'bayglo', 'museuAfroDigital', 'beyondDigitalReturn'],
            'authorities' => ['deccaProducer', 'jamboProducer'],
            'properties' => ['productionCompany'],
            'overviewItems' => ['genre', 'language', 'resourceType', 'targetAudience', 'person', 'institution', 'group', 'lcsh', 'tag', 'project'],
        ];
        foreach ($required as $section => $keys) {
            foreach ($keys as $key) $this->id($section, $key);
        }
        foreach (['templateResourceTypes', 'syntheticTypes', 'universityLabels', 'externalCollections', 'clusterCategoryAuthorities', 'featuredCollections', 'wordcloudCorpora', 'embeddingCorpora'] as $section) {
            if (!isset($this->data[$section]) || !is_array($this->data[$section]) || !$this->data[$section]) {
                throw new RuntimeException('AMIRA profile section is missing or empty: ' . $section);
            }
        }
        foreach ($this->data['externalCollections'] as $route) {
            if (!is_array($route)
                || !is_string($route['itemSetKey'] ?? null)
                || !isset($this->data['itemSets'][$route['itemSetKey']])
                || !is_string($route['section'] ?? null) || $route['section'] === ''
                || !is_string($route['university'] ?? null) || $route['university'] === '') {
                throw new RuntimeException('AMIRA profile has an invalid external collection route.');
            }
            $this->itemSet($route['itemSetKey']);
        }
        foreach ($this->data['clusterCategoryAuthorities'] as $itemId => $key) {
            if ((int) $itemId < 1 || !is_string($key) || $key === '') {
                throw new RuntimeException('AMIRA profile has an invalid cluster category authority.');
            }
        }
        foreach ($this->data['universityLabels'] as $source => $label) {
            if (!is_string($source) || trim($source) === ''
                || !is_string($label) || trim($label) === '') {
                throw new RuntimeException('AMIRA profile has an invalid university label mapping.');
            }
        }
        $collectionSlugs = [];
        foreach ($this->data['featuredCollections'] as $collection) {
            $slug = is_array($collection) ? ($collection['slug'] ?? null) : null;
            $itemSetKey = is_array($collection) ? ($collection['itemSetKey'] ?? null) : null;
            $title = is_array($collection) ? ($collection['title'] ?? null) : null;
            $filter = is_array($collection) ? ($collection['externalFilter'] ?? null) : null;
            if (!is_string($slug) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)
                || isset($collectionSlugs[$slug])
                || !is_string($itemSetKey) || !isset($this->data['itemSets'][$itemSetKey])
                || !is_string($title) || trim($title) === ''
                || ($filter !== null && (!is_array($filter)
                    || !is_string($filter['propertyKey'] ?? null)
                    || !isset($this->data['properties'][$filter['propertyKey']])
                    || !is_string($filter['resourceKey'] ?? null)
                    || !isset($this->data['authorities'][$filter['resourceKey']])))) {
                throw new RuntimeException('AMIRA profile has an invalid featured collection.');
            }
            $this->itemSet($itemSetKey);
            if (is_array($filter)) {
                $this->id('properties', $filter['propertyKey']);
                $this->id('authorities', $filter['resourceKey']);
            }
            $collectionSlugs[$slug] = true;
        }
        $corpusIds = [];
        foreach ($this->data['wordcloudCorpora'] as $corpus) {
            $id = is_array($corpus) ? ($corpus['id'] ?? null) : null;
            $itemSetKey = is_array($corpus) ? ($corpus['itemSetKey'] ?? null) : null;
            $field = is_array($corpus) ? ($corpus['field'] ?? null) : null;
            if (!is_string($id) || !preg_match('/^[a-z][a-z0-9-]*$/', $id)
                || isset($corpusIds[$id])
                || !is_string($itemSetKey) || !isset($this->data['itemSets'][$itemSetKey])
                || !is_string($field) || !preg_match('/^[a-z][a-z0-9]*:[A-Za-z][A-Za-z0-9]*$/', $field)) {
                throw new RuntimeException('AMIRA profile has an invalid word-cloud corpus.');
            }
            $this->itemSet($itemSetKey);
            $corpusIds[$id] = true;
        }

        $embeddingIds = [];
        foreach ($this->data['embeddingCorpora'] as $corpus) {
            $id = is_array($corpus) ? ($corpus['id'] ?? null) : null;
            $label = is_array($corpus) ? ($corpus['label'] ?? null) : null;
            $itemSetKey = is_array($corpus) ? ($corpus['itemSetKey'] ?? null) : null;
            $templateKey = is_array($corpus) ? ($corpus['templateKey'] ?? null) : null;
            $textFields = is_array($corpus) ? ($corpus['textFields'] ?? null) : null;
            $hasItemSet = is_string($itemSetKey) && isset($this->data['itemSets'][$itemSetKey]);
            $hasTemplate = is_string($templateKey) && isset($this->data['templates'][$templateKey]);
            if (!is_string($id) || !preg_match('/^[a-z][a-z0-9-]*$/', $id)
                || isset($embeddingIds[$id])
                || !is_string($label) || trim($label) === ''
                || ($hasItemSet === $hasTemplate)
                || !is_array($textFields) || !$textFields) {
                throw new RuntimeException('AMIRA profile has an invalid embedding corpus.');
            }
            foreach ($textFields as $field) {
                if (!is_string($field) || !preg_match('/^[a-z][a-z0-9]*:[A-Za-z][A-Za-z0-9]*$/', $field)) {
                    throw new RuntimeException('AMIRA profile has an invalid embedding corpus text field.');
                }
            }
            $hasItemSet ? $this->itemSet($itemSetKey) : $this->template($templateKey);
            $embeddingIds[$id] = true;
        }
    }
}
