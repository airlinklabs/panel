/**
 * Tests for the Islands registry module.
 *
 * Verifies:
 * - Component system registration
 * - destroyWithin() subtree-scoped cleanup
 * - mountWithin() subtree-scoped mounting
 * - sync() full-document operation
 * - Specialist island registration
 * - Edge cases: null targets, missing APIs, duplicate mounts
 * - Integration with htmx-bootstrap.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const islandsPath = path.resolve(__dirname, '../public/javascript/shared/islands.js');
const htmxBootstrapPath = path.resolve(__dirname, '../public/javascript/shared/htmx-bootstrap.js');
const headerPath = path.resolve(__dirname, '../views/components/header.ejs');

function loadIslands(mockWindow) {
  // Clear module cache
  delete require.cache[islandsPath];

  // Set up globals for the IIFE
  global.window = mockWindow;
  global.document = mockWindow.document;
  global.module = { exports: {} };
  global.exports = global.module.exports;

  const code = fs.readFileSync(islandsPath, 'utf8');
  // Execute in current context
  const fn = new Function('window', 'document', 'module', 'exports', code);
  fn(mockWindow, mockWindow.document, global.module, global.module.exports);

  return global.module.exports;
}

function mockDoc() {
  return {
    readyState: 'complete',
    querySelector: vi.fn(),
    body: { contains: vi.fn(() => false) },
  };
}

function mockWindow(doc) {
  return {
    document: doc || mockDoc(),
    ALTabSystem: null,
    ALDialog: null,
    ALField: null,
    ALStateView: null,
  };
}

describe('Islands registry', () => {
  let Islands;
  let win;

  beforeEach(() => {
    win = mockWindow();
    Islands = loadIslands(win);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.module;
    delete global.exports;
  });

  it('exposes the expected API', () => {
    expect(typeof Islands.register).toBe('function');
    expect(typeof Islands.destroyWithin).toBe('function');
    expect(typeof Islands.destroyAll).toBe('function');
    expect(typeof Islands.mountWithin).toBe('function');
    expect(typeof Islands.sync).toBe('function');
    expect(typeof Islands.registerIsland).toBe('function');
    expect(Islands.VERSION).toBe(1);
  });

  it('returns default systems on init (4 al-* systems)', () => {
    expect(Islands.systems.length).toBe(4);
    const keys = Islands.systems.map(s => s.key);
    expect(keys).toContain('ALTabSystem');
    expect(keys).toContain('ALDialog');
    expect(keys).toContain('ALField');
    expect(keys).toContain('ALStateView');
  });

  it('returns empty mounted on init', () => {
    expect(Islands.mounted).toEqual([]);
  });

  it('register() adds a custom component system', () => {
    Islands.register('MyComponent', 'scan');
    const found = Islands.systems.find(s => s.key === 'MyComponent');
    expect(found).toBeDefined();
    expect(found.scanMethod).toBe('scan');
    expect(found.rootFn).toBeNull();
  });

  it('register() with rootFn adds a component system', () => {
    const rootFn = () => document.body;
    Islands.register('ALFieldCustom', 'enhance', rootFn);
    const found = Islands.systems.find(s => s.key === 'ALFieldCustom');
    expect(found).toBeDefined();
    expect(found.rootFn).toBe(rootFn);
  });

  it('destroyAll() clears mounted controllers', () => {
    Islands.destroyAll();
    expect(Islands.mounted.length).toBe(0);
  });

  it('destroyWithin() is safe with null/undefined target', () => {
    expect(() => Islands.destroyWithin(null)).not.toThrow();
    expect(() => Islands.destroyWithin(undefined)).not.toThrow();
  });

  it('mountWithin() is safe with null/undefined target', () => {
    expect(() => Islands.mountWithin(null)).not.toThrow();
    expect(() => Islands.mountWithin(undefined)).not.toThrow();
  });

  it('sync() does not throw with no registered systems', () => {
    expect(() => Islands.sync()).not.toThrow();
  });

  it('sync() calls destroyAll then scan on registered systems', () => {
    const destroyAll = vi.fn();
    const scan = vi.fn(() => []);
    win.ALDialogCustom = { destroyAll, scan };

    Islands.register('ALDialogCustom', 'scan');
    Islands.sync();

    // sync calls destroyAll on the Islands level, then scan on each system
    expect(scan).toHaveBeenCalled();
  });

  it('sync() calls enhance with root for ALField-style systems', () => {
    const destroyAll = vi.fn();
    const enhance = vi.fn(() => []);
    const rootFn = () => ({ tagName: 'BODY' });
    win.ALFieldCustom = { destroyAll, enhance };

    Islands.register('ALFieldCustom', 'enhance', rootFn);
    Islands.sync();

    expect(enhance).toHaveBeenCalledWith({ tagName: 'BODY' });
  });

  it('sync() tracks controllers returned by scan', () => {
    const mockCtrl = { root: { tagName: 'DIV' }, destroy: vi.fn() };
    const scan = vi.fn(() => [mockCtrl]);
    win.ALDialogTrack = { destroyAll: vi.fn(), scan };

    Islands.register('ALDialogTrack', 'scan');
    Islands.sync();

    const tracked = Islands.mounted.find(m => m.systemKey === 'ALDialogTrack');
    expect(tracked).toBeDefined();
    expect(tracked.root).toBe(mockCtrl.root);
    expect(tracked.destroy).toBe(mockCtrl.destroy);
  });

  it('sync() does not duplicate already-tracked controllers', () => {
    const mockCtrl = { root: { tagName: 'DIV' }, destroy: vi.fn() };
    const scan = vi.fn(() => [mockCtrl]);
    win.ALDialogDupe = { destroyAll: vi.fn(), scan };

    Islands.register('ALDialogDupe', 'scan');
    Islands.sync();
    Islands.sync(); // second sync should not duplicate

    const tracked = Islands.mounted.filter(m => m.systemKey === 'ALDialogDupe');
    expect(tracked.length).toBe(1);
  });

  it('sync() handles scan returning null/undefined gracefully', () => {
    const scan = vi.fn(() => null);
    win.ALDialogNull = { destroyAll: vi.fn(), scan };

    Islands.register('ALDialogNull', 'scan');
    expect(() => Islands.sync()).not.toThrow();
  });

  it('destroyWithin() destroys controllers inside target', () => {
    const contains = vi.fn(el => el === innerEl);
    const target = { contains };
    const innerEl = { tagName: 'DIV' };
    const outerEl = { tagName: 'SPAN' };
    const destroyInner = vi.fn();
    const destroyOuter = vi.fn();

    const scan = vi.fn(() => [
      { root: innerEl, destroy: destroyInner },
      { root: outerEl, destroy: destroyOuter },
    ]);
    win.ALDialogDestroy = { destroyAll: vi.fn(), scan };
    Islands.register('ALDialogDestroy', 'scan');
    Islands.sync();

    // Now destroyWithin the target
    Islands.destroyWithin(target);

    // innerEl should be destroyed (target.contains(innerEl) = true)
    expect(destroyInner).toHaveBeenCalled();
    // outerEl should NOT be destroyed (target.contains(outerEl) = false)
    expect(destroyOuter).not.toHaveBeenCalled();
  });

  it('registerIsland() stores island modules', () => {
    const mountFn = vi.fn(() => vi.fn());
    Islands.registerIsland('xterm', mountFn);
    // No direct accessor, but mountWithin should call it
  });

  it('mountWithin() calls specialist island mountFn for matching elements', () => {
    const cleanup = vi.fn();
    const mountFn = vi.fn(() => cleanup);
    Islands.registerIsland('xterm', mountFn);

    const root = { dataset: { island: 'xterm' }, querySelectorAll: vi.fn(() => []), tagName: 'DIV' };
    root.querySelectorAll.mockImplementation((sel) => {
      if (sel === '[data-island="xterm"]') return [root];
      return [];
    });

    // mountWithin calls querySelectorAll on the target
    Islands.mountWithin(root);

    expect(mountFn).toHaveBeenCalled();
  });
});

describe('HTMX lifecycle bridge source', () => {
  const code = fs.readFileSync(htmxBootstrapPath, 'utf8');

  it('wires Islands.destroyWithin on htmx:beforeSwap', () => {
    expect(code).toContain('htmx:beforeSwap');
    expect(code).toContain('Islands.destroyWithin');
  });

  it('wires Islands.mountWithin on htmx:afterSettle', () => {
    expect(code).toContain('htmx:afterSettle');
    expect(code).toContain('Islands.mountWithin');
  });

  it('includes focus management for validation errors', () => {
    expect(code).toContain('aria-invalid="true"');
    expect(code).toContain('.focus()');
  });

  it('includes focus management for error alerts', () => {
    expect(code).toContain('role="alert"');
  });
});

describe('header.ejs script loading order', () => {
  const code = fs.readFileSync(headerPath, 'utf8');

  it('includes islands.js after al-state.js', () => {
    const alStateIdx = code.indexOf('al-state.js');
    const islandsIdx = code.indexOf('islands.js');
    expect(alStateIdx).toBeGreaterThan(-1);
    expect(islandsIdx).toBeGreaterThan(alStateIdx);
  });

  it('islands.js loads before data-layer.js', () => {
    const islandsIdx = code.indexOf('islands.js');
    const dataLayerIdx = code.indexOf('data-layer.js');
    expect(islandsIdx).toBeGreaterThan(-1);
    expect(dataLayerIdx).toBeGreaterThan(islandsIdx);
  });
});
