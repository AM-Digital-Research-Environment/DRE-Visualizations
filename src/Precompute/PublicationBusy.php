<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

/** Another generation, or an Omeka API write, holds the lock a publication needs. */
final class PublicationBusy extends \RuntimeException {}
