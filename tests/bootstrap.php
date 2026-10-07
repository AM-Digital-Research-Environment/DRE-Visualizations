<?php
declare(strict_types=1);
spl_autoload_register(static function (string $class): void {
    $prefix = 'DreVisualizations\\';
    if (str_starts_with($class, $prefix)) {
        $path = dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($path)) require_once $path;
    }
});
require_once __DIR__ . '/lib/strict-errors.php';
