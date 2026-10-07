<?php
declare(strict_types=1);

namespace DreVisualizations\Tests\Integration;

use Doctrine\DBAL\Connection;

/**
 * Deterministic synthetic AMIRA corpus for tests/integration/GoldenTest.php.
 *
 * Builds, in an (empty) SQLite connection, the slice of Omeka's schema that
 * DataLoader queries and fills it with a small but realistic installation:
 * research sections → projects → research items, people affiliated with
 * cluster universities, geocoded locations across several African countries,
 * LCSH subjects and free tags, the curated Publications / Podcasts / YouTube
 * item sets, photo galleries, the featured collections of the AMIRA profile
 * (ILAM journal issues, the three Museu Afro-Digital sub-collections, the
 * DECCA / Jambo producer subsets) and a handful of PRIVATE records that must
 * never reach an artifact.
 *
 * Everything is either fixed data or drawn from mt_rand() after
 * mt_srand(SEED), so the corpus — and therefore every artifact generated from
 * it — is identical on every run and every PHP version (MT19937 is specified).
 * Ids, vocabulary terms and item-set numbers mirror config/amira-profile.json;
 * the corpus deliberately avoids every id the profile reserves for something
 * else (overview items, cluster-category authorities, producers).
 *
 * Changing ANYTHING here changes the golden files: regenerate them with
 * UPDATE_GOLDEN=1 and review the diff like any other output change.
 */
final class GoldenCorpus
{
    public const SEED = 20261007;
    public const SITE_ID = 1;

    /** Ids the AMIRA profile gives meaning to (see config/amira-profile.json). */
    private const LCSH_MARKER = 3167;
    private const CLUSTER_AMRC = 37685;
    private const CLUSTER_PRIVILEGED = 39073;
    private const CLUSTER_COOPERATION = 39072;
    private const CLUSTER_GLOBAL = 39071;
    private const DECCA = 1219;
    private const JAMBO = 1222;

    /** Item sets (profile itemSets.*) plus a few ordinary collection sets. */
    private const SET_RESOURCE_TYPE = 1;
    private const SET_AUDIENCE = 3169;
    private const SET_PERSON = 18;
    private const SET_LANGUAGE = 19;
    private const SET_PROJECT = 20;
    private const SET_GENRE = 21;
    private const SET_INSTITUTION = 110;
    private const SET_SUBJECT = 1852;
    private const SET_DIGITAL_RETURN = 6262;
    private const SET_MUSEU = 6295;
    private const SET_BAYGLO = 27601;
    private const SET_ILAM = 27724;
    private const SET_PUBLICATIONS = 29918;
    private const SET_PODCASTS = 39095;
    private const SET_YOUTUBE = 39192;
    private const SET_PLAYLISTS = 39193;
    private const SET_FIELD_PHOTOS = 50000;
    private const SET_SAHEL_SOUND = 60001;
    private const SET_EAST_AFRICA = 60002;
    private const SET_BRAZIL = 60003;
    private const SET_PRIVATE = 77;

    /** Resource templates (profile templates.* plus media/publication templates). */
    private const T_ORG = 2;
    private const T_LOCATION = 3;
    private const T_PERSON = 4;
    private const T_PROJECT = 5;
    private const T_AUTHORITY = 6;
    private const T_SECTION = 7;
    private const T_RESEARCH = 10;
    private const T_ARTICLE = 11;
    private const T_CHAPTER = 12;
    private const T_PODCAST = 21;
    private const T_YOUTUBE = 22;
    private const T_PHOTO = 23;
    private const T_AUDIO = 24;

    private Connection $conn;
    /** @var array<string,int> term => property id */
    private array $properties = [];
    /** @var array<string,int> term => resource class id */
    private array $classes = [];
    private int $valueId = 0;
    private int $mediaId = 20000;
    /** @var array<string,int> Item counts by kind, reported by the test. */
    private array $counts = [];

    private function __construct(Connection $conn)
    {
        $this->conn = $conn;
    }

    /**
     * Create the schema, fill it, and return item counts by kind.
     *
     * @return array<string,int>
     */
    public static function build(Connection $conn): array
    {
        $corpus = new self($conn);
        mt_srand(self::SEED);
        // Connecting runs Doctrine's own PDOSqlite driver, which registers its
        // SQL functions through the PHP 8.5-deprecated sqliteCreateFunction();
        // that notice comes from Omeka core's vendor, not from this module.
        $reporting = error_reporting(error_reporting() & ~E_DEPRECATED);
        try {
            $conn->connect();
        } finally {
            error_reporting($reporting);
        }
        $conn->beginTransaction();
        try {
            $corpus->schema();
            $corpus->vocabulary();
            $corpus->fill();
            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            throw $e;
        }
        return $corpus->counts;
    }

    // ── Schema ─────────────────────────────────────────────────────────────

    private function schema(): void
    {
        // Same table shapes as tests/integration/DatabaseTest.php: only the
        // columns DataLoader reads. Doctrine wraps a plain PDO, not Pdo\Sqlite,
        // so the PHP 8.5-deprecated sqliteCreateFunction() is the only way to
        // give SQLite the CONCAT() MySQL has; the deprecation is not ours.
        @$this->conn->getWrappedConnection()->sqliteCreateFunction('CONCAT', static fn (...$s) => implode('', $s));
        foreach ([
            'CREATE TABLE resource (id INTEGER PRIMARY KEY, title TEXT, resource_template_id INTEGER, resource_class_id INTEGER, created TEXT, is_public INTEGER, resource_type TEXT)',
            'CREATE TABLE site (id INTEGER, is_public INTEGER)',
            'CREATE TABLE item_site (item_id INTEGER, site_id INTEGER)',
            'CREATE TABLE resource_class (id INTEGER, vocabulary_id INTEGER, local_name TEXT, label TEXT)',
            'CREATE TABLE vocabulary (id INTEGER, prefix TEXT)',
            'CREATE TABLE property (id INTEGER, vocabulary_id INTEGER, local_name TEXT, label TEXT)',
            'CREATE TABLE value (id INTEGER, resource_id INTEGER, property_id INTEGER, value_resource_id INTEGER, value TEXT, uri TEXT, is_public INTEGER)',
            'CREATE TABLE item_item_set (item_id INTEGER, item_set_id INTEGER)',
            'CREATE TABLE resource_template (id INTEGER, label TEXT, title_property_id INTEGER)',
            'CREATE TABLE media (id INTEGER, item_id INTEGER, storage_id TEXT, extension TEXT, has_thumbnails INTEGER, has_original INTEGER, position INTEGER)',
            'CREATE TABLE item (id INTEGER, primary_media_id INTEGER)',
        ] as $sql) {
            $this->conn->executeStatement($sql);
        }
        $this->conn->insert('site', ['id' => self::SITE_ID, 'is_public' => 1]);
        // A second public site: items assigned only to it are out of scope.
        $this->conn->insert('site', ['id' => 2, 'is_public' => 1]);
    }

