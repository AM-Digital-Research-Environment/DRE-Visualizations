<?php
declare(strict_types=1);

namespace DreVisualizations\View\Helper;

use Doctrine\DBAL\Connection;
use Laminas\View\Helper\AbstractHelper;

/**
 * Deep link into the Project explorer for one project, on the current site:
 * the first public page that holds the Project explorer block, with
 * `?project={id}` (read by dashboard-explorer.js). Null when the site has no
 * such page, so the caller shows no link.
 *
 *   $this->dreProjectExplorerUrl($item->id())
 */
final class ProjectExplorerUrl extends AbstractHelper
{
    /** The block's registered name and its config alias (older pages store either). */
    private const LAYOUTS = ['dreProjectExplorer', 'projectExplorer'];

    /** @var array<int,?string> Site id => page slug, looked up once per request. */
    private array $slugs = [];

    public function __construct(private readonly Connection $connection) {}

    public function __invoke(int $projectId): ?string
    {
        $view = $this->getView();
        $site = $view?->currentSite();
        if ($site === null) {
            return null;
        }
        $siteId = (int) $site->id();
        if (!array_key_exists($siteId, $this->slugs)) {
            $slug = $this->connection->fetchOne(
                'SELECT p.slug FROM site_page p JOIN site_page_block b ON b.page_id = p.id'
                . ' WHERE p.site_id = ? AND p.is_public = 1 AND b.layout IN (?, ?)'
                . ' ORDER BY p.id, b.position LIMIT 1',
                [$siteId, ...self::LAYOUTS]
            );
            $this->slugs[$siteId] = is_string($slug) && $slug !== '' ? $slug : null;
        }
        if ($this->slugs[$siteId] === null) {
            return null;
        }
        return $view->url('site/page', ['site-slug' => $site->slug(), 'page-slug' => $this->slugs[$siteId]],
            ['query' => ['project' => $projectId]]);
    }
}
