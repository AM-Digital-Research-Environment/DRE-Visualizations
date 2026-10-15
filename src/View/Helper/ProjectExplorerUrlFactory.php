<?php
declare(strict_types=1);

namespace DreVisualizations\View\Helper;

use Laminas\ServiceManager\Factory\FactoryInterface;
use Psr\Container\ContainerInterface;

final class ProjectExplorerUrlFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, ?array $options = null): ProjectExplorerUrl
    {
        return new ProjectExplorerUrl($services->get('Omeka\Connection'));
    }
}
