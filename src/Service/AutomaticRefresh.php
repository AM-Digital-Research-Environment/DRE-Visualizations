<?php
declare(strict_types=1);

namespace DreVisualizations\Service;

use DateTime;
use Doctrine\ORM\EntityManager;
use DreVisualizations\Job\PrecomputeDashboards;
use DreVisualizations\Module;
use DreVisualizations\Precompute\SnapshotStore;
use Omeka\Entity\Job;
use Omeka\Entity\User;
use Omeka\Job\DispatchStrategy\Synchronous;
use Psr\Container\ContainerInterface;

/**
 * Queues a background regeneration after Omeka writes, so a stale snapshot
 * catches up without anyone clicking Regenerate now.
 *
 * Dispatch happens once per PHP process, when it ends: after an admin save, an
 * API call or a whole import job, never mid-write. The job then waits for edits
 * to go quiet (PrecomputeDashboards::refreshAfterEdits()), so a burst of edits
 * costs one regeneration.
 */
final class AutomaticRefresh
{
    private static bool $queued = false;

    public static function queue(ContainerInterface $services): void
    {
        if (self::$queued) return;
        self::$queued = true;
        register_shutdown_function(static function () use ($services): void {
            self::$queued = false;
            self::request($services);
        });
    }

    /**
     * Dispatch a refresh job, unless a refresher is already running (it will
     * see this write), nothing was ever published, or a manual withdrawal
     * waits for Regenerate now. Returns the job id; never throws.
     */
    public static function request(ContainerInterface $services): ?int
    {
        try {
            $store = SnapshotStore::tryDefault();
            if ($store === null || !$store->reading(fn (): bool => $store->refreshAllowed()) || !$store->refreshIdle()) {
                return null;
            }
            if ((int) $services->get('Omeka\Settings')->get(Module::SETTING_SITE_ID, 0) < 1) return null;
            $strategy = $services->get('Omeka\Job\Dispatcher')->getDispatchStrategy();
            // Never run a whole regeneration inside the request that saved an item.
            if ($strategy instanceof Synchronous) return null;

            // Omeka's Dispatcher flushes the request's own entity manager, which
            // could persist changes its caller has not committed to; use a fresh one.
            $main = $services->get('Omeka\EntityManager');
            $entityManager = new EntityManager($main->getConnection(), $main->getConfiguration(), $main->getEventManager());
            $job = new Job();
            $job->setStatus(Job::STATUS_STARTING);
            $job->setClass(PrecomputeDashboards::class);
            $job->setArgs(['trigger' => PrecomputeDashboards::TRIGGER_EDIT]);
            $owner = $services->get('Omeka\AuthenticationService')->getIdentity();
            if ($owner instanceof User) $job->setOwner($entityManager->getReference(User::class, $owner->getId()));
            $entityManager->persist($job);
            $entityManager->flush();
            try {
                $strategy->send($job);
            } catch (\Throwable $e) {
                $job->setStatus(Job::STATUS_ERROR);
                $job->setEnded(new DateTime('now'));
                $job->addLog((string) $e);
                $entityManager->flush();
                throw $e;
            }
            return $job->getId();
        } catch (\Throwable $e) {
            try {
                $services->get('Omeka\Logger')->warn('DreVisualizations: could not queue the automatic refresh: ' . $e->getMessage());
            } catch (\Throwable) {
            }
            return null;
        }
    }
}
