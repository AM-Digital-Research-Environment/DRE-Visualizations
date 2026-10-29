<?php
declare(strict_types=1);
namespace DreVisualizations\Site;

/**
 * config/asset-plans.json: what each surface loads, independent of the view.
 *
 * The same file drives scripts/build-frontend-bundles.mjs (the chart bundle's
 * sources) and the contract checks, so the load order lives in one place.
 * View\Helper\DashboardAssets turns a plan into head tags. Paths are relative
 * to asset/.
 */
final class AssetPlans
{
    public const FILE = __DIR__ . '/../../config/asset-plans.json';

    /** The decoded file, once per process. */
    public static function manifest(): array
    {
        static $manifest = null;
        return $manifest ??= json_decode((string) file_get_contents(self::FILE), true, 64, JSON_THROW_ON_ERROR);
    }

    /** One plan's definition; an unknown name throws. */
    public static function plan(string $name): array
    {
        return self::manifest()['plans'][$name] ?? throw new \InvalidArgumentException('Unknown asset plan: ' . $name);
    }

    /** A single-file vendored library's path (`libs`), e.g. 'maplibreCss'. */
    public static function lib(string $key): string
    {
        $path = self::manifest()['libs'][$key] ?? null;
        if (!is_string($path)) throw new \InvalidArgumentException('Unknown single-file library: ' . $key);
        return $path;
    }

    /**
     * A library's file or ordered files, as `publish` hands them to the core.
     *
     * @return string|string[]
     */
    public static function libFiles(string $key): string|array
    {
        return self::manifest()['libs'][$key] ?? throw new \InvalidArgumentException('Unknown library: ' . $key);
    }

    /**
     * A plan's script entries as asset paths, in load order: `@group` expands to
     * its list, `lib:key` to that library's file(s), anything else is a path.
     * Scripts of the plan named by `after` are not included.
     *
     * @return string[]
     */
    public static function scripts(string $plan): array
    {
        $groups = self::manifest()['groups'];
        $paths = [];
        foreach (self::plan($plan)['scripts'] ?? [] as $entry) {
            if (str_starts_with($entry, '@')) {
                array_push($paths, ...($groups[substr($entry, 1)] ?? throw new \InvalidArgumentException('Unknown asset group: ' . $entry)));
            } elseif (str_starts_with($entry, 'lib:')) {
                array_push($paths, ...(array) self::libFiles(substr($entry, 4)));
            } else {
                $paths[] = $entry;
            }
        }
        return $paths;
    }
}
