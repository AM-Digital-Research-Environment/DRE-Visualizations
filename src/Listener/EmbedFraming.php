<?php
declare(strict_types=1);

namespace DreVisualizations\Listener;

use Laminas\Http\Response;
use Laminas\Mvc\MvcEvent;

/**
 * Replace X-Frame-Options with a permissive CSP frame-ancestors on the
 * /dre-embed routes, so the public, read-only widget can be framed on other
 * origins. X-Frame-Options only understands DENY / SAMEORIGIN — it cannot
 * allowlist origins — which is why the CSP frame-ancestors form is needed.
 *
 * Effective only when the header is set by Omeka/PHP. If the reverse proxy
 * (nginx) adds `X-Frame-Options ... always`, that overrides PHP and must be
 * relaxed for the /dre-embed path there too — but this CSP is then already in
 * place, so only the X-Frame-Options removal is left to do at the proxy.
 */
final class EmbedFraming
{
    public function __invoke(MvcEvent $event): void
    {
        $match = $event->getRouteMatch();
        if (!$match || !str_starts_with((string) $match->getMatchedRouteName(), 'site/dre-embed')) {
            return;
        }
        $response = $event->getResponse();
        if (!$response instanceof Response) {
            return;
        }
        $headers = $response->getHeaders();
        $xfo = $headers->get('X-Frame-Options');
        if ($xfo) {
            foreach (($xfo instanceof \Traversable ? iterator_to_array($xfo) : [$xfo]) as $header) {
                $headers->removeHeader($header);
            }
        }
        // Public read-only widget — any parent may frame it. Swap in an explicit
        // allowlist (e.g. "frame-ancestors 'self' https://slides.example") here if
        // embedding should ever be restricted.
        $headers->addHeaderLine('Content-Security-Policy', 'frame-ancestors *');
    }
}
