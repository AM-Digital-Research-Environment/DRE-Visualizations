/**
 * Dashboard core: the copy-embed-code buttons and the snippet they copy.
 *
 * Source file of the generated asset/js/dashboard-core.js (see base.js).
 */
(function () {
    'use strict';

    var ns = window.RV = window.RV || {};

    /* ------------------------------------------------------------------ */
    /*  Embed buttons (copy iframe snippet)                                */
    /* ------------------------------------------------------------------ */

    // The copy-embed-code affordance shared by the on-page visualizations AND the
    // /dre-embed snippet gallery: one snippet builder, one resize listener, one
    // clipboard helper, one button factory — so the embed format lives in exactly
    // one place. A block opts in by stamping data-embed-slug (+ data-site-base) on
    // its container; dashboards get a per-chart button, the single-widget blocks
    // one button for the whole block. Never shown inside an embed (dre-embed-body).

    var EMBED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
    var CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    // Host-side listener that resizes the iframe to the height the embed posts
    // (paired with the reporter in view/dre-visualizations/layout/embed.phtml).
    // Guarded + idempotent, so pasting several snippets on one page installs it
    // once. The escaped <\/script> keeps a copied snippet from closing an inline
    // <script> on the host page; its runtime value is a real </script>.
    /* eslint-disable no-useless-escape -- the escaped <\/script> is deliberate, see above */
    ns.embedListener = "<script>(function(){if(window.__dreEmbedResize)return;window.__dreEmbedResize=1;"
        + "window.addEventListener('message',function(e){if(!e.data||e.data.type!=='dre-embed-height')return;"
        + "var f=document.getElementsByTagName('iframe');for(var i=0;i<f.length;i++){"
        + "if(f[i].contentWindow===e.source){f[i].style.height=e.data.height+'px';}}});})();<\/script>";
    /* eslint-enable no-useless-escape */

    /** Build the copy-paste embed snippet (iframe + the resize listener). */
    ns.embedSnippet = function (src, title, height) {
        var px = Math.max(1, Math.round(Number(height) || 600));
        return '<iframe src="' + ns.escapeHtml(src) + '" title="' + ns.escapeHtml(title || '') + '"'
            + ' loading="lazy" scrolling="no" style="width:100%;border:0;height:' + px + 'px"></iframe>\n'
            + ns.embedListener;
    };

    /** Absolute embed URL for a block (and optional chart key). */
    ns.embedUrl = function (siteBase, slug, chartKey) {
        var origin = (window.location && window.location.origin) || '';
        return origin + siteBase + '/dre-embed/' + slug + (chartKey ? '/' + chartKey : '');
    };

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }

    /** Copy text to the clipboard; resolves whether via the async API or fallback. */
    ns.copyToClipboard = function (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        }
        fallbackCopy(text);
        return Promise.resolve();
    };

    // Briefly swap a button to a "copied" check, then restore its markup/title.
    function flashCopied(btn, restoreHtml, restoreTitle) {
        var copied = ns.t('copied', 'Copied');
        // eslint-disable-next-line no-unsanitized/property -- icon constant + escaped label
        btn.innerHTML = CHECK_ICON + (btn.dataset.embedLabel ? '<span>' + ns.escapeHtml(copied) + '</span>' : '');
        btn.classList.add('rv-toolbar-btn-active');
        btn.title = copied;
        clearTimeout(btn._embedTimer);
        btn._embedTimer = setTimeout(function () {
            // eslint-disable-next-line no-unsanitized/property -- restores the escaped markup built above
            btn.innerHTML = restoreHtml;
            btn.classList.remove('rv-toolbar-btn-active');
            btn.title = restoreTitle;
        }, 1600);
    }

    /**
     * A copy-embed-code button element. opts: { src, title, height, label }.
     * With `label` it renders icon + text (block-level); otherwise icon-only (the
     * dense chart toolbar). Reuses the .rv-toolbar-btn skin, so it follows the DRE
     * theme like every other control.
     */
    ns.makeEmbedButton = function (opts) {
        var labelTxt = opts.label || '';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rv-toolbar-btn rv-embed-btn' + (labelTxt ? ' rv-embed-btn--labeled' : '');
        if (labelTxt) btn.dataset.embedLabel = labelTxt;
        var baseHtml = EMBED_ICON + (labelTxt ? '<span>' + ns.escapeHtml(labelTxt) + '</span>' : '');
        // eslint-disable-next-line no-unsanitized/property -- icon constant + escaped label
        btn.innerHTML = baseHtml;
        var copyTitle = ns.t('copyEmbed', 'Copy the code to put this on another website');
        btn.title = copyTitle;
        btn.setAttribute('aria-label', copyTitle);
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            ns.copyToClipboard(ns.embedSnippet(opts.src, opts.title, opts.height)).then(function () {
                flashCopied(btn, baseHtml, copyTitle);
            });
        });
        return btn;
    };

    /**
     * Per-chart embed buttons for an embeddable dashboard. Adds one button to each
     * chart panel's toolbar — creating the toolbar for map panels that have none
     * (attachToolbar only runs for ECharts charts). No-op off the live site or for
     * a non-embeddable dashboard (no data-embed-slug).
     */
    ns.addEmbedButtons = function (container) {
        if (!container || !container.classList || (document.body && document.body.classList.contains('dre-embed-body'))) return;
        // Per-chart embeds are a dashboard-only surface (the standard async render
        // path). Widgets that reuse ns.renderInto must not get per-chart buttons —
        // their /dre-embed/<slug>/<chart> URL has no single-chart route and 404s.
        var dashboard = container.classList.contains('dashboard-async-container')
            ? container : container.closest('.dashboard-async-container');
        if (!dashboard) return;
        var slug = dashboard.getAttribute('data-embed-slug');
        if (!slug) return;
        var siteBase = dashboard.getAttribute('data-site-base') || '';
        var panels = container.querySelectorAll('.chart-panel');
        for (var i = 0; i < panels.length; i++) {
            (function (panel) {
                var cc = panel.querySelector('[data-chart]');
                var h3 = panel.querySelector('h3');
                if (!cc || !h3) return;
                var key = cc.getAttribute('data-chart');
                var heading = panel.querySelector('.rv-chart-heading');
                var bar = panel.querySelector('.rv-chart-toolbar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.className = 'rv-chart-toolbar';
                    bar.setAttribute('role', 'toolbar');
                    bar.setAttribute('aria-label', ns.t('chartActions', 'Chart actions') + ': ' + (h3.textContent || '').trim());
                    if (heading) heading.appendChild(bar);
                }
                bar.appendChild(ns.makeEmbedButton({
                    src: ns.embedUrl(siteBase, slug, key),
                    title: ns.chartLabel ? ns.chartLabel(key) : ((ns.CHART_LABELS && ns.CHART_LABELS[key]) || key),
                    height: 520
                }));
            })(panels[i]);
        }
    };

    /**
     * Whole-block embed button for the single-visualization blocks (entity
     * network, spatial map, network explorer, compare, project explorer, what's
     * new). Mounted on the stable outer .resource-vis-block wrapper — never the
     * inner container, which the block's own controller rebuilds on render.
     */
    ns.setupBlockEmbedButtons = function () {
        if (document.body && document.body.classList.contains('dre-embed-body')) return;
        var hosts = document.querySelectorAll('[data-embed-slug]:not(.dashboard-async-container)');
        for (var i = 0; i < hosts.length; i++) {
            (function (host) {
                var wrap = host.closest('.resource-vis-block') || host.parentNode;
                if (!wrap || wrap._dreEmbedBtn) return;
                wrap._dreEmbedBtn = true;
                var bar = document.createElement('div');
                bar.className = 'rv-embed-block-toolbar';
                bar.appendChild(ns.makeEmbedButton({
                    src: ns.embedUrl(host.getAttribute('data-site-base') || '', host.getAttribute('data-embed-slug')),
                    title: document.title || host.getAttribute('data-embed-slug'),
                    height: 600,
                    label: ns.t('embedThis', 'Embed this')
                }));
                wrap.insertBefore(bar, wrap.firstChild);
            })(hosts[i]);
        }
    };
})();
