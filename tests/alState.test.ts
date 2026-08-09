import { describe, it, expect, vi, beforeEach } from 'vitest';
import ALStateView from '../public/javascript/shared/al-state.js';

/* al-state runs in a browser; the node test env has no DOM, so these tests
   drive the controller through a minimal Element shim supporting the exact
   operations al-state uses: attributes, classList, closest(), querySelector
   (on data-al-state selectors), dispatchEvent, and bubbling events. */

function matchSelector(el, sel) {
  const alts = sel.split(',').map((s) => s.trim()).filter(Boolean);
  return alts.some((alt) => {
    const segs = alt.match(/\[[^\]]+\]/g) || [];
    return segs.every((seg) => {
      const m = /^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]$/.exec(seg);
      if (!m) return false;
      const [name, value] = [m[1], m[2]];
      if (value !== undefined) return el.getAttribute(name) === value;
      return el.hasAttribute(name);
    });
  });
}

class FakeEl {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.parent = null;
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.dataset = {};
    this.classListSet = new Set(attrs['class'] ? attrs['class'].split(' ') : []);
    this.classList = {
      add: (c) => this.classListSet.add(c),
      remove: (c) => this.classListSet.delete(c),
      contains: (c) => this.classListSet.has(c),
    };
    Object.keys(attrs).forEach((k) => {
      if (k.startsWith('data-')) {
        const camel = k.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = attrs[k];
      }
    });
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  contains(el) { let n = el; while (n) { if (n === this) return true; n = n.parent; } return false; }
  appendChild(el) { el.parent = this; el.parentElement = this; this.children.push(el); return el; }
  focus() { this.focused = true; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (el) => {
      if (matchSelector(el, sel)) out.push(el);
      el.children.forEach(walk);
    };
    this.children.forEach(walk);
    return out;
  }
  closest(sel) {
    let n = this;
    while (n) {
      if (matchSelector(n, sel)) return n;
      n = n.parent;
    }
    return null;
  }
  addEventListener(t, fn) { (this.listeners[t] ||= new Set()).add(fn); }
  removeEventListener(t, fn) { this.listeners[t]?.delete(fn); }
  dispatchEvent(evt) {
    let n = this;
    const seen = new Set();
    while (n && !seen.has(n)) {
      seen.add(n);
      n.listeners[evt.type]?.forEach((fn) => fn(evt));
      n = n.parent;
    }
    return true;
  }
  fire(t, evt) {
    let n = this;
    while (n) {
      n.listeners[t]?.forEach((fn) => fn(evt));
      n = n.parent;
    }
  }
}

function panel(name, extra = {}) {
  const el = new FakeEl('div', Object.assign({ 'data-al-state-panel': name }, extra));
  if (name !== 'loading') el.setAttribute('hidden', '');
  return el;
}

function buildState() {
  const root = new FakeEl('div', { 'data-al-state': '', 'data-al-state-default': 'loading' });
  const loading = panel('loading');
  const empty = panel('empty');
  const error = panel('error', { 'data-al-state-error': 'load' });
  const retryBtn = new FakeEl('button', { 'data-al-state-retry': '', 'data-al-state-retry-loading': 'Retrying…' });
  error.appendChild(retryBtn);
  const offline = panel('offline');
  root.appendChild(loading);
  root.appendChild(empty);
  root.appendChild(error);
  root.appendChild(offline);
  return { root, loading, empty, error, offline, retryBtn };
}

function makeScope() {
  return {
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
  };
}

describe('al-state controller', () => {
  let scope;

  beforeEach(() => {
    scope = makeScope();
    ALStateView.setScope(scope);
    ALStateView.destroyAll();
  });

  it('leaves the server-rendered default visible on mount (no auto-switch)', () => {
    const s = buildState();
    ALStateView.mount(s.root);
    // The server renders the default (loading) panel visible; mounting must
    // not hide it — the page script owns transitions via set().
    expect(s.loading.hasAttribute('hidden')).toBe(false);
    expect(s.empty.hasAttribute('hidden')).toBe(true);
  });

  it('set switches between named states', () => {
    const s = buildState();
    ALStateView.mount(s.root);
    ALStateView.set(s.root, 'empty');
    expect(s.loading.hasAttribute('hidden')).toBe(true);
    expect(s.empty.hasAttribute('hidden')).toBe(false);
    expect(s.root.getAttribute('data-al-state')).toBe('empty');
    ALStateView.set(s.root, 'offline');
    expect(s.offline.hasAttribute('hidden')).toBe(false);
    expect(s.empty.hasAttribute('hidden')).toBe(true);
  });

  it('sets aria-busy only while loading', () => {
    const s = buildState();
    ALStateView.mount(s.root);
    ALStateView.set(s.root, 'loading');
    expect(s.root.getAttribute('aria-busy')).toBe('true');
    ALStateView.set(s.root, 'empty');
    expect(s.root.hasAttribute('aria-busy')).toBe(false);
  });

  it('selects the keyed error panel and hides the rest', () => {
    const s = buildState();
    ALStateView.mount(s.root);
    const shown = ALStateView.set(s.root, 'error', { errorKey: 'load' });
    expect(shown).toBe(s.error);
    expect(s.error.hasAttribute('hidden')).toBe(false);
    expect(s.loading.hasAttribute('hidden')).toBe(true);
    expect(s.root.getAttribute('data-al-state')).toBe('error');
  });

  it('retry button triggers the load function', () => {
    const s = buildState();
    const loadFn = vi.fn();
    ALStateView.mount(s.root, loadFn);
    s.retryBtn.fire('click', { target: s.retryBtn, preventDefault: () => {} });
    expect(loadFn).toHaveBeenCalledTimes(1);
    expect(loadFn).toHaveBeenCalledWith(s.root);
  });

  it('retry disables the button while loading', () => {
    const s = buildState();
    const loadFn = vi.fn();
    ALStateView.mount(s.root, loadFn);
    s.retryBtn.fire('click', { target: s.retryBtn, preventDefault: () => {} });
    expect(s.retryBtn.hasAttribute('disabled')).toBe(true);
    expect(s.retryBtn.textContent).toBe('Retrying…');
  });

  it('fires al:state-change on every transition', () => {
    const s = buildState();
    const events = [];
    s.root.addEventListener('al:state-change', (e) => events.push(e.detail.name));
    ALStateView.mount(s.root);
    ALStateView.set(s.root, 'empty');
    ALStateView.set(s.root, 'offline');
    expect(events).toEqual(['empty', 'offline']);
  });

  it('destroy removes the retry listener', () => {
    const s = buildState();
    const loadFn = vi.fn();
    const c = ALStateView.mount(s.root, loadFn);
    c.destroy();
    s.retryBtn.fire('click', { target: s.retryBtn, preventDefault: () => {} });
    expect(loadFn).not.toHaveBeenCalled();
  });

  it('exposes the public API surface', () => {
    expect(typeof ALStateView.mount).toBe('function');
    expect(typeof ALStateView.scan).toBe('function');
    expect(typeof ALStateView.destroyAll).toBe('function');
    expect(typeof ALStateView.set).toBe('function');
    expect(ALStateView.VERSION).toBe(1);
  });
});
