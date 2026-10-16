<?php
declare(strict_types=1);
namespace DreVisualizations\Controller\Site;

use DreVisualizations\Module;
use DreVisualizations\Precompute\EmbeddingInputs;
use DreVisualizations\Precompute\PublishedSnapshot;
use DreVisualizations\Precompute\ScopedInput;
use DreVisualizations\Precompute\SnapshotStore;
use DreVisualizations\Service\AutomaticRefresh;
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
        $path = (string) $this->params()->fromRoute('path');
        $ping = $path === 'embeddings-refresh';
        if ($ping ? !$this->getRequest()->isPost() : !$this->getRequest()->isGet() && !$this->getRequest()->isHead()) {
            return $response->setStatusCode(405);
        }
        $site = $this->currentSite();
        $siteId = (int) $this->settings()->get(Module::SETTING_SITE_ID, 0);
        if (!$site || !$site->isPublic() || $site->id() !== $siteId) return $response;
        $store = SnapshotStore::tryDefault();
        if ($store === null) return $response;
        if ($ping) return $this->refreshEmbeddings($response, $store, $siteId);

        if ($path === 'source.json') {
            // Exclusive: the first request on a fresh store creates the revision.
            return $this->json($response, $store->locked(fn (): string => json_encode([
                'siteId' => $siteId,
                'revision' => $store->revision(),
                'profile' => ScopedInput::profileHash(),
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

    /**
     * POST embeddings-refresh: the embeddings workflow's ping after it publishes
     * a build. Anyone may send it, so it only makes the site look at GitHub
     * (at most once a minute) and install a build made for this revision; a
     * new one queues the automatic refresh that puts it in the snapshot.
     */
    private function refreshEmbeddings($response, SnapshotStore $store, int $siteId)
    {
        $revision = $store->reading(fn (): ?string => $store->readRevision());
        if ($revision === null) return $response;
        $services = $this->getEvent()->getApplication()->getServiceManager();
        $inputs = EmbeddingInputs::forStore($store->directory, EmbeddingInputs::httpFetcher($services->get('Omeka\HttpClient')));
        $result = $inputs->refresh([
            'siteId' => $siteId,
            'revision' => $revision,
            'profile' => ScopedInput::profileHash(),
        ], EmbeddingInputs::CHECK_AT_MOST_EVERY);
        if ($result === 'installed') {
            $store->markChanged();
            AutomaticRefresh::request($services);
        }
        return $this->json($response, json_encode(['status' => $result], JSON_THROW_ON_ERROR));
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