    private function vocabulary(): void
    {
        $vocabularies = [1 => 'dcterms', 2 => 'bibo', 3 => 'geo', 4 => 'foaf', 5 => 'frapo', 6 => 'marcrel', 7 => 'fabio', 8 => 'dctype'];
        foreach ($vocabularies as $id => $prefix) {
            $this->conn->insert('vocabulary', ['id' => $id, 'prefix' => $prefix]);
        }
        $vocabIds = array_flip($vocabularies);
        // Labels matter: role charts and knowledge-graph edges print them.
        $props = [
            'dcterms:title' => 'Title', 'dcterms:creator' => 'Creator', 'dcterms:contributor' => 'Contributor',
            'dcterms:isPartOf' => 'Is Part Of', 'dcterms:subject' => 'Subject', 'dcterms:spatial' => 'Spatial Coverage',
            'dcterms:provenance' => 'Provenance', 'dcterms:language' => 'Language', 'dcterms:type' => 'Type',
            'dcterms:format' => 'Format', 'dcterms:audience' => 'Audience', 'dcterms:issued' => 'Date Issued',
            'dcterms:created' => 'Date Created', 'dcterms:date' => 'Date', 'dcterms:temporal' => 'Temporal Coverage',
            'dcterms:abstract' => 'Abstract', 'dcterms:description' => 'Description', 'dcterms:identifier' => 'Identifier',
            'dcterms:publisher' => 'Publisher', 'dcterms:extent' => 'Extent', 'dcterms:relation' => 'Relation',
            'dcterms:alternative' => 'Alternative Title',
            'bibo:authorList' => 'Author list', 'bibo:editorList' => 'Editor list', 'bibo:abstract' => 'Abstract',
            'bibo:content' => 'Content', 'bibo:doi' => 'DOI', 'bibo:status' => 'Status',
            'geo:lat' => 'Latitude', 'geo:long' => 'Longitude',
            'foaf:member' => 'Member', 'foaf:name' => 'Name',
            'frapo:isFundedBy' => 'Is Funded By',
            'marcrel:aut' => 'Author', 'marcrel:ive' => 'Interviewee', 'marcrel:ivr' => 'Interviewer',
            'marcrel:pht' => 'Photographer', 'marcrel:spk' => 'Speaker', 'marcrel:hst' => 'Host',
            'marcrel:pup' => 'Publication place', 'marcrel:prn' => 'Production company', 'marcrel:ctb' => 'Contributor (role)',
            'fabio:hasDateCollected' => 'Has Date Collected',
        ];
        $id = 0;
        foreach ($props as $term => $label) {
            [$prefix, $local] = explode(':', $term);
            $this->properties[$term] = ++$id;
            $this->conn->insert('property', ['id' => $id, 'vocabulary_id' => $vocabIds[$prefix], 'local_name' => $local, 'label' => $label]);
        }
        $classes = [
            'frapo:ResearchGroup' => 'Research Group', 'foaf:Organization' => 'Organization', 'foaf:Person' => 'Person',
            'foaf:Group' => 'Group', 'foaf:Project' => 'Project', 'dcterms:Location' => 'Location',
            'fabio:JournalArticle' => 'Journal Article', 'fabio:BookChapter' => 'Book Chapter',
            'dctype:Text' => 'Text', 'dctype:StillImage' => 'Still Image', 'dctype:Sound' => 'Sound',
            'dctype:MovingImage' => 'Moving Image',
        ];
        $id = 0;
        foreach ($classes as $term => $label) {
            [$prefix, $local] = explode(':', $term);
            $this->classes[$term] = ++$id;
            $this->conn->insert('resource_class', ['id' => $id, 'vocabulary_id' => $vocabIds[$prefix], 'local_name' => $local, 'label' => $label]);
        }
        // Persons take their title from foaf:name, everything else from dcterms:title.
        foreach ([
            self::T_ORG => ['Organisation', 'dcterms:title'], self::T_LOCATION => ['Location', 'dcterms:title'],
            self::T_PERSON => ['Person', 'foaf:name'], self::T_PROJECT => ['Project', 'dcterms:title'],
            self::T_AUTHORITY => ['Authority', 'dcterms:title'], self::T_SECTION => ['Research Section', 'dcterms:title'],
            self::T_RESEARCH => ['Research Item', 'dcterms:title'], self::T_ARTICLE => ['Journal Article', 'dcterms:title'],
            self::T_CHAPTER => ['Book Chapter', 'dcterms:title'], self::T_PODCAST => ['Podcast Episode', 'dcterms:title'],
            self::T_YOUTUBE => ['YouTube Video', 'dcterms:title'], self::T_PHOTO => ['Photograph', 'dcterms:title'],
            self::T_AUDIO => ['Audio Recording', 'dcterms:title'],
        ] as $tid => [$label, $titleTerm]) {
            $this->conn->insert('resource_template', ['id' => $tid, 'label' => $label, 'title_property_id' => $this->properties[$titleTerm]]);
        }
    }

    // ── Low-level writers ──────────────────────────────────────────────────

    /**
     * One item: resource + item + site membership + title value + item sets.
     * $created is resource.created (drives What's New).
     */
    private function item(int $id, ?int $template, ?string $class, string $title, string $created, array $sets = [], bool $public = true, array $sites = [self::SITE_ID], string $kind = 'other'): void
    {
        $this->conn->insert('resource', [
            'id' => $id, 'title' => $title, 'resource_template_id' => $template,
            'resource_class_id' => $class === null ? null : $this->classes[$class],
            'created' => $created, 'is_public' => $public ? 1 : 0, 'resource_type' => 'Omeka\\Entity\\Item',
        ]);
        $this->conn->insert('item', ['id' => $id]);
        foreach ($sites as $site) {
            $this->conn->insert('item_site', ['item_id' => $id, 'site_id' => $site]);
        }
        $this->literal($id, $template === self::T_PERSON ? 'foaf:name' : 'dcterms:title', $title);
        foreach ($sets as $set) {
            $this->conn->insert('item_item_set', ['item_id' => $id, 'item_set_id' => $set]);
        }
        $this->counts[$kind] = ($this->counts[$kind] ?? 0) + 1;
    }

    private function itemSet(int $id, string $title, bool $public = true): void
    {
        $this->conn->insert('resource', ['id' => $id, 'title' => $title, 'is_public' => $public ? 1 : 0, 'resource_type' => 'Omeka\\Entity\\ItemSet', 'created' => '2024-01-01 00:00:00']);
    }

    private function literal(int $id, string $term, ?string $value, bool $public = true, ?string $uri = null): void
    {
        $this->conn->insert('value', [
            'id' => ++$this->valueId, 'resource_id' => $id, 'property_id' => $this->properties[$term],
            'value_resource_id' => null, 'value' => $value, 'uri' => $uri, 'is_public' => $public ? 1 : 0,
        ]);
    }

