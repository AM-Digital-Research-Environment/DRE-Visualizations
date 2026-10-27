<?php
declare(strict_types=1);

namespace DreVisualizations\Precompute\Aggregators;

/**
 * Media-document charts: the episode-length histogram and the transcript word
 * cloud for the Podcasts dashboard (and reusable by any text-bearing corpus).
 *
 * Composed into {@see \DreVisualizations\Precompute\Aggregators}; its methods
 * reach shared constants and helpers on that class through `self::`.
 */
trait MediaChartsTrait
{
    // Provided by SupportTrait / Aggregators (or another trait); declared so
    // this trait states what it relies on and PHP checks the signatures.
    abstract private function sortCounts(array &$counts): void;

    /**
     * Episode-length histogram from a list of durations in seconds. Returns the
     * populated length bands in natural order (so the front-end buildHistogram
     * renders them left → right), as `[{name, value}]`; null when nothing is
     * countable. Empty bands are dropped to keep the columns tidy.
     *
     * @param list<int> $secondsList
     * @return list<array{name:string,value:int}>|null
     */
    public function buildDurationHistogram(array $secondsList): ?array
    {
        // Upper bound (exclusive) of each band, in seconds; the last catches the rest.
        $bands = [
            ['name' => 'Under 20 min', 'max' => 20 * 60],
            ['name' => '20–30 min',    'max' => 30 * 60],
            ['name' => '30–40 min',    'max' => 40 * 60],
            ['name' => '40–50 min',    'max' => 50 * 60],
            ['name' => '50–60 min',    'max' => 60 * 60],
            ['name' => '60 min +',     'max' => PHP_INT_MAX],
        ];
        $counts = array_fill(0, count($bands), 0);
        $any = false;
        foreach ($secondsList as $s) {
            $s = (int) $s;
            if ($s <= 0) {
                continue;
            }
            foreach ($bands as $i => $band) {
                if ($s < $band['max']) {
                    $counts[$i]++;
                    $any = true;
                    break;
                }
            }
        }
        if (!$any) {
            return null;
        }
        $out = [];
        foreach ($bands as $i => $band) {
            if ($counts[$i] > 0) {
                $out[] = ['name' => $band['name'], 'value' => $counts[$i]];
            }
        }
        return $out;
    }

    /**
     * Word-frequency cloud across a set of (plain-text) transcripts. Aggressive
     * cleanup: bracketed cues (`[music]`), diarisation labels (`Speaker 1:`),
     * tokens under three characters and a broad English, French, German and
     * Portuguese stop-word and filler list are all removed, plus the words
     * stopped only in `$lang` when the texts are known to be in one language.
     * A small curated EN/FR form map merges the common surface variants that
     * matter in the fallback cloud; the committed CI-built inputs use full
     * spaCy lemmatisation. Returns
     * the top `$topN` words as `[{name, value}]` (value = corpus frequency),
     * dropping words that occur only once; null when there is nothing left.
     *
     * @param list<string> $texts
     * @return list<array{name:string,value:int}>|null
     */
    public function buildTranscriptWordCloud(array $texts, int $topN = 150, ?string $lang = null): ?array
    {
        if (!$texts) {
            return null;
        }
        $stop = $this->transcriptStopWords() + $this->languageStopWords($lang);
        $lemmas = $this->transcriptLemmaMap();
        $counts = [];
        foreach ($texts as $text) {
            if (!is_string($text) || $text === '') {
                continue;
            }
            $t = mb_strtolower($text, 'UTF-8');
            // Drop bracketed audio cues and the "Speaker 1 / Speaker 2:" diarisation
            // labels (with or without the trailing colon). The bare word "speaker"
            // is stop-worded and digits never tokenise, but this also keeps the
            // label from being counted as a unit.
            $t = (string) preg_replace('/\[[^\]]*\]/u', ' ', $t);
            $t = (string) preg_replace('/\bspeakers?\s*\d+\s*:?/u', ' ', $t);
            // Tokenise on any non-letter (Unicode-aware, so accented French letters
            // survive). Apostrophes split too, shedding French elisions (l', d', qu').
            $tokens = preg_split('/[^\p{L}]+/u', $t, -1, PREG_SPLIT_NO_EMPTY);
            if (!$tokens) {
                continue;
            }
            foreach ($tokens as $tok) {
                $tok = $lemmas[$tok] ?? $tok;
                if (mb_strlen($tok, 'UTF-8') < 3 || isset($stop[$tok])) {
                    continue;
                }
                $counts[$tok] = ($counts[$tok] ?? 0) + 1;
            }
        }
        if (!$counts) {
            return null;
        }
        $this->sortCounts($counts);
        $out = [];
        foreach ($counts as $word => $n) {
            if ($n < 2) {
                break; // arsort is descending, so nothing past here clears the floor
            }
            $out[] = ['name' => (string) $word, 'value' => $n];
            if (count($out) >= $topN) {
                break;
            }
        }
        return $out ?: null;
    }

