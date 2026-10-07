<?php
declare(strict_types=1);
/**
 * Every notice, warning and deprecation raised by the module is a test
 * failure: without this an "Undefined array key" inside an aggregator prints
 * and the harness still exits 0. Deprecations raised inside a dependency's
 * vendor/ tree (Omeka core's Laminas/Doctrine on a newer PHP) are not ours to
 * fix and are ignored; `@`-suppressed diagnostics stay suppressed.
 */
error_reporting(E_ALL);
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    if (($severity & (E_DEPRECATED | E_USER_DEPRECATED)) && str_contains(str_replace('\\', '/', $file), '/vendor/')) {
        return true;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});
