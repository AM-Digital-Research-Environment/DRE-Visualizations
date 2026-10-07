<?php
declare(strict_types=1);

namespace DreVisualizations\Form;

use Laminas\Form\Element\Csrf;
use Laminas\Form\Form;

/**
 * Minimal CSRF-only form for the admin maintenance page. The operation
 * (regenerate or withdraw) is the route the form posts to, not a payload field.
 */
class MaintenanceForm extends Form
{
    public function init(): void
    {
        $this->add([
            'name' => 'rv_maintenance_csrf',
            'type' => Csrf::class,
            'options' => [
                'csrf_options' => ['timeout' => 600],
            ],
        ]);
    }
}
