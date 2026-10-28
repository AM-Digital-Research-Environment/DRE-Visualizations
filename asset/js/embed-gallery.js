/**
 * Embed snippet gallery (/s/<site>/dre-embed): copy buttons, the code previews
 * and each dashboard card's single-chart menu, built from RV.LAYOUTS +
 * RV.CHART_LABELS and the block's precomputed JSON.
 *
 * Loaded by view/dre-visualizations/embed/index.phtml as a file; its URLs and
 * labels come from the inert JSON in #dre-embed-gallery-config.
 * Depends on: dashboard-core.js (RV.embedSnippet, RV.fetchDataJson,
 * RV.copyToClipboard, RV.announce) and the chart bundle (RV.LAYOUTS).
 */
(function () {
    'use strict';

    var RV = window.RV || {};
    // Labels and URLs the template hands over as inert JSON, so the gallery
    // page carries no inline script.
    var node = document.getElementById('dre-embed-gallery-config');
    var config;
    try { config = JSON.parse(node ? node.textContent : '{}') || {}; } catch (e) { config = {}; }
    var basePath = config.basePath || '';
    var embedBase = config.embedBase || '';
    var copyLabel = config.copyLabel || 'Copy';
    var doneLabel = config.doneLabel || 'Copied';
    var previewLabel = config.previewLabel || 'Preview';
    var chartsHeading = config.chartsHeading || 'Or embed a single chart';
    function hasData(d) {
        return Array.isArray(d) ? d.length > 0 : (!!d && typeof d === 'object' && Object.keys(d).length > 0);
    }

    // Build a copy button's snippet from its data-embed-* attributes via the
    // shared builder in dashboard-core.js (the single source for the iframe +
    // resize-listener format), so the gallery never restates it.
    function snippetFor(btn) {
        var src = btn.getAttribute('data-embed-src');
        if (!src) return '';
        var height = parseInt(btn.getAttribute('data-embed-height'), 10) || 600;
        return RV.embedSnippet
            ? RV.embedSnippet(src, btn.getAttribute('data-embed-title') || '', height)
            : '<iframe src="' + src + '" loading="lazy" style="width:100%;border:0;height:' + height + 'px"></iframe>';
    }

    // Copy via event delegation, so the per-chart buttons added later work too.
    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.dre-embed-copy') : null;
        if (!btn) return;
        var done = function () {
            // Copy feedback as everywhere else: "Copied" for 2000 ms, announced.
            btn.textContent = doneLabel; btn.classList.add('copied');
            if (RV.announce) RV.announce(doneLabel);
            setTimeout(function () { btn.textContent = copyLabel; btn.classList.remove('copied'); }, 2000);
        };
        var text = snippetFor(btn);
        if (RV.copyToClipboard) { RV.copyToClipboard(text).then(done, done); }
        else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); }
        else { done(); }
    });

    // Mirror the generated code in each whole-block card's <pre> (same builder,
    // so the preview matches exactly what Copy yields).
    function fillPreviews() {
        var btns = document.querySelectorAll('.dre-embed-code .dre-embed-copy[data-embed-src]');
        for (var i = 0; i < btns.length; i++) {
            var code = btns[i].parentNode.querySelector('pre code');
            if (code) code.textContent = snippetFor(btns[i]);
        }
    }

    // Populate a dashboard card's single-chart menu from the real layout + labels
    // and the precomputed JSON (only charts that carry data are offered).
    function fillCharts(host) {
        var LAYOUTS = RV.LAYOUTS || {};
        var LABELS = RV.CHART_LABELS || {};
        var slug = host.getAttribute('data-embed-charts');
        var itemId = host.getAttribute('data-item-id');
        var layoutKey = host.getAttribute('data-layout');
        var order = (LAYOUTS[layoutKey] && LAYOUTS[layoutKey].order) || [];
        if (!order.length) return;
        RV.basePath = basePath;
        RV.fetchDataJson('item-dashboards/' + encodeURIComponent(itemId) + '.json').then(function (data) {
            if (!data) return;
            var seen = {};
            var keys = order.filter(function (k) {
                if (seen[k] || !hasData(data[k])) return false;
                seen[k] = true; return true;
            });
            if (!keys.length) return;
            var h3 = document.createElement('h3');
            h3.className = 'dre-embed-charts-title';
            h3.textContent = chartsHeading;
            var ul = document.createElement('ul');
            ul.className = 'dre-embed-viz-list';
            keys.forEach(function (k) {
                var label = LABELS[k] || k;
                var src = embedBase + '/' + slug + '/' + k;
                var li = document.createElement('li');
                li.className = 'dre-embed-viz';
                var lab = document.createElement('span');
                lab.className = 'dre-embed-viz-label';
                lab.textContent = label;
                var key = document.createElement('code');
                key.className = 'dre-embed-viz-key';
                key.textContent = k;
                var open = document.createElement('a');
                open.className = 'dre-embed-viz-open';
                open.href = src; open.target = '_blank'; open.rel = 'noopener';
                open.textContent = previewLabel;
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dre-embed-copy dre-embed-copy--sm';
                btn.textContent = copyLabel;
                btn.setAttribute('data-embed-src', src);
                btn.setAttribute('data-embed-title', label);
                btn.setAttribute('data-embed-height', '520');
                li.appendChild(lab); li.appendChild(key); li.appendChild(open); li.appendChild(btn);
                ul.appendChild(li);
            });
            host.appendChild(h3); host.appendChild(ul);
        }).catch(function () {});
    }

    // RV.LAYOUTS / RV.CHART_LABELS are defined by deferred module scripts, which
    // run before DOMContentLoaded — so enumerate then.
    function start() {
        fillPreviews();
        var hosts = document.querySelectorAll('[data-embed-charts]');
        for (var i = 0; i < hosts.length; i++) fillCharts(hosts[i]);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
