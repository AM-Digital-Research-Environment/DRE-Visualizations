<?php
declare(strict_types=1);

namespace DreVisualizations\Listener;

use DreVisualizations\Precompute\SnapshotStore;
use DreVisualizations\Service\AutomaticRefresh;
use Laminas\EventManager\EventInterface;
use Omeka\Api\Request;

/**
 * Keeps the published snapshot honest around every Omeka API write that can
 * change what it would contain.
 *
 * An ordinary write marks the snapshot stale and leaves it served; once the
 * request ends, an automatic refresh is queued (AutomaticRefresh). A write that
 * makes something private (VisibilityState::privatised()) withdraws the
 * snapshot instead, so visitors never see data that has since become private.
 *
 * `.pre` takes a shared source-write lock, `.post` releases it.
 * SnapshotStore::quiescent() needs that lock exclusively to capture a revision
 * or commit, and the publisher discards a generation whose corpus read overlaps
 * a write, so no snapshot mixes the states before and after one.
 */
final class SnapshotInvalidation
{
    /** Adapters whose writes can change the public corpus. */
    public const RESOURCES = ['Item', 'Media', 'ItemSet', 'Site', 'ValueAnnotation', 'ResourceTemplate',
        'Property', 'ResourceClass', 'Vocabulary'];
    public const OPERATIONS = ['create', 'update', 'delete', 'batch_create', 'batch_update', 'batch_delete'];

    /**
     * API request => [shared source-write lock, visibility before the write].
     * Weak keys: when a write throws, `.post` never fires, but the request
     * object is freed with its caller, which frees the handle and so the lock.
     */
    private \WeakMap $writes;

    public function __construct()
    {
        $this->writes = new \WeakMap();
    }

    public function __invoke(EventInterface $event): void
    {
        $store = self::storeForWithdrawal();
        if ($store === null) return;
        $request = $event->getParam('request');
        if (!$request instanceof Request) {
            // Not an event Omeka's API manager fires: nothing to compare, fail closed.
            $store->withdraw(automatic: true);
        } elseif (str_ends_with((string) $event->getName(), '.pre')) {
            $lock = $store->beginWrite();
            $this->writes[$request] = ['lock' => $lock, 'before' => $this->visibilityBefore($event, $request)];
            return;
        } else {
            $write = $this->writes[$request] ?? null;
            unset($this->writes[$request]);
            if ($write === null) {
                // `.post` without `.pre` (the caller skipped initialisation): no
                // earlier state to compare, so an update may have hidden anything.
                $this->isVisibilityUpdate($request) ? $store->withdraw(automatic: true) : $store->markChanged();
            } else {
                $before = $write['before'];
                $response = $event->getParam('response');
                $privatised = $before === null || ($before && is_object($response) && method_exists($response, 'getContent')
                    && VisibilityState::privatised($before, VisibilityState::fromEntities($response->getContent())));
                $store->endWrite($write['lock'], $privatised);
            }
        }
        $target = $event->getTarget();
        if (is_object($target) && method_exists($target, 'getServiceLocator')) {
            AutomaticRefresh::queue($target->getServiceLocator());
        }
    }

    /** Withdraw the published snapshot until someone regenerates, if there is one to withdraw. */
    public static function withdraw(): void
    {
        self::storeForWithdrawal()?->withdraw();
    }

    /**
     * What the public could see of the resources an update targets: [] for a
     * write that cannot hide anything, null when that state is unknown (the
     * write is then treated as privatising rather than blocked).
     *
     * @return array<int,array<string,mixed>>|null
     */
    private function visibilityBefore(EventInterface $event, Request $request): ?array
    {
        if (!$this->isVisibilityUpdate($request)) return [];
        $ids = $request->getOperation() === Request::UPDATE ? [$request->getId()] : (array) $request->getIds();
        $ids = array_filter($ids, 'is_numeric');
        if (!$ids) return [];
        $target = $event->getTarget();
        if (!is_object($target) || !method_exists($target, 'getServiceLocator')) return null;
        try {
            return VisibilityState::load($target->getServiceLocator()->get('Omeka\Connection'), $ids);
        } catch (\Throwable) {
            return null;
        }
    }

    private function isVisibilityUpdate(Request $request): bool
    {
        return in_array($request->getOperation(), [Request::UPDATE, Request::BATCH_UPDATE], true)
            && in_array($request->getResource(), VisibilityState::RESOURCES, true);
    }

    /**
     * The store a write must update, or null when nothing was ever published
     * there. A missing or unwritable store with no publication cannot serve
     * stale data, so Omeka writes go through; a publication that cannot be
     * updated still blocks them (the exception propagates).
     */
    private static function storeForWithdrawal(): ?SnapshotStore
    {
        try {
            return new SnapshotStore(SnapshotStore::defaultDirectory());
        } catch (\RuntimeException $e) {
            if (SnapshotStore::hasPublicationAtDefaultPath()) throw $e;
            return null;
        }
    }
}
