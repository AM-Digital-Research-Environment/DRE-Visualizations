<?php
declare(strict_types=1);

namespace DreVisualizations\Site;

use Doctrine\DBAL\Connection;

/**
 * Puts the Visualisations block (LinkedItemsDashboard) on item pages.
 *
 * Omeka reads a site's item-page blocks from the active theme's saved settings
 * (`theme_settings_<theme>` → `resource_page_blocks`) as soon as an
 * administrator has saved the Resource pages screen once, and then ignores
 * both the theme.ini defaults and every module's `resource_page_blocks_default`
 * (Omeka\Site\ResourcePageBlockLayout\Manager::getResourcePageBlocks). Such a
 * site never shows the block until someone adds it by hand. place() adds it to
 * a saved configuration that lacks it; repair() does so for every site, and
 * runs on install, on the 2.38.0 upgrade and from the maintenance page.
 *
 * The block goes into the item page's main region, right after the last core
 * "record" block (media, values, item sets, media list, viewer) — before
 * Linked resources when there is no record block. Nothing an administrator
 * chose is removed or reordered, and a block already present in any item
 * region is left where it is.
 */
final class ResourcePagePlacement
{
    /** The registered name, which the admin Resource pages screen stores. */
    public const BLOCK = 'dreLinkedItemsDashboard';
    /** Every name that resolves to the block (the config alias included). */
    public const NAMES = ['dreLinkedItemsDashboard', 'linkedItemsDashboard'];
    /** Core and viewer blocks that show the record itself; the block follows them. */
    public const RECORD_BLOCKS = ['mediaEmbeds', 'values', 'itemSets', 'mediaList', 'mirador', 'mediaRender'];
    /** Without a record block, the block goes before this one when present. */
    public const BEFORE = 'linkedResources';

    /** No saved configuration: the theme and module defaults apply (they include the block). */
    public const STATE_DEFAULT = 'default';
    public const STATE_PRESENT = 'present';
    public const STATE_MISSING = 'missing';

    /**
     * The saved configuration with the block added, or null when there is
     * nothing to change: no saved blocks (Omeka then uses the defaults) or the
     * block already in a region of the item page.
     *
     * @return array<string,array<string,list<string>|array<int,string>>>|null
     */
    public static function place(mixed $saved): ?array
    {
        if (self::state($saved) !== self::STATE_MISSING) {
            return null;
        }
        $blocks = self::standardize($saved);
        $main = array_values($blocks['items']['main'] ?? []);
        $position = null;
        foreach ($main as $index => $name) {
            if (in_array($name, self::RECORD_BLOCKS, true)) {
                $position = $index + 1;
            }
        }
        if ($position === null) {
            $before = array_search(self::BEFORE, $main, true);
            $position = $before === false ? count($main) : $before;
        }
        array_splice($main, $position, 0, [self::BLOCK]);
        $blocks['items']['main'] = $main;
        return $blocks;
    }

    /** Whether a site's saved blocks show the Visualisations on item pages. */
    public static function state(mixed $saved): string
    {
        // The same test as Omeka's Manager: an empty saved value means "unset".
        if (!$saved) {
            return self::STATE_DEFAULT;
        }
        foreach (self::standardize($saved)['items'] as $names) {
            if (array_intersect($names, self::NAMES)) {
                return self::STATE_PRESENT;
            }
        }
        return self::STATE_MISSING;
    }

    /**
     * Omeka\Site\ResourcePageBlockLayout\Manager::standardizeResourcePageBlocks(),
     * repeated so this class runs where the plugin manager is not available
     * (upgrade() of a module Omeka has not loaded, the test harnesses).
     *
     * @return array<string,array<string,array<int,string>>>
     */
    public static function standardize(mixed $blocksIn): array
    {
        $blocksIn = is_array($blocksIn) ? $blocksIn : [];
        $blocksOut = [];
        foreach (['items', 'item_sets', 'media'] as $resourceName) {
            if (isset($blocksIn[$resourceName]) && is_array($blocksIn[$resourceName])) {
                foreach ($blocksIn[$resourceName] as $regionName => $blockLayouts) {
                    if (!is_array($blockLayouts)) {
                        $blockLayouts = [];
                    }
                    $blocksOut[$resourceName][$regionName] = array_filter(array_map('strval', $blockLayouts));
                }
            } else {
                $blocksOut[$resourceName] = ['main' => []];
            }
        }
        return $blocksOut;
    }

    /**
     * Each site's state, keyed by site id, read from its active theme's settings.
     *
     * @return array<int,string>
     */
    public static function states(Connection $connection): array
    {
        $states = [];
        foreach (self::savedSettings($connection) as $siteId => [, $settings]) {
            $states[$siteId] = self::state($settings['resource_page_blocks'] ?? null);
        }
        return $states;
    }

    /**
     * Add the block to every site (or the listed ones) whose saved item-page
     * configuration lacks it. Idempotent.
     *
     * @param list<int>|null $siteIds Restrict the repair to these sites.
     * @return list<int> The sites whose configuration changed.
     */
    public static function repair(Connection $connection, ?array $siteIds = null): array
    {
        $changed = [];
        foreach (self::savedSettings($connection) as $siteId => [$key, $settings]) {
            if ($siteIds !== null && !in_array($siteId, $siteIds, true)) {
                continue;
            }
            $placed = self::place($settings['resource_page_blocks'] ?? null);
            if ($placed === null) {
                continue;
            }
            $settings['resource_page_blocks'] = $placed;
            // What Omeka's site settings write: the json_array type is json_encode().
            $connection->update('site_setting', ['value' => json_encode($settings, JSON_THROW_ON_ERROR)],
                ['id' => $key, 'site_id' => $siteId]);
            $changed[] = $siteId;
        }
        return $changed;
    }

    /**
     * Every site's saved settings for its active theme. Omeka lowercases
     * setting ids when it writes them (AbstractSettings::set()).
     *
     * @return array<int,array{0:string,1:array<string,mixed>}>
     */
    private static function savedSettings(Connection $connection): array
    {
        $saved = [];
        foreach ($connection->fetchAllAssociative('SELECT id, theme FROM site ORDER BY id') as $site) {
            $siteId = (int) $site['id'];
            $key = strtolower('theme_settings_' . (string) $site['theme']);
            $raw = $connection->fetchOne('SELECT value FROM site_setting WHERE id = ? AND site_id = ?', [$key, $siteId]);
            $settings = is_string($raw) ? json_decode($raw, true) : null;
            $saved[$siteId] = [$key, is_array($settings) ? $settings : []];
        }
        return $saved;
    }
}
