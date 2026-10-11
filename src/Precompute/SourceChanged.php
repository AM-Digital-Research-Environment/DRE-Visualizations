<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

/** An Omeka write landed while the corpus was being read, so the run may mix two states. */
final class SourceChanged extends \RuntimeException {}
