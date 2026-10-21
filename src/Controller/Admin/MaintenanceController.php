<?php
declare(strict_types=1);

namespace DreVisualizations\Controller\Admin;

use Doctrine\DBAL\Connection;
use DreVisualizations\Form\MaintenanceForm;
use DreVisualizations\Job\PrecomputeDashboards;
use DreVisualizations\Listener\SnapshotInvalidation;
use DreVisualizations\Precompute\EmbeddingInputs;
use DreVisualizations\Precompute\EmbeddingWorkflow;
use DreVisualizations\Precompute\ScopedInput;
use DreVisualizations\Precompute\SnapshotStore;
use DreVisualizations\Service\CanonicalSite;
use DreVisualizations\Site\ResourcePagePlacement;
use Laminas\Http\Response;
use Laminas\Mvc\Controller\AbstractActionController;
use Laminas\View\Model\ViewModel;
use Omeka\Mvc\Controller\Plugin\Messenger;
use Omeka\Stdlib\Message;

/**
 * Admin maintenance page for the DreVisualizations module.
 *
 *   indexAction       GET   /admin/dre-visualizations/maintenance
 *     Renders the page with "Regenerate" and "Withdraw" buttons (one
 *     CSRF-protected form posting to either action).
 *
 *   regenerateAction  POST  /admin/dre-visualizations/maintenance/regenerate
 *     Dispatches DreVisualizations\Job\PrecomputeDashboards as an Omeka
 *     background job and flashes a link to its log at /admin/job/{id}/log.
 *
 *   withdrawAction    POST  /admin/dre-visualizations/maintenance/withdraw
 *     Stops serving the published snapshot until the next manual regeneration;
 *     the automatic refresh after edits does not republish it.
 *
 *   placeBlockAction  POST  /admin/dre-visualizations/maintenance/place-block
 *     Adds the Visualisations block to the saved item-page configuration of
 *     every site the user may edit that lacks it (Site\ResourcePagePlacement),
 *     the same repair install and the 2.38.0 upgrade run.
 *
 *   rebuildEmbeddingsAction  POST  /admin/dre-visualizations/maintenance/rebuild-embeddings
 *     Starts the embeddings workflow on GitHub with the token saved in the
 *     module configuration, as that page's rebuild button does.
 *
 * ACL: editor + site-admin + global-admin (granted in Module::onBootstrap).
 */
class MaintenanceController extends AbstractActionController
{
    public function __construct(
        private readonly CanonicalSite $canonicalSite,
        private readonly Connection $connection,
        private readonly EmbeddingWorkflow $workflow,
    ) {}

    public function indexAction(): ViewModel
    {
        $scopeSite = $this->canonicalSite->publicSite();
        $store = SnapshotStore::tryDefault();
        return new ViewModel([
            'form' => $this->getForm(MaintenanceForm::class),
            'scopeSite' => $scopeSite,
            'publication' => self::publicationStatus($store),
            'embeddings' => self::embeddingStatus($store, $scopeSite === null ? 0 : (int) $scopeSite['id']),
            'hasToken' => $this->workflow->hasToken(),
            'placements' => ResourcePagePlacement::states($this->connection),
        ]);
    }

    /**
     * Flash what became of a request for an embeddings build: a link to follow
     * it, or why GitHub did not start it. Shared with the configuration page.
     */
    public static function reportRebuild(Messenger $messenger, ?string $error): void
    {
        if ($error !== null) {
            $messenger->addError(new Message('The semantic embeddings were not rebuilt: %s', $error)); // @translate
            return;
        }
        $message = new Message(
            'GitHub is rebuilding the semantic embeddings. It takes about five minutes; the site then downloads the build and refreshes the semantic map by itself. %1$sFollow the build on GitHub%2$s.', // @translate
            sprintf('<a href="%s" target="_blank" rel="noopener">', htmlspecialchars(EmbeddingWorkflow::PAGE, ENT_QUOTES, 'UTF-8')),
            '</a>'
        );
        $message->setEscapeHtml(false);
        $messenger->addSuccess($message);
    }

