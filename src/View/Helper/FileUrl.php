<?php
declare(strict_types=1);

namespace DreVisualizations\View\Helper;

use Laminas\View\Helper\AbstractHelper;
use Omeka\File\Store\StoreInterface;

/**
 * URL of a stored media file, resolved through Omeka's configured file store
 * (local `files/`, S3, …) — the precomputed galleries carry only storage ids.
 *
 *   $this->dreFileUrl('large', $storageId)          // derivative, always .jpg
 *   $this->dreFileUrl('original', $storageId, 'tif')
 */
final class FileUrl extends AbstractHelper
{
    public function __construct(private readonly StoreInterface $store) {}

    public function __invoke(string $type, string $storageId, string $extension = 'jpg'): string
    {
        $path = $type . '/' . $storageId . ($extension !== '' ? '.' . $extension : '');
        return (string) $this->store->getUri($path);
    }
}