    private function link(int $id, string $term, int $target, bool $public = true): void
    {
        $this->conn->insert('value', [
            'id' => ++$this->valueId, 'resource_id' => $id, 'property_id' => $this->properties[$term],
            'value_resource_id' => $target, 'value' => null, 'uri' => null, 'is_public' => $public ? 1 : 0,
        ]);
    }

    private function geo(int $id, string $lat, string $lon, bool $public = true): void
    {
        $this->literal($id, 'geo:lat', $lat, $public);
        $this->literal($id, 'geo:long', $lon, $public);
    }

    /** Attach a media file; the first public thumbnail-bearing one becomes primary. */
    private function media(int $itemId, string $storage, bool $public = true, int $position = 1, bool $thumbnails = true, bool $original = true): int
    {
        $id = ++$this->mediaId;
        $this->conn->insert('resource', ['id' => $id, 'title' => 'Media ' . $id, 'is_public' => $public ? 1 : 0, 'resource_type' => 'Omeka\\Entity\\Media', 'created' => '2024-01-01 00:00:00']);
        $this->conn->insert('media', [
            'id' => $id, 'item_id' => $itemId, 'storage_id' => $storage, 'extension' => 'jpg',
            'has_thumbnails' => $thumbnails ? 1 : 0, 'has_original' => $original ? 1 : 0, 'position' => $position,
        ]);
        return $id;
    }

    // ── Seeded helpers ─────────────────────────────────────────────────────

    /** @template T @param list<T> $pool @return T */
    private function pick(array $pool): mixed
    {
        return $pool[mt_rand(0, count($pool) - 1)];
    }

    /** Up to $n distinct values from $pool, in draw order. */
    private function pickMany(array $pool, int $n): array
    {
        $out = [];
        for ($guard = 0; count($out) < min($n, count($pool)) && $guard < 100; $guard++) {
            $v = $this->pick($pool);
            if (!in_array($v, $out, true)) {
                $out[] = $v;
            }
        }
        return $out;
    }

    private function chance(int $percent): bool
    {
        return mt_rand(1, 100) <= $percent;
    }

    /** A resource.created timestamp between 2025-01-01 and 2026-09-30. */
    private function createdStamp(): string
    {
        $day = mt_rand(0, 637); // 2025-01-01 + 637 days = 2026-09-30
        return gmdate('Y-m-d', 1735689600 + $day * 86400) . sprintf(' %02d:%02d:00', mt_rand(0, 23), mt_rand(0, 59));
    }

    private function sentence(array $words, int $min, int $max): string
    {
        $out = [];
        $n = mt_rand($min, $max);
        for ($i = 0; $i < $n; $i++) {
            $out[] = $this->pick($words);
        }
        return ucfirst(implode(' ', $out)) . '.';
    }

    // ── Corpus ─────────────────────────────────────────────────────────────

    private function fill(): void
    {
        foreach ([
            self::SET_RESOURCE_TYPE => 'Resource types', self::SET_AUDIENCE => 'Target audiences',
            self::SET_PERSON => 'Persons', self::SET_LANGUAGE => 'Languages', self::SET_PROJECT => 'Research projects',
            self::SET_GENRE => 'Genres', self::SET_INSTITUTION => 'Institutions', self::SET_SUBJECT => 'Subjects',
            self::SET_DIGITAL_RETURN => 'Beyond the Digital Return', self::SET_MUSEU => 'Museu Afro-Digital',
            self::SET_BAYGLO => 'Bayreuth Global', self::SET_ILAM => 'ILAM', self::SET_PUBLICATIONS => 'Publications',
            self::SET_PODCASTS => 'Podcasts', self::SET_YOUTUBE => 'YouTube', self::SET_PLAYLISTS => 'YouTube playlists',
            self::SET_FIELD_PHOTOS => 'Field photographs', self::SET_SAHEL_SOUND => 'Sahel Sound Collection',
            self::SET_EAST_AFRICA => 'East African Field Recordings', self::SET_BRAZIL => 'Afro-Brazilian Archive',
        ] as $id => $title) {
            $this->itemSet($id, $title);
        }
        $this->itemSet(self::SET_PRIVATE, 'PRIVATE item set', false);

        $authorityStamp = '2024-03-01 09:00:00';
        // Markers and authority records the profile names.
        $this->item(self::LCSH_MARKER, null, null, 'Library of Congress Subject Headings', $authorityStamp);
        $this->item(self::CLUSTER_AMRC, null, null, 'Africa Multiple Research Centres', $authorityStamp);
        $this->item(self::CLUSTER_PRIVILEGED, null, null, 'Privileged partner', $authorityStamp);
        $this->item(self::CLUSTER_COOPERATION, null, null, 'Cooperation partners', $authorityStamp);
        $this->item(self::CLUSTER_GLOBAL, null, null, 'Global partners', $authorityStamp);
        $this->item(850, null, null, 'Peer reviewed', $authorityStamp);
        $this->item(851, null, null, 'Not peer reviewed', $authorityStamp);

        $orgs = $this->organisations($authorityStamp);
        $locations = $this->locations($authorityStamp);
        $persons = $this->persons($orgs, $authorityStamp);
        [$lcsh, $tags] = $this->subjects($authorityStamp);
        $vocab = $this->controlledVocabularies($authorityStamp);
        [$sections, $projects, $members] = $this->sectionsAndProjects($persons, $authorityStamp);

        $context = compact('orgs', 'locations', 'persons', 'lcsh', 'tags', 'projects', 'members') + $vocab;
        $this->researchItems($context);
        $this->publications($context);
        $this->podcasts($context);
        $this->youtube($context);
        $this->photographs($context);
        $this->museuAfroDigital($context);
        $this->ilam($context);
        $this->digitalReturn($context);
        $this->privateRecords($context);
    }

