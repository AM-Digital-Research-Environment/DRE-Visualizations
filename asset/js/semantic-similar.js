/**
 * Cross-type semantic recommendations on item pages.
 * Depends on dashboard-core.js for moduleAsset(), setChildren(), and i18n.
 */
(function () {
    'use strict';

    var ns = window.RV;
    if (!ns) return;

    function node(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function render(container, payload) {
        var itemId = String(container.getAttribute('data-item-id') || '');
        var neighbours = payload && payload.items && payload.items[itemId];
        var catalog = payload && payload.catalog;
        if (!Array.isArray(neighbours) || !catalog || typeof catalog !== 'object') return;

        var list = node('ol', 'semantic-similar-list');
        neighbours.slice(0, 6).forEach(function (neighbour) {
            var id = Number(neighbour && neighbour.id);
            var record = catalog[String(id)];
            if (!Number.isInteger(id) || id < 1 || !record || record.lowSignal) return;

            var row = node('li', 'semantic-similar-item');
            var link = node('a', 'semantic-similar-link');
            link.href = (container.getAttribute('data-site-base') || '') + '/item/' + id;

            var copy = node('span', 'semantic-similar-copy');
            copy.appendChild(node('span', 'semantic-similar-type', record.typeLabel || record.type || 'Item'));
            copy.appendChild(node('span', 'semantic-similar-title', record.title || ('Item ' + id)));

            var score = Math.max(0, Math.min(100, Math.round(Number(neighbour.score || 0) * 100)));
            var measure = node('span', 'semantic-similar-score', score + '%');
            measure.setAttribute('aria-label', score + '% ' + ns.t('semanticSimilarity', 'match'));

            link.appendChild(copy);
            link.appendChild(measure);
            row.appendChild(link);
            list.appendChild(row);
        });
        if (!list.children.length) return;

        ns.setChildren(container, [list]);
        var block = container.closest('.semantic-similar-block');
        if (block) block.hidden = false;
    }

    function init(container) {
        ns.basePath = container.getAttribute('data-base-path') || '';
        fetch(ns.moduleAsset('data/embeddings/similar.json'), {
            credentials: 'same-origin'
        }).then(function (response) {
            if (!response.ok) throw new Error('Semantic recommendations not found');
            return response.json();
        }).then(function (payload) {
            if (!payload || payload.schemaVersion !== 1) return;
            render(container, payload);
        }).catch(function () {
            // The block is progressive enhancement and intentionally stays
            // hidden until the first embeddings build has been published.
        });
    }

    function start() {
        var containers = document.querySelectorAll('.semantic-similar-container');
        for (var i = 0; i < containers.length; i++) init(containers[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
