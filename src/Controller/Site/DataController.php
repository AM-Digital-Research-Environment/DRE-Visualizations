<?php
declare(strict_types=1);
namespace DreVisualizations\Controller\Site;

use DreVisualizations\Module;
use DreVisualizations\Precompute\PublishedSnapshot;
use DreVisualizations\Precompute\SnapshotStore;
use Laminas\Mvc\Controller\AbstractActionController;

/** Only the current, public canonical site's generation is addressable. */
final class DataController extends AbstractActionController
{
    public function indexAction()
    {
        $response = $this->getResponse();
        $response->getHeaders()->addHeaderLine('Content-Type', 'application/json; charset=utf-8')
            ->addHeaderLine('Cache-Control', 'no-store, private')
            ->addHeaderLine('X-Content-Type-Options', 'nosniff');
        $response->setStatusCode(404)->setContent('{"error":"Snapshot unavailable"}');
        if (!$this->getRequest()->isGet() && !$this->getRequest()->isHead()) return $response->setStatusCode(405);
        $site = $this->currentSite();
        $siteId = (int) $this->settings()->get(Module::SETTING_SITE_ID, 0);
        if (!$site || !$site->isPublic() || $site->id() !== $siteId) return $response;
        $store = new SnapshotStore(SnapshotStore::defaultDirectory());
        $path = (string) $this->params()->fromRoute('path');
        $content = $store->locked(function () use ($store, $path, $siteId): ?string {
            if ($path === 'source.json') {
                return json_encode([
                    'siteId' => $siteId,
                    'revision' => $store->revision(),
                    'profile' => hash('sha256', str_replace("\r\n", "\n", (string) file_get_contents(dirname(__DIR__, 3) . '/config/amira-profile.json'))),
                ], JSON_THROW_ON_ERROR);
            }
            $manifest = $store->manifest();
            if (!$manifest || (int) ($manifest['scope']['siteId'] ?? 0) !== $siteId) return null;
            if ($path === 'current.json') return json_encode($manifest, JSON_THROW_ON_ERROR);
            $prefix = 'generations/' . $manifest['generationId'] . '/';
            if (!str_starts_with($path, $prefix)) return null;
            $file = PublishedSnapshot::artifactPath($store->directory, $manifest, substr($path, strlen($prefix)));
            return $file === null ? null : (string) file_get_contents($file);
        });
        if ($content !== null) $response->setStatusCode(200)->setContent($content);
        if ($this->getRequest()->isHead()) $response->setContent('');
        return $response;
    }
}
