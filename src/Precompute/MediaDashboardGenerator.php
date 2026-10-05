<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

use DreVisualizations\FeaturedCollections\Registry;

final class MediaDashboardGenerator extends DashboardGenerator
{
    public function generate(): int
    {
        $this->generatePublications();
        $this->generateYouTube();
        $this->generatePodcasts();
        return $this->fileCount;
    }

    protected function generatePublications(): void
    {
        $pubs = $this->publicationIds();
        $this->log('=== Publications (' . count($pubs) . ' items in set ' . $this->profile->itemSet('publications') . ') ===');
        if (count($pubs) < 3) {
            return;
        }
        $dashboard = $this->aggregators->aggregateItems($pubs, $this->items, $this->links, $this->itemYear, $this->geo);
        // Places of publication (marcrel:pup → geocoded Location items) as the
        // standard locations map. Publications carry no dcterms:spatial, so
        // aggregateItems left `locations` empty; overriding it here reuses the
        // shared map builder — bubbles sized by publication count, per-place
        // popup lists — with the labels retitled below. Literal-only places
        // (unreconciled, e.g. "München") stay off the map by design.
        if ($v = $this->aggregators->buildLinkedPlacesMap($pubs, $this->links, $this->items, $this->geo, 'marcrel:pup')) {
            $dashboard['locations'] = $v;
        }
        if ($v = $this->aggregators->buildTopLiteral($pubs, $this->literals, 'dcterms:isPartOf')) {
            $dashboard['topVenues'] = $v;
        }
        if ($v = $this->aggregators->buildTopAuthors($pubs, $this->links, $this->literals, $this->items)) {
            $dashboard['topAuthors'] = $v;
        }
        // Funding bodies (frapo:isFundedBy → linked Institution / grant
        // authority items — the DFG, the EXC 2052 grant, partner foundations).
        if ($v = $this->aggregators->buildTopLinked($pubs, $this->links, $this->items, 'frapo:isFundedBy')) {
            $dashboard['funders'] = $v;
        }
        if ($v = $this->aggregators->buildCoAuthorNetwork($pubs, $this->links, $this->literals, $this->items)) {
            $dashboard['coAuthorNetwork'] = $v;
        }
        if ($v = $this->aggregators->buildChord($pubs, $this->links, $this->items)) {
            $dashboard['chord'] = $v;
        }
        if ($v = $this->aggregators->buildStackedTimeline($pubs, $this->links, $this->items, $this->itemYear)) {
            $dashboard['stackedTimeline'] = $v;
        }
        if ($v = $this->aggregators->buildSubjectTrends($pubs, $this->links, $this->items, $this->itemYear)) {
            $dashboard['subjectTrends'] = $v;
        }
        // Abstract word cloud — lemmatised frequencies from the wordclouds Action
        // (asset/data/wordclouds/publications.json), or an in-PHP fallback over the
        // raw bibo:abstract text when that committed input is absent.
        $absWc = $this->wordCloudInput('publications')
            ?? $this->aggregators->buildTranscriptWordCloud($this->loadTextValues($pubs, 'bibo:abstract'));
        if ($absWc) {
            $dashboard['abstractWordcloud'] = $absWc;
        }

        // Summary stat cards: total publications, distinct publication types
        // (dcterms:type), languages, and the people credited as authors or editors
        // — distinct linked Person records across bibo:authorList + bibo:editorList.
        $peopleIds = [];
        foreach ($pubs as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term === 'bibo:authorList' || $term === 'bibo:editorList') {
                    $peopleIds[$vrid] = true;
                }
            }
        }
        // Bibliographic breadth cards: distinct venues (journals & book series,
        // dcterms:isPartOf) and publishers (dcterms:publisher) are literal EP3
        // fields; places of publication counts what the map above renders. The
        // peer-review flag is NOT a literal — the sync links bibo:status to a
        // "Peer reviewed" / "Not peer reviewed" authority item — so it is
        // counted through the links map, on the exact title (no substring hit
        // for "Not peer reviewed").
        $venueCount = $this->aggregators->countDistinctLiterals($pubs, $this->literals, 'dcterms:isPartOf');
        $publisherCount = $this->aggregators->countDistinctLiterals($pubs, $this->literals, 'dcterms:publisher');
        $peerReviewed = $this->aggregators->countItemsLinkedTo($pubs, $this->links, $this->items, 'bibo:status', 'Peer reviewed');
        // EPub deposits carry their open-access PDF as attached media (ERef
        // records are metadata-only), so "has media" = full text available.
        $fullTexts = $this->countItemsWithMedia($pubs);
        $dashboard['stats'] = $this->aggregators->buildStatCards([
            ['key' => 'publications', 'label' => 'Publications', 'value' => count($pubs)],
            ['key' => 'peerReviewed', 'label' => 'Peer-reviewed', 'value' => $peerReviewed,
                'subtitle' => 'of ' . count($pubs) . ' publications'],
            ['key' => 'fullText', 'label' => 'Full texts', 'value' => $fullTexts,
                'subtitle' => 'open-access PDFs you can read here'],
            ['key' => 'types', 'label' => 'Publication types', 'value' => count($dashboard['types'] ?? [])],
            ['key' => 'languages', 'label' => 'Languages', 'value' => count($dashboard['languages'] ?? [])],
            ['key' => 'people', 'label' => 'Authors and editors', 'value' => count($peopleIds)],
            ['key' => 'venues', 'label' => 'Venues', 'value' => $venueCount,
                'subtitle' => 'journals and book series'],
            ['key' => 'publishers', 'label' => 'Publishers', 'value' => $publisherCount],
            ['key' => 'places', 'label' => 'Places of publication', 'value' => count($dashboard['locations'] ?? []),
                'subtitle' => 'shown on the map'],
        ]);

        // Publications-specific chart wording, plus the Languages pie. The shared
        // registry renders Languages as a bar chart and titles charts for research
        // items; these per-dashboard overrides retitle them for the bibliography
        // and swap Languages to a pie. Read by renderDashboard() in dashboard.js.
        $dashboard['builders'] = ['languages' => 'buildPieChart'];
        $dashboard['labels'] = [
            'types' => 'Publication types',
            'stackedTimeline' => 'Publications by year and type',
            'locations' => 'Places of publication',
            'funders' => 'Funders',
            'coAuthorNetwork' => 'Collaboration network',
            'chord' => 'Keywords that appear together',
            'subjects' => 'Keywords',
            'subjectTrends' => 'Keywords over time',
            'abstractWordcloud' => 'Words in the abstracts',
        ];
        $dashboard['descriptions'] = [
            'types' => 'The mix of publication types: article, book, chapter, thesis, and so on.',
            'languages' => 'The languages the publications are written in.',
            'stackedTimeline' => 'Publications issued each year, split by type.',
            'locations' => 'The cities these publications appeared in. Each bubble is sized by the number of publications issued there; click one to list them.',
            'funders' => 'The funding bodies credited on these publications. Click a bar to open a funder\'s page.',
            'topVenues' => 'The journals and book series these publications appear in most often.',
            'topAuthors' => 'The authors credited on the most publications.',
            'coAuthorNetwork' => 'Authors and editors are linked when they appear on the same publication. The colour of a line shows the relationship: co-authorship, author and editor, or co-editorship.',
            'chord' => 'Keywords that are often assigned to the same publication.',
            'subjects' => 'The keywords assigned to these publications most often.',
            'subjectTrends' => 'How the most frequent keywords rise and fall over the years.',
            'abstractWordcloud' => 'The words that come up most often across the publication abstracts. Words are reduced to their base form, and everyday words such as "the" and "of" are left out.',
        ];

        $dashboard['resourceType'] = 'publications';
        $this->save('publications', $dashboard);
        $this->log('  publications dashboard written (' . count($pubs) . ' items)');
    }

    protected function generateYouTube(): void
    {
        $videos = $this->youtubeIds();
        $this->log('=== YouTube (' . count($videos) . ' videos in set ' . $this->profile->itemSet('youtube') . ') ===');
        if (count($videos) < 3) {
            return;
        }
        $dashboard = $this->aggregators->aggregateItems($videos, $this->items, $this->links, $this->itemYear, $this->geo);
        if ($v = $this->buildYoutubePlaylists($videos)) {
            $dashboard['playlists'] = $v;
        }
        if ($v = $this->aggregators->buildLanguageTimeline($videos, $this->links, $this->items, $this->itemYear)) {
            $dashboard['languageTimeline'] = $v;
        }
        // Transcript word cloud — lemmatised frequencies from the wordclouds
        // Action (asset/data/wordclouds/youtube.json) when present, else the
        // in-PHP tokeniser over the raw bibo:content captions. Mirrors the
        // Podcasts headline chart.
        $wc = $this->wordCloudInput('youtube')
            ?? $this->aggregators->buildTranscriptWordCloud($this->loadTextValues($videos, 'bibo:content'));
        if ($wc) {
            $dashboard['transcriptWordcloud'] = $wc;
        }
        // Who appears together — speakers (marcrel:spk) featuring on the same
        // video. Speaker credits are manually curated and often sparse, so the
        // panel auto-hides until curation catches up (empty = hidden).
        if ($v = $this->aggregators->buildPersonCollaborationNetwork($videos, $this->items, $this->links, 1)) {
            $dashboard['speakerNetwork'] = $v;
        }

        // Summary stat cards: videos, playlists, languages, and the people
        // credited as speakers (marcrel:spk — manually curated, so often empty).
        $speakerIds = [];
        foreach ($videos as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term === 'marcrel:spk') {
                    $speakerIds[$vrid] = true;
                }
            }
        }
        $dashboard['stats'] = $this->aggregators->buildStatCards([
            ['key' => 'youtube', 'label' => 'Videos', 'value' => count($videos)],
            ['key' => 'playlists', 'label' => 'Playlists', 'value' => count($dashboard['playlists'] ?? [])],
            ['key' => 'languages', 'label' => 'Languages', 'value' => count($dashboard['languages'] ?? [])],
            ['key' => 'people', 'label' => 'Speakers', 'value' => count($speakerIds)],
        ]);

        // YouTube-specific chart wording. The shared registry titles charts for
        // research items; these retitle them for the channel. Read by
        // renderDashboard() in dashboard.js.
        $dashboard['labels'] = [
            'timeline' => 'Videos by year',
            'contributors' => 'Speakers',
        ];
        $dashboard['descriptions'] = [
            'timeline' => 'Videos uploaded each year.',
            'languages' => 'The languages spoken across the channel\'s videos.',
            'languageTimeline' => 'How the mix of languages in the uploads shifts over time.',
            'contributors' => 'The people credited as speakers in the videos.',
            'transcriptWordcloud' => 'The words that come up most often in the video captions. Everyday words and filler such as "um" are left out.',
            'speakerNetwork' => 'People are linked when they appear in the same video, and colour marks groups who appear together often. The picture fills out as more speaker credits are added.',
        ];

        $dashboard['resourceType'] = 'youtube';
        $this->save('youtube', $dashboard);
        $this->log('  youtube dashboard written (' . count($videos) . ' videos)');
    }

    protected function generatePodcasts(): void
    {
        $ids = $this->podcastIds();
        $this->log('=== Podcasts (' . count($ids) . ' episodes in set ' . $this->profile->itemSet('podcasts') . ') ===');
        if (count($ids) < 3) {
            return;
        }
        $dashboard = $this->aggregators->aggregateItems($ids, $this->items, $this->links, $this->itemYear, $this->geo);

        // Series (dcterms:isPartOf → series authority items) as a ranked bar.
        if ($v = $this->buildPodcastSeries($ids)) {
            $dashboard['series'] = $v;
        }

        // Durations (dcterms:extent, ISO-8601) and transcripts (bibo:content) are
        // not loaded by DataLoader, so fetch them for just these episodes.
        [$durations, $transcripts] = $this->loadPodcastExtras($ids);
        $totalSeconds = array_sum($durations);
        if ($v = $this->aggregators->buildDurationHistogram($durations)) {
            $dashboard['duration'] = $v;
        }
        // Prefer the lemmatised frequencies from the wordclouds Action
        // (asset/data/wordclouds/podcasts.json); fall back to the in-PHP tokeniser
        // over the raw transcripts when that committed input is absent.
        if ($v = ($this->wordCloudInput('podcasts') ?? $this->aggregators->buildTranscriptWordCloud($transcripts))) {
            $dashboard['transcriptWordcloud'] = $v;
        }

        // The generic item aggregation already supplies the subject frequency
        // cloud and location points. These richer derived views are cheap to
        // build here and remain auto-hidden until the corresponding episode
        // metadata has actually been curated.
        if ($v = $this->aggregators->buildChord($ids, $this->links, $this->items)) {
            $dashboard['chord'] = $v;
        }
        if ($v = $this->aggregators->buildSubjectTrends($ids, $this->links, $this->items, $this->itemYear)) {
            $dashboard['subjectTrends'] = $v;
        }
        if ($v = $this->aggregators->buildChoropleth($ids, $this->links, $this->countryIndex)) {
            $dashboard['choropleth'] = $v;
        }

        // Co-appearance network — people (speakers / hosts / moderators) linked
        // when they feature on the same episode, clustered into communities.
        // Reuses the shared person-collaboration builder; minCooccurrence=1
        // because podcast line-ups are small, so a single shared episode is a
        // meaningful tie (a recurring host becomes a hub to its guests).
        if ($v = $this->aggregators->buildPersonCollaborationNetwork($ids, $this->items, $this->links, 1)) {
            $dashboard['speakerNetwork'] = $v;
        }

        // Summary stat cards: episodes, distinct series, distinct speakers
        // (marcrel:spk), total listening time (avg length in the subtitle) and
        // the languages spoken (their names in the subtitle).
        $seriesIds = [];
        $speakerIds = [];
        foreach ($ids as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term === 'dcterms:isPartOf') {
                    $seriesIds[$vrid] = true;
                } elseif ($term === 'marcrel:spk') {
                    $speakerIds[$vrid] = true;
                }
            }
        }
        $langNames = array_map(static fn ($l) => $l['name'], $dashboard['languages'] ?? []);
        $cards = [
            ['key' => 'podcasts', 'label' => 'Episodes', 'value' => count($ids)],
            ['key' => 'series', 'label' => 'Series', 'value' => count($seriesIds)],
            ['key' => 'people', 'label' => 'Speakers', 'value' => count($speakerIds)],
        ];
        if ($totalSeconds > 0 && $durations) {
            $cards[] = [
                'key' => 'duration', 'label' => 'Hours of audio',
                'value' => (int) round($totalSeconds / 3600),
                'subtitle' => (int) round($totalSeconds / count($durations) / 60) . ' minutes per episode on average',
            ];
        }
        $cards[] = [
            'key' => 'languages', 'label' => 'Languages',
            'value' => count($langNames),
            'subtitle' => $langNames ? implode(', ', $langNames) : null,
        ];
        $dashboard['stats'] = $this->aggregators->buildStatCards($cards);

        // Podcast-specific chart wording (the shared registry titles charts for
        // research items). Read by renderDashboard() in dashboard.js.
        $dashboard['labels'] = [
            'transcriptWordcloud' => 'Words in the transcripts',
            'contributors' => 'Speakers and hosts',
            'duration' => 'Episode length',
            'timeline' => 'Episodes by year',
            'series' => 'Episodes by series',
            'speakerNetwork' => 'Who appears together',
            'subjects' => 'Subjects',
            'chord' => 'Subjects that appear together',
            'subjectTrends' => 'Subjects over time',
            'locations' => 'Places the episodes are about',
            'choropleth' => 'Episodes by country',
        ];
        $dashboard['descriptions'] = [
            'transcriptWordcloud' => 'The words that come up most often across the episode transcripts, which are generated automatically from the audio. Audio cues, speaker names and everyday English and French words are left out.',
            'contributors' => 'The people credited as speakers, hosts or moderators across the episodes.',
            'duration' => 'How long the episodes run, grouped into length bands.',
            'timeline' => 'Podcast episodes published each year.',
            'series' => 'Episodes counted by the series they belong to.',
            'speakerNetwork' => 'People are linked when they feature on the same episode, and colour marks groups who appear together often. A recurring host or guest sits at the centre of many links.',
            'subjects' => 'The subjects assigned to the podcast episodes by the editors.',
            'chord' => 'Subjects that are often assigned to the same episode.',
            'subjectTrends' => 'How the most frequent subjects change from one year of episodes to the next.',
            'locations' => 'The places the episodes are associated with.',
            'choropleth' => 'Episodes counted by the country of the places they are associated with.',
        ];

        $dashboard['resourceType'] = 'podcasts';
        $this->save('podcasts', $dashboard);
        $this->log('  podcasts dashboard written (' . count($ids) . ' episodes)');
    }

    protected function buildPodcastSeries(array $ids): ?array
    {
        $counts = [];
        foreach ($ids as $iid) {
            foreach ($this->links[$iid] ?? [] as [$term, , $vrid]) {
                if ($term !== 'dcterms:isPartOf') {
                    continue;
                }
                $title = $this->items[$vrid]['title'] ?? '';
                if ($title === '') {
                    continue;
                }
                $counts[$vrid] ??= ['name' => $title, 'value' => 0, 'itemId' => $vrid];
                $counts[$vrid]['value']++;
            }
        }
        if (!$counts) {
            return null;
        }
        $rows = array_values($counts);
        usort($rows, static fn ($a, $b) => ($b['value'] <=> $a['value'])
            ?: strcmp((string) $a['name'], (string) $b['name'])
            ?: ((int) $a['itemId'] <=> (int) $b['itemId']));
        return $rows;
    }

    protected function countItemsWithMedia(array $ids): int
    {
        return count(array_intersect_key($this->mediaItems, array_fill_keys($ids, true)));
    }

    protected function loadPodcastExtras(array $ids): array
    {
        $durations = [];
        $transcripts = [];
        foreach ($this->loadValueRows($ids, ['dcterms:extent', 'bibo:content']) as $r) {
            $term = (string) $r[1];
            $value = (string) $r[2];
            if ($term === 'dcterms:extent') {
                $secs = self::parseIso8601Duration($value);
                if ($secs > 0) {
                    $durations[] = $secs;
                }
            } elseif ($term === 'bibo:content') {
                $transcripts[] = $value;
            }
        }
        return [$durations, $transcripts];
    }

    protected static function parseIso8601Duration(string $iso): int
    {
        if (!preg_match('/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i', trim($iso), $m)) {
            return 0;
        }
        return ((int) ($m[1] ?? 0)) * 3600 + ((int) ($m[2] ?? 0)) * 60 + ((int) ($m[3] ?? 0));
    }

    protected function wordCloudInput(string $corpus): ?array
    {
        $path = $this->wordcloudsDir . '/' . $corpus . '.php';
        if (!is_file($path)) {
            return null;
        }
        $json = ScopedInput::read($path, $this->sourceScope);
        $byLang = is_array($json) ? ($json['byLang'] ?? null) : null;
        if (!is_array($byLang) || !$byLang) {
            return null;
        }
        $languages = $json['languages'] ?? array_keys($byLang);
        return ['languages' => array_values($languages), 'byLang' => $byLang];
    }

    protected function loadTextValues(array $ids, string $term): array
    {
        $values = [];
        foreach ($this->loadValueRows($ids, [$term]) as $r) {
            $values[] = (string) $r[2];
        }
        return $values;
    }

    protected function buildYoutubePlaylists(array $videoIds): array
    {
        $videoSet = array_flip($videoIds);
        $out = [];
        foreach ($this->itemSets[$this->profile->itemSet('youtubePlaylists')] ?? [] as $plId) {
            $title = $this->items[$plId]['title'] ?? '';
            if ($title === '') {
                continue;
            }
            $n = 0;
            foreach ($this->childrenOf[$plId] ?? [] as $childId) {
                if (isset($videoSet[$childId])) {
                    $n++;
                }
            }
            if ($n > 0) {
                $out[] = ['name' => $title, 'value' => $n, 'itemId' => (int) $plId];
            }
        }
        usort($out, static fn ($a, $b) => ($b['value'] <=> $a['value']) ?: strcmp((string) $a['name'], (string) $b['name']));
        return $out;
    }
}
