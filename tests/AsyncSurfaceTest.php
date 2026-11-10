<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

/**
 * The server half of DESIGN-INTEGRATION.md "Asynchronous states", rendered:
 * view/common/block-layout/partials/async-surface.phtml and the dashboard
 * partial that wraps it, through a stub renderer, parsed as HTML. These
 * replace the substring checks on the template source that
 * scripts/check-accessibility-contracts.mjs used to make; the client half is
 * tests/js/async.test.mjs.
 */

final class AsyncSurfaceView
{
    public array $assets = [];

    public function translate(string $text): string
    {
        return $text;
    }

    public function escapeHtml(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public function escapeHtmlAttr(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public function basePath(): string
    {
        return '/omeka';
    }

    public function currentSite(): object
    {
        return new class {
            public function slug(): string
            {
                return 'amira';
            }
        };
    }

    public function dashboardAssets(array $options): void
    {
        $this->assets[] = $options;
    }

    public function partial(string $name, array $vars): string
    {
        return $this->render(dirname(__DIR__) . '/view/' . $name . '.phtml', $vars);
    }

    /** Include a template with `$this` bound to this view, as PhpRenderer does. */
    public function render(string $template, array $vars): string
    {
        return (function (string $__template, array $__vars): string {
            extract($__vars);
            ob_start();
            include $__template;
            return (string) ob_get_clean();
        })($template, $vars);
    }
}

function surfaceDocument(string $html): \Dom\HTMLDocument
{
    return \Dom\HTMLDocument::createFromString('<!doctype html><html><body>' . $html . '</body></html>', LIBXML_NOERROR);
}

$view = new AsyncSurfaceView();
$partial = dirname(__DIR__) . '/view/common/block-layout/partials/async-surface.phtml';

// The default form: the live region BEFORE the container, so a controller that
// replaces the container's children never destroys it.
$doc = surfaceDocument($view->render($partial, [
    'class' => 'photo-browse-stage',
    'data' => ['view' => 'grid', 'skipped' => null, 'title' => 'A "quoted" <title>'],
]));
$status = $doc->querySelector('p.rv-async-status');
$container = $doc->querySelector('.photo-browse-stage');
check($status !== null && $container !== null, 'the partial renders a status node and the container');
check($status?->classList->contains('rv-dashboard-status') === true, 'the status node carries the visually hidden class');
checkSame(['status', 'polite', 'true'], [$status?->getAttribute('role'), $status?->getAttribute('aria-live'), $status?->getAttribute('aria-atomic')],
    'the status node is a polite, atomic live region');
checkSame('Loading…', trim((string) $status?->textContent), 'the status node says "Loading…" until the script speaks');
check($status?->nextElementSibling === $container, 'the status node is the container\'s previous sibling');
check($doc->querySelector('[aria-busy]') === null, 'nothing is aria-busy server-side: a page without JavaScript must not stay busy');
checkSame(['/omeka', '/omeka/s/amira', 'grid', 'A "quoted" <title>'],
    [$container?->getAttribute('data-base-path'), $container?->getAttribute('data-site-base'), $container?->getAttribute('data-view'), $container?->getAttribute('data-title')],
    'the container carries the base paths and the data attributes, escaped');
check($container?->hasAttribute('data-skipped') === false, 'a null data attribute is left out');
$spinner = $container?->querySelector('.rv-loading.rv-async-loading');
checkSame('true', $spinner?->getAttribute('aria-hidden'), 'the spinner is hidden from assistive technology');
check($spinner?->querySelector('.rv-spinner') !== null && trim((string) $spinner?->querySelector('span')?->textContent) === 'Loading…',
    'the spinner shows the wheel and "Loading…"');
check(str_contains((string) $container?->querySelector('noscript')?->textContent, 'This visualisation needs JavaScript.'),
    'without JavaScript the reserved space says the visualisation needs it');
checkSame(1, $doc->querySelectorAll('[role="status"]')->length, 'one live region per surface');

// The dashboard form, through the dashboard partial: the status node inside
// the container, the content area after it.
$doc = surfaceDocument($view->render(dirname(__DIR__) . '/view/common/block-layout/partials/dashboard-async.phtml', [
    'itemId' => 'collection-overview', 'slug' => 'collection-overview', 'layout' => 'collectionOverview', 'plan' => 'dashboard',
]));
$container = $doc->querySelector('.dashboard-block > .dashboard-async-container');
$status = $container?->firstElementChild;
check($status !== null && $status->matches('p.rv-dashboard-status.rv-async-status[role="status"][aria-live="polite"][aria-atomic="true"]'),
    'a dashboard keeps its live region first inside its container');
check($status?->nextElementSibling?->matches('.rv-dashboard-content') === true
    && $status->nextElementSibling->querySelector('.rv-async-loading[aria-hidden="true"]') !== null,
    'the dashboard content area follows it and holds the spinner');
checkSame(['collection-overview', 'collectionOverview', 'collection-overview', 'Visualisations ready.', 'No visualisations are available.', 'The visualisation could not be loaded.'],
    array_map(static fn (string $name): ?string => $container?->getAttribute('data-' . $name), ['item-id', 'layout', 'embed-slug', 'ready-status', 'empty-status', 'error-status']),
    'the dashboard container names its artifact, layout, embed slug and the three outcome messages');
check($doc->querySelector('[aria-busy]') === null, 'the dashboard is not aria-busy server-side either');
checkSame([['plan' => 'dashboard']], $view->assets, 'the dashboard partial asks DashboardAssets for its plan, once');

finish('Async surface passed.');
