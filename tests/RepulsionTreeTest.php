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
if ($error / $scale > 0.03) throw new RuntimeException('Barnes-Hut aggregate force error exceeds 3%');
$edges = [];
for ($i = 1; $i < 180; $i++) $edges[] = [$i - 1, $i, 1];
$a = ForceLayout::layout(180, $edges, [], ['iterations' => 8]);
$b = ForceLayout::layout(180, $edges, [], ['iterations' => 8]);
if ($a !== $b) throw new RuntimeException('Layout must remain deterministic');
foreach ($a as [$px, $py]) if (!is_finite($px) || !is_finite($py) || abs($px) > 1.000001 || abs($py) > 1.000001) throw new RuntimeException('Invalid layout extent');
$coincident = new RepulsionTree([0, 0], [0, 0], [1, 1]);
if ($coincident->force(0, 1) !== [0.0, 0.0]) throw new RuntimeException('Coincident points must be finite');
printf("Barnes-Hut regression passed; relative force error %.4f%%.\n", 100 * $error / $scale);