    /** @return array<string,int> key => organisation id */
    private function organisations(string $stamp): array
    {
        // [id, title, lat, lon, cluster category, extra isPartOf]
        $rows = [
            'ubt' => [500, 'University of Bayreuth', '49.9456', '11.5713', null],
            'lagos' => [501, 'University of Lagos African Cluster Centre (LACC)', '6.5244', '3.3792', self::CLUSTER_AMRC],
            'ujkz' => [502, 'University Joseph Ki-Zerbo', '12.3714', '-1.5197', self::CLUSTER_AMRC],
            'ufba' => [503, 'Universidade Federal da Bahia', '-12.9777', '-38.5016', self::CLUSTER_PRIVILEGED],
            'rhodes' => [504, 'Rhodes University', '-33.3106', '26.5256', self::CLUSTER_AMRC],
            'moi' => [505, 'Moi University', '0.5143', '35.2698', self::CLUSTER_AMRC],
            'nairobi' => [506, 'University of Nairobi', '-1.2921', '36.8219', self::CLUSTER_COOPERATION],
            'dfg' => [507, 'Deutsche Forschungsgemeinschaft', '50.7374', '7.0982', null],
            'ceao' => [508, 'CEAO Centro de Estudos Afro-Orientais', '-12.9714', '-38.5124', self::CLUSTER_PRIVILEGED],
            // No coordinates: never a cluster-map point, never a current location.
            'ifan' => [509, 'Institut Fondamental d\'Afrique Noire', null, null, self::CLUSTER_GLOBAL],
        ];
        $ids = [];
        foreach ($rows as $key => [$id, $title, $lat, $lon, $category]) {
            $this->item($id, self::T_ORG, 'foaf:Organization', $title, $stamp, [self::SET_INSTITUTION], kind: 'organisations');
            if ($lat !== null) {
                $this->geo($id, $lat, $lon);
            }
            if ($category !== null) {
                $this->link($id, 'dcterms:isPartOf', $category);
            }
            $ids[$key] = $id;
        }
        $this->link(508, 'dcterms:isPartOf', 503); // CEAO is part of UFBA
        // Record-label producers (DECCA / Jambo featured collections).
        $this->item(self::DECCA, self::T_ORG, 'foaf:Organization', 'DECCA West Africa', $stamp, [self::SET_INSTITUTION], kind: 'organisations');
        $this->item(self::JAMBO, self::T_ORG, 'foaf:Organization', 'Jambo Records', $stamp, [self::SET_INSTITUTION], kind: 'organisations');
        // Groups: institution-set members that are not foaf:Organization (group overview).
        $this->item(510, self::T_ORG, 'foaf:Group', 'Bayreuth Academy Working Group', $stamp, [self::SET_INSTITUTION], kind: 'groups');
        $this->item(511, self::T_ORG, 'foaf:Group', 'Digital Research Environment Team', $stamp, [self::SET_INSTITUTION], kind: 'groups');
        $ids['decca'] = self::DECCA;
        $ids['jambo'] = self::JAMBO;
        $ids['workingGroup'] = 510;
        $ids['dre'] = 511;
        return $ids;
    }

    /** @return array<string,int> name => location id (geocoded unless noted) */
    private function locations(string $stamp): array
    {
        $rows = [
            600 => ['Lagos', '6.5244', '3.3792'], 601 => ['Ibadan', '7.3775', '3.947'],
            602 => ['Ouagadougou', '12.3714', '-1.5197'], 603 => ['Bobo-Dioulasso', '11.1771', '-4.2979'],
            604 => ['Makhanda', '-33.3106', '26.5256'], 605 => ['Eldoret', '0.5143', '35.2698'],
            606 => ['Nairobi', '-1.2921', '36.8219'], 607 => ['Salvador', '-12.9777', '-38.5016'],
            608 => ['Kumasi', '6.6885', '-1.6244'], 609 => ['Kaolack', '14.15', '-16.07'],
            610 => ['Bamako', '12.6392', '-8.0029'], 611 => ['Kinshasa', '-4.4419', '15.2663'],
            612 => ['Addis Ababa', '9.03', '38.74'], 613 => ['Abomey', '7.18', '1.99'],
            // Falls in no country polygon: country index -1 on the spatial map.
            614 => ['Zanzibar', '-6.1659', '39.2026'],
            615 => ['Dar es Salaam', '-6.7924', '39.2083'], 616 => ['Kampala', '0.3476', '32.5825'],
        ];
        $ids = [];
        foreach ($rows as $id => [$name, $lat, $lon]) {
            $this->item($id, self::T_LOCATION, 'dcterms:Location', $name, $stamp, kind: 'locations');
            $this->geo($id, $lat, $lon);
            $ids[$name] = $id;
        }
        // No coordinates at all.
        $this->item(617, self::T_LOCATION, 'dcterms:Location', 'Timbuktu', $stamp, kind: 'locations');
        $ids['Timbuktu'] = 617;
        // First lat/long pair unusable: the second, coherent pair is selected.
        $this->item(618, self::T_LOCATION, 'dcterms:Location', 'Gorée', $stamp, kind: 'locations');
        $this->literal(618, 'geo:lat', 'unknown');
        $this->literal(618, 'geo:long', '-17.398');
        $this->literal(618, 'geo:lat', '14.667');
        $this->literal(618, 'geo:long', '-17.398');
        $ids['Gorée'] = 618;
        // Longitude is private: the place must not be geocoded from half a pair.
        $this->item(619, self::T_LOCATION, 'dcterms:Location', 'Accra', $stamp, kind: 'locations');
        $this->geo(619, '5.6037', '-0.187', true);
        $this->conn->executeStatement('UPDATE value SET is_public = 0 WHERE resource_id = 619 AND property_id = ?', [$this->properties['geo:long']]);
        $ids['Accra'] = 619;
        return $ids;
    }

    /** @return list<int> person ids */
    private function persons(array $orgs, string $stamp): array
    {
        $names = [
            'Adeyemi, Folake', 'Bakari, Amina', 'Ouédraogo, Issa', 'Santos, Ana Clara', 'Müller, Katharina',
            'Okonkwo, Chinedu', 'Mwangi, Wanjiru', 'Sawadogo, Mariam', 'Dlamini, Thandiwe', 'Schmidt, Jonas',
            'Oliveira, Rafael', 'Kiprop, David', 'Traoré, Aïssata', 'Nkosi, Sipho', 'Weber, Lena',
            'Balogun, Tunde', 'Achieng, Grace', 'Kaboré, Paul', 'Ferreira, Luíza', 'Hoffmann, Felix',
            'Mensah, Kwame', 'Diallo, Fatoumata', 'Abubakar, Hauwa', 'Njoroge, Peter',
        ];
        $affiliationPool = [$orgs['ubt'], $orgs['lagos'], $orgs['ujkz'], $orgs['ufba'], $orgs['rhodes'], $orgs['moi'], $orgs['nairobi'], $orgs['ceao'], $orgs['ifan']];
        $ids = [];
        foreach ($names as $i => $name) {
            $id = 400 + $i;
            $this->item($id, self::T_PERSON, 'foaf:Person', $name, $stamp, [self::SET_PERSON], kind: 'persons');
            // Most people have one affiliation, some two, a few none.
            $n = $i % 7 === 6 ? 0 : ($i % 4 === 0 ? 2 : 1);
            foreach ($this->pickMany($affiliationPool, $n) as $org) {
                $this->link($id, 'dcterms:isPartOf', $org);
            }
            $ids[] = $id;
        }
        // Two people also belong to a group (a non-Organization affiliation).
        $this->link(404, 'dcterms:isPartOf', $orgs['dre']);
        $this->link(409, 'dcterms:isPartOf', $orgs['dre']);
        // The name value is private: the person must surface as "Item 424",
        // never under the cached resource title.
        $this->item(424, self::T_PERSON, 'foaf:Person', 'PRIVATE cached name', $stamp, [self::SET_PERSON], kind: 'persons');
        $this->conn->executeStatement('UPDATE value SET is_public = 0 WHERE resource_id = 424');
        $this->link(424, 'dcterms:isPartOf', $orgs['ubt']);
        $ids[] = 424;
        return $ids;
    }

