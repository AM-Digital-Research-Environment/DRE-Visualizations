<?php
declare(strict_types=1);
namespace DreVisualizations\Controller\Site;

use DreVisualizations\Module;
use DreVisualizations\Site\BasemapStyle;
use Laminas\Mvc\Controller\AbstractActionController;

/**
 * Serves the self-hosted basemap as a MapLibre style document:
 *
 *   /s/:site-slug/dre-basemap/light
 *   /s/:site-slug/dre-basemap/dark
 *
 * This is the URL window.RV_MAP_CONFIG names when no basemap is configured, so
 * any map on the page — DRE Search's included — can load the module's default
 * basemap by URL. See {@see BasemapStyle}.
 */
final class BasemapController extends AbstractActionController
{
    public function indexAction()
    {
        $response = $this->getResponse();
        $headers = $response->getHeaders();
        $headers->addHeaderLine('Content-Type', 'application/json; charset=utf-8')
            ->addHeaderLine('X-Content-Type-Options', 'nosniff');
        if (!$this->getRequest()->isGet() && !$this->getRequest()->isHead()) {
            return $response->setStatusCode(405)->setContent('');
        }
        $mode = (string) $this->params()->fromRoute('mode');
        if (!in_array($mode, BasemapStyle::MODES, true)) {
            return $response->setStatusCode(404)->setContent('{"error":"Unknown basemap"}');
        }

        // The same paths ns.moduleAsset() builds in the browser, so a page with
        // maps from both modules requests one set of outlines and glyphs.
        $asset = $this->viewHelpers()->get('basePath')() . '/modules/DreVisualizations/asset/';
        $glyphs = trim((string) $this->settings()->get(Module::SETTING_MAP_GLYPHS, ''));
        $style = BasemapStyle::style(
            $mode,
            $asset . 'data/geo/countries.geojson',
            $glyphs !== '' ? $glyphs : $asset . 'fonts/{fontstack}/{range}.pbf',
        );
        // Cacheable briefly: the document changes only with the module or the
        // glyph setting, never with the visitor's light/dark choice.
        $headers->addHeaderLine('Cache-Control', 'public, max-age=3600');
        return $response->setStatusCode(200)->setContent(
            $this->getRequest()->isHead() ? '' : json_encode($style, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        );
    }
}
