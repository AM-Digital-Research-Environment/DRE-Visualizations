<?php
declare(strict_types=1);
// Discover every harness in both CI and releases. Separate processes avoid fixture globals leaking.
$root = dirname(__DIR__);
$failed = false;
foreach (glob($root . '/tests/*Test.php') as $test) {
    passthru(escapeshellarg(PHP_BINARY) . ' -d auto_prepend_file='
        . escapeshellarg($root . '/tests/bootstrap.php') . ' ' . escapeshellarg($test), $status);
    $failed = $failed || $status !== 0;
}
exit($failed ? 1 : 0);