    /** @return array{0:list<int>,1:list<int>} [LCSH subject ids, free tag ids] */
    private function subjects(string $stamp): array
    {
        $lcshTitles = ['Music', 'Religion', 'Islam', 'Christianity', 'Migration', 'Urbanization', 'Oral tradition',
            'Popular music', 'Language policy', 'Education', 'Colonialism', 'Collective memory', 'Archives', 'Kinship', 'Gender'];
        $tagTitles = ['capoeira', 'highlife', 'Afrobeat', 'mobile phones', 'sound recording', 'pilgrimage', 'healing',
            'urban farming', 'diaspora', 'restitution', 'radio', 'photography', 'Candomblé', 'griot', 'heritage'];
        $lcsh = $tags = [];
        foreach ($lcshTitles as $i => $title) {
            $id = 700 + $i;
            $this->item($id, self::T_AUTHORITY, null, $title, $stamp, [self::SET_SUBJECT], kind: 'subjects');
            $this->link($id, 'dcterms:type', self::LCSH_MARKER);
            $lcsh[] = $id;
        }
        foreach ($tagTitles as $i => $title) {
            $id = 715 + $i;
            $this->item($id, self::T_AUTHORITY, null, $title, $stamp, [self::SET_SUBJECT], kind: 'subjects');
            $tags[] = $id;
        }
        // 'heritage' (729) is never used: no subject dashboard, still counted in the set.
        array_pop($tags);
        return [$lcsh, $tags];
    }

    /** Resource types, languages, genres, audiences, podcast series and playlists. */
    private function controlledVocabularies(string $stamp): array
    {
        $groups = [
            'types' => [self::SET_RESOURCE_TYPE, [800 => 'Interview', 801 => 'Photograph', 802 => 'Field notes', 803 => 'Sound recording', 804 => 'Video', 805 => 'Journal article', 806 => 'Book chapter', 807 => 'Monograph', 808 => 'Report']],
            'languages' => [self::SET_LANGUAGE, [810 => 'English', 811 => 'French', 812 => 'Portuguese', 813 => 'Yoruba', 814 => 'Swahili', 815 => 'Hausa', 816 => 'Mooré']],
            'genres' => [self::SET_GENRE, [820 => 'Oral history', 821 => 'Ethnography', 822 => 'Documentary', 823 => 'Music performance', 824 => 'Lecture']],
            'audiences' => [self::SET_AUDIENCE, [830 => 'Researchers', 831 => 'General public', 832 => 'Students']],
            'playlists' => [self::SET_PLAYLISTS, [845 => 'Cluster Lectures', 846 => 'Field Stories', 847 => 'Empty playlist']],
        ];
        $out = [];
        foreach ($groups as $key => [$set, $rows]) {
            foreach ($rows as $id => $title) {
                $this->item($id, null, null, $title, $stamp, [$set], kind: $key);
            }
            $out[$key] = array_keys($rows);
        }
        foreach ([840 => 'Africa Multiple Voices', 841 => 'Knowledge Talks'] as $id => $title) {
            $this->item($id, null, null, $title, $stamp, kind: 'podcastSeries');
        }
        $out['series'] = [840, 841];
        return $out;
    }

    /** @return array{0:array<int,string>,1:array<int,array>,2:array<int,list<int>>} */
    private function sectionsAndProjects(array $persons, string $stamp): array
    {
        $sections = [200 => 'Affiliations', 201 => 'Arts & Aesthetics', 202 => 'Knowledges', 203 => 'Moralities', 204 => 'Learning'];
        foreach ($sections as $id => $title) {
            $this->item($id, self::T_SECTION, 'frapo:ResearchGroup', $title, '2024-02-01 08:00:00', kind: 'sections');
            $this->literal($id, 'dcterms:abstract', 'The ' . $title . ' research section of the cluster.');
        }
        // [id, title, sections, temporal, funders, PI, members]
        $rows = [
            300 => ['Sonic Archives of the Sahel', [201], '2019-01-01/2022-12-31', [500], 400, [401, 402, 412]],
            301 => ['Mobile Knowledges in East Africa', [202], '2020-04-01/2025-03-31', [505], 406, [411, 416, 423]],
            302 => ['Faith and Public Morality', [203], '2019-07-01/2023-06-30', [501], 405, [415, 422, 420]],
            303 => ['Kinship Across Borders', [200], '2021-01-01/2025-12-31', [502], 402, [407, 417, 421]],
            304 => ['Afro-Brazilian Memory Work', [201, 200], '2022-01-01/2026-12-31', [508], 403, [410, 418]],
            305 => ['Urban Ecologies of Lagos', [200], '2023-01-01/2026-06-30', [501, 507], 415, [400, 405, 413]],
            // No research section: grouped under "Other" in the projects beeswarm.
            306 => ['Digital Return of Sound Archives', [], '2020-10-01/2024-09-30', [504], 408, [413, 404, 419]],
            // No temporal coverage and no funder.
            307 => ['Pilot Study on Language Policy', [202], null, [], 411, [414]],
            // Temporal coverage but no items yet.
            308 => ['Archive Futures Workshop', [203], '2025-10-01/2026-09-30', [500], 409, []],
        ];
        $projects = [];
        $members = [];
        foreach ($rows as $id => [$title, $secs, $temporal, $funders, $pi, $team]) {
            $this->item($id, self::T_PROJECT, 'foaf:Project', $title, '2024-02-15 08:00:00', [self::SET_PROJECT], kind: 'projects');
            foreach ($secs as $sid) {
                $this->link($id, 'dcterms:isPartOf', $sid);
            }
            if ($temporal !== null) {
                $this->literal($id, 'dcterms:temporal', $temporal);
            }
            foreach ($funders as $org) {
                $this->link($id, 'frapo:isFundedBy', $org);
            }
            $this->link($id, 'dcterms:creator', $pi);
            foreach ($team as $member) {
                $this->link($id, 'foaf:member', $member);
            }
            $this->literal($id, 'dcterms:abstract', 'Project ' . $title . ' studies how people make and remake their worlds.');
            $this->literal($id, 'dcterms:description', 'Funded within the Africa Multiple cluster of excellence.');
            $projects[$id] = $title;
            $members[$id] = array_merge([$pi], $team);
        }
        return [$sections, $projects, $members];
    }

