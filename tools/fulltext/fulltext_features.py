"""Features stage of the full-text map: word counts by year and the places each article writes about.

Called by `fulltext_map.py features`, after `export`, over the articles the
exported map shows (journal furniture, shared and very short texts are already
left out there). Needs only the standard library and the private harvest.

- **Words** (`--words-out`, `asset/data/fulltext/<collection>-words.json`): for
  every word that occurs in at least MIN_ARTICLES articles, its occurrences in
  each year, beside the year's total word count, so the page can chart a
  word's frequency per 10,000 words. Aggregates only, like HathiTrust's
  extracted features for works still in copyright: no article is identified,
  word order is gone, and a word too rare to stay anonymous is left out.
- **Places** (written into the map file as `places`): for each article, the
  countries it names at least MIN_MENTIONS times, once its own addresses and
  university affiliations are cut (by modern name, colonial
  name or nationality adjective, a few regions such as Buganda or Zanzibar
  included), keyed by the `ADMIN` name of `asset/data/geo/countries.geojson`.
  Africa and the African Americas only: European and North American names
  mostly come from publishers' addresses in the reviews.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from fulltext_map import corpus_furniture, load_items, paragraphs

MIN_ARTICLES = 10
MIN_MENTIONS = 3
WORD_RE = re.compile(r"[^\W\d_](?:[^\W\d_]|['’-](?=[^\W\d_]))+", re.UNICODE)

# country ADMIN name -> the names that point to it, matched case-sensitively as
# whole words. Ambiguous short forms are resolved in PLACE_OVERRIDES below.
COUNTRIES: dict[str, list[str]] = {
    "Algeria": ["Algeria", "Algerian", "Algérie"],
    "Angola": ["Angola", "Angolan"],
    "Benin": ["Benin", "Dahomey", "Dahomean", "Bénin"],
    "Botswana": ["Botswana", "Bechuanaland"],
    "Burkina Faso": ["Burkina Faso", "Upper Volta", "Haute-Volta", "Burkinabe"],
    "Burundi": ["Burundi", "Urundi", "Burundian"],
    "Cameroon": ["Cameroon", "Cameroun", "Cameroons", "Cameroonian", "Camerounais"],
    "Central African Republic": ["Central African Republic", "Ubangi-Shari", "Oubangui-Chari", "République centrafricaine"],
    "Chad": ["Chad", "Chadian", "Tchad"],
    "Democratic Republic of the Congo": ["Democratic Republic of the Congo", "Democratic Republic of Congo", "Belgian Congo",
                                         "Congo Free State", "Zaire", "Zaïre", "Zairean", "Congo belge", "Katanga", "Kinshasa",
                                         "Léopoldville", "Leopoldville"],
    "Djibouti": ["Djibouti"],
    "Egypt": ["Egypt", "Egyptian", "Égypte"],
    "Equatorial Guinea": ["Equatorial Guinea", "Fernando Po", "Bioko"],
    "Eritrea": ["Eritrea", "Eritrean"],
    "Ethiopia": ["Ethiopia", "Ethiopian", "Abyssinia", "Abyssinian", "Éthiopie"],
    "Gabon": ["Gabon", "Gabonese"],
    "Gambia": ["Gambia", "Gambian"],
    "Ghana": ["Ghana", "Ghanaian", "Gold Coast", "Ashanti", "Asante"],
    "Guinea": [],  # PLACE_OVERRIDES: "Guinea" is also part of three other names
    "Guinea-Bissau": ["Guinea-Bissau", "Guinea Bissau", "Portuguese Guinea"],
    "Ivory Coast": ["Ivory Coast", "Côte d'Ivoire", "Côte d’Ivoire", "Cote d'Ivoire", "Ivorian"],
    "Kenya": ["Kenya", "Kenyan"],
    "Lesotho": ["Lesotho", "Basutoland", "Basotho"],
    "Liberia": ["Liberia", "Liberian"],
    "Libya": ["Libya", "Libyan"],
    "Madagascar": ["Madagascar", "Malagasy"],
    "Malawi": ["Malawi", "Malawian", "Nyasaland"],
    "Mali": ["Mali", "Malian", "French Sudan", "Soudan français"],
    "Mauritania": ["Mauritania", "Mauritanian"],
    "Morocco": ["Morocco", "Moroccan", "Maroc"],
    "Mozambique": ["Mozambique", "Moçambique", "Mocambique", "Mozambican", "Portuguese East Africa"],
    "Namibia": ["Namibia", "Namibian", "South West Africa"],
    "Niger": ["Niger", "Nigerien"],  # PLACE_OVERRIDES: the Niger river
    "Nigeria": ["Nigeria", "Nigerian", "Yorubaland", "Lagos", "Ibadan"],
    "Republic of the Congo": ["Republic of the Congo", "Congo-Brazzaville", "Brazzaville", "French Congo", "Moyen-Congo"],
    "Rwanda": ["Rwanda", "Ruanda", "Rwandan"],
    "Senegal": ["Senegal", "Senegalese", "Sénégal"],
    "Sierra Leone": ["Sierra Leone", "Sierra Leonean"],
    "Somalia": ["Somalia", "Somali"],
    "South Africa": ["South Africa", "South African", "Transvaal", "Natal", "Zululand", "Orange Free State", "Afrique du Sud",
                     "Johannesburg", "Cape Town", "Soweto", "Durban", "Pretoria"],
    "South Sudan": ["South Sudan", "South Sudanese"],
    "Sudan": [],  # PLACE_OVERRIDES: not "South Sudan"
    "Togo": ["Togo", "Togolese", "Togoland"],
    "Tunisia": ["Tunisia", "Tunisian"],
    "Uganda": ["Uganda", "Ugandan", "Buganda", "Baganda", "Kampala", "Busoga", "Ankole"],
    "United Republic of Tanzania": ["Tanzania", "Tanzanian", "Tanganyika", "Zanzibar", "Dar es Salaam"],
    "Western Sahara": ["Western Sahara", "Saharawi", "Sahrawi"],
    "Zambia": ["Zambia", "Zambian", "Northern Rhodesia", "Barotseland", "Copperbelt", "Lusaka"],
    "Zimbabwe": ["Zimbabwe", "Zimbabwean", "Southern Rhodesia", "Harare", "Salisbury", "Bulawayo"],
    "eSwatini": ["Eswatini", "eSwatini", "Swaziland", "Swazi"],
    # The African Americas
    "Brazil": ["Brazil", "Brazilian", "Brasil", "Bahia"],
    "Cuba": ["Cuba", "Cuban", "Havana"],
    "Haiti": ["Haiti", "Haitian"],
    "Jamaica": ["Jamaica", "Jamaican"],
    "Trinidad and Tobago": ["Trinidad", "Trinidadian", "Tobago"],
    "Colombia": ["Colombia", "Colombian"],
    "Ecuador": ["Ecuador", "Ecuadorian", "Esmeraldas"],
    "Venezuela": ["Venezuela", "Venezuelan"],
}
# Names that need a look around them: (country, pattern).
PLACE_OVERRIDES: list[tuple[str, str]] = [
    # A bare "Congo" is the Belgian Congo / DRC in this journal far more often than Brazzaville.
    ("Democratic Republic of the Congo", r"(?<!Republic of the )(?<!Republic of )(?<!French )(?<!Moyen-)\bCongo\b(?!-Brazzaville)"),
    ("Democratic Republic of the Congo", r"\bCongolese\b"),
    ("Guinea", r"(?<!Equatorial )(?<!New )(?<!Portuguese )\bGuinea\b(?![- ]Bissau)"),
    ("Sudan", r"(?<!South )(?<!French )(?<!Western )\bSudan\b"),
    ("Sudan", r"(?<!South )\bSudanese\b"),
    ("Rwanda", r"\bRuanda-Urundi\b"),
    ("Burundi", r"\bRuanda-Urundi\b"),
    # "Rhodesia" alone is Southern Rhodesia (Zimbabwe) after 1964 and in most of the journal's usage.
    ("Zimbabwe", r"(?<!Northern )\bRhodesia\b"),
]


def _patterns() -> list[tuple[str, re.Pattern[str]]]:
    out = []
    for country, names in COUNTRIES.items():
        if names:
            alternation = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
            out.append((country, re.compile(rf"(?<![\w-])(?:{alternation})(?![\w-])")))
    for country, pattern in PLACE_OVERRIDES:
        out.append((country, re.compile(pattern)))
    return out


PATTERNS = _patterns()
# The journal's own addresses (ILAM at Roodepoort, then Rhodes University in
# Grahamstown) and contributors' affiliations name South Africa in articles
# about anywhere else: they are cut before counting.
ADDRESS_RE = re.compile(
    r"(?:International Library of African Music|\bILAM\b|Rhodes University|University of the Witwatersrand|"
    r"University of (?:Cape Town|Natal|KwaZulu-Natal|Pretoria|South Africa|Fort Hare|Venda|Zululand))[^.\n]{0,80}")
# The Niger river, not the country.
NIGER_RIVER = re.compile(r"\b(?:river|River) Niger\b|\bNiger (?:river|River|delta|Delta|bend|Bend)\b")


def places_in(text: str) -> dict[str, int]:
    """Country -> mentions in one text, for countries named at least MIN_MENTIONS times."""
    text = ADDRESS_RE.sub(" ", text)
    counts: Counter[str] = Counter()
    # "Republic of the Congo" must not count for both Congos, nor "South Sudan" for Sudan:
    # the overrides' lookbehinds handle that; overlapping literal names are matched once.
    for country, pattern in PATTERNS:
        counts[country] += len(pattern.findall(text))
    counts["Niger"] -= len(NIGER_RIVER.findall(text))
    return {country: n for country, n in counts.items() if n >= MIN_MENTIONS}


def features(work_dir: Path, map_path: Path, words_path: Path) -> int:
    payload = json.loads(map_path.read_text(encoding="utf-8"))
    shown = {row[0] for row in payload["items"]}
    items = load_items(work_dir)
    furniture = corpus_furniture(items)

    totals: Counter[int] = Counter()
    by_word: dict[str, Counter[int]] = {}
    articles: Counter[str] = Counter()
    places: dict[str, list[list]] = {}
    for item in items:
        if item["id"] not in shown:
            continue
        year = int(item["date"][:4]) if re.match(r"\d{4}", item.get("date") or "") else None
        text = "\n\n".join(paragraphs(item["text"], furniture))
        found = places_in(text)
        if found:
            places[str(item["id"])] = [[country, n] for country, n in sorted(found.items(), key=lambda kv: (-kv[1], kv[0]))]
        if year is None:
            continue
        words = [w.lower().replace("’", "'") for w in WORD_RE.findall(text)]
        totals[year] += len(words)
        counts = Counter(words)
        for word, n in counts.items():
            by_word.setdefault(word, Counter())[year] += n
        articles.update(counts.keys())

    years = sorted(totals)
    index = {year: k for k, year in enumerate(years)}
    kept = sorted(word for word, n in articles.items() if n >= MIN_ARTICLES and len(word) >= 2)
    words = {
        "schemaVersion": 1,
        "itemSetId": payload["itemSetId"],
        "generatedAt": payload["generatedAt"],
        "minArticles": MIN_ARTICLES,
        "articles": len(shown),
        "years": years,
        "totals": [totals[year] for year in years],
        # word -> flat [yearIndex, count, yearIndex, count, ...] for the years it occurs in
        "words": {word: [v for year, n in sorted(by_word[word].items()) for v in (index[year], n)] for word in kept},
    }
    words_path.parent.mkdir(parents=True, exist_ok=True)
    words_path.write_text(json.dumps(words, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")

    payload["places"] = {"minMentions": MIN_MENTIONS, "items": places}
    map_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")

    by_country = Counter(country for rows in places.values() for country, _ in rows)
    print(f"{len(kept)} words in at least {MIN_ARTICLES} articles over {len(years)} years ({years[0]}-{years[-1]}), "
          f"{words_path.stat().st_size // 1024} KiB")
    print(f"{len(places)} of {len(shown)} articles name a country at least {MIN_MENTIONS} times")
    for country, n in by_country.most_common(25):
        print(f"  {n:>4}  {country}")
    return 0
