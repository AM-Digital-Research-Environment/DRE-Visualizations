<?php
declare(strict_types=1);

/**
 * Declares every class this module ships against a real Omeka S core.
 *
 * `php -l` only parses a file. PHP checks an override against its parent when
 * the class is *declared*, so a hook whose signature contradicts its Omeka base
 * class lints clean and then fatals as soon as anything loads it — as
 * `getConfigForm(ViewModel)` did against the base `getConfigForm(PhpRenderer)`,
 * blanking every admin page that instantiates the module. Declaring the classes
 * here makes PHP run those inheritance checks in CI.
 *
 * Usage: php scripts/check-module-contract.php <omeka-s-root>
 */

$omekaRoot = rtrim($argv[1] ?? (string) getenv('OMEKA_ROOT'), '/\\');
if ($omekaRoot === '') {
    fwrite(STDERR, "usage: php scripts/check-module-contract.php <omeka-s-root>\n");
    exit(2);
}
$autoload = $omekaRoot . '/vendor/autoload.php';
if (!is_readable($autoload)) {
    fwrite(STDERR, "Omeka S core autoloader not found at $autoload\n");
    exit(2);
}
require $autoload;

$root = str_replace('\\', '/', dirname(__DIR__));
$namespace = 'DreVisualizations\\';
$srcPrefix = $root . '/src/';

// Mirrors Omeka's own module autoloading: <namespace>\Foo => src/Foo.php.
spl_autoload_register(static function (string $class) use ($srcPrefix, $namespace): void {
    if (!str_starts_with($class, $namespace)) {
        return;
    }
    $file = $srcPrefix . str_replace('\\', '/', substr($class, strlen($namespace))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// A fatal declaration error aborts the script, so name the file being declared
// to keep the failure self-describing.
$current = 'Module.php';
register_shutdown_function(static function () use (&$current): void {
    $error = error_get_last();
    if ($current !== '' && $error && ($error['type'] & (E_ERROR | E_COMPILE_ERROR | E_CORE_ERROR))) {
        fwrite(STDERR, "\nwhile declaring $current\n");
    }
});

require $root . '/Module.php';

$paths = [];
foreach (new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($srcPrefix, FilesystemIterator::SKIP_DOTS)
) as $file) {
    if ($file->getExtension() === 'php') {
        $paths[] = str_replace('\\', '/', $file->getPathname());
    }
}
sort($paths);

$failures = [];
$declared = 0;
foreach ($paths as $path) {
    $relative = substr($path, strlen($srcPrefix));
    $current = 'src/' . $relative;
    $class = $namespace . str_replace('/', '\\', substr($relative, 0, -strlen('.php')));
    if (class_exists($class) || interface_exists($class) || trait_exists($class)) {
        $declared++;
        continue;
    }
    $failures[] = "src/$relative does not declare $class";
}
$current = '';

if ($failures) {
    fwrite(STDERR, sprintf("Module contract: %d finding(s)\n", count($failures)));
    foreach ($failures as $failure) {
        fwrite(STDERR, '  ' . $failure . "\n");
    }
    exit(1);
}
printf("Module contract: Module.php and %d src classes load against Omeka S at %s.\n", $declared, $omekaRoot);