    private function researchItems(array $c): void
    {
        $words = ['archive', 'voices', 'market', 'river', 'memory', 'ritual', 'song', 'city', 'school', 'mosque',
            'church', 'radio', 'harvest', 'migration', 'family', 'festival', 'drum', 'language', 'healing', 'road'];
        $projectWeights = [300, 300, 300, 301, 301, 301, 302, 302, 303, 303, 304, 304, 305, 305, 306, 306, 307];
        $sets = [300 => self::SET_SAHEL_SOUND, 301 => self::SET_EAST_AFRICA, 304 => self::SET_BRAZIL];
        $rolePool = ['marcrel:ive', 'marcrel:ivr', 'marcrel:pht', 'dcterms:contributor'];
        $currentPool = [600, 602, 604, 606, 607, 500, 504, 505, 503];
        for ($i = 0; $i < 120; $i++) {
            $id = 1000 + $i;
            // Ten items belong to no project ("(unassigned)" in the treemaps).
            $project = $i % 12 === 11 ? null : $this->pick($projectWeights);
            $itemSets = [];
            if ($project !== null && isset($sets[$project])) {
                $itemSets[] = $sets[$project];
            }
            if ($i % 15 === 4) {
                $itemSets[] = self::SET_BAYGLO;
            }
            $title = $this->sentence($words, 2, 4);
            $title = rtrim($title, '.') . ' (' . ($i + 1) . ')';
            $this->item($id, self::T_RESEARCH, $this->pick(['dctype:Text', 'dctype:Sound', 'dctype:StillImage']), $title, $this->createdStamp(), $itemSets, kind: 'researchItems');
            if ($project !== null) {
                $this->link($id, 'dcterms:isPartOf', $project);
            }
            // People: a creator from the project team (or anyone), plus 0–2 roles.
            $team = $project !== null ? $c['members'][$project] : $c['persons'];
            $this->link($id, 'dcterms:creator', $this->pick($team));
            foreach ($this->pickMany($c['persons'], mt_rand(0, 2)) as $person) {
                $this->link($id, $this->pick($rolePool), $person);
            }
            if ($i % 17 === 3) {
                $this->link($id, 'marcrel:ctb', $this->pick([$c['orgs']['workingGroup'], $c['orgs']['dre']]));
            }
            foreach ($this->pickMany(array_merge($c['lcsh'], $c['tags']), mt_rand(1, 4)) as $subject) {
                $this->link($id, 'dcterms:subject', $subject);
            }
            $locationPool = array_values(array_diff($c['locations'], [619]));
            foreach ($this->pickMany($locationPool, mt_rand(0, 2)) as $place) {
                $this->link($id, 'dcterms:spatial', $place);
            }
            if ($this->chance(45)) {
                $this->link($id, 'dcterms:provenance', $this->pick($currentPool));
            }
            foreach ($this->pickMany($c['languages'], $this->chance(25) ? 2 : 1) as $language) {
                $this->link($id, 'dcterms:language', $language);
            }
            $typeCount = $i % 23 === 7 ? 0 : ($this->chance(15) ? 2 : 1);
            foreach ($this->pickMany([800, 801, 802, 803, 804], $typeCount) as $type) {
                $this->link($id, 'dcterms:type', $type);
            }
            if ($this->chance(70)) {
                $this->link($id, 'dcterms:format', $this->pick($c['genres']));
            }
            if ($this->chance(30)) {
                $this->link($id, 'dcterms:audience', $this->pick($c['audiences']));
            }
            if ($this->chance(10)) {
                $this->link($id, 'frapo:isFundedBy', $this->pick([500, 507, 501]));
            }
            // Dates: the issued > created > date > hasDateCollected priority is exercised.
            $year = mt_rand(2019, 2025);
            $dateKind = mt_rand(1, 10);
            if ($dateKind <= 5) {
                $this->literal($id, 'dcterms:created', sprintf('%d-%02d-%02d', $year, mt_rand(1, 12), mt_rand(1, 28)));
            } elseif ($dateKind <= 7) {
                $this->literal($id, 'dcterms:date', (string) $year);
                $this->literal($id, 'fabio:hasDateCollected', 'ca. ' . ($year - 1));
            } elseif ($dateKind === 8) {
                $this->literal($id, 'fabio:hasDateCollected', 'collected ' . $year);
            } elseif ($dateKind === 9) {
                $this->literal($id, 'dcterms:created', sprintf('%d-01-01', $year + 1));
                $this->literal($id, 'dcterms:issued', (string) $year);
            }
            // dateKind 10: undated.
            if ($this->chance(40)) {
                $this->literal($id, 'dcterms:abstract', $this->sentence($words, 8, 16));
            } elseif ($this->chance(10)) {
                $this->literal($id, 'bibo:abstract', $this->sentence($words, 6, 10));
            }
            if ($i % 31 === 5) {
                $this->literal($id, 'dcterms:temporal', '1960/1975');
            }
            // Literal-only dcterms:spatial (unreconciled place name).
            if ($i % 19 === 2) {
                $this->literal($id, 'dcterms:spatial', 'Somewhere in the Sahel');
            }
            if ($this->chance(25)) {
                $this->media($id, sprintf('research-%04d', $i));
            }
            // A literal the loader never fetches.
            if ($i % 10 === 0) {
                $this->literal($id, 'dcterms:alternative', 'Alternative title ' . $i);
            }
        }
        // Exact duplicate link statements count once.
        $this->link(1000, 'dcterms:subject', 700);
        $this->link(1000, 'dcterms:subject', 700);
        // One research item is related to another (knowledge-graph "Related item").
        $this->link(1001, 'dcterms:relation', 1002);
    }

