<?php
declare(strict_types=1);

namespace DreVisualizations\Form;

use DreVisualizations\Module;
use DreVisualizations\Precompute\EmbeddingWorkflow;

/**
 * Validated configuration values from a posted ConfigForm. Pure — the caller
 * checks the site is public and saves — so the rules are unit-testable.
 */
final readonly class ConfigValues
{
    public const URL_SETTINGS = [Module::SETTING_BASEMAP_LIGHT, Module::SETTING_BASEMAP_DARK, Module::SETTING_MAP_GLYPHS];

    public const FORGET_TOKEN = 'dre_visualizations_github_token_forget';
    public const REBUILD = 'dre_visualizations_rebuild_embeddings';

    /**
     * @param array<string,string> $settings setting name => value
     * @param ?string $githubToken the token to save, '' to forget it, null to keep the saved one
     */
    private function __construct(public int $siteId, public array $settings, public ?string $githubToken, public bool $rebuild) {}

    /**
     * @param array<string,mixed> $post
     * @return self|string The values, or the (translatable) reason they were rejected.
     */
    public static function fromPost(array $post): self|string
    {
        $value = static fn (string $key): string => is_scalar($post[$key] ?? null) ? trim((string) $post[$key]) : '';
        $settings = [];
        foreach ([...self::URL_SETTINGS, Module::SETTING_BASEMAP_ATTRIBUTION] as $key) {
            $settings[$key] = $value($key);
        }
        foreach (self::URL_SETTINGS as $key) {
            if ($settings[$key] !== '' && !self::isAllowedUrl($settings[$key])) {
                return 'Basemap styles must use HTTPS or a same-origin absolute path beginning with “/”.'; // @translate
            }
        }
        $glyphs = $settings[Module::SETTING_MAP_GLYPHS];
        if ($glyphs !== '' && (!str_contains($glyphs, '{fontstack}') || !str_contains($glyphs, '{range}'))) {
            return 'The map glyph URL must contain “{fontstack}” and “{range}”.'; // @translate
        }
        $anyUrl = array_filter(array_intersect_key($settings, array_flip(self::URL_SETTINGS)), static fn (string $url): bool => $url !== '');
        if ($anyUrl && $settings[Module::SETTING_BASEMAP_ATTRIBUTION] === '') {
            return 'Basemap attribution is required when a style URL is configured.'; // @translate
        }
        // The saved token is never shown again, so a blank field keeps it.
        $token = $value(Module::SETTING_GITHUB_TOKEN);
        if ($token !== '' && !EmbeddingWorkflow::isPlausibleToken($token)) {
            return 'That is not a GitHub token. Paste the whole token, which starts with “github_pat_”.'; // @translate
        }
        $githubToken = match (true) {
            $token !== '' => $token,
            !empty($post[self::FORGET_TOKEN]) => '',
            default => null,
        };
        return new self((int) $value(Module::SETTING_SITE_ID), $settings, $githubToken, !empty($post[self::REBUILD]));
    }

    /** HTTPS, or a same-origin absolute path (not a protocol-relative //host). */
    public static function isAllowedUrl(string $url): bool
    {
        if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
            return true;
        }
        return filter_var($url, FILTER_VALIDATE_URL) !== false
            && strtolower((string) parse_url($url, PHP_URL_SCHEME)) === 'https';
    }
}
