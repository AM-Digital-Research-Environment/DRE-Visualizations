# Changelog

All notable changes to DRE Visualizations are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the module uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), as DRE-theme and
DRE Search do.

Add entries under **[Unreleased]** as you work. A release moves them into a
dated `## [x.y.z] - YYYY-MM-DD` section; `scripts/check-release-metadata.mjs`
requires that section for the version in `config/module.ini`, and the release
workflow publishes it as the notes of the GitHub release
(`scripts/changelog-section.mjs`).

## [Unreleased]

## [2.42.1] - 2026-10-26

### Changed

- MapLibre GL JS 6.16.0 (was 6.13.0), re-vendored with `npm run vendor:maplibre`.
- Development dependencies updated: Playwright 1.64.1, axe-core/playwright 4.14.0, ESLint 10.13.0.

## [2.42.0] - 2026-10-21

### Added

- The maintenance page (**DRE Visualizations** in the admin menu) has a *Semantic map* section: the state of the installed build, and **Rebuild the semantic embeddings**, which starts a build on GitHub with the token saved in the module configuration. Without a token it links to the configuration and to the workflow on GitHub.

### Changed

- The GitHub token field shows *Saved (hidden)* once a token is saved, so a saved token no longer looks lost when the page reopens with the field empty.
- When GitHub refuses to start a build (403), the message now says the organisation may still have to approve the token, as well as naming the *Actions: Read and write* permission. A fine-grained token that is still pending reads public data but cannot start a build.

## [2.41.0] - 2026-10-17

### Changed

- Making a record private no longer takes the semantic map, the "by similarity" panels and the similar items offline until the next build. The site keeps the installed build, without the records hidden since and without anything that left the public corpus. Positions and neighbours of the remaining records still come from that build until a new one arrives. Each withdrawal now records what it hid (`revisions.json` in the snapshot store); a withdrawal that cannot say (a manual one, a canonical-site change, a write whose earlier state was unknown) still hides the map until a build for the current data arrives.
- With a GitHub token saved, the refresh that follows such a write asks GitHub for a new build straight away (once per revision) instead of waiting for the nightly check. Without a token, the job log says the nightly check will build it.
- The maintenance page and the module configuration say when the map is being served from an earlier build.

## [2.40.0] - 2026-10-16

**Upgrading:** to use the new button, create a fine-grained GitHub token for the `AM-Digital-Research-Environment/DRE-Visualizations` repository only, with *Actions: Read and write*, and paste it into the module configuration.

### Added

- The module configuration has a *Semantic embeddings* panel. It checks the connection to GitHub each time it opens, shows the last build on GitHub and the build this site downloaded, and says when a token has expired or the server cannot reach GitHub.
- **Save and rebuild the semantic embeddings** starts the embeddings workflow on GitHub (scope `missing`) with the saved token, so edits reach the semantic map without waiting for the nightly check. The token is never shown again; leave the field blank to keep it, or tick *Forget the saved GitHub token*.

## [2.39.1] - 2026-10-16

### Fixed

- Regenerating printed "Using null as the key parameter for array_key_exists() is deprecated" from `laminas-uri`. The semantic-input download reset Omeka's shared HTTP client, which re-applied its empty URI; it now starts from a fresh request.

## [2.39.0] - 2026-10-16

**Upgrading:** the server must reach `api.github.com` and GitHub release downloads. Install this release, then **Regenerate now**, and check the new *Semantic map* line on the maintenance page.

### Changed

- The semantic map, the "by similarity" panels and the similar items no longer ship in the module. The embeddings workflow publishes each build as a `semantic-inputs-<n>` GitHub release, and the module downloads the newest one made for its current revision before each regeneration. A new build reaches the site without a pull request, a module release or a deploy.
- The embeddings workflow runs every night and builds only when the site changed since the last build: a new revision (a record made private, publication withdrawn), a new published snapshot, or another profile. After a build it pings the site (`POST /s/<site>/dre-data/embeddings-refresh`), which installs the build and refreshes in the background. Until now a record made private hid the semantic map until someone rebuilt the inputs, merged them and released the module.
- The workflow no longer pushes an `automation/embeddings-*` branch, and `data/embeddings/` is no longer committed.

### Added

- The maintenance page says which semantic build is installed, whether it fits the current data, and when a look at GitHub last failed.

## [2.38.2] - 2026-10-16

**Upgrading:** install this release, then **Regenerate now**.

### Fixed

- The semantic map, the "by similarity" panels and the similar items were missing ("This map is not available yet"). An edit had made a record private, which changes the publication revision, and the semantic inputs shipped with 2.38.1 were built for the previous one, so regeneration rightly ignored them. This release carries a build made for the current revision (4,644 public records).

## [2.38.1] - 2026-10-15

### Fixed

- The Visualisations block broke on item pages (2.38.0, live on project 1797): "dashboard-core.js must load before graph-canvas.js", then `ns.t is not a function` and `ns.mountWhenVisible is not a function`, and no chart drew. An item-page block asked for its scripts before `Module::addAssets` added the shared prelude, because DRE-theme renders the blocks before it triggers `view.show.before`. The deferred scripts therefore ran ahead of the namespace they extend. A block now emits the prelude (`RV_LIBS` and `dashboard-core.js`) itself when it is not there yet, whatever the theme's order; the listener's later copy is dropped as a duplicate.

## [2.38.0] - 2026-10-15

**Upgrading:** install this release, then **Regenerate now**. The upgrade adds the Visualisations block to the item pages of every site that saved its resource pages without it; regeneration then writes the project collections and drops the dashboards of item sets that belong to a project.

### Added

- The **Visualisations** block places itself on item pages. Sites that never saved their resource pages get it as a module default; installing the module and upgrading to 2.38.0 add it to every saved item-page configuration that lacks it, right after the blocks that show the record (before *Linked resources* when there are none), without removing or reordering anything. The maintenance page shows, per site, whether item pages carry the block, and **Add the Visualisations block to item pages** repeats the repair for the sites you may edit. Until now no item page on amira showed a dashboard, because its saved configuration predated the block.
- A research project's dashboard opens with what it covers: its number of records, its collections ("Collection: *title* (*n* records)") and, when the site has a Project explorer page, a link to the project there.
- The precompute finds each research project's collections: the item sets whose `dcterms:isPartOf` links the project item or, for a project with no such link, the item set that shares its `dre:id`. The project's dashboard and its `projects-index.json` entry carry them as `collections: [{id, title, items}]`.

### Changed

- Item sets that belong to a research project no longer get an item-set dashboard: their pages redirect to the project item, whose Visualisations block shows the project dashboard. Every other item set keeps its dashboard.

## [2.37.2] - 2026-10-15

### Fixed

- Map popups close with Escape: the hover popups on the maps, which had no close button, and the pinned ones. Inside a fullscreen chart, the first Escape closes the popup and the next leaves fullscreen; focus inside a closing popup goes back to the map.
- Map markers open their popup with Enter or Space (partner institutions, affiliations, item locations). Giving a marker its popup before adding it to the map dropped MapLibre's key listener, so the popup opened only on a click.
- The partner-institution markers on the collection overview are now buttons named after the institution and its category, not unnamed tab stops.
- Each dashboard map is named after its chart ("Map: …"), so two maps on one page no longer share the name "Map".
- The map legend caption ("Items per country") is no longer faded below the contrast minimum in the light theme.
- The word cloud's "Number of words" slider wraps on narrow screens instead of running past the edge.

### Changed

- `npm run check:a11y` fails when a file builds a MapLibre popup directly or sets a marker's popup before adding the marker to the map.

## [2.37.1] - 2026-10-13

### Changed

- Plainer wording around the semantic map and the similarity panels: the Semantic Map's introduction, panel title, record count and notes, the three *by similarity* descriptions and the Similar Items introduction now say in short, everyday sentences what a dot is, what closeness means and how to zoom.