    private function publications(array $c): void
    {
        $words = ['postcolonial', 'archive', 'religion', 'music', 'city', 'memory', 'knowledge', 'mobility', 'gender',
            'heritage', 'language', 'education', 'africa', 'brazil', 'diaspora', 'sound', 'kinship', 'ritual'];
        $externalAuthors = ['Smith, John', 'Ndiaye, Awa', 'García, Lucía', 'Mbeki, Zola', 'Rossi, Marco', 'Kamau, Esther',
            'Lefèvre, Claire', 'Osei, Kofi', ' Tanaka, Yuki ', 'Bello, Ibrahim', 'Novak, Petra', 'Silva, João'];
        $venues = ['Journal of African Cultural Studies', 'Africa Spectrum', 'Afro-Ásia', 'Journal of Religion in Africa',
            'Cahiers d\'Études africaines', 'Africa Multiple Working Papers'];
        $publishers = ['Brill', 'Routledge', 'James Currey', 'Karthala', 'EDUFBA'];
        $placePool = [600, 602, 607, 606, 604];
        for ($i = 0; $i < 30; $i++) {
            $id = 2100 + $i;
            $isArticle = $i % 3 !== 2;
            $year = 2019 + ($i % 7);
            $title = ucfirst($this->pick($words)) . ' and ' . $this->pick($words) . ': ' . $this->sentence($words, 3, 5);
            $this->item($id, $isArticle ? self::T_ARTICLE : self::T_CHAPTER, $isArticle ? 'fabio:JournalArticle' : 'fabio:BookChapter',
                rtrim($title, '.'), $this->createdStamp(), [self::SET_PUBLICATIONS], kind: 'publications');
            // Linked authors and literal (unreconciled) authors, in list order.
            foreach ($this->pickMany($c['persons'], mt_rand($i % 5 === 0 ? 0 : 1, 3)) as $person) {
                $this->link($id, 'bibo:authorList', $person);
            }
            foreach ($this->pickMany($externalAuthors, mt_rand(0, 3)) as $name) {
                $this->literal($id, 'bibo:authorList', $name);
            }
            if (!$isArticle) {
                if ($this->chance(60)) {
                    $this->link($id, 'bibo:editorList', $this->pick($c['persons']));
                }
                $this->literal($id, 'bibo:editorList', $this->pick($externalAuthors));
            }
            $this->link($id, 'dcterms:type', $isArticle ? 805 : $this->pick([806, 807]));
            $this->link($id, 'dcterms:language', $this->pick([810, 810, 811, 812]));
            foreach ($this->pickMany(array_merge($c['lcsh'], $c['tags']), mt_rand(1, 3)) as $subject) {
                $this->link($id, 'dcterms:subject', $subject);
            }
            $this->literal($id, 'dcterms:issued', (string) $year);
            if ($isArticle) {
                $this->literal($id, 'dcterms:isPartOf', $this->pick($venues));
            }
            if ($i % 11 === 4) {
                // A publisher held as a URI value only (no label).
                $this->literal($id, 'dcterms:publisher', null, true, 'https://example.org/press/' . $i);
            } elseif ($this->chance(70)) {
                $this->literal($id, 'dcterms:publisher', $this->pick($publishers));
            }
            if ($this->chance(50)) {
                $this->link($id, 'marcrel:pup', $this->pick($placePool));
            }
            if ($this->chance(75)) {
                $this->link($id, 'frapo:isFundedBy', $this->pick([507, 507, 500]));
            }
            $this->link($id, 'bibo:status', $this->chance(65) ? 850 : 851);
            $this->literal($id, 'bibo:doi', '10.5555/amira.' . $id);
            $this->literal($id, 'bibo:abstract', $this->sentence($words, 15, 30));
            if ($i % 3 === 0) {
                $this->media($id, sprintf('publication-%04d', $i));
            }
        }
        // A publication that is part of a project (enters the project's items).
        $this->link(2101, 'dcterms:isPartOf', 305);
        // A non-public author literal on a public publication.
        $this->literal(2100, 'bibo:authorList', 'PRIVATE, Hidden Author', false);
    }

    private function podcasts(array $c): void
    {
        $words = ['research', 'africa', 'knowledge', 'community', 'communities', 'language', 'languages', 'music',
            'archive', 'city', 'studies', 'studying', 'travaille', 'langues', 'projets', 'heritage', 'healing'];
        $durations = ['PT18M40S', 'PT25M', 'PT33M12S', 'PT41M05S', 'PT52M', 'PT1H05M30S', 'PT47M', 'PT29M59S', '45 minutes', 'PT0S'];
        for ($i = 0; $i < 10; $i++) {
            $id = 2200 + $i;
            $this->item($id, self::T_PODCAST, 'dctype:Sound', 'Episode ' . ($i + 1) . ': ' . rtrim($this->sentence($words, 2, 4), '.'),
                $this->createdStamp(), [self::SET_PODCASTS], kind: 'podcasts');
            $this->link($id, 'dcterms:isPartOf', $i < 6 ? 840 : 841);
            $this->link($id, 'marcrel:hst', 409);
            foreach ($this->pickMany(array_values(array_diff($c['persons'], [409])), mt_rand(1, 2)) as $person) {
                $this->link($id, 'marcrel:spk', $person);
            }
            $this->link($id, 'dcterms:language', $i % 4 === 3 ? 811 : 810);
            foreach ($this->pickMany($c['lcsh'], 2) as $subject) {
                $this->link($id, 'dcterms:subject', $subject);
            }
            if ($i % 2 === 0) {
                $this->link($id, 'dcterms:spatial', $this->pick([600, 602, 606, 607]));
            }
            $this->literal($id, 'dcterms:extent', $durations[$i]);
            $this->literal($id, 'dcterms:issued', sprintf('%d-%02d-15', 2021 + intdiv($i, 4), 1 + $i));
            $this->literal($id, 'dcterms:abstract', 'In this episode we ' . $this->sentence($words, 6, 10));
            // Transcript with diarisation labels and bracketed cues the cloud strips.
            $this->literal($id, 'bibo:content', 'Speaker 1: [music] Welcome. ' . $this->sentence($words, 30, 50)
                . ' Speaker 2: ' . $this->sentence($words, 20, 40) . ' [laughter]');
        }
        $this->literal(2203, 'bibo:content', 'PRIVATE transcript fragment', false);
    }

    private function youtube(array $c): void
    {
        $words = ['lecture', 'africa', 'multiple', 'knowledge', 'archive', 'sound', 'city', 'memory', 'research'];
        for ($i = 0; $i < 12; $i++) {
            $id = 2300 + $i;
            $this->item($id, self::T_YOUTUBE, 'dctype:MovingImage', 'Video ' . ($i + 1) . ': ' . rtrim($this->sentence($words, 2, 4), '.'),
                $this->createdStamp(), [self::SET_YOUTUBE], kind: 'youtube');
            if ($i < 10) {
                $this->link($id, 'dcterms:isPartOf', $i % 3 === 0 ? 846 : 845);
            }
            foreach ($this->pickMany($c['persons'], mt_rand(0, 3)) as $person) {
                $this->link($id, 'marcrel:spk', $person);
            }
            $this->link($id, 'dcterms:language', $this->pick([810, 810, 811, 812, 814]));
            if ($i % 2 === 1) {
                $this->link($id, 'dcterms:subject', $this->pick($c['lcsh']));
            }
            $this->literal($id, 'dcterms:issued', sprintf('%d-%02d-%02d', 2020 + ($i % 6), 1 + $i, 3 + $i));
            $this->literal($id, 'bibo:content', $this->sentence($words, 20, 40));
        }
    }

    private function photographs(array $c): void
    {
        for ($i = 0; $i < 20; $i++) {
            $id = 2400 + $i;
            $place = $this->pick([600, 601, 602, 603, 608, 609, 610, 613, 617]);
            $this->item($id, self::T_PHOTO, 'dctype:StillImage', 'Field photograph ' . ($i + 1), $this->createdStamp(),
                [self::SET_FIELD_PHOTOS], kind: 'photographs');
            if ($i % 6 === 5) {
                // Unreconciled place: the gallery falls back to the literal label.
                $this->literal($id, 'dcterms:spatial', 'Village near Bobo-Dioulasso');
            } else {
                $this->link($id, 'dcterms:spatial', $place);
            }
            $this->link($id, 'marcrel:pht', $this->pick([400, 402, 407, 412]));
            $this->link($id, 'dcterms:type', 801);
            $this->link($id, 'dcterms:subject', $this->pick([725, 715, 706]));
            if ($i % 5 !== 4) {
                $this->literal($id, 'dcterms:date', sprintf('%d-%02d-%02d', 2019 + ($i % 6), 1 + ($i % 12), 1 + $i));
            }
            if ($i === 0) {
                // Private first media, public second: the public one is primary.
                $this->media($id, 'PRIVATE-photo-storage', false, 1);
                $this->media($id, 'photo-0000', true, 2);
            } elseif ($i === 1) {
                // Explicit primary media that is not the first by position.
                $this->media($id, 'photo-0001-a', true, 1);
                $primary = $this->media($id, 'photo-0001-b', true, 2);
                $this->conn->update('item', ['primary_media_id' => $primary], ['id' => $id]);
            } elseif ($i === 2) {
                // Media without thumbnails is not image-bearing.
                $this->media($id, 'photo-0002', true, 1, false);
            } elseif ($i === 3) {
                // Thumbnail but no original: extension is withheld.
                $this->media($id, 'photo-0003', true, 1, true, false);
            } else {
                $this->media($id, sprintf('photo-%04d', $i));
            }
        }
    }