    /**
     * The transcript word cloud split by language: each text is assigned the
     * language whose function words it uses most ({@see detectTextLanguage()}),
     * and each language gets its own cloud, so a few German abstracts no longer
     * flood an English corpus with "und", "die" and "der". Returns the
     * `{languages, byLang}` shape the front-end renders with a language toggle,
     * languages ordered by how many texts they hold. Texts in no supported
     * language, or too short to tell, are left out; when no text can be told
     * at all, it falls back to the single mixed cloud.
     *
     * With $markAcademic, the words of scholarly prose ({@see academicWords()})
     * stay in each cloud flagged `generic`, for the viewer to show or hide, and
     * each cloud keeps that many more words so hiding them still leaves $topN.
     *
     * @param list<string> $texts
     * @return array{languages:list<string>,byLang:array<string,list<array{name:string,value:int,generic?:true}>>}|list<array{name:string,value:int}>|null
     */
    public function buildMultilingualWordCloud(array $texts, int $topN = 150, bool $markAcademic = false): ?array
    {
        $buckets = [];
        foreach ($texts as $text) {
            if (is_string($text) && ($lang = $this->detectTextLanguage($text)) !== null) {
                $buckets[$lang][] = $text;
            }
        }
        // Spanish is told apart only so it is not misfiled as Portuguese or
        // French; the toggle offers the four languages the corpora are in.
        unset($buckets['es']);
        if (!$buckets) {
            return $this->buildTranscriptWordCloud($texts, $topN);
        }
        $order = array_flip(['en', 'fr', 'de', 'pt']);
        uksort($buckets, static fn ($a, $b) => (count($buckets[$b]) <=> count($buckets[$a])) ?: ($order[$a] <=> $order[$b]));
        $byLang = [];
        foreach ($buckets as $lang => $bucket) {
            $generic = $markAcademic ? $this->academicWords($lang) : [];
            $cloud = $this->buildTranscriptWordCloud($bucket, $topN + count($generic), $lang);
            if (!$cloud) {
                continue;
            }
            foreach ($cloud as &$entry) {
                if (isset($generic[$entry['name']])) {
                    $entry['generic'] = true;
                }
            }
            unset($entry);
            $byLang[$lang] = $cloud;
        }
        return $byLang ? ['languages' => array_keys($byLang), 'byLang' => $byLang] : null;
    }

    /**
     * Words every abstract uses about itself — "this article", "the study",
     * "the author examines" — which top each language's cloud without saying
     * what the work is about. Forms as the tokeniser and the lemma map leave
     * them ("studies" is already "study").
     *
     * @return array<string,bool>
     */
    private function academicWords(string $lang): array
    {
        $words = [
            'en' => 'analysis approach argue argues article articles author authors based book case chapter '
                . 'chapters contribution discuss discusses examine examines explore explores focus findings '
                . 'paper papers research study',
            'fr' => 'analyse approche article articles auteur auteurs chapitre contribution examine '
                . 'ouvrage question recherche recherches étude',
            'de' => 'analyse artikel band beitrag beiträge beispiel buch forschung frage kapitel rahmen '
                . 'studie studien untersuchung',
            'pt' => 'análise artigo autor autores capítulo estudo forma livro obra partir pesquisa trabalho',
        ][$lang] ?? '';
        return $words === '' ? [] : array_fill_keys(explode(' ', $words), true);
    }