## [2.37.0] - 2026-10-13

**Upgrading:** install this release, then **Regenerate now**. The Podcasts and YouTube dashboards then show their similarity panels.

### Added

- **Episodes by similarity** on the Podcasts dashboard, coloured by series, and **Videos by similarity** on the YouTube dashboard, coloured by playlist (videos in none are grouped as "Not in a playlist"). Both use the corpus's own layout from the embeddings build, like *Publications by similarity*.
- **Zoom buttons** on the Semantic Map block and every similarity panel: zoom in, zoom out and show everything again, in the chart's toolbar. Ctrl + scroll and dragging still work, and the panel descriptions now say so.

### Changed

- A similarity panel keeps its eight largest groups in their own colours and folds the rest into "Other", so its legend stays short. *Publications by similarity* now shows its eight commonest publication types.

### Fixed

- The regeneration job's log can be read while the job runs. Omeka saves a job's log only when the job saves its record, which this job never did mid-run, so the job page showed "[No log]" until the end; the job now writes its log every few seconds. The confirmation after **Regenerate now** links straight to that log.

## [2.36.0] - 2026-10-13

**Upgrading:** install this release, then **Regenerate now**. The Publications dashboard then shows *Publications by similarity*.

### Added

- **Publications by similarity** on the Publications dashboard: each publication is a dot placed by what it is about, so publications whose titles, abstracts and keywords are close in meaning sit together, whatever their language. Colour shows the publication type, faint dots are publications too lightly described to place reliably, and a click opens the publication. The data table lists the publications by type. The panel appears once a semantic build matches the site.
- The embeddings build lays out publications, podcasts and YouTube videos each from their own vectors (`corpusLayouts` in `map.json`). In the shared map a corpus fills a small patch; its own layout spreads it over the panel.

## [2.35.1] - 2026-10-13

**Upgrading:** install this release, then **Regenerate now**. It is the first archive that carries the semantic inputs, so the Semantic Map and Similar Items have data after regeneration.

### Added

- The first EmbeddingGemma 2 semantic inputs (`data/embeddings/`): 4,637 public records, 3,212 of them with recommendations. Their full vectors are the `semantic-embeddings-v1-3` release. 2.35.0 was cut before this build, so its archive had none.

### Fixed

- The Build semantic embeddings and Build word clouds workflows no longer fail when the organisation forbids GitHub Actions to open pull requests. They push the bot branch and link to it in the job summary, and the vector release is published before that step.

## [2.35.0] - 2026-10-13

**Upgrading:** the semantic corpora in the installation profile changed, so semantic inputs built against an earlier profile no longer match it. After deploying, run **Actions → Build semantic embeddings** with scope `all`, merge its pull request, deploy, then **Regenerate now**. Until then the Semantic Map shows its unavailable state and Similar Items stays hidden. The `GEMINI_API_KEY` secret is no longer used.

### Changed

- **The semantic map and Similar Items are built with EmbeddingGemma 2**, Google's open-weights embedding model, pinned to one revision and run on the GitHub runner, instead of the paid `gemini-embedding-2` API. The build needs no API key or secret, and the Omeka server still only reads the precomputed map and recommendations. The vector release records the model revision and inference dtype, which consumers check along with the model.
- Semantic cards read a record's abstract or description, never its full text or transcript. A podcast, video or publication without an abstract is described by its title and metadata alone.
- A record is low-signal (kept on the map, left out of recommendations) when its own title, abstract or description, subjects and places come to fewer than 100 characters. The project and research-section lines it inherits no longer count, so a research item with only a shelf mark and its collection's context no longer recommends its siblings. Identical cards are embedded once, and a recommendation list never shows a record identical to the one on the page.
- Authority records (people, institutions, subjects, places, vocabularies) are never embedded; the profile validators reject a semantic corpus that selects them.

## [2.34.0] - 2026-10-12

### Added

