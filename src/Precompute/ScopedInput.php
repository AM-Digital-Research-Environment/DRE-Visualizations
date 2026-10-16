<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

/** Offline derived inputs are executable-denied envelopes, never static public JSON. */
final class ScopedInput
{
    public const PREFIX = "<?php http_response_code(404); exit; ?>\n";

    public static function read(string $path, array $scope): ?array
    {
        if (!is_file($path)) return null;
        $raw = file_get_contents($path);
        return $raw === false ? null : self::parse($raw, $scope);
    }

    /** The installed profile's hash, as source.json reports it and the offline builders check it. */
    public static function profileHash(): string
    {
        return hash('sha256', str_replace("\r\n", "\n", (string) file_get_contents(dirname(__DIR__, 2) . '/config/amira-profile.json')));
    }

    /** The payload of an envelope built for $scope (siteId, revision, profile); null otherwise. */
    public static function parse(string $raw, array $scope): ?array
    {
        $raw = str_replace("\r\n", "\n", $raw);
        if (!str_starts_with($raw, self::PREFIX)) return null;
        $data = json_decode(substr($raw, strlen(self::PREFIX)), true);
        if (!is_array($data)) return null;
        foreach (['siteId', 'revision', 'profile'] as $key) {
            if (!isset($scope[$key]) || ($data['scope'][$key] ?? null) !== $scope[$key]) return null;
        }
        return $data;
    }
}
