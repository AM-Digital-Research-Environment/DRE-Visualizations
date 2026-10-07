<?php
declare(strict_types=1);

namespace DreVisualizations\Listener;

use DreVisualizations\Precompute\SnapshotStore;
use Laminas\EventManager\EventInterface;

/**
 * Withdraws the published snapshot around every Omeka API write that can
 * change what it would contain, so visitors never see data that has since
 * become private, and a regeneration overlapping a write is refused.
 *
 * `.pre` withdraws and takes a shared source-write lock; `.post` withdraws
 * again and releases it. SnapshotStore::quiescent() needs that lock exclusively
 * to capture a revision or commit, so no generation can publish a corpus that
 * mixes the states before and after a write.
 */
final class SnapshotInvalidation
{
    /** Adapters whose writes can change the public corpus. */
    public const RESOURCES = ['Item', 'Media', 'ItemSet', 'Site', 'ValueAnnotation', 'ResourceTemplate',
        'Property', 'ResourceClass', 'Vocabulary'];
    public const OPERATIONS = ['create', 'update', 'delete', 'batch_create', 'batch_update', 'batch_delete'];

    /**
     * API request => shared source-write lock. Weak keys: when a write throws,
     * `.post` never fires, but the request object is freed with its caller,
     * which frees the handle and so the lock.
     */
    private \WeakMap $locks;

    public function __construct()
    {
        $this->locks = new \WeakMap();
    }

    public function __invoke(EventInterface $event): void
    {
        $store = self::storeForWithdrawal();
        if ($store === null) return;
        $request = $event->getParam('request');
        if (!is_object($request)) {
            $store->withdraw();
            return;
        }
        if (str_ends_with((string) $event->getName(), '.pre')) {
            $this->locks[$request] = $store->beginWrite();
        } elseif (isset($this->locks[$request])) {
            $lock = $this->locks[$request];
            unset($this->locks[$request]);
            $store->endWrite($lock);
        } else {
            $store->withdraw();
        }
    }

    /** Withdraw the published snapshot, if there is one to withdraw. */
    public static function withdraw(): void
    {
        self::storeForWithdrawal()?->withdraw();
    }

    /**
     * The store a write must withdraw, or null when nothing was ever published
     * there. A missing or unwritable store with no publication cannot serve
     * stale data, so Omeka writes go through; a publication that cannot be
     * withdrawn still blocks them (the exception propagates).
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
