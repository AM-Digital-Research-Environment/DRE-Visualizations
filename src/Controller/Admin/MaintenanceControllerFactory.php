<?php
declare(strict_types=1);

namespace DreVisualizations\Controller\Admin;

use DreVisualizations\Service\CanonicalSite;
use Laminas\ServiceManager\Factory\FactoryInterface;
use Psr\Container\ContainerInterface;

final class MaintenanceControllerFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, ?array $options = null): MaintenanceController
    {
        return new MaintenanceController($services->get(CanonicalSite::class));
    }
}
