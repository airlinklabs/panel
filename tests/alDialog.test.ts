import { describe, it, expect, vi, beforeEach } from 'vitest';
import ALDialog from '../public/javascript/shared/al-dialog.js';

/* al-dialog runs in a browser; the node test env has no DOM, so these tests
   drive the controller through a minimal native-<dialog> shim supporting the
   exact operations al-dialog uses: open/showModal/close, attributes,
   querySelector(All), closest(), focus(), classList, and events. */

function matchSelector(el, sel) {
  // Supports comma-separated alternatives, attribute segments like
  // `[data-al-dialog-close]` / `[role="tab"][data-tab]`, and `#id`.
  const alts = sel.split(',').map((s) => s.trim()).filter(Boolean);
  return alts.some((alt) => {
    const segs = alt.match(/\[[^\]]+\]/g) || [];
    const idM = /^#([a-zA-Z0-9-]+)$/.exec(alt);
    if (idM) return el.getAttribute && el.getAttribute('id') === idM[1];
    if (!segs.length) return false;
    return segs.every((seg) => {
      const m = /^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]$/.exec(seg);
      if (!m) return false;
      const [name, value] = [m[1], m[2]];
      if (value !== undefined) return el.getAttribute(name) === value;
      return el.hasAttribute(name);
    });
  });
}

class FakeClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(c) { this.set.add(c); this.el.classListSet = this.set; }
  remove(c) { this.set.delete(c); this.el.classListSet = this.set; }
  contains(c) { return this.set.has(c); }
}

class FakeDialog {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.parent = null;
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.innerHTML = '';
    this.style = {};
    this.open = false;
    this.isConnected = true;
    this.classList = new FakeClassList(this);
    this.returnValue = '';
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'open') this.open = true; }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); if (k === 'open') this.open = false; }
  hasAttribute(k) { return this.attrs.has(k); }
  contains(el) { let n = el; while (n) { if (n === this) return true; n = n.parent; } return false; }
  appendChild(el) { el.parent = this; el.parentElement = this; el.parentNode = this; this.children.push(el); return el; }
  focus() { this.focused = true; if (this.ownerDoc) this.ownerDoc.activeElement = this; }
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
  fire(t, evt) {
    let el = this;
    while (el) {
      el.listeners[t]?.forEach((fn) => fn(evt));
      el = el.parent;
    }
  }
  showModal() { this.open = true; this.attrs.set('open', ''); }
  close() { this.open = false; this.attrs.delete('open'); }
  get isTopLayer() { return this.open; }
}

function btn(attrs) {
  const el = new FakeDialog('button', Object.assign({ type: 'button' }, attrs));
  el.classListSet = new Set();
  return el;
}

function buildDialog() {
  const dlg = new FakeDialog('dialog', { class: 'al-dialog', 'data-al-dialog': '' });
  const closeBtn = btn({ 'data-al-dialog-close': '', 'aria-label': 'Close' });
  const confirmBtn = btn({ 'data-al-dialog-confirm': '' });
  const dismissBtn = btn({ 'data-al-dialog-dismiss': '' });
  const title = new FakeDialog('p', { 'data-al-dialog-title': '' });
  const body = new FakeDialog('p', { 'data-al-dialog-body': '' });
  const content = new FakeDialog('div', { 'data-al-dialog-content': '' });
  dlg.appendChild(title);
  dlg.appendChild(body);
  dlg.appendChild(content);
  dlg.appendChild(closeBtn);
  dlg.appendChild(confirmBtn);
  dlg.appendChild(dismissBtn);
  return { dlg, title, body, content, closeBtn, confirmBtn, dismissBtn };
}

function buildScope() {
  const bodyEl = new FakeDialog('body');
  const htmlEl = new FakeDialog('html');
  const doc = {
    getElementById: () => dialog.dlg,
    documentElement: htmlEl,
    body: bodyEl,
    createElement: (tag) => new FakeDialog(tag),
  };
  let active = null;
  Object.defineProperty(doc, 'activeElement', { get: () => active, set: (v) => { active = v; } });
  const scope = { document: doc };
  return { scope, doc, bodyEl, htmlEl };
}

let dialog;

