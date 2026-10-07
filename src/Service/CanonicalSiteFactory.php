<?php
declare(strict_types=1);

namespace DreVisualizations\Service;

use Laminas\ServiceManager\Factory\FactoryInterface;
use Psr\Container\ContainerInterface;

final class CanonicalSiteFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, ?array $options = null): CanonicalSite
    {
        return new CanonicalSite($services->get('Omeka\Connection'), $services->get('Omeka\Settings'));
    }
}
