<?php
declare(strict_types=1);

namespace DreVisualizations\Form;

use DreVisualizations\Module;
use Laminas\Form\Element;
use Laminas\Form\Form;

/**
 * The module's configuration form: the canonical public site and the optional
 * basemap / glyph endpoints. Omeka's module page wraps it and checks its own
 * CSRF token before Module::handleConfigForm() runs; validation of the posted
 * values lives in ConfigValues.
 */
final class ConfigForm extends Form
{
    /**
     * @param array<int,string> $siteOptions public sites, id => label
     * @param array<string,string> $values current settings, keyed by setting name
     */
    public function __construct(array $siteOptions, array $values)
    {
        parent::__construct('dre-visualizations-config');
        $this->add([
            'name' => Module::SETTING_SITE_ID,
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Canonical public site', // @translate
                'info' => 'Only public items assigned to this public site enter generated JSON. Regeneration fails closed until a site is selected.', // @translate
                'empty_option' => 'Select a public site', // @translate
                'value_options' => $siteOptions,
            ],
            'attributes' => [
                'id' => Module::SETTING_SITE_ID,
                'value' => $values[Module::SETTING_SITE_ID] ?? '',
                'required' => true,
            ],
        ]);
        $this->text($values, Module::SETTING_BASEMAP_LIGHT,
            'Light basemap style URL', // @translate
            'Optional HTTPS or same-origin MapLibre style JSON. Leave blank for the privacy-safe blank background.' // @translate
        );
        $this->text($values, Module::SETTING_BASEMAP_DARK,
            'Dark basemap style URL', // @translate
            'Optional HTTPS or same-origin MapLibre style JSON. The light style is used as a fallback when blank.' // @translate
        );
        $this->text($values, Module::SETTING_MAP_GLYPHS,
            'Map glyph URL template', // @translate
            'Optional HTTPS or same-origin MapLibre glyph template containing “{fontstack}” and “{range}”. Required for Entity Network labels.' // @translate
        );
        $this->text($values, Module::SETTING_BASEMAP_ATTRIBUTION,
            'Basemap attribution', // @translate
            'Required when a basemap URL is configured, but shown only when that style does not already credit its own sources. Most providers (CARTO included) do credit themselves, so this is normally an unused fallback rather than the text on the map.' // @translate
        );
    }

    private function text(array $values, string $name, string $label, string $info): void
    {
        $this->add([
            'name' => $name,
            'type' => Element\Text::class,
            'options' => ['label' => $label, 'info' => $info],
            'attributes' => ['id' => $name, 'value' => $values[$name] ?? ''],
        ]);
    }
}
