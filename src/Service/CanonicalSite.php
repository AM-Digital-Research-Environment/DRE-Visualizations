<?php
declare(strict_types=1);

namespace DreVisualizations\Service;

use Doctrine\DBAL\Connection;
use DreVisualizations\Module;
use Omeka\Settings\SettingsInterface;

/**
 * The one public Omeka site whose items enter generated data. Read directly
 * from the database: a site's visibility is checked at use, never cached.
 */
final class CanonicalSite
{
    public function __construct(
        private readonly Connection $connection,
        private readonly SettingsInterface $settings,
    ) {}

    /** The configured site id, or 0 when none is. */
    public function id(): int
    {
        return (int) $this->settings->get(Module::SETTING_SITE_ID, 0);
    }

    /** @return array{id:int,title:string,slug:string}|null The configured site, when it is public. */
    public function publicSite(): ?array
    {
        $id = $this->id();
        $row = $id > 0 ? $this->connection->executeQuery(
            'SELECT id, title, slug FROM site WHERE id = ? AND is_public = 1', [$id]
        )->fetchAssociative() : false;
        return $row ? ['id' => (int) $row['id'], 'title' => (string) $row['title'], 'slug' => (string) $row['slug']] : null;
    }

    public function isPublicSite(int $siteId): bool
    {
        return $siteId > 0 && (bool) $this->connection->executeQuery(
            'SELECT 1 FROM site WHERE id = ? AND is_public = 1', [$siteId]
        )->fetchOne();
    }

    /** @return array<int,string> Public sites as select options: id => "Title (slug, #id)". */
    public function publicSiteOptions(): array
    {
        $options = [];
        foreach ($this->connection->executeQuery(
            'SELECT id, title, slug FROM site WHERE is_public = 1 ORDER BY title ASC, id ASC'
        )->fetchAllNumeric() as [$id, $title, $slug]) {
            $options[(int) $id] = sprintf('%s (%s, #%d)', (string) $title, (string) $slug, (int) $id);
        }
        return $options;
    }
}
