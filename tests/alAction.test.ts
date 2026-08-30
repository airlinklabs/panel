import { describe, it, expect, vi, beforeEach } from "vitest";
import ALAction from "../public/javascript/shared/al-action.js";

/* al-action runs in a browser; the node test env has no DOM, so these tests
   drive the controller through a minimal Element shim supporting the exact
   operations al-action uses: attributes, classList, dataset, closest(),
   dispatchEvent, and events that bubble to parent listeners. */

function matchSelector(el, sel) {
  const alts = sel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    this.textContent = attrs.label || "";
    this.dataset = {};
    this.offsetWidth = 120;
    this.dispatched = [];
    this.classListSet = new Set(
      attrs["class"] ? attrs["class"].split(" ") : [],
    );
    this.classList = {
      add: (c) => this.classListSet.add(c),
      remove: (c) => this.classListSet.delete(c),
      contains: (c) => this.classListSet.has(c),
    };
    this.style = {};
    // data-* attributes become dataset members, as in the browser.
    Object.keys(attrs).forEach((k) => {
      if (k.startsWith("data-")) {
        const camel = k
          .replace(/^data-/, "")
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = attrs[k];
      }
    });
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  hasAttribute(k) {
    return this.attrs.has(k);
  }
  appendChild(el) {
    el.parent = this;
    el.parentElement = this;
    this.children.push(el);
    return el;
  }
  focus() {
    this.focused = true;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
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
  addEventListener(t, fn) {
    (this.listeners[t] ||= new Set()).add(fn);
  }
  removeEventListener(t, fn) {
    this.listeners[t]?.delete(fn);
  }
  dispatchEvent(evt) {
    this.dispatched.push(evt);
    let n = this;
    const seen = new Set();
    while (n && !seen.has(n)) {
      seen.add(n);
      n.listeners[evt.type]?.forEach((fn) => fn(evt));
      n = n.parent;
    }
    return !evt.defaultPrevented;
  }
  fire(t, evt) {
    let n = this;
    const seen = new Set();
    while (n && !seen.has(n)) {
      seen.add(n);
      n.listeners[t]?.forEach((fn) => fn(evt));
      n = n.parent;
    }
  }
}

function btn(attrs) {
  return new FakeEl("button", attrs);
}

function makeScope() {
  const scope = {
    confirm: vi.fn(() => true),
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
        this.defaultPrevented = false;
      }
      preventDefault() {
        this.defaultPrevented = true;
      }
    },
  };
  return scope;
}

describe("al-action controller", () => {
  let scope;

  beforeEach(() => {
    scope = makeScope();
    ALAction.setScope(scope);
    ALAction.destroyAll();
  });

  it("loading(true) sets aria-busy, disabled, and the loading label", () => {
    const b = btn({
      "data-al-action": "",
      label: "Save",
      "data-action-label": "Saving…",
    });
    ALAction.loading(b, true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(true);
    expect(b.classListSet.has("al-action-loading")).toBe(true);
    expect(b.textContent).toBe("Saving…");
  });

  it("loading(false) restores the original label and removes state", () => {
    const b = btn({
      "data-al-action": "",
      label: "Save",
      "data-action-label": "Saving…",
    });
    ALAction.loading(b, true);
    ALAction.loading(b, false);
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect(b.hasAttribute("disabled")).toBe(false);
    expect(b.classListSet.has("al-action-loading")).toBe(false);
    expect(b.textContent).toBe("Save");
  });

  it("preserves the button width while loading", () => {
    const b = btn({
      "data-al-action": "",
      label: "Save",
      "data-action-label": "Saving…",
    });
    b.offsetWidth = 240;
    ALAction.loading(b, true);
    expect(b.style.minWidth).toBe("240px");
  });

  it("isBusy guards against a second click while loading", () => {
    const b = btn({ "data-al-action": "", label: "Save" });
    const c = ALAction.mount(b);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const e1 = { target: b, preventDefault, stopPropagation };
    // Page starts a request; while busy, a click is swallowed.
    ALAction.loading(b, true);
    b.fire("click", e1);
    expect(c.isBusy()).toBe(true);
    expect(e1.preventDefault).toHaveBeenCalled();
    expect(e1.stopPropagation).toHaveBeenCalled();
  });

  it("fires al:action on click after a confirm passes", async () => {
    const b = btn({
      "data-al-action": "",
      label: "Delete",
      "data-action-confirm": "Really?",
    });
    ALAction.mount(b);
    const fired = [];
    b.addEventListener("al:action", (e) => fired.push(e.detail.button));
    b.fire("click", {
      target: b,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(scope.confirm).toHaveBeenCalledWith("Really?");
    expect(fired.length).toBe(1);
    expect(fired[0]).toBe(b);
  });

  it("does not fire al:action when confirm is cancelled", () => {
    scope.confirm.mockReturnValue(false);
    const b = btn({
      "data-al-action": "",
      label: "Delete",
      "data-action-confirm": "Really?",
    });
    ALAction.mount(b);
    const fired = [];
    b.addEventListener("al:action", (e) => fired.push(e.detail.button));
    b.fire("click", {
      target: b,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(scope.confirm).toHaveBeenCalledWith("Really?");
    expect(fired.length).toBe(0);
  });

  it("setResult flashes success then restores the label", async () => {
    vi.useFakeTimers();
    try {
      const b = btn({ "data-al-action": "", label: "Save" });
      ALAction.setResult(b, "success", "Saved");
      expect(b.classListSet.has("al-action-success")).toBe(true);
      expect(b.textContent).toBe("Saved");
      await vi.advanceTimersByTimeAsync(2700);
      expect(b.textContent).toBe("Save");
      expect(b.classListSet.has("al-action-success")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("setResult with error uses the error class", () => {
    const b = btn({ "data-al-action": "", label: "Save" });
    ALAction.setResult(b, "error", "Failed");
    expect(b.classListSet.has("al-action-error")).toBe(true);
    expect(b.textContent).toBe("Failed");
  });

  it("enhance mounts every [data-al-action] button in the subtree", () => {
    const root = new FakeEl("div");
    const b1 = btn({ "data-al-action": "", label: "A" });
    const b2 = btn({ "data-al-action": "", label: "B" });
    const plain = btn({ label: "C" });
    root.appendChild(b1);
    root.appendChild(b2);
    root.appendChild(plain);
    const ctrls = ALAction.enhance(root);
    expect(ctrls.length).toBe(2);
  });

  it("destroy removes the click listener", () => {
    const b = btn({ "data-al-action": "", label: "Save" });
    const c = ALAction.mount(b);
    const fired = [];
    b.addEventListener("al:action", (e) => fired.push(e.detail.button));
    c.destroy();
    b.fire("click", {
      target: b,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(fired.length).toBe(0);
  });

  it("exposes the public API surface", () => {
    expect(typeof ALAction.enhance).toBe("function");
    expect(typeof ALAction.mount).toBe("function");
    expect(typeof ALAction.destroyAll).toBe("function");
    expect(typeof ALAction.loading).toBe("function");
    expect(typeof ALAction.setResult).toBe("function");
    expect(ALAction.VERSION).toBe(1);
  });
});
