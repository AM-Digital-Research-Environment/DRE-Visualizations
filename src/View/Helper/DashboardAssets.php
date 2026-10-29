<?php
declare(strict_types=1);
namespace DreVisualizations\View\Helper;

use DreVisualizations\Module;
use DreVisualizations\Site\AssetPlans;
use DreVisualizations\Site\BasemapStyle;
use Laminas\View\Helper\AbstractHelper;

/**
 * Appends a surface's front-end assets to the page head, by plan.
 *
 * What each surface loads is data, in config/asset-plans.json (Site\AssetPlans),
 * which the build and the contract checks read too: a plan names whether it needs the
 * stylesheet, which vendored library URLs it hands the core for lazy loading
 * (`publish`), and its scripts in load order (paths, `@group` lists, or
 * `lib:key` for a library loaded eagerly). A block's plan is its BlockRegistry
 * row's `plan`, which its template receives as `$plan`:
 *
 *     $this->dashboardAssets(['plan' => $plan]);
 *
 * `after` emits another plan first: the dashboards name `prelude` (stylesheet,
 * library URLs, the core), which Module::addAssets also emits on every item
 * page. Each plan is emitted at most once per request, so the order holds
 * whichever runs first — DRE-theme renders an item page's blocks before
 * `view.show.before`. Laminas' headScript()/headLink() de-duplicate files by
 * URL, so plans may share scripts. An unknown plan or option throws.
 *
 * Every script is deferred, so the ECharts/MapLibre prelude and the chart chain
 * never block first paint; deferred scripts still run in append order, before
 * DOMContentLoaded. The heavy libraries themselves load on demand through
 * ns.ensureLibs (core/libs.js) from the URLs a plan publishes.
 */
class DashboardAssets extends AbstractHelper
{
    /** Whether this request's head already carries the i18n, data and basemap configuration. */
    private bool $pageConfigInjected = false;
    /** How many rv-config payloads this request's head carries (their ids). */
    private int $configPayloads = 0;
    /** @var array<string, true> the plans already emitted in this request */
    private array $emitted = [];

    /**
     * @param array{plan?: string} $options `plan`: a key of config/asset-plans.json
     *     `plans` (default 'dashboard').
     */
    public function __invoke(array $options = []): self
    {
        $unknown = array_diff(array_keys($options), ['plan']);
        if ($unknown) throw new \InvalidArgumentException('Unknown dashboardAssets option: ' . implode(', ', $unknown));
        $this->emit((string) ($options['plan'] ?? 'dashboard'));
        return $this;
    }

    private function emit(string $name): void
    {
        if (isset($this->emitted[$name])) return;
        $plan = AssetPlans::plan($name);
        $this->emitted[$name] = true;
        if (isset($plan['after'])) $this->emit((string) $plan['after']);

        $view = $this->getView();
        $this->injectPageConfig();
        $asset = fn (string $path): string => $view->assetUrl($path, 'DreVisualizations');

        if (!empty($plan['stylesheet'])) {
            $view->headLink()->appendStylesheet($asset(AssetPlans::manifest()['stylesheet']));
        }
        if (!empty($plan['publish'])) {
            $libs = [];
            foreach ($plan['publish'] as $key) {
                $value = AssetPlans::libFiles($key);
                $libs[$key] = is_array($value) ? array_map($asset, $value) : $asset($value);
            }
            $this->appendConfig(['libs' => $libs]);
        }
        foreach (AssetPlans::scripts($name) as $path) {
            $view->headScript()->appendFile($asset($path), 'text/javascript', ['defer' => true]);
        }
    }

    /**
     * The configuration every surface shares, once per request: the translated
     * interface strings, the data endpoint, and the basemap configuration both
     * this module and DRE Search read (never an empty style string: the
     * configured URL, else this module's self-hosted default by URL, else no key
     * at all; see Site\BasemapStyle::mapConfig).
     */
    private function injectPageConfig(): void
    {
        if ($this->pageConfigInjected) return;
        $this->pageConfigInjected = true;
        $view = $this->getView();
        $site = $view->currentSite();
        $config = ['i18n' => (object) Module::clientTranslations($view)];
        if ($site) $config['dataBase'] = preg_replace('/current\.json$/', '',
            $view->url('site/dre-data', ['site-slug' => $site->slug(), 'path' => 'current.json']));
        $defaults = $site ? [
            'light' => $view->url('site/dre-basemap', ['site-slug' => $site->slug(), 'mode' => 'light']),
            'dark' => $view->url('site/dre-basemap', ['site-slug' => $site->slug(), 'mode' => 'dark']),
        ] : null;
        $config['mapConfig'] = (object) BasemapStyle::mapConfig(
            (string) $view->setting(Module::SETTING_BASEMAP_LIGHT, ''),
            (string) $view->setting(Module::SETTING_BASEMAP_DARK, ''),
            (string) $view->setting(Module::SETTING_MAP_GLYPHS, ''),
            (string) $view->setting(Module::SETTING_BASEMAP_ATTRIBUTION, ''),
            $defaults,
        );
        $this->appendConfig($config);
    }

    /**
     * Flags for every JSON value inlined into a page (<script> bodies and
     * script-carried payloads): slashes and Unicode stay readable, but `<`, `&`,
     * `'` and `"` are hex-escaped so no value can close the element or break out
     * of a string literal. U+2028/2029 stay escaped (no
     * JSON_UNESCAPED_LINE_TERMINATORS), which old JavaScript parsers needed.
     */
    public const SCRIPT_JSON_FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

    /**
     * A count for the page, grouped the way the site's locale groups digits
     * (1.234 on a German site, 1,234 on an English one) — the same
     * NumberFormatter rule DRE-theme's banner uses, and the server half of
     * the client's Intl formatting (core/base.js, ns.formatNumber).
     * number_format() is locale-blind, so it is only the fallback when the
     * intl extension is missing.
     */
    public static function formatNumber(int $value): string
    {
        if (class_exists(\NumberFormatter::class)) {
            $formatted = (new \NumberFormatter(\Locale::getDefault(), \NumberFormatter::DECIMAL))->format($value);
            if ($formatted !== false) return $formatted;
        }
        return number_format($value);
    }

    /** A value as JSON that is safe to inline in a <script> element. */
    public static function scriptJson(mixed $value): string
    {
        return json_encode($value, self::SCRIPT_JSON_FLAGS);
    }

    /**
     * Hands part of the page configuration to the core as inert JSON, a
     * `<script type="application/json" id="rv-config-N">` that core/base.js
     * merges into window.RV_LIBS / RV_I18N / RV_MAP_CONFIG / RV_DATA_BASE (the
     * first value for a key wins). Never executable inline script, so a
     * `script-src 'self'` policy holds; `noescape` keeps Laminas from wrapping
     * the JSON in `//<!--` comments.
     */
    private function appendConfig(array $config): void
    {
        $this->getView()->headScript()->appendScript(self::scriptJson($config), 'application/json',
            ['id' => 'rv-config-' . ++$this->configPayloads, 'noescape' => true]);
    }
}
