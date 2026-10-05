<?php
declare(strict_types=1);
namespace DreVisualizations\Precompute;

/** Deterministic Barnes-Hut quadtree for the ForceAtlas2 repulsion step. */
final class RepulsionTree
{
    private array $tree;
    public function __construct(private readonly array $x, private readonly array $y, private readonly array $mass)
    {
        $this->tree = $this->build(array_keys($x), 0);
    }

    private function build(array $ids, int $depth): array
    {
        $xmin = $xmax = $this->x[$ids[0]];
        $ymin = $ymax = $this->y[$ids[0]];
        $weight = $cx = $cy = 0.0;
        foreach ($ids as $i) {
            $xmin = min($xmin, $this->x[$i]); $xmax = max($xmax, $this->x[$i]);
            $ymin = min($ymin, $this->y[$i]); $ymax = max($ymax, $this->y[$i]);
            $weight += $this->mass[$i];
            $cx += $this->mass[$i] * $this->x[$i]; $cy += $this->mass[$i] * $this->y[$i];
        }
        $node = ['xmin' => $xmin, 'xmax' => $xmax, 'ymin' => $ymin, 'ymax' => $ymax,
            'size' => max($xmax - $xmin, $ymax - $ymin), 'mass' => $weight,
            'x' => $cx / $weight, 'y' => $cy / $weight];
        if (count($ids) <= 4 || $depth >= 24 || $node['size'] < 1e-12) {
            $node['ids'] = $ids;
            return $node;
        }
        $mx = ($xmin + $xmax) / 2; $my = ($ymin + $ymax) / 2;
        $groups = [];
        foreach ($ids as $i) $groups[($this->x[$i] > $mx ? 1 : 0) + ($this->y[$i] > $my ? 2 : 0)][] = $i;
        ksort($groups);
        $node['children'] = [];
        foreach ($groups as $group) $node['children'][] = $this->build($group, $depth + 1);
        return $node;
    }

    public function force(int $i, float $coefficient, float $theta = 0.6): array
    {
        $fx = $fy = 0.0;
        $this->visit($this->tree, $i, $coefficient, $theta * $theta, $fx, $fy);
        return [$fx, $fy];
    }

    private function visit(array $node, int $i, float $coefficient, float $theta2, float &$fx, float &$fy): void
    {
        if (isset($node['ids'])) {
            foreach ($node['ids'] as $j) {
                if ($i === $j) continue;
                $dx = $this->x[$i] - $this->x[$j]; $dy = $this->y[$i] - $this->y[$j];
                $d2 = $dx * $dx + $dy * $dy;
                if ($d2 <= 0) continue;
                $f = $coefficient * $this->mass[$i] * $this->mass[$j] / $d2;
                $fx += $dx * $f; $fy += $dy * $f;
            }
            return;
        }
        $dx = $this->x[$i] - $node['x']; $dy = $this->y[$i] - $node['y'];
        $d2 = $dx * $dx + $dy * $dy;
        $contains = $this->x[$i] >= $node['xmin'] && $this->x[$i] <= $node['xmax']
            && $this->y[$i] >= $node['ymin'] && $this->y[$i] <= $node['ymax'];
        if (!$contains && $node['size'] * $node['size'] < $theta2 * $d2) {
            $f = $coefficient * $this->mass[$i] * $node['mass'] / $d2;
            $fx += $dx * $f; $fy += $dy * $f;
            return;
        }
        foreach ($node['children'] as $child) $this->visit($child, $i, $coefficient, $theta2, $fx, $fy);
    }
}
