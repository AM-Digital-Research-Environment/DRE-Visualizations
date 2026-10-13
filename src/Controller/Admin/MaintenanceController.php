<?php
declare(strict_types=1);

namespace DreVisualizations\Controller\Admin;

use DreVisualizations\Form\MaintenanceForm;
use DreVisualizations\Job\PrecomputeDashboards;
use DreVisualizations\Listener\SnapshotInvalidation;
use DreVisualizations\Precompute\SnapshotStore;
use DreVisualizations\Service\CanonicalSite;
use Laminas\Http\Response;
use Laminas\Mvc\Controller\AbstractActionController;
use Laminas\View\Model\ViewModel;
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
 * ACL: editor + site-admin + global-admin (granted in Module::onBootstrap).
 */
class MaintenanceController extends AbstractActionController
{
    public function __construct(private readonly CanonicalSite $canonicalSite) {}

    public function indexAction(): ViewModel
    {
        return new ViewModel([
            'form' => $this->getForm(MaintenanceForm::class),
            'scopeSite' => $this->canonicalSite->publicSite(),
            'publication' => self::publicationStatus(SnapshotStore::tryDefault()),
        ]);
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