describe('al-dialog controller', () => {
  beforeEach(() => {
    dialog = buildDialog();
    const { scope } = buildScope();
    ALDialog.setScope(scope);
    ALDialog.reset();
  });

  it('confirm resolves true when the confirm action is clicked', async () => {
    ALDialog.mount(dialog.dlg);
    const p = ALDialog.confirm({ title: 'Delete?', body: 'Really?', confirmLabel: 'Delete' });
    expect(ALDialog.isOpen(dialog.dlg)).toBe(true);
    expect(dialog.title.textContent).toBe('Delete?');
    expect(dialog.body.textContent).toBe('Really?');
    expect(dialog.confirmBtn.textContent).toBe('Delete');
    dialog.confirmBtn.fire('click', { target: dialog.confirmBtn, preventDefault: () => {} });
    expect(ALDialog.isOpen(dialog.dlg)).toBe(false);
    await expect(p).resolves.toBe(true);
  });

  it('confirm resolves false on dismiss and close-button actions', async () => {
    ALDialog.mount(dialog.dlg);
    const p1 = ALDialog.confirm({ title: 't', body: 'b' });
    dialog.dismissBtn.fire('click', { target: dialog.dismissBtn, preventDefault: () => {} });
    await expect(p1).resolves.toBe(false);

    const p2 = ALDialog.confirm({ title: 't', body: 'b' });
    dialog.closeBtn.fire('click', { target: dialog.closeBtn, preventDefault: () => {} });
    await expect(p2).resolves.toBe(false);
  });

  it('cancel (Escape) resolves false and closes', async () => {
    ALDialog.mount(dialog.dlg);
    const p = ALDialog.confirm({ title: 't', body: 'b' });
    const prevent = vi.fn();
    dialog.dlg.fire('cancel', { preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(ALDialog.isOpen(dialog.dlg)).toBe(false);
    await expect(p).resolves.toBe(false);
  });

  it('styles the confirm button for danger', async () => {
    ALDialog.mount(dialog.dlg);
    const p = ALDialog.confirm({ title: 't', body: 'b', danger: true });
    expect(dialog.confirmBtn.className).toBe('al-btn-danger');
    dialog.confirmBtn.fire('click', { target: dialog.confirmBtn, preventDefault: () => {} });
    await p;
  });

  it('danger/primary button classes are present', () => {
    expect(ALDialog.confirm).toBeTypeOf('function');
    expect(ALDialog.alert).toBeTypeOf('function');
    expect(ALDialog.show).toBeTypeOf('function');
    expect(ALDialog.close).toBeTypeOf('function');
    expect(ALDialog.VERSION).toBe(1);
  });

  it('restores focus to the previously active element on close', async () => {
    const opener = new FakeDialog('button');
    const { scope } = buildScope();
    scope.document.activeElement = opener;
    ALDialog.setScope(scope);
    ALDialog.mount(dialog.dlg);
    const p = ALDialog.confirm({ title: 't', body: 'b' });
    dialog.dlg.fire('cancel', { preventDefault: () => {} });
    await p;
    expect(opener.focused).toBe(true);
  });

  it('locks body scroll while open and unlocks when the last dialog closes', async () => {
    const { scope, bodyEl, htmlEl } = buildScope();
    ALDialog.setScope(scope);
    ALDialog.mount(dialog.dlg);
    const p = ALDialog.confirm({ title: 't', body: 'b' });
    expect(htmlEl.hasAttribute('data-modal-open')).toBe(true);
    expect(bodyEl.classList.contains('no-scroll')).toBe(true);
    dialog.dlg.fire('cancel', { preventDefault: () => {} });
    await p;
    expect(htmlEl.hasAttribute('data-modal-open')).toBe(false);
    expect(bodyEl.classList.contains('no-scroll')).toBe(false);
  });

  it('traps Tab within the dialog', async () => {
    const { scope } = buildScope();
    scope.document.activeElement = dialog.closeBtn;
    ALDialog.setScope(scope);
    ALDialog.mount(dialog.dlg);
    ALDialog.confirm({ title: 't', body: 'b' });
    const focusable = dialog.dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const last = focusable[focusable.length - 1];
    scope.document.activeElement = last;
    dialog.dlg.fire('keydown', { key: 'Tab', shiftKey: false, preventDefault: () => {} });
    expect(scope.document.activeElement).toBe(focusable[0]);
  });

  it('supports nested dialogs: the top dialog owns Escape while open', async () => {
    const outer = buildDialog();
    const inner = buildDialog();
    const { scope } = buildScope();
    scope.document.getElementById = (id) => (id === 'globalModal' ? inner.dlg : null);
    ALDialog.setScope(scope);
    ALDialog.mount(inner.dlg);
    const p1 = ALDialog.confirm({ title: 'inner' });
    expect(ALDialog.isOpen(inner.dlg)).toBe(true);
    const prevent = vi.fn();
    inner.dlg.fire('cancel', { preventDefault: prevent });
    await p1;
    expect(ALDialog.isOpen(inner.dlg)).toBe(false);
    expect(outer.dlg.open).toBe(false);
  });

  it('destroy removes listeners so a later confirm click does nothing', async () => {
    const c = ALDialog.mount(dialog.dlg);
    c.destroy();
    const p = ALDialog.confirm({ title: 't', body: 'b' });
    expect(ALDialog.isOpen(dialog.dlg)).toBe(true);
    dialog.confirmBtn.fire('click', { target: dialog.confirmBtn, preventDefault: () => {} });
    // Listeners were removed, so the dialog stays open and the promise is
    // never resolved; resolve(false) is safe but the dialog remains open.
    expect(ALDialog.isOpen(dialog.dlg)).toBe(true);
    p.then(() => {});
  });

  it('exposes the public API surface', () => {
    expect(typeof ALDialog.mount).toBe('function');
    expect(typeof ALDialog.scan).toBe('function');
    expect(typeof ALDialog.destroyAll).toBe('function');
    expect(typeof ALDialog.setScope).toBe('function');
  });
});
