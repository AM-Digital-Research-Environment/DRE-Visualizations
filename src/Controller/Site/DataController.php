<?php
declare(strict_types=1);
namespace DreVisualizations\Controller\Site;

use DreVisualizations\Module;
use DreVisualizations\Precompute\PublishedSnapshot;
use DreVisualizations\Precompute\SnapshotStore;
use Laminas\Http\Response\Stream;
use Laminas\Mvc\Controller\AbstractActionController;

/** Only the current, public canonical site's generation is addressable. */
final class DataController extends AbstractActionController
{
    public function indexAction()
    {
        $response = $this->getResponse();
        $this->addHeaders($response);
        $response->setStatusCode(404)->setContent('{"error":"Snapshot unavailable"}');
        if (!$this->getRequest()->isGet() && !$this->getRequest()->isHead()) return $response->setStatusCode(405);
        $site = $this->currentSite();
        $siteId = (int) $this->settings()->get(Module::SETTING_SITE_ID, 0);
        if (!$site || !$site->isPublic() || $site->id() !== $siteId) return $response;
        $store = SnapshotStore::tryDefault();
        if ($store === null) return $response;
        $path = (string) $this->params()->fromRoute('path');

        if ($path === 'source.json') {
            // Exclusive: the first request on a fresh store creates the revision.
            return $this->json($response, $store->locked(fn (): string => json_encode([
                'siteId' => $siteId,
                'revision' => $store->revision(),
                'profile' => hash('sha256', str_replace("\r\n", "\n", (string) file_get_contents(dirname(__DIR__, 3) . '/config/amira-profile.json'))),
            ], JSON_THROW_ON_ERROR)));
        }

        // Resolve and open under the shared lock, then stream without it: the
        // open handle survives a prune, and a multi-megabyte artifact neither
        // holds the lock nor passes through PHP's memory limit.
        $resolved = $store->reading(function () use ($store, $path, $siteId): ?array {
            $manifest = $store->manifest();
            if (!$manifest || (int) ($manifest['scope']['siteId'] ?? 0) !== $siteId) return null;
            if ($path === 'current.json') return ['json' => json_encode($manifest, JSON_THROW_ON_ERROR)];
            $prefix = 'generations/' . $manifest['generationId'] . '/';
            if (!str_starts_with($path, $prefix)) return null;
            $file = PublishedSnapshot::artifactPath($store->directory, $manifest, substr($path, strlen($prefix)));
            $handle = $file === null ? false : fopen($file, 'rb');
            return $handle ? ['handle' => $handle, 'size' => (int) filesize($file)] : null;
        });
        if ($resolved === null) return $response;
        if (isset($resolved['json'])) return $this->json($response, $resolved['json']);

        if ($this->getRequest()->isHead()) {
            fclose($resolved['handle']);
            $response->getHeaders()->addHeaderLine('Content-Length', (string) $resolved['size']);
            return $response->setStatusCode(200)->setContent('');
        }
        $stream = new Stream();
        $this->addHeaders($stream);
        $stream->getHeaders()->addHeaderLine('Content-Length', (string) $resolved['size']);
        $stream->setStream($resolved['handle']);
        $stream->setContentLength($resolved['size']);
        $stream->setCleanup(false);
        return $stream->setStatusCode(200);
    }

    private function json($response, string $json)
    {
        $response->setStatusCode(200)->setContent($this->getRequest()->isHead() ? '' : $json);
        return $response;
    }

    private function addHeaders($response): void
    {
        $response->getHeaders()->addHeaderLine('Content-Type', 'application/json; charset=utf-8')
            ->addHeaderLine('Cache-Control', 'no-store, private')
            ->addHeaderLine('X-Content-Type-Options', 'nosniff');
    }
}