    /**
     * The language of a text, from the share of each language's commonest
     * function words among its tokens: 'en', 'fr', 'de', 'pt' or 'es', or null
     * when the text has too few of them or two languages run too close (a
     * Swahili abstract, a list of names). The marker sets are disjoint, so one
     * word never votes twice. On the live abstracts this agrees with every
     * value's own language tag.
     */
    private function detectTextLanguage(string $text): ?string
    {
        static $markers = null;
        if ($markers === null) {
            $markers = [];
            foreach ([
                'en' => 'the and of to in is that for with are this was from by which be were have',
                'fr' => 'le la les et du est une dans pour qui sur par au aux cette ces sont leur',
                'de' => 'der die das und von mit den sich auf ist ein eine im für dem nicht zu auch wird werden',
                'pt' => 'os do da dos das em uma com não na no ao pelo pela são foi seu sua',
                'es' => 'el los las del y una con por se al lo como más su sus fue entre',
            ] as $lang => $words) {
                foreach (explode(' ', $words) as $word) {
                    $markers[$word] = $lang;
                }
            }
        }
        $hits = [];
        foreach (preg_split('/[^\p{L}]+/u', mb_strtolower($text, 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) {
            if (isset($markers[$token])) {
                $hits[$markers[$token]] = ($hits[$markers[$token]] ?? 0) + 1;
            }
        }
        arsort($hits);
        $counts = array_values($hits);
        if (($counts[0] ?? 0) < 3 || ($counts[1] ?? 0) * 2 > $counts[0]) {
            return null;
        }
        return (string) array_key_first($hits);
    }

    /**
     * Predictable concept-level merges for the dependency-free PHP fallback.
     * This deliberately stays curated instead of pretending to be a general
     * stemmer: visible labels remain real words, and adding one high-frequency
     * variant cannot unexpectedly rewrite the rest of the vocabulary.
     *
     * @return array<string,string>
     */
    private function transcriptLemmaMap(): array
    {
        return [
            // English forms surfaced by the podcast/video transcript corpora.
            'communities' => 'community',
            'languages' => 'language',
            'knowledges' => 'knowledge',
            'projects' => 'project',
            'researchers' => 'researcher',
            'studied' => 'study',
            'studies' => 'study',
            'studying' => 'study',
            'worked' => 'work',
            'working' => 'work',
            'works' => 'work',

            // French forms kept equally explicit so labels stay readable.
            'communautés' => 'communauté',
            'connaissances' => 'connaissance',
            'chercheuses' => 'chercheur',
            'chercheurs' => 'chercheur',
            'études' => 'étude',
            'langues' => 'langue',
            'projets' => 'projet',
            'travailler' => 'travail',
            'travaille' => 'travail',
            'travaillent' => 'travail',
            'travaux' => 'travail',
        ];
    }

    /**
     * Function words of one language that are content words in another, so
     * they are stopped only in that language's cloud: German "war" (was) and
     * "man" (one), and "innen" from gendered plurals ("Forscher*innen").
     *
     * @return array<string,bool>
     */
    private function languageStopWords(?string $lang): array
    {
        return $lang === 'de' ? array_fill_keys(['innen', 'man', 'war'], true) : [];
    }

    /**
     * Stop-word / filler set for the transcript word cloud, keyed for O(1)
     * lookup. Aggressive by design (English, French, German and Portuguese
     * function words, spoken fillers, and podcast meta terms like
     * "welcome"/"speaker"); topical words
     * (africa, knowledge, …) are deliberately kept. Tune this list freely — it is
     * the single knob on what the cloud surfaces. All entries are lower-case to
     * match the tokeniser.
     *
     * @return array<string,bool>
     */
    private function transcriptStopWords(): array
    {
        $en = 'able about above across after again against all almost also although always among '
            . 'another any anybody anyone anything anyway are aren around because become been before '
            . 'began begin being below best better between both but came can cannot could couldn course '
            . 'did didn does doesn doing don done down during each either else enough especially even '
            . 'ever every everybody everyone everything few for from further gave get gets getting give '
            . 'given gives going gone got gotten had hadn has hasn have haven having her here hers herself '
            . 'him himself his how however indeed inside instead into isn its itself just keep kept kind '
            . 'knew know knowing known knows last later least less let lets like likely little look looking '
            . 'lot made make makes making many may maybe mean means meant might more most much must myself '
            . 'near need needs neither never new next nobody nor not nothing now off often okay once one '
            . 'ones only onto other others ought our ours ourselves out over own particular perhaps please '
            . 'put quite rather really right said same say saying says see seem seemed seems seen several '
            . 'shall she should shouldn since some somebody somehow someone something sometimes somewhat '
            . 'soon still stuff such sure take taken takes talk talked talking tell tells than thank thanks '
            . 'that the their theirs them themselves then there therefore these they thing things think '
            . 'thinking this those though thought through thus today together too took toward towards under '
            . 'until upon use used uses using usually very want wanted wants was wasn way ways well went '
            . 'were weren what whatever when where whereas whether which while who whoever whole whom whose '
            . 'why will with within without won would wouldn yeah yes yet you your yours yourself yourselves '
            . 'gonna wanna gotta lemme dunno yep nope hmm mhm uh huh okay actually basically literally '
            . 'obviously definitely probably certainly simply really pretty bit two three '
            . 'and sort guess lots';

        $meta = 'podcast podcasts episode episodes speaker speakers music applause laughter intro outro '
            . 'welcome cluster everybody everyone hello today session lecture lectures talk conversation conversations';

        $fr = 'alors après aussi autant autre autres avait avant avec avoir beaucoup bien car ceci cela '
            . 'celle celles celui cependant certains ces cet cette ceux chaque chez comme comment dans '
            . 'depuis derrière des deux devait devant doit donc dont elle elles encore entre était étaient '
            . 'étais étant été êtes être eux fait faire fais fait faites font ici ils jamais juste leur '
            . 'leurs lors lui mais mes moi moins mon naturellement notre nous nôtre par parce parfois '
            . 'pendant peu peut peuvent plupart plus plusieurs pour pourquoi pourtant quand que quel quelle '
            . 'quelles quelque quelques quels qui quoi sans sauf selon ses seulement sien sienne soit son '
            . 'sont sous souvent sur surtout tandis tant tellement tels tes toi ton tous tout toute toutes '
            . 'très trop une vers voici voilà vos votre vous ainsi fois '
            . 'est les des aux pas ont même déjà cette ces ils elles nous vous';

        // German and Portuguese function words, for the abstracts in those
        // languages. Words that are also English content words ("war", "man")
        // stay out: every language shares this list ({@see languageStopWords()}).
        $de = 'aber alle allem allen alles als andere anderen anderer auch auf aus bei beiden beim bis '
            . 'bzw dabei daher damit darauf dass daß dazu dem den denen der deren des dessen die dies diese diesem '
            . 'diesen dieser dieses doch dort drei durch ein eine einem einen einer eines etwa gegen '
            . 'für gibt hat haben hier ich ihr ihre ihrem ihren ihrer immer insbesondere ist jedoch kann können mit '
            . 'mehr neue neuen neuer nach nicht noch nur oder ohne sein seine seinen seiner seit sich sie '
            . 'sind sondern sowie sowohl über und uns unter vom von vor was welche welcher welches wenn werden '
            . 'wie wir wird wurde wurden zum zur zwei zwischen';

        $pt = 'além aos ainda até bem cada com como das depois disso dos ela elas ele eles entre essa esse esta '
            . 'este está estão foi isso mais mas muito não nas nos num numa onde para pela pelas pelo '
            . 'pelos podemos por qual quais quando sem ser seu seus sido sobre sua suas são também tem têm ter uma';

        return array_fill_keys(
            array_filter(preg_split('/\s+/', $en . ' ' . $meta . ' ' . $fr . ' ' . $de . ' ' . $pt) ?: []),
            true
        );
    }
}