- **The Publications map shows countries as well as cities.** Countries are shaded by the number of publications that appeared there: an article counts for the country its journal comes from (the Journal record's country of origin), a book or chapter for the country of its place of publication. The place-of-publication bubbles sit on top. Click a country to list its publications. On the live data that places 516 of the 555 publications in 36 countries; most of the rest are talks without proceedings. A new stat card counts the countries.
- **Journals, Book series and Publishers charts** on the Publications dashboard, ranked by the records the publications sync links: the Journal an article appeared in, the series a monograph, book or chapter belongs to (`dcterms:isPartOf` or `dre:series`), and the publisher Organisation. Bars click through to the record's page.
- Publisher and corporate-author pages: an organisation's dashboard now covers the publications it published (`dcterms:publisher`) or is credited on as an author or editor, alongside what it funds and holds.
- **Bar charts page through long lists.** A ranked list longer than twenty bars gets a pager under the chart (first, previous, "21–40 of 195", next, last), on every dashboard and block. Every page keeps the first page's value axis, so bar lengths compare across pages. The CSV download and the data table carry the whole list, not only the page on screen. The archive-wide lists are now complete — all 195 journals, 417 authors and 78 publishers on the Publications dashboard, and every member of a category overview (they were cut to the top 20) — and a page's contributors, co-authors and co-subjects keep 100 instead of 20 or 30.
- **Journal and book series pages get their own dashboard.** A Journal or Series record now shows the cluster publications that link to it — articles to their journal, monographs, books and chapters to their series (`dcterms:isPartOf` or `dre:series`) — by year and type, with their languages, most published authors, keywords and, from five publications on, the collaboration network of their authors and editors (new `venue` layout). On the live data that is 267 dashboards: 195 journals and 72 series. They show through the item page's *Visualisations* block, which Journal and Series records share with every other item.
- **Location pages show what was published there.** A new *Published here* panel counts, by year and type, the publications whose place of publication is the city, or for a country also the publications of its cities and the articles of the journals that come from it. It sits apart from the research-item charts, which keep counting only what comes from or is held at the place. A place reached only by publications gets a page with this panel alone. On the live data 98 places get the panel, led by Germany (178 publications), the United Kingdom (150) and Bayreuth (51).

### Changed

- The stat cards count journals and book series, and publishers, through their linked records. They counted only the text values the sync had not yet reconciled, so the more the reconciliation linked, the lower the numbers went: the Publishers card disappeared once every publisher was linked, and Venues counted 110 leftover titles.
- The *Journals and book series* chart (`topVenues`) is replaced by the Journals and Book series charts. It ranked the unreconciled text containers only, which by now are mostly edited volumes and conference names.
- Publication authors and editors count as contributors and roles wherever a dashboard covers publications (a subject, language or funder page, a person's roles), as `marcrel:aut` already did for research items. A publication's author is an "author" in the roles chart, not "list of authors".
- In a knowledge graph, `dcterms:isPartOf` is typed by what it links to: a journal, series or edited book is a *Publication venue*, a person's institution an *Institution*, a city's country a *Location*; only a project is a *Project*. A publisher is an *Institution*, and two works in one book series are related like two articles in one journal.

### Fixed

- **Places of publication were treated as people.** Every builder matched contributor roles on the `marcrel:` prefix, so `marcrel:pup` (place of publication) counted London, Bayreuth and Lagos as contributors on funder, subject and language pages, added a "Publication place" role, and drew them as *Person* nodes in the entity network (Discursive Communities). One rule (`Roles`) now decides which properties credit an agent, and leaves the place roles out.
- In the entity network, an organisation credited in a role (a sponsor, a corporate author) or holding an item is drawn as an *Organisation*, not a *Person* or a *Location*.
- Journal records carry their country of origin in `dcterms:spatial`. Spatial Exploration and Location pages no longer read it as a place a research item comes from, which would have added 70 journal records to the United Kingdom.
- The Sankey (contributor → project → type) followed any `dcterms:isPartOf`, so a publication's journal would have been drawn as its project.

**Upgrade:** run **Regenerate now** after deploying; most of the changes are in the precomputed data. The artifact schema is unchanged, so the published snapshot keeps being served until then, without the new charts. The Journal, Series and place dashboards show through the item page's *Visualisations* block (Admin → Sites → [site] → Theme → Configure resource pages → Item page), so check it is placed there.

## [2.33.0] - 2026-10-12

### Added

- **Every visualization can go fullscreen, with its controls.** A dashboard chart gets a *Fullscreen* button, last in its toolbar; the panel fills the screen with its description, word-count slider and languages, legend and data table. The single-view blocks (Spatial Exploration, Semantic Map, Network Explorer, Compare, Project Explorer, What's New) get one beside *Embed this* that expands the whole block, so the picker, tabs, selectors and search come along. The item page's location map has one too. The knowledge graph and the entity network keep the button they had.
- In fullscreen a map zooms on a plain scroll, and a word cloud scales its type to the larger stage. Escape leaves the innermost surface first (a chart opened inside the expanded Project Explorer, then the explorer). The page keeps the expanded surface's place, so leaving returns the reader to the same spot.

### Changed

- A map's fullscreen moved from a button on the map to its chart toolbar, like every other chart's.

### Fixed

- **The Network Explorer opens with the whole network in view.** Its People and projects, People and institutions, and Institutions tabs used ECharts' force layout, which spreads nodes out in pixels from the centre and never fits them to the frame: on the collection-wide data (157, 200 and 80 nodes) the graph opened zoomed in, with most of it off the panel. These networks are now laid out with d3-force before they are drawn, in the panel's proportions, and ECharts fits the result to the panel, on resize and in fullscreen too. On a phone the circles are drawn smaller so the network still fits without overlapping. The same builders draw the contributor, affiliation and collaboration networks on project and institution pages, which get the same fit. Without d3 they fall back to the old layout.
- In those networks a circle's area now follows its count against the largest in the network. The old fixed scale (2.5 px per item, capped at 35 px) put nearly everyone in a collection-wide network at the cap, so the size said nothing.
- **What's New period buttons are readable.** "Last 3 months", "Last 6 months" and "Last 12 months" used the square icon-button style, which squeezed each label into a 36 px box with the text spilling over its neighbours. They are now the same text pills as the Compare and Network Explorer switchers, grouped under a "Period" label, and the selected period is announced (`aria-pressed`).
- **The copy-embed-code button sits with the other chart actions again.** On a chart drawn as it scrolled into view (every chart after the fourth), the embed button made a toolbar of its own before the chart's arrived, and the two split the heading row, leaving the embed button stranded mid-panel. A chart panel now has one toolbar, and each button takes a fixed place in it: export buttons, then embed, then fullscreen.

**Upgrade:** no regeneration needed; the changes are all in the front end.

## [2.32.1] - 2026-10-11

### Fixed

- **The Publications collaboration network shows the collaborations again.** It kept the 60 top-ranked people and only the ties between two of them. The people who link the most prolific authors ranked lower and were cut, so on the live bibliography the chart showed 111 of nearly 2,000 ties, with several people standing alone. It now ranks people by PageRank over the whole network and grows outwards from the top-ranked person, adding the best-ranked collaborator of someone already shown, up to 120 people. On the live data that is 120 people and 564 ties in one connected network, with no one shown alone. Smaller groups that never co-publish with the main network are no longer shown.
- Its colour groups are computed over the people shown, with multi-level Louvain (local moving, then each group collapsed and moved again). The old one-pass grouping over the whole network split the 60 people shown into 25 groups; the live data now gives 10.
- A linked author or editor counts only when it is a Person record. ERef credits the Institute of African Studies as an author on 12 publications, and it appeared as a well-connected "person".
- The chart description now says how people are chosen, sized and coloured.

**Upgrade:** run **Regenerate now** after deploying; the change is in the precomputed data.

## [2.32.0] - 2026-10-11

### Changed

- **Editing or deleting an item no longer takes the visualisations offline.** An Omeka write marks the published snapshot stale and keeps serving it. When the request or job ends, one background regeneration is queued; it waits until edits have been quiet for five minutes, then publishes, and repeats if edits arrived meanwhile. An import or batch edit costs one run, not one per record. The maintenance page shows whether the published data is current or stale.
- Publication is still withdrawn at once when a write makes something private (an item, medium or item set made private, or a public value made private), because a stale snapshot could still show it. The automatic refresh republishes it after one quiet minute. **Withdraw published data** and canonical-site changes still wait for **Regenerate now**.
- Ordinary edits keep the source revision, so scoped word-cloud and semantic inputs stay valid across them. Only a withdrawal invalidates them.
- A regeneration waits up to 30 seconds for an in-flight write instead of failing, and discards its run only if a write lands before the corpus is fully read. **Regenerate now** retries up to three times when that happens.

**Upgrade:** no regeneration needed. The automatic refresh needs Omeka's default PHP-CLI job strategy and starts only after a snapshot has been published once.

## [2.31.2] - 2026-10-08

The first packaged release of the 2.31 line. Neither 2.31.0 nor 2.31.1 was packaged: each release run stopped at a gate. So read 2.31.0 (the shared interaction contract with DRE-theme and DRE Search) and 2.31.1 below as part of this release.

### Fixed

- Ships 2.31.1, which was tagged but never packaged. Its `module.ini` spelled the version line `version     = "2.31.1"`, and the release step looks for exactly `version = "…"`. `npm run check:release` now enforces that spelling, so the mismatch fails locally. There is no runtime change from 2.31.1.

## [2.31.1] - 2026-10-08

### Fixed

- The semantic map's record list gives every link at least a 24px target (WCAG 2.2). Padding plus line height reached it with Windows font metrics but not with the fallback font on Linux, where CI's axe run failed `target-size`.

## [2.31.0] - 2026-10-08

Brings the module onto the shared interaction contract in DRE-theme's
`docs/DESIGN-INTEGRATION.md`, so DRE-theme, DRE Search and DRE Visualizations behave as one product.

**Requires Omeka S 4.2.1 or later** (`^4.2.1`; was `^4.0.0`), the only core the CI and golden suites run against.

### Added

- A **Data table** disclosure under every chart, built from the same rows as the CSV download. The semantic map instead lists its records by type, each linking to the record.
- One loading, empty, error and unavailable pattern for every block (`partials/async-surface.phtml`, `core/async.js`). Each block has a persistent live region, `aria-busy` only while work is under way, a no-JavaScript message ("This visualisation needs JavaScript.") and a **Try again** button that reruns the failed request in place.
- One fullscreen control for the knowledge graph, the entity network and every map. It sets `aria-pressed`, switches its label between "Fullscreen" and "Exit fullscreen", sits at `--z-stage` and closes with Escape. It replaces MapLibre's own control and the knowledge graph's ⛶ glyph.
- The self-hosted basemap is served as a style URL (`/s/{site}/dre-basemap/{light|dark}`). `window.RV_MAP_CONFIG` names it when no basemap is configured, so a DRE Search map on the same page draws the same basemap. It never carries an empty style string.
- A translation catalogue, `language/template.pot`, covering the PHP strings and the browser strings.

### Changed

- Colours, fonts and the light/dark mode come from DRE-theme's `window.DRETokens` when it is present. The module keeps one theme subscription. Every fallback colour is the theme's generated value for its mode, and the retired teal and cold greys are gone.
- Focus rings stay visible in forced-colours (high-contrast) mode, MapLibre's controls included. Fields use `--field-border` and `--radius-md`. Toolbar controls share one height from the theme's control scale. Icon and text buttons use the theme's secondary-button style, and chips are pills with weight-600 labels.
- The dark fallback follows an explicit `data-theme="dark"` even when the OS is light. Breakpoints, reading widths and letter-spacing use the theme's tokens.
- Map controls (zoom, fullscreen, attribution, globe and the gesture hints) are translated, and every map uses the same zoom-only navigation control.
- Wording follows the shared glossary: "Loading…", "Try again", "Clear all filters", "No records match that search.", "The map could not be loaded.", "The visualisation could not be loaded.", "Download data (CSV)", "Copied" (for two seconds, announced) and "View as".
- Numbers are formatted in the page's language in the browser (not the browser's own locale) and with `NumberFormatter` on the server. The featured-collection counts are translated.
- Printing hides every module control, map controls included. The active tab still prints as text.
- The entity network and spatial exploration titles are `h2`, like every other block title.

### Fixed

- The Network Explorer and What's New blocks no longer import MapLibre from an inline `<script type="module">` in the head. Neither draws a map, so this cost about 1 MB per page for nothing. In Firefox it also disabled every import map after it, including Mirador's, so a viewer on the same page stayed blank. MapLibre's URLs are now published for `ns.ensureLibs`, which loads ES modules at run time. A unit test (`tests/js/import-maps.test.mjs`) keeps module scripts and `modulepreload` out of the head.

### Development

- The browser suite runs on `@playwright/test` with axe in light and dark, forced-colours focus checks, a 320px overflow check and fullscreen and map-locale tests (`npm run test:browser`).
- `npm run check` also runs ESLint, `npm audit --audit-level=high` and the translation-catalogue check.
- CI verifies the SHA-256 of the Omeka S and PHPStan downloads, and every job has a timeout.
- `CHANGELOG.md` uses Keep a Changelog, and the release notes come from it. `.editorconfig` is added, Dependabot runs weekly with a cooldown, and `engines.node` is `>=24`.

**Upgrade:** no regeneration is needed. The artifact schema is unchanged and the published snapshot keeps being served.

## [2.30.0] - 2026-10-07

Implements the review of 2.29.1; [docs/ROADMAP.md](docs/ROADMAP.md) tracks every item.

**Requires PHP 8.4 or later** (was 8.2).

### Fixed

- Clicking a cluster on the dashboard map zooms in again (MapLibre returns a Promise; the callback form was ignored).
- Map labels (cluster counts, place names, photo-map clusters) name the shipped Noto Sans glyphs; layers without `text-font` asked for a font the glyph endpoint does not serve.
- The publications abstract word cloud reads `bibo:abstract`, where publications keep their abstracts; asking the loader for a property it does not load now fails loudly.
- Entity-network PNG export keeps the drawing buffer (`canvasContextAttributes`).
- Network graphs keep two people (or projects, institutions) who share a title as two nodes, and count a person once per item however many roles they hold.
- Item links, popups, the embed snippet and the comparison statistics escape every value they insert; chart clicks follow the clicked datum rather than the first one with the same name, and the word cloud follows the current language.
- An unknown single-chart embed (`/dre-embed/<block>/<chart>`) returns 404.
- Faint, lightly described points on the semantic map stay faint at collection scale.
- Cover and photo URLs resolve through Omeka's file store, so S3 and other stores work.
- A browser without WebGL 2 shows a notice instead of a broken map (MapLibre now throws).
- A missing or unwritable private store hides the blocks instead of failing item pages, and no longer blocks Omeka edits when nothing was ever published; a failed edit can no longer leave regeneration blocked.

### Changed

- **Upgrades keep serving the published snapshot** unless the artifact schema changes (`SnapshotPublisher::SCHEMA_VERSION`; unchanged in this release). Withdrawal on upgrade is limited to upgrades from before 2.29.0.
- Snapshot reads share their lock and stream from disk, so concurrent page views no longer queue behind each other.
- MapLibre GL JS 6.13.0 (self-contained build; fixes for globe view, `setData` memory growth, attribution sanitising, right-to-left labels). First map load is about 150 KB (gzip) larger.
- Front end: theme colours are cached; entity-network selection uses feature-state; artifacts download once per page; only the libraries of the charts actually drawn load; panels below the fold build on approach; charts resize with their container; a light/dark switch recolours every chart; reduced motion turns chart animation off.
- Accessibility: charts are named images; the chart toolbar (image, CSV, patterns) appears on every chart surface; Network Explorer tabs and the photo dialogs manage focus; the sparkline heading is a link.
- Every interface string is translatable and plural-aware (`config/client-strings.json`, generated by the build). The copy-edited wording from 2.27.0 now shows everywhere; a stale server-side list had been overriding part of it.
- Uninstall removes generated data from private storage; the force-layout cache is pruned.
- `Module.php` is split into listeners, services and form classes; withdrawal from the maintenance page has its own action.

### Development

- Golden-output test of the whole precompute (899 artifacts), seeded property tests, a tooltip-formatter XSS sweep on hostile data, PHPStan level 5, and failure on any PHP warning in the harnesses.
- `npm run test:php` and `npm run phpstan` run the PHP gates in Docker.
- CI tests PHP 8.4 and 8.5 with every integration suite; releases run the full CI workflow and check the built archive. Node is pinned; bot PRs get CI; Dependabot watches actions, npm and pip.

**Upgrade:** install, then **Regenerate now** to pick up the abstract word cloud, the contributor-count and homonym fixes. The published snapshot keeps being served until then.

## [2.29.1] - 2026-10-07

### Fixed

- Upgrading to 2.29.0 stopped at `Class "DreVisualizations\Precompute\SnapshotStore" not found` and left the module in `needs_upgrade`, which hides every visualization. Omeka runs `upgrade()`, and `uninstall()` on a deactivated module, without loading the module, so none of its classes autoloaded. Both hooks now register the module autoloader themselves.
- Add an Omeka-core regression that runs both hooks as Omeka does: no module autoloader, no merged module configuration.
- Document creating the private storage directory, owned by the runtime user, before a Docker volume is first mounted there.

**Upgrade:** like 2.29.0, upgrading withdraws publication, so regenerate afterwards. Sites still on 2.28.x upgrade straight to 2.29.1; a 2.29.0 upgrade that was completed by hand needs nothing extra.

## [2.29.0] - 2026-10-05

- Serve only the current canonical-site snapshot through a no-store Omeka endpoint, backed by private storage outside the document root. Withdraw on data changes, reject stale publications, and honor job cancellation. Upgrade removes old public generated files.
- Filter private values, media and item sets in streamed, site-scoped SQL; honor explicit primary media and visible titles. Share one immutable corpus across focused entity, overview, media, gallery and graph generators.
- Deduplicate relationships and item counts; filter galleries before applying collection caps. Validate offline inputs against source/site/profile/revision metadata and remove permission-dependent live fallbacks.
- Bound graph candidate discovery; use deterministic Barnes–Hut repulsion and graph-hash layout caching. Replace mutable static aggregation configuration with immutable instance context.
- Add comparison error/retry states, renderer disposal and payload-driven library loading. Consolidate asset setup.
- Discover every PHP harness in CI/releases, lint templates, and add database integration, publication lifecycle, numerical accuracy, scoped Python and Chromium regressions.

**Upgrade:** configure durable private storage, upgrade the module, then regenerate. Optional word-cloud/semantic inputs need a scoped rebuild. See [Administration](docs/ADMINISTRATION.md).

All notable changes are documented here. Versions follow Semantic Versioning.

## [2.28.5] - 2026-09-07

### Fixed

- Only render an item's optional aggregate dashboard when its artifact exists in the published snapshot. Research records such as item 32328 retain their separate knowledge graph without requesting a dashboard that the generator never creates.
- Resolve availability through the current generation pointer, retaining legacy flat-data compatibility without using stale flat artifacts when an authoritative generation lacks the file.
- Add executable block-rendering regressions for missing, generated, graph-only, legacy and stale-generation data. Collection dashboards and the deployment health gate still expose snapshot outages.
- No regeneration is required. Preserve published data while replacing the module.

## [2.28.4] - 2026-09-07

### Fixed

- Spatial Exploration uses a named group of native toggle buttons instead of incomplete listbox semantics. Selection is always a boolean, and keyboard focus survives result-list updates.
- Underline MapLibre attribution links so they remain identifiable without colour perception.
- No data schema change or regeneration is needed for this patch. Preserve asset/data when replacing the module; see the theme's release-deployment guide and snapshot health gate.

## [2.28.3] - 2026-09-07

### Fixed

- Preserve configured dashboard titles and layouts during asynchronous rendering.
- Show accessible empty/error states and a reload action, and isolate chart failures so other charts remain usable.
- Refresh a pruned snapshot generation once before retrying a missing artifact.
- Use the optional DRESearch 1.21.0 public corpus-count service for overview totals, including configured extra sources and public site membership. Omit country subtitles from canonical location totals.

### Upgrade

Install DRESearch 1.21.0 and the DRE theme 2.30.2 alongside this module, then run **Regenerate now**. Preserve the installation's asset/data directory when upgrading; generated snapshots are intentionally not bundled in release archives. Without the new Search service, existing fallback count definitions remain in use.

## [2.28.2] - 2026-09-04

### Documentation

- The Collection Overview comment described the cluster bibliography as
  "templates 11–20". It now spans 11–20 **and** 24–32, a non-contiguous range
  that grows whenever a new upstream EP3 publication type appears. No code
  change: `publicationIds()` selects by the Publications item set and
  `buildTemplates()` reads its labels from `resource_template` at runtime, so
  nine new templates and 285 new publications flowed in with nothing to
  register in `config/amira-profile.json`.

> Run **Regenerate now** after upgrading — the upstream harvest grew from 277
> to 562 publications, and every dashboard renders precomputed JSON.

## [2.28.1] - 2026-08-28

### Fixed

- Dashboard action buttons now live in a named sibling toolbar instead of
  inside each chart heading. Heading navigation therefore announces only the
  chart title, while every icon-only action has an explicit accessible name.
- Async dashboards keep a persistent polite status region and expose
  `aria-busy` while data loads. Ready, empty, and unavailable outcomes are
  announced without moving focus or removing the readable page around a chart.
- On coarse pointers, native MapLibre navigation and popup-close controls now
  use the shared 44px touch-target token. Popup content reserves enough space
  for the enlarged close action, while fine-pointer layouts stay compact.

### Internal

- `npm run check` now pins the dashboard heading, toolbar, control-name,
  live-status, and MapLibre touch-target contracts with a dependency-free
  accessibility check.

## [2.28.0] - 2026-08-14

### Changed

- **One reflow.** The dashboards carried their own breakpoint ladder — 420, 600,
  680, 700, 720 and 768px — against the theme's 600 · 768 · 1024 · 1200 · 1460.
  The 720/768 pair left a 48px band in which a dashboard block had changed layout
  and the header around it had not. Every `@media` width now sits on the shared
  ladder (`max-width` one pixel below a step, as the convention has it), so a page
  carrying the theme's header, a facet panel and a dashboard turns at once.
- **One rhythm.** Twelve distinct raw line-heights, including a `24px`, with the
  theme's `--leading-*` tokens referenced nowhere. All 21 now read
  `--rv-leading-tight/-snug/-normal/-relaxed`.
- **Stacking is on the scale.** Sixteen hand-set `z-index` values, two of them
  `9999` — a fullscreen chart stage sitting above the theme's sticky header,
  drawer, modal layer *and* tooltip, i.e. above chrome it should never cover. The
  nine that are page layers now read `--rv-z-banner/-dropdown/-stage/-modal`;
  DRE-theme publishes `--z-stage` (290) for exactly this. Small integers that
  order siblings inside one component stay raw — they are not page layers.
- **Entity-type colour comes from the theme.** Person, Project, Organisation,
  Subject, Location and the rest were a private registry here, while DRE Search
  reached for a CSS variable nothing defined — two encodings of one meaning, so a
  Person chip in search results and a Person node in a graph could not be
  guaranteed the same hue. `ns.entityColor()` now resolves DRE-theme's published
  `--entity-*` family, with the existing palette slot as the fallback. The values
  are unchanged, so nothing re-colours.
- A map toolbar's `--rv-spatial-control-h` was `2rem` — 32px, under the 44px
  touch target the theme states as `--size-control-lg`, on the one surface where
  a thumb actually lands. It reads that token now.

### Fixed

- **The guard palettes were a shadow brand.** `ns.THEME`'s placeholders and
  `entity-graph.js`'s `THEME_FALLBACK` carried a teal accent (`#22817b`, not
  Uni-Grün), Material's `#b2dfdb`, the cold greys `#333` / `#666` / `#e0e0e0` /
  `#f0f0f0`, and a categorical fallback of stock Material purple, pink, blue and
  brown — all named as anti-patterns in DESIGN.md. They only paint before
  `dashboard-core` resolves, which is precisely how they came loose from the
  palette. They are the theme's own generated values now.
- Six `cssColor()` bridge fallbacks were off, including `--primary-contrast` and
  `--surface` falling back to `#ffffff` — the literal the theme retired `--white`
  to prevent — and `--accent` to the raw Braun pigment rather than `#ca7210`.
- 88 `var(--token, literal)` fallbacks corrected against the theme's resolved
  values, in both the light and the dark alias blocks. The dark block's header
  argued that syncing them was "pointless churn on inert values"; being
  unobservable is why they drifted, not a reason to let them, and they cost
  nothing to keep right now that they are generated rather than typed.
- `--rv-lift-sm` aliased `--lift-sm`, which DRE-theme retired in v2.22, so it was
  permanently on its fallback — a hard-coded `-4px` wearing a token's name.
  Nothing referenced it; it is gone.
- Two interaction transitions read `--rv-transition-slow` instead of hand-set
  `0.4s`/`0.3s`. The looping shimmer and spin placeholders keep their own
  durations — they are not interactions.

### Internal

- `scripts/check-design-tokens.mjs` is now a thin config over
  `scripts/lib/token-rules.mjs`, vendored verbatim from DRE-theme. It opened by
  claiming it mirrored the theme's check and did not: this repo enforced
  off-scale spacing and radius the theme did not, the theme measured contrast no
  module did, and all three stripped `var(--x, …)` before applying any rule, so
  no fallback was ever checked. Four rules are new — fallback literals (including
  `cssColor()` bridge arguments), `--leading-*`, the z-index scale, and `@media`
  widths against the shared ladder.
- `scripts/design-token-allowlist.txt` records what is not yet converted, per rule
  per file — a backlog, not exemptions. 10 lines today, 8 of them the canvas
  palettes that DESIGN.md's data-colour contract governs instead.

## [2.27.0] - 2026-08-11

### Changed

- **Every reader-facing string was copy-edited** for a visitor who does not work
  in digital humanities. Chart titles move to sentence case, which they were only
  half in before (`Items by Year and Type` beside `Subjects & Tags` beside
  `By Resource Template`), and the symbols that stood in for words are spelled
  out: `Resource Type × Language` is now "Resource type by language" and
  `Contributor → Project → Type` is "From contributor to project to resource
  type". A screen reader read those as "times" and "rightwards arrow".
- Chart descriptions no longer explain the data model to people who did not ask
  about it. The subjects chart described itself as *"dcterms:subject covers both
  controlled LCSH subjects and free tags"* and now says the controlled headings
  and the free-text tags are counted together; "cross-tabulation" is an item
  count for each combination; "LCSH" is spelled out as Library of Congress
  subject headings; "lemmatised" is glossed as reduced to a base form. The
  cluster-partners map carried *"Toggle categories in the legend"* as its entire
  description — an instruction in the slot where the reader expects to be told
  what they are looking at.
- Error and empty states say what happened and what to do next. `Map library
  failed to load.` and `No spatial data available yet.` were written for whoever
  would read the stack trace.
- Interface labels that only made sense from inside the code are gone: the entity
  network's `Min. link` is "Shared items", the knowledge graph's `Max.
  commonality` is "Hide the most common links", and the semantic map's
  `low-signal` records are "only lightly described".
- One vocabulary per concept. Community detection was variously `Cluster`,
  `Community` and `Group` across three blocks, and "cluster" collides with the
  Africa Multiple Cluster of Excellence on this very site; everything now says
  "group". The entity network's legend said `Organization` while the map beside
  it said `Organisation` — British spelling throughout now, including
  `visualization` in the admin maintenance page, and `Related Item` is
  `Related item`.
- Featured-collection copy: descriptions rewritten, and a Portuguese agreement
  error corrected in a public title (*Memória Periféricas* → *Memórias
  Periféricas*, which the slug and the English gloss both already had as plural).
- A single-chart embed titled its browser tab with the raw chart key
  (`stackedTimeline`); the key is now spelled out as words, since that title is
  also the iframe's accessible name.

### Compatibility

- The Entity Network's entity-type labels are baked into
  `communities/entity-graph.json`, so its legend and type filter keep saying
  `Organization` until the next **Regenerate**. Nothing breaks in the meantime —
  both spellings resolve to the same palette slot, so the colours are unchanged.
  The same applies to the per-dashboard titles the precompute writes for
  Publications, YouTube and Podcasts.
- No translation catalogues ship with the module, so the changed source strings
  fall through to English as before. A downstream catalogue keyed to the old
  strings will need re-extracting.

## [2.26.1] - 2026-08-05

### Added

- **`CITATION.cff`.** Machine-readable citation metadata (ORCID, affiliation,
  licence, version), which GitHub renders as *Cite this repository* with BibTeX
  and APA export. Release checks pin its `version` to `config/module.ini` and its
  `date-released` to this file's entry for that version, and assert the author
  ORCID is well-formed — nothing else reads the file, so it would otherwise go
  stale silently and offer a citation naming a version that was never tagged.
- A social preview card at `.github/social-preview.png` (1280×640, drawn in the
  module's own dark-mode palette). Development-only: `.github/` is
  `export-ignore`d, so it stays out of the runtime archive.

### Changed

- `.gitattributes` now normalises text to LF in the repository (`* text=auto`),
  so a Windows checkout cannot commit CRLF into PHP/JS bound for a Linux
  container, and marks images binary. `/.codex` joins the `export-ignore` list —
  it is git-ignored, but `git add -f` bypasses that and the release archive
  should not depend on it.
- README: documented the citation metadata, and corrected the dependency list,
  which still named MapLibre GL 5 after 2.26.0 shipped 6.1.0 and omitted
  d3-force entirely.

## [2.26.0] - 2026-08-05

### Changed

- **MapLibre GL JS 5.24.0 → 6.1.0.** Version 6 ships ES modules only, so the
  library is now imported rather than loaded as a classic script: `ns.ensureLibs`
  dynamic-imports it and publishes the namespace as `window.maplibregl`, and the
  eager dashboard surfaces (compare, explorer, network, what's new) do the same
  from an inline module. Every map builder keeps the API it already used — no
  call site changed. Brings upstream fixes for globe latitude precision on some
  GPUs, terrain reconfiguration, 3D buildings near the horizon, and raster tile
  error handling.
- MapLibre is vendored by `npm run vendor:maplibre`, which verifies the npm
  tarball against the registry's sha512 and rewrites exactly one import
  specifier so the three ES-module files can ship under `.js` names (stock
  nginx types no `.mjs`, and a module script served as the wrong type is
  refused) with the library version stamped into the two chunks that Omeka's
  `?v=` cache-buster cannot reach. Documented with hashes in
  `THIRD_PARTY_NOTICES`; release checks now assert the file names stay in sync.

### Compatibility

- MapLibre 6 requires **WebGL2** — Baseline in every browser since Safari 15
  (2021), but WebGL1-only clients will no longer render maps.
- Administrator-configured third-party basemap styles are validated against
  style-spec v25, which reports legacy expressions as errors. The self-hosted
  default basemap is unaffected.

## [2.25.0] - 2026-08-04

### Changed

- **Collection Overview drops the Type of Resource card.** Every other overview
  card answers "how much of X does the collection hold" and links to an authority
  page a reader can browse. Type of Resource is a controlled vocabulary
  describing the *other* records rather than a corpus of its own, and it is the
  one key the theme's masthead has no route for — so it rendered as the single
  dead row in an otherwise navigable catalogue. Ten cards now: research items,
  projects, people, organisations, locations, languages, subjects & tags,
  publications, podcasts, YouTube videos. The metric set changes in the
  precompute's `stats` array rather than in either renderer, because that array
  is what the theme reads from `collection-overview.json` to render the
  masthead's "In AMIRA" column. The `resourceTypes` entry stays in
  `dashboard-stat-cards.js`'s icon map — the `types` and `genres` aliases of
  other dashboards still resolve through it. **Needs a regeneration:** the
  published generation is what readers see, so the card only disappears after a
  precompute run.

## [2.24.0] - 2026-07-31

### Added

- **One multilingual semantic space across six public corpora.** The manual,
  secret-backed embedding workflow creates uniformly bounded cards for podcasts,
  YouTube videos, publications, projects, research sections, and research items;
  incrementally embeds changed cards with `gemini-embedding-2`; projects them with
  deterministic UMAP; reports quality/low-signal coverage; commits the compact
  map and recommendation contracts; and publishes normalized 768-dimensional
  float32 vectors as a versioned GitHub Release.
- **Semantic Map** site-page block and **Similar Items** resource-page block.
  The map supports title search, resource-type/cluster colouring, accessible
  controls, lazy ECharts loading, and embedding. Recommendations are progressive
  enhancement and never surface low-signal records.
- CI now validates the six-corpus profile, card construction, public filtering,
  incremental cache behaviour, recommendation eligibility, and vector release
  schema alongside the PHP and browser-contract matrices.

### Changed

- Podcasts now include linked subjects, subject trends/co-occurrence, locations,
  and an items-by-country choropleth. Transcript word clouds expose translated,
  accessible language controls, while the PHP fallback performs a curated layer
  of English/French inflection folding when the spaCy-built input is unavailable.
- Project and installation metadata use the canonical **DRE-Visualizations**
  repository name throughout.

## [2.23.0] - 2026-07-30

### Fixed

- **The Entity Network's dots now match its own legend.** Its legend, type chips and
  sidebar swatches resolved colour through the shared entity registry, but the
  MapLibre paint expression still coloured circles by their position in `types` — so
  Organization, Location and Tag each had a swatch in one hue and dots in another,
  and none of the three matched the same type elsewhere on the site. This is the
  defect 2.22.1 fixed for the graph categories, still live in the paint expression.
  `npm run check:graph` now fails if the expression stops going through the registry.

### Changed

- **The co-occurrence networks now use the d3-force canvas renderer.** The
  Publications co-author network, the Podcasts and YouTube speaker networks and the
  Network Explorer's co-authorship tab were the last ECharts `graph`/`force`
  series: the layout ran to a frozen state with no collision pass, so nodes
  overlapped, only the largest could carry a label, and dragging one moved it
  through a static picture. They now simulate with d3-force on their own canvas —
  drag a person and their collaborators relax around them, and the node keeps the
  position you gave it. Same renderer as the item-page knowledge graph, so there is
  one set of gestures to learn for every graph on the site.

  Kept: PageRank sizing, Louvain colouring, the co-author edge-relationship
  palette and its key, and click-through to a matched person's record. New:
  labels placed by collision test, a **clickable cluster legend** — which the
  co-author network never had, because colour there was spent on the edges — a
  detail card naming the kinds of connection, an edge list rather than a
  series/category/value CSV, deterministic layouts, keyboard and screen-reader
  access, and a PNG export that draws every label. The payload contract is
  unchanged, so no regeneration is needed for this part.

  One deliberate loss: the plain accent border that marked every matched person is
  now shown only when the data actually mixes matched records with external
  (literal) names, so the ring appears where it discriminates instead of on every
  node.

- Publication authors and editors reach the knowledge graph. Publications credit
  their people through `bibo:authorList` / `bibo:editorList` rather than
  `dcterms:creator`, and those two terms were missing from the graph's property
  whitelist — so a publication's graph showed no people at all, and a person's
  graph never reached the work they wrote. Both terms are now also *shareable*, so
  two publications by one author surface as each other's shared items. **Needs a
  regeneration.** (Podcast episodes and YouTube videos were already covered: their
  speaker credits use `marcrel:spk`, which the `marcrel:` prefix rule already
  matched.)

### Added

- **The Entity Network can be driven from the keyboard.** A WebGL canvas is opaque
  to a pointer-less reader, and this block carried `role="application"` with no key
  handling at all — there was no way in. Left/right now step through the entities
  and set the "hub", up/down walk that hub's own neighbours, Enter selects, `+`/`-`
  zoom, `0` refits and Escape unwinds; a `polite` live region announces each entity
  with its type and its item and link counts, and the cursor is drawn as an accent
  ring that outranks the hover ring. This is the same key model `graph-force.js`
  gives the knowledge graph, so there is one set of gestures for every graph on the
  site. MapLibre's own arrow-key panning is switched off to free the keys — `+`/`-`
  still zoom, so nothing is lost.
- **A text alternative for the Entity Network**: every visible entity as a real
  link, grouped by type and hubs-first, in a disclosure below the graph. The tabular
  fallback for MapLibre-only visualizations that `docs/ROADMAP_STATUS.md` asks for,
  and a Ctrl+F-able index for everyone else. It follows the active filters.
- **Export from the Entity Network** — the block previously had none. PNG (the map
  is now created with `preserveDrawingBuffer`, without which the canvas reads back
  blank) and CSV. The CSV is the *entity* table, not the edge list: the Louvain
  cluster and the dominant research section are computed by this precompute and
  published nowhere else, whereas the edges are the picture on screen. It follows
  the visible filters, so a reader exports what they narrowed to.
- **Isolate one co-occurrence cluster.** The block is called Discursive Communities
  and the clusters were the one axis a reader could not filter on — the chips filter
  by type, the select by link weight, and colouring by cluster only recoloured.
  Each cluster is named by its most central member, the camera flies to it, and
  edges need *both* ends inside it so an isolated cluster shows its own structure
  rather than a fringe running to hidden nodes.
- **Fullscreen for the Entity Network**, on the same `.rv-fullscreen` convention as
  the knowledge graph. The whole block expands, not just the canvas: the toolbar,
  sidebar and legend are how this graph is driven, so MapLibre's own control would
  have taken the map out from under them.
- The search box is a real combobox: type, then arrow through the hits and press
  Enter. Focus stays in the input via `aria-activedescendant` (so typing keeps
  working while the highlight moves), the results are `role="option"`, and a
  `focusout` guard replaces the 150 ms blur timeout that could close the list from
  under a click. Hits are also restricted to entities the current filters leave
  reachable, instead of offering dead ends.
- `entity-graph-ui.js` — the Entity Network's chrome (keyboard walker, text
  alternative, cluster filter, export and fullscreen controls), split out so
  `entity-graph.js` stays the controller that owns the payload, the MapLibre layers
  and the filter expressions. Mirrors the knowledge-graph.js / -ui.js split.
- `ns.mapPng(map)` — a MapLibre map as a PNG data URL, forcing a fresh frame first
  so the export cannot predate the filter change that prompted it.
- `graph-chrome.js` — the renderer-agnostic chrome (clickable legend, detail card,
  edge-colour key, gesture hint) shared by any graph built on `ns.ForceGraph`, so a
  second consumer no longer has to pull in the knowledge graph's own filter panel,
  relationship list and floating toolbar to reuse the four generic pieces.
- `graph-canvas.js` takes an optional per-link colour (`scene.linkColorOf`), which
  is what keeps the co-author network's relationship palette. Hover and focus
  emphasis still win over it.
- `ForceGraph.destroy()` — stops the simulation and disconnects the resize
  observer. The Network Explorer replaces one network with another in the same
  panel, and a simulation left running kept ticking and repainting into a detached
  canvas for the life of the page.
- `ns.chartCsvRows` honours a renderer-supplied `csvRows()`, so a graph can offer
  its natural tabular form (an edge list) instead of being walked as an ECharts
  option.

## [2.22.1] - 2026-07-30

### Fixed

- **Entity colours are consistent across every network.** A type was coloured by
  the palette slot its category happened to occupy, and the knowledge graph
  appends categories in per-item discovery order — so Person came out in the
  project colour on one item and a project in the research-item colour on the
  next, and nothing matched the Entity Network or the contributor networks. All
  three entity-typed graphs now resolve through one registry
  (`ns.entityColor`), seeded from the person/project/institution convention the
  contributor network already encoded, so those colours are unchanged and
  everything else lines up behind them. `npm run check:graph` fails if two types
  ever collide again.
- **The knowledge graph no longer grows without bound in fullscreen.** The canvas
  was in flow while carrying an inline pixel height measured from its own
  container, so each ResizeObserver pass made it taller. The canvas is now out of
  flow, the stage takes its height from the panel rather than its content, and
  `resize()` returns early when nothing changed. Also fixed the height that
  produced: `display: flex` on the `<details>` block never reached the panel,
  because modern Chromium wraps a `<details>` element's content in an internal
  `::details-content` box — so the stage had collapsed to its minimum instead of
  filling the viewport.
- Dropped the "Show patterns" control from the Contributor, Affiliation,
  Collaboration and Discursive Communities networks. Decal patterns exist to
  separate filled areas without relying on colour; on small graph nodes they read
  as noise. Chord, sankey, radar and the word cloud already opted out.
- The same linked resource stated twice on one property no longer counts twice
  toward a node's degree in the REST-API fallback either (the precompute was
  fixed in 2.22.0).

### Changed

- **Clicking an entity selects it instead of navigating away.** It anchors the
  neighbourhood, names its connections along their edges, and opens a card with
  the entity's type, stats, relationship kinds and an explicit link to its
  record; clicking it again, clicking the background or Escape clears it. The
  previous behaviour jumped straight to the Omeka page, which fought exploration
  and had no touch story — the tap-twice-to-open workaround is gone.
- Relationship names are drawn along the edges of the selected entity, with a
  toolbar toggle to name every connection. Edge labels share the node labels'
  collision pass, so the two never overlap.

### Internal

- `scripts/check-graph-contracts.mjs` (`npm run check:graph`, wired into CI):
  asserts the entity-colour registry's invariants and that the vendored d3 files
  only work in their declared order. Both are regressions that reached the site.

## [2.22.0] - 2026-07-30

### Changed

- The item-page Knowledge Graph is now a **live d3-force simulation on a canvas**
  instead of an ECharts `graph`/`force` series. ECharts ran its layout to a frozen
  state with no collision pass, so nodes overlapped, only the centre could carry a
  label, and dragging a node moved it through a static picture. Now a drag makes
  the neighbourhood relax around it and the node keeps the position you gave it
  (a ring marks it as pinned; Alt-click releases it, and a toolbar button releases
  every pin). The payload contract is unchanged, so **no regeneration is required**
  to get the new renderer.
- The graph block loads ~17 KiB of d3-force rather than the 1.1 MiB ECharts
  bundle, so an item page whose only visualization block is the graph is much
  lighter. MapLibre still loads only when the item has coordinates.

### Added

- **Cross edges in the precompute.** The graph also draws the statements *between*
  an item's neighbours — a person who is a member of its project, a project
  carrying its subjects, a project's items sharing its themes — instead of only
  the spokes from the item outwards. The picture is a network rather than
  hub-and-spokes, and community detection finally has real structure to find.
  Cross edges are drawn thinner and fainter so the item's own statements still
  read as the primary layer. Requires "Regenerate now".
- Raised node caps now the renderer can carry them: 220 direct (was 150), 90
  shared (was 60), 40 reverse (was 25), 60 referencing (was 40).
- Labels are placed by an actual collision test — as many as fit, prioritised by
  centrality, and more appear as you zoom in. A toolbar toggle forces all of them.
- A clickable legend below the graph toggles whole entity types in and out.
- Keyboard and screen-reader access to the graph: the canvas is focusable, ←/→
  walk every entity, ↑/↓ walk the focused entity's own neighbours, Enter opens
  one, and each move is announced through a live region. A *Relationships as a
  list* disclosure gives the same content as real links.
- Freeze the layout, reset the view, and a 2× PNG export that includes every
  label and a category legend.
- Pan by dragging the background; zoom with Ctrl/⌘ + scroll, a double-click,
  pinch, or `+`/`−`. A plain scroll still scrolls the page, so the graph never
  hijacks the wheel mid-article; in fullscreen the wheel zooms.
- `prefers-reduced-motion` is respected: the layout settles before first paint
  and never animates on its own, while a drag still relaxes its neighbourhood.
- Layouts are deterministic — the same item lays out identically on every load.

### Fixed

- The same linked resource stated twice on one property produced two edges, in both
  the precompute and the REST fallback. That now collapses to one — it had become
  visible, because edge count feeds the hub sizing and the "connections in view"
  count. The same resource under two *different* properties is still two statements.

### Internal

- New reusable front-end modules, none of which know about Omeka: `graph-canvas.js`
  (view transform, canvas painter, hit tests) and `graph-force.js` (simulation +
  interaction). `knowledge-graph-data.js`, `knowledge-graph-ui.js`,
  `item-location-map.js` and a thin `knowledge-graph.js` controller replace the
  former single file. The co-occurrence networks can adopt the renderer unchanged.
- `ns.iconSvg` / `ns.iconButton` in `dashboard-core.js` give the module one
  `innerHTML` sink for inline icons instead of one per button.
- `ns.trackRenderer` re-themes a canvas surface on a light/dark toggle without
  re-simulating, alongside the existing ECharts and MapLibre paths.
- `ns.ensureLibs({ d3: true })` loads the vendored d3-force stack in dependency
  order. Vendored: d3-force 3.0.0, d3-quadtree 3.0.1, d3-dispatch 3.0.1,
  d3-timer 3.0.1 — pinned by SHA-256 in `THIRD_PARTY_NOTICES`.
- `tests/KnowledgeGraphsTest.php` covers the IDF statistics, the cross-edge pass,
  community detection and the item location map.

## [2.21.6] - 2026-07-26

### Fixed

- Show one basemap credit instead of two. MapLibre already renders the credits a
  style declares for its own sources, so also passing the configured attribution
  printed the same tiles twice in different words. The style's own credit now
  wins and the setting is the fallback for a style that declares none, so an
  external basemap such as CARTO is credited exactly once.
- Stop crediting a basemap on the Entity Network, which renders no map data.

## [2.21.5] - 2026-07-26

### Added

- Country labels on the self-hosted basemap, sized by zoom and haloed against
  the land fill, and a stronger border colour so coastlines read at world zoom.

## [2.21.4] - 2026-07-26

### Added

- Self-hosted basemap. Maps now default to a style built from the Natural Earth
  outlines already shipped for the choropleth, with self-hosted Noto Sans glyph
  ranges for labels, themed from the DRE tokens. Land, coastlines, borders and
  labels render with no tile server and no third-party request, so the basemap
  settings can stay blank.

### Fixed

- Restore Entity Network and Spatial Exploration labels, which drew nothing
  unless an administrator had configured an external glyph endpoint.
- Stop showing two credits for the same basemap. The built-in style declares its
  own attribution, so the attribution setting is only needed for an external
  style; documented that an external style adds the provider's credit to
  whatever text is configured.

## [2.21.3] - 2026-07-26

### Fixed

- Publish `beeswarm-all-sections.json`, which is a JSON array of scatter points
  rather than a dashboard object. Snapshot validation had no schema for it, so a
  fully generated snapshot was discarded at the final publish step.
- Accept a featured-collections index with no qualifying collection, which
  encodes as `[]` rather than `{}`.

### Changed

- Mirror the full `item-dashboards` artifact inventory in the snapshot publisher
  fixture, so an artifact shape the validator has no schema for fails in CI
  rather than at the end of a regeneration.

## [2.21.2] - 2026-07-26

### Fixed

- Restore the module configuration form and every admin page that loads the
  module. `getConfigForm()` declared a `ViewModel` parameter where Omeka's
  `AbstractModule` declares a `PhpRenderer`, so PHP rejected the override at
  class-declaration time and the class could not be loaded at all — Configure
  and Upgrade returned a blank 500 with nothing in `application.log`.
- Regenerate now reads the site item pool from `item_site`, Omeka's actual join
  table; the reversed name `site_item` made every precompute run abort with
  "Base table or view not found".

### Changed

- Add a `module-contract` CI job (and release gate) that declares every module
  class against a real Omeka S core, so an incompatible override fails CI
  instead of a live admin page. `php -l` cannot detect this class of bug.

## [2.21.1] - 2026-07-21

### Changed

- Require PHP 8.2+ (8.1 is end-of-life and the precompute layer uses trait
  constants); CI and the security policy now cover PHP 8.2–8.5.

### Fixed

- Model a deleted item by its absence from the snapshot in the public-corpus
  regression fixture, which failed on every CI run.

## [2.21.0] - 2026-07-17

### Security

- Scope every generated artifact to one configured public Omeka site and
  remove private, deleted, and cross-site sources and relationship targets.
- Escape stored metadata at MapLibre and ECharts HTML sinks and add regression
  contracts using a malicious label fixture.
- Remove hard-coded third-party basemap calls; add configurable endpoints and
  visible attribution.

### Changed

- Publish validated, immutable generations behind an atomic `current.json`
  manifest with per-site locking, artifact schema checks, stale-generation
  pruning, and removal of legacy direct-output paths.
- Precompute item-set dashboards and cancel stale Compare/Explorer requests.
- Make date, coordinate, corpus, and tied-count selection deterministic.
- Ship one generated chart-builder bundle while preserving modular sources.
- Centralize installation IDs, featured collections, corpus definitions, and
  university labels in a validated AMIRA profile; introduce an immutable corpus
  boundary and focused knowledge-graph/item-set generators.
- Use the document locale for numbers and dates, emit translated runtime labels,
  and provide CSV downloads for ECharts canvas data.
- Correct canonical repository/install metadata and add CI/release automation.

### Fixed

- Correct counts in What's New, group/institution filtering, duplicate section
  membership, equatorial map coordinates, and unused geo-flow asset loading.

## [2.20.1]

- Previous repository state. Earlier history remains available in Git tags and
  commit history.

[Unreleased]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.31.0...HEAD
[2.31.0]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.30.0...v2.31.0
[2.30.0]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.29.1...v2.30.0
[2.29.1]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.29.0...v2.29.1
[2.29.0]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.28.5...v2.29.0
[2.28.5]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.28.4...v2.28.5
[2.28.4]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.28.3...v2.28.4
[2.28.3]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.28.2...v2.28.3
[2.28.2]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.28.1...v2.28.2
[2.28.1]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.28.0...v2.28.1
[2.28.0]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/compare/v2.26.1...v2.28.0
[2.26.1]: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/releases/tag/v2.26.1
