<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
use DreVisualizations\Precompute\{ForceLayout, RepulsionTree};

$x = $y = $mass = [];
for ($i = 0; $i < 600; $i++) {
    $x[] = sqrt($i + 1) * cos($i * 2.39996);
    $y[] = sqrt($i + 1) * sin($i * 2.39996);
    $mass[] = 1.0 + ($i % 4);
}
$tree = new RepulsionTree($x, $y, $mass);
$error = $scale = 0.0;
for ($i = 0; $i < 600; $i += 13) {
    $fx = $fy = 0;
    for ($j = 0; $j < 600; $j++) {
        if ($i === $j) continue;
        $dx = $x[$i] - $x[$j]; $dy = $y[$i] - $y[$j];
        $f = $mass[$i] * $mass[$j] / ($dx * $dx + $dy * $dy);
        $fx += $dx * $f; $fy += $dy * $f;
    }
    [$ax, $ay] = $tree->force($i, 1);
    $error += hypot($ax - $fx, $ay - $fy);
    $scale += hypot($fx, $fy);
}
verify($error / $scale <= 0.03, 'Barnes-Hut aggregate force error stays within 3%');
$edges = [];
for ($i = 1; $i < 180; $i++) $edges[] = [$i - 1, $i, 1];
$a = ForceLayout::layout(180, $edges, [], ['iterations' => 8]);
$b = ForceLayout::layout(180, $edges, [], ['iterations' => 8]);
verify($a === $b, 'Layout remains deterministic');
verify(array_filter($a, static fn (array $p): bool => !is_finite($p[0]) || !is_finite($p[1]) || abs($p[0]) > 1.000001 || abs($p[1]) > 1.000001) === [], 'Layout extent is finite and within the unit square');
$coincident = new RepulsionTree([0, 0], [0, 0], [1, 1]);
verify($coincident->force(0, 1) === [0.0, 0.0], 'Coincident points get a finite (zero) force');
printf("Barnes-Hut regression passed; relative force error %.4f%%.\n", 100 * $error / $scale);
