<?php
declare(strict_types=1);
/**
 * The one assertion helper of the plain PHP harnesses (tests/*Test.php and
 * tests/integration/*), loaded by tests/bootstrap.php.
 *
 *   check($condition, $message)   records a failure and carries on, so one
 *                                 run lists every broken expectation;
 *   checkQuietly($condition, $message)
 *                                 check() that reports failures only;
 *   checkSame($expected, $actual, $what)
 *                                 check() of `===`, naming both values when
 *                                 they differ;
 *   verify($condition, $message)  throws on the first failure, for suites
 *                                 whose later steps build on the earlier ones
 *                                 (and run their clean-up in `finally`);
 *   finish($passed)               prints the summary of check() and exits 1
 *                                 when any failed: scripts/test-php.php and CI
 *                                 read the exit status, not the output.
 *
 * Global functions, as the harnesses are plain scripts run one per process.
 */

/** Count of failed check()s in this process; `$add` adds to it. */
function failureCount(int $add = 0): int
{
    static $failures = 0;
    return $failures += $add;
}

function check(bool $condition, string $message): void
{
    if ($condition) {
        echo "ok: $message\n";
        return;
    }
    failureCount(1);
    fwrite(STDERR, "FAIL: $message\n");
}

/** check() that prints failures only: the property tests run thousands. */
function checkQuietly(bool $condition, string $message): void
{
    if (!$condition) {
        check(false, $message);
    }
}

function checkSame(mixed $expected, mixed $actual, string $what): void
{
    check($expected === $actual, $expected === $actual ? $what
        : $what . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
}

function verify(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "ok: $message\n";
}

function finish(string $passed): never
{
    $failures = failureCount();
    if ($failures) {
        fwrite(STDERR, "\n$failures FAILURE(S)\n");
        exit(1);
    }
    echo "\n$passed\n";
    exit(0);
}
