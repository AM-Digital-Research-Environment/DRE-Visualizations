<?php
declare(strict_types=1);

namespace DreVisualizations\View\Helper;

use Laminas\ServiceManager\Factory\FactoryInterface;
use Psr\Container\ContainerInterface;

final class FileUrlFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, ?array $options = null): FileUrl
    {
        return new FileUrl($services->get('Omeka\File\Store'));
    }
}