    private function museuAfroDigital(array $c): void
    {
        $identifiers = [];
        foreach (['APMESTRENO' => 7, 'TRABNEGRBA' => 5, 'ORIXAFGM' => 4, 'OTHERPREFIX' => 1] as $prefix => $n) {
            for ($k = 1; $k <= $n; $k++) {
                $identifiers[] = sprintf('%s%03d', $prefix, $k);
            }
        }
        foreach ($identifiers as $i => $ident) {
            $id = 2450 + $i;
            $this->item($id, self::T_PHOTO, 'dctype:StillImage', 'Acervo ' . $ident, $this->createdStamp(), [self::SET_MUSEU, self::SET_BRAZIL], kind: 'museuAfroDigital');
            $this->literal($id, 'dcterms:identifier', $ident);
            $this->literal($id, 'dcterms:description', 'Fotografia do acervo, Salvador.');
            $this->link($id, 'dcterms:spatial', 607);
            $this->link($id, 'dcterms:provenance', 503);
            $this->link($id, 'dcterms:subject', $this->pick([715, 727, 711]));
            $this->link($id, 'dcterms:language', 812);
            $this->literal($id, 'dcterms:date', (string) (1970 + 3 * $i));
            if ($i % 6 !== 5) {
                $this->media($id, 'museu-' . strtolower($ident));
            }
        }
    }

    private function ilam(array $c): void
    {
        // [doi, description, author] — volume/issue come from the DOI, pages from the description.
        $rows = [
            ['10.21504/amj.v9i1.1801', 'African Music Journal, pages 1–14', 400],
            ['10.21504/amj.v9i1.1802', 'African Music Journal, pages 15-32', 403],
            ['10.21504/amj.v9i1.1803', 'African Music Journal, page 33', null],
            ['10.21504/amj.v9i2.1901', 'African Music Journal, pages: ix - xii', 408],
            ['10.21504/amj.v9i2.1902', 'African Music Journal, pages 45–60', 404],
            ['10.21504/amj.v10i1.2001', 'African Music Journal, pp. 3', 400],
            ['10.21504/amj.v10i1.2002', 'African Music Journal, pages 21–40', 413],
            ['10.21504/amj.v10i1.2003', null, 404],
            [null, 'Editorial note', null],
        ];
        foreach ($rows as $i => [$doi, $desc, $author]) {
            $id = 2500 + $i;
            $this->item($id, self::T_ARTICLE, 'fabio:JournalArticle', 'ILAM article ' . ($i + 1), $this->createdStamp(), [self::SET_ILAM], kind: 'ilam');
            if ($doi !== null) {
                $this->literal($id, 'bibo:doi', $doi);
            }
            if ($desc !== null) {
                $this->literal($id, 'dcterms:description', $desc);
            }
            if ($author !== null) {
                $this->link($id, $i % 2 ? 'marcrel:aut' : 'dcterms:creator', $author);
            }
            $this->link($id, 'dcterms:provenance', 604);
            $this->link($id, 'dcterms:subject', $this->pick([700, 707, 716]));
            $this->literal($id, 'dcterms:issued', (string) (2012 + intdiv($i, 3)));
            if ($i !== 2) {
                $this->media($id, sprintf('ilam-%04d', $i));
            }
        }
    }

    private function digitalReturn(array $c): void
    {
        for ($i = 0; $i < 8; $i++) {
            $id = 2600 + $i;
            $this->item($id, self::T_AUDIO, 'dctype:Sound', 'Gramophone side ' . ($i + 1), $this->createdStamp(), [self::SET_DIGITAL_RETURN], kind: 'digitalReturn');
            $this->link($id, 'marcrel:prn', $i < 5 ? self::DECCA : self::JAMBO);
            $this->link($id, 'dcterms:language', $i < 5 ? 813 : 814);
            $this->link($id, 'dcterms:type', 803);
            $this->link($id, 'dcterms:format', 823);
            $this->link($id, 'dcterms:subject', $this->pick([707, 716, 717]));
            $this->link($id, 'dcterms:spatial', $i < 5 ? 600 : 606);
            $this->link($id, 'dcterms:provenance', 608);
            $this->literal($id, 'dcterms:issued', (string) (1955 + $i));
            $this->link($id, 'dcterms:isPartOf', 306);
        }
    }

    /** Records that must never reach an artifact. */
    private function privateRecords(array $c): void
    {
        // A private item in the site, linked from public items and in public sets.
        $this->item(9000, self::T_RESEARCH, 'dctype:Text', 'PRIVATE research item', '2026-09-30 23:00:00', [self::SET_FIELD_PHOTOS, self::SET_PUBLICATIONS], false, kind: 'private');
        $this->link(9000, 'dcterms:isPartOf', 300);
        $this->media(9000, 'PRIVATE-item-media');
        $this->link(1003, 'dcterms:subject', 9000);
        $this->link(1004, 'dcterms:relation', 9000);
        // A public item of another site only (cross-site target).
        $this->item(9001, self::T_AUTHORITY, null, 'PRIVATE other-site subject', '2026-09-30 23:00:00', [self::SET_SUBJECT], true, [2], kind: 'private');
        $this->link(1005, 'dcterms:subject', 9001);
        // A public item in no site at all.
        $this->item(9002, self::T_PERSON, 'foaf:Person', 'PRIVATE siteless person', '2026-09-30 23:00:00', [self::SET_PERSON], true, [], kind: 'private');
        $this->link(1006, 'dcterms:creator', 9002);
        // Private statements on public items.
        $this->literal(1002, 'dcterms:abstract', 'PRIVATE abstract text', false);
        $this->link(1007, 'dcterms:subject', 701, false);
        $this->link(1008, 'dcterms:spatial', 611, false);
        // Public items in a private item set.
        foreach ([1010, 1011, 2400] as $id) {
            $this->conn->insert('item_item_set', ['item_id' => $id, 'item_set_id' => self::SET_PRIVATE]);
        }
        // A private media on a research item that is otherwise image-less.
        $this->media(1012, 'PRIVATE-research-media', false);
    }
}
