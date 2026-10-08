/**
 * Dashboard core: the module's one icon set — 24×24 stroke path bodies for
 * ns.iconSvg / ns.iconButton (base.js).
 *
 * Every glyph that more than one surface draws lives here, so "save as image"
 * is the same arrow on a chart, the knowledge graph and the entity network, and
 * the fullscreen, copy and close glyphs cannot drift apart. A glyph only one
 * surface ever draws (the stat-card badges, the knowledge graph's label and
 * freeze toggles) may stay beside its code, but anything shared comes from here.
 * The bodies are module-authored constants, never curator data.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    ns.ICONS = {
        // Fullscreen: four corners out / in.
        expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>'
            + '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
        collapse: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>'
            + '<line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
        // Save as image (a download tray) and download data (a sheet).
        save: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
            + '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        csv: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
            + '<path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>',
        // Fill patterns (decals) toggle.
        patterns: '<line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="14" x2="14" y2="4"/>'
            + '<line x1="4" y1="8" x2="8" y2="4"/><line x1="10" y1="20" x2="20" y2="10"/>'
            + '<line x1="16" y1="20" x2="20" y2="16"/>',
        // Copy embed code, and the confirmation that replaces it.
        embed: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        check: '<polyline points="20 6 9 17 4 12"/>',
        close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
        pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>'
            + '<circle cx="12" cy="10" r="3"/>',
        book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5'
            + 'a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
    };
})();