    /**
     * The installed semantic-map build and whether it was made for the current
     * revision; null before anything was published.
     *
     * @return array{tag:?string,matches:bool,carried:bool,installedAt:int,checkedAt:int,error:?string}|null
     */
    public static function embeddingStatus(?SnapshotStore $store, int $siteId): ?array
    {
        $revision = $store?->reading(fn (): ?string => $store->readRevision());
        if ($store === null || $revision === null || $siteId < 1) return null;
        return EmbeddingInputs::forStore($store->directory, static fn (): ?string => null)
            ->status(['siteId' => $siteId, 'revision' => $revision, 'profile' => ScopedInput::profileHash()],
                static fn (string $built): ?array => $store->hiddenSince($built));
    }

    /**
     * What visitors currently get: 'current', 'stale' (an automatic refresh
     * follows), 'withdrawn-private' (likewise), 'withdrawn' (waits for
     * Regenerate now) or 'none'.
     *
     * @return array{state:string,createdAt:?string,changedAt:int}
     */
    public static function publicationStatus(?SnapshotStore $store): array
    {
        $status = $store?->reading(function () use ($store): array {
            $manifest = $store->manifest();
            $state = match (true) {
                $manifest !== null => $store->isFresh() ? 'current' : 'stale',
                $store->withdrawnByHand() => 'withdrawn',
                $store->refreshAllowed() => 'withdrawn-private',
                default => 'none',
            };
            return ['state' => $state, 'createdAt' => $manifest['createdAt'] ?? null, 'changedAt' => $store->changes()['changedAt']];
        });
        return $status ?? ['state' => 'none', 'createdAt' => null, 'changedAt' => 0];
    }

    public function regenerateAction(): Response
    {
        if (!$this->validPost()) {
            return $this->backToIndex();
        }
        if ($this->canonicalSite->publicSite() === null) {
            $this->messenger()->addError(
                'Configure a canonical public site in the DRE Visualizations module settings before regenerating data.' // @translate
            );
            return $this->backToIndex();
        }

        $job = $this->jobDispatcher()->dispatch(PrecomputeDashboards::class);

        // Straight to the log, which the job writes as it runs.
        $jobUrl = $this->url()->fromRoute('admin/id', ['controller' => 'job', 'action' => 'log', 'id' => $job->getId()]);
        $message = new Message(
            'Dashboard regeneration queued — rebuilds every precomputed visualisation (entities, overviews, communities). Track progress: %1$sjob #%2$d%3$s', // @translate
            sprintf('<a href="%s">', htmlspecialchars($jobUrl, ENT_QUOTES, 'UTF-8')),
            $job->getId(),
            '</a>'
        );
        $message->setEscapeHtml(false);
        $this->messenger()->addSuccess($message);

        return $this->backToIndex();
    }

    public function withdrawAction(): Response
    {
        if ($this->validPost()) {
            SnapshotInvalidation::withdraw();
            $this->messenger()->addSuccess('Published visualizations withdrawn. They stay hidden until you regenerate.'); // @translate
        }
        return $this->backToIndex();
    }

    public function placeBlockAction(): Response
    {
        if ($this->validPost()) {
            // Only the sites whose settings this user may change.
            $titles = [];
            foreach ($this->api()->search('sites')->getContent() as $site) {
                if ($site->userIsAllowed('update')) $titles[(int) $site->id()] = (string) $site->title();
            }
            $changed = $titles ? ResourcePagePlacement::repair($this->connection, array_keys($titles)) : [];
            $changedTitles = array_map(static fn (int $id): string => $titles[$id], $changed);
            if ($changed) {
                $this->messenger()->addSuccess(new Message(
                    'Added the Visualisations block to the item pages of these sites: %s.', // @translate
                    implode(', ', $changedTitles)
                ));
            } else {
                $this->messenger()->addSuccess('Every site you can edit already shows the Visualisations block on item pages.'); // @translate
            }
        }
        return $this->backToIndex();
    }

    public function rebuildEmbeddingsAction(): Response
    {
        if ($this->validPost()) self::reportRebuild($this->messenger(), $this->workflow->dispatch());
        return $this->backToIndex();
    }

    /** A POST carrying the maintenance form's valid CSRF token; flashes an error otherwise. */
    private function validPost(): bool
    {
        $request = $this->getRequest();
        if (!$request->isPost()) {
            return false;
        }
        $form = $this->getForm(MaintenanceForm::class);
        $form->setData($request->getPost()->toArray());
        if (!$form->isValid()) {
            $this->messenger()->addError('Invalid form submission. Please reload the page and try again.'); // @translate
            return false;
        }
        return true;
    }

    private function backToIndex(): Response
    {
        return $this->redirect()->toRoute('admin/dre-visualizations/maintenance');
    }
}
