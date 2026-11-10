import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The client half of DESIGN-INTEGRATION.md "Asynchronous states"
// (asset/js/core/async.js) on its own source, with base.js for ns.el, ns.t and
// ns.setChildren. These replace the substring checks that used to pin the
// aria-busy and "Try again" lines in scripts/check-accessibility-contracts.mjs.
const read = (name) => readFileSync(new URL(`../../asset/js/core/${name}`, import.meta.url), 'utf8');

/** Just enough DOM for async.js: elements with children, attributes and listeners. */
function element(tag) {
    return {
        tagName: tag.toUpperCase(), children: [], attributes: {}, dataset: {}, listeners: {},
        className: '', textContent: '', parentNode: null, previousElementSibling: null, disabled: false,
        get classList() {
            const names = () => this.className.split(/\s+/).filter(Boolean);
            return { contains: (name) => names().includes(name) };
        },
        setAttribute(key, value) { this.attributes[key] = String(value); },
        getAttribute(key) { return this.attributes[key] ?? null; },
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        insertBefore(child, ref) {
            child.parentNode = this;
            this.children.splice(this.children.indexOf(ref), 0, child);
            ref.previousElementSibling = child;
            return child;
        },
        replaceChild(next, old) { next.parentNode = this; this.children[this.children.indexOf(old)] = next; return old; },
        replaceChildren(...nodes) { this.children = []; nodes.forEach((n) => this.appendChild(n)); },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        click() { this.listeners.click?.(); },
        querySelector(selector) {
            const name = selector.replace(/^\./, '');
            for (const child of this.children) {
                if (child.classList.contains(name)) return child;
                const found = child.querySelector(selector);
                if (found) return found;
            }
            return null;
        },
    };
}

function load() {
    const window = { RV: {} };
    const context = { window, document: { documentElement: { lang: 'en' }, createElement: element }, navigator: {} };
    vm.createContext(context);
    vm.runInContext(read('base.js'), context, { filename: 'asset/js/core/base.js' });
    vm.runInContext(read('async.js'), context, { filename: 'asset/js/core/async.js' });
    return window.RV;
}

/** A block as async-surface.phtml renders it: the status node, then the container. */
function surface() {
    const host = element('div');
    const status = element('p');
    status.className = 'rv-dashboard-status rv-async-status';
    const container = element('div');
    host.appendChild(status);
    host.appendChild(container);
    container.previousElementSibling = status;
    return { status, container };
}

test('the rendered status node is reused: work in progress is busy, a terminal state is not', () => {
    const ns = load();
    const { status, container } = surface();
    const state = ns.asyncState(container);
    assert.equal(state.status, status);
    state.loading();
    assert.equal(container.attributes['aria-busy'], 'true');
    assert.equal(container.dataset.state, 'loading');
    assert.equal(status.textContent, 'Loading…');
    state.ready();
    assert.equal(container.attributes['aria-busy'], 'false');
    assert.equal(container.dataset.state, 'ready');
    assert.equal(status.textContent, 'Visualisation ready.');
    for (const [name, message] of [['empty', 'Nothing here.'], ['unavailable', 'Switched off.']]) {
        state.loading();
        state[name](message);
        assert.equal(container.attributes['aria-busy'], 'false', `${name} clears aria-busy`);
        assert.equal(container.dataset.state, name);
        assert.equal(status.textContent, message, `${name} is announced`);
        assert.equal(container.children[0].textContent, message, `${name} is shown`);
    }
});

test('an error shows the message and a "Try again" button that reruns the work', () => {
    const ns = load();
    const { status, container } = surface();
    const state = ns.asyncState(container);
    let retried = 0;
    state.loading();
    state.error('The map could not be loaded.', () => { retried++; state.loading(); });
    assert.equal(container.attributes['aria-busy'], 'false');
    assert.equal(container.dataset.state, 'error');
    assert.equal(status.textContent, 'The map could not be loaded.');
    const notice = container.children[0];
    assert.ok(notice.classList.contains('rv-async-error'));
    const button = notice.children[1];
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.textContent, 'Try again');
    button.click();
    assert.equal(retried, 1);
    assert.equal(button.disabled, true, 'a second click cannot start a second run');
    // The retry's loading() puts the spinner back in the notice's place.
    assert.ok(container.children[0].classList.contains('rv-async-loading'));
    assert.equal(container.children[0].attributes['aria-hidden'], 'true');
    assert.equal(container.attributes['aria-busy'], 'true');
});

test('without a rendered status node, one live region is created before the container', () => {
    const ns = load();
    const host = element('div');
    const container = host.appendChild(element('div'));
    const status = ns.asyncStatusNode(container);
    assert.equal(host.children[0], status);
    assert.deepEqual({ ...status.attributes }, { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    assert.equal(ns.asyncStatusNode(container), status, 'the same node is found again');
});
