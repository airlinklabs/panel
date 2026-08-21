import { describe, it, expect, vi, beforeAll } from 'vitest';

/* al-table runs in a browser; the node test env has no DOM, so these tests
   drive the upgrade through a minimal Element shim supporting attributes,
   classList, descendants, and querySelector(All) on the small set of tag /
   class / attribute selectors al-table uses. */

function matchSelector(el, sel) {
  const segments = sel.trim().split(/\s+/);
  let node = el;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!node) return false;
    if (!matchCompound(node, seg)) return false;
    if (i === 0) return true;
    node = node.parent;
  }
  return false;
}

function matchCompound(el, seg) {
  const tagMatch = /^[a-zA-Z][a-zA-Z0-9]*/.exec(seg);
  if (tagMatch && el.tag !== tagMatch[0]) return false;
  const rest = tagMatch ? seg.slice(tagMatch[0].length) : seg;
  const attrs = rest.match(/\[[^\]]+\]/g) || [];
  const classNames = (rest.match(/\.([a-zA-Z0-9_-]+)/g) || []).map((c) => c.slice(1));
  if (classNames.some((c) => !el.classList.has(c))) return false;
  return attrs.every((a) => {
    const m = /^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]$/.exec(a);
    if (!m) return false;
    const [name, value] = [m[1], m[2]];
    if (value !== undefined) return el.getAttribute(name) === value;
    return el.hasAttribute(name);
  });
}

class FakeEl {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.parent = null;
    this.parentNode = null;
    this.children = [];
    this.listeners = {};
    this._text = '';
    this._innerHTML = '';
    this.style = {};
    this._classListSet = new Set();
    if (attrs.class) String(attrs.class).split(/\s+/).filter(Boolean).forEach((c) => this._classListSet.add(c));
  }
  get dataset() {
    const out = {};
    this.attrs.forEach((v, k) => {
      if (!k.startsWith('data-')) return;
      out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    });
    return out;
  }
  classListContains(cls) { return this.classList.has(cls); }
  get classList() {
    const set = this._classListSet;
    return {
      add: (...c) => c.forEach((x) => set.add(x)),
      has: (c) => set.has(c),
      contains: (c) => set.has(c),
    };
  }
  set classList(v) { this._classListSet = v; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(el) {
    el.parent = this; el.parentNode = this;
    this.children.push(el); return el;
  }
  removeChild(el) {
    const i = this.children.indexOf(el);
    if (i >= 0) this.children.splice(i, 1);
    return el;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
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
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  addEventListener(t, fn) { (this.listeners[t] ||= new Set()).add(fn); }
  removeEventListener(t, fn) { this.listeners[t]?.delete(fn); }
}

function makeTable({ attrs = {}, labels = ['Image', 'Version', 'Status', 'Actions'], rows = 2 } = {}) {
  const table = new FakeEl('table', Object.assign({ class: 'al-table' }, attrs));
  const thead = new FakeEl('thead');
  const thRow = new FakeEl('tr');
  labels.forEach((l) => { const th = new FakeEl('th'); th.textContent = l; thRow.appendChild(th); });
  thead.appendChild(thRow);
  table.appendChild(thead);
  const tbody = new FakeEl('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = new FakeEl('tr');
    labels.forEach(() => { tr.appendChild(new FakeEl('td')); });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const container = new FakeEl('div');
  container.appendChild(table);
  return { table, thead, tbody, container };
}

let alTable;
beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.document = {
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {},
    body: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return new FakeEl(tag); },
  };
  globalThis.MutationObserver = undefined;
  const mod = await import('../public/javascript/shared/al-table.js');
  alTable = mod.default;
});

describe('al-table responsive fallback', () => {
  it('adds the card class and injects data-label from thead into td cells', () => {
    const { table, tbody, container } = makeTable();
    window.alTableScan(container);
    expect(table.classList.has('al-table-card')).toBe(true);
    const firstTd = tbody.querySelectorAll('tr')[0].querySelectorAll('td')[0];
    expect(firstTd.getAttribute('data-label')).toBe('Image');
    const thirdTd = tbody.querySelectorAll('tr')[0].querySelectorAll('td')[2];
    expect(thirdTd.getAttribute('data-label')).toBe('Status');
  });

  it('skips the Actions column so the row-as-card keeps a single action slot', () => {
    const { tbody, container } = makeTable();
    window.alTableScan(container);
    const cells = tbody.querySelectorAll('tr')[0].querySelectorAll('td');
    const last = cells[cells.length - 1];
    expect(last.hasAttribute('data-label')).toBe(false);
  });

  it('skips card fallback when data-table-card="off"', () => {
    const { table, container } = makeTable({ attrs: { 'data-table-card': 'off' } });
    window.alTableScan(container);
    expect(table.classList.has('al-table-card')).toBe(false);
    const firstTd = table.querySelectorAll('td')[0];
    expect(firstTd.hasAttribute('data-label')).toBe(false);
  });

  it('does not enable card mode for a table with fewer than 3 columns', () => {
    const { table, container } = makeTable({ labels: ['Name', 'Actions'] });
    window.alTableScan(container);
    expect(table.classList.has('al-table-card')).toBe(false);
  });

  it('injects a stable empty-state row when there are no data rows', () => {
    const { table, tbody, container } = makeTable({ rows: 0, attrs: { 'data-table-empty': 'No images yet', 'data-table-empty-colspan': '4' } });
    window.alTableScan(container);
    const emptyRow = tbody.querySelector('[data-al-empty]');
    expect(emptyRow).toBeTruthy();
    const cell = emptyRow.querySelector('td');
    expect(cell.textContent).toBe('No images yet');
    expect(cell.colSpan).toBe(4);
  });

  it('removes the placeholder when a real row is present after a refresh', () => {
    const { tbody, container } = makeTable({ rows: 0, attrs: { 'data-table-empty': 'No images yet' } });
    window.alTableScan(container);
    expect(tbody.querySelector('[data-al-empty]')).toBeTruthy();

    const row = new FakeEl('tr');
    row.appendChild(new FakeEl('td'));
    tbody.appendChild(row);
    window.alTableScan(container);

    expect(tbody.querySelector('[data-al-empty]')).toBeNull();
  });

  it('leaves an empty table alone when data-table-empty is absent', () => {
    const { table, container } = makeTable({ rows: 0 });
    window.alTableScan(container);
    expect(table.querySelector('[data-al-empty]')).toBeNull();
  });
});
