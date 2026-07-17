<?php
declare(strict_types=1);

namespace DreVisualizations\Controller\Admin;

use DreVisualizations\Module;
use Laminas\Http\Response;
use Laminas\Mvc\Controller\AbstractActionController;
use Laminas\View\Model\ViewModel;
use Omeka\Stdlib\Message;
use DreVisualizations\Form\MaintenanceForm;
use DreVisualizations\Job\PrecomputeDashboards;

/**
 * Admin maintenance page for the DreVisualizations module.
 *
 *   indexAction       GET   /admin/dre-visualizations/maintenance
 *     Renders the page with a "Regenerate" button (CSRF-protected POST form).
 *
 *   regenerateAction  POST  /admin/dre-visualizations/maintenance/regenerate
 *     Dispatches DreVisualizations\Job\PrecomputeDashboards as an Omeka
 *     background job and flashes a link to its log at /admin/job/{id}/log.
 *
 * ACL: editor + site-admin + global-admin (granted in Module::onBootstrap).
 */
class MaintenanceController extends AbstractActionController
{
    public function indexAction(): ViewModel
    {
        $services = $this->getEvent()->getApplication()->getServiceManager();
        $siteId = (int) $services->get('Omeka\Settings')->get(Module::SETTING_SITE_ID, 0);
        $scopeSite = $siteId > 0
            ? $services->get('Omeka\Connection')->executeQuery(
                'SELECT id, title, slug FROM site WHERE id = ? AND is_public = 1',
                [$siteId]
            )->fetchAssociative()
            : false;
        return new ViewModel([
            'form' => $this->getForm(MaintenanceForm::class),
            'scopeSite' => $scopeSite ?: null,
        ]);
    }

    public function regenerateAction(): Response
    {
        $request = $this->getRequest();
        if (!$request->isPost()) {
            return $this->redirect()->toRoute('admin/dre-visualizations/maintenance');
        }

        $form = $this->getForm(MaintenanceForm::class);
        $form->setData($request->getPost()->toArray());
        if (!$form->isValid()) {
            $this->messenger()->addError('Invalid form submission. Please reload the page and try again.'); // @translate
            return $this->redirect()->toRoute('admin/dre-visualizations/maintenance');
        }

        $services = $this->getEvent()->getApplication()->getServiceManager();
        $siteId = (int) $services->get('Omeka\Settings')->get(Module::SETTING_SITE_ID, 0);
        $validSite = $siteId > 0 && (bool) $services->get('Omeka\Connection')->executeQuery(
            'SELECT 1 FROM site WHERE id = ? AND is_public = 1',
            [$siteId]
        )->fetchOne();
        if (!$validSite) {
            $this->messenger()->addError(
                'Configure a canonical public site in the DRE Visualizations module settings before regenerating data.' // @translate
            );
            return $this->redirect()->toRoute('admin/dre-visualizations/maintenance');
        }

        $job = $this->jobDispatcher()->dispatch(PrecomputeDashboards::class);

        $jobUrl = $this->url()->fromRoute('admin/id', ['controller' => 'job', 'id' => $job->getId()]);
        $message = new Message(
            'Dashboard regeneration queued — rebuilds every precomputed visualisation (entities, overviews, communities). Track progress: %1$sjob #%2$d%3$s', // @translate
            sprintf('<a href="%s">', htmlspecialchars($jobUrl, ENT_QUOTES, 'UTF-8')),
            $job->getId(),
            '</a>'
        );
        $message->setEscapeHtml(false);
        $this->messenger()->addSuccess($message);

        return $this->redirect()->toRoute('admin/dre-visualizations/maintenance');
    }
}
