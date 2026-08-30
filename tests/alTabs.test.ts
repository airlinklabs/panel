import { describe, it, expect, vi, beforeEach } from "vitest";
import ALTabSystem from "../public/javascript/shared/al-tabs.js";

/* al-tabs runs in a browser; the node test env has no DOM, so these tests
   drive the controller through a minimal Element shim supporting the exact
   operations al-tabs uses: attributes, children, querySelector(All) on
   attribute selectors like [role="tab"][data-tab], closest(), and events. */

function matchSelector(el, sel) {
  // Supports one or two bracketed attribute segments, e.g.
  // [role="tab"][data-tab] or [data-al-tabs].
  const segs = sel.match(/\[[^\]]+\]/g) || [];
  return segs.every((seg) => {
    const m = /^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]$/.exec(seg);
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
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.innerHTML = "";
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
  contains(el) {
    let n = el;
    while (n) {
      if (n === this) return true;
      n = n.parent;
    }
    return false;
  }
  appendChild(el) {
    el.parent = this;
    el.parentElement = this;
    el.parentNode = this;
    this.children.push(el);
    return el;
  }
  focus() {
    this.focused = true;
  }
  dispatchEvent() {
    return true;
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
  fire(t, evt) {
    let el = this;
    while (el) {
      el.listeners[t]?.forEach((fn) => fn(evt));
      el = el.parent;
    }
  }
}

function tab(attrs) {
  return new FakeEl("button", Object.assign({ role: "tab" }, attrs));
}

function panel(attrs) {
  return new FakeEl("div", Object.assign({ role: "tabpanel" }, attrs));
}

function makeRoot({ defaultName, hash = false } = {}) {
  const root = new FakeEl("div", { "data-al-tabs": "" });
  if (defaultName) root.attrs.set("data-tabs-default", defaultName);
  if (hash) root.attrs.set("data-tabs-hash", "");
  const list = new FakeEl("div", { role: "tablist" });
  root.appendChild(list);
  return { root, list };
}

function makeScope(initialHash = "") {
  let hash = initialHash;
  const documentEl = new FakeEl("document");
  const hashListeners = new Set();
  const scope = {
    location: {
      pathname: "/admin/settings",
      search: "",
      get hash() {
        return hash;
      },
    },
    history: {
      pushed: [],
      replaced: [],
      pushState(_s, _t, url) {
        this.pushed.push(url);
      },
      replaceState(_s, _t, url) {
        this.replaced.push(url);
      },
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    addEventListener(t, fn) {
      if (t === "hashchange") hashListeners.add(fn);
    },
    removeEventListener(t, fn) {
      if (t === "hashchange") hashListeners.delete(fn);
    },
    document: documentEl,
    fireHashChange() {
      hashListeners.forEach((fn) => fn());
    },
  };
  scope.setHash = (h) => {
    hash = h;
  };
  return scope;
}

function buildSurface() {
  const { root, list } = makeRoot({ defaultName: "installed", hash: true });
  const bInstalled = tab({
    "data-tab": "installed",
    "aria-selected": "true",
    tabindex: "0",
  });
  const bApprovals = tab({
    "data-tab": "approvals",
    "aria-selected": "false",
    tabindex: "-1",
  });
  const bStore = tab({
    "data-tab": "store",
    "aria-selected": "false",
    tabindex: "-1",
  });
  list.appendChild(bInstalled);
  list.appendChild(bApprovals);
  list.appendChild(bStore);
  const pInstalled = panel({ "data-tab-panel": "installed" });
  const pApprovals = panel({ "data-tab-panel": "approvals", hidden: "" });
  const pStore = panel({ "data-tab-panel": "store", hidden: "" });
  root.appendChild(pInstalled);
  root.appendChild(pApprovals);
  root.appendChild(pStore);
  return {
    root,
    list,
    bInstalled,
    bApprovals,
    bStore,
    pInstalled,
    pApprovals,
    pStore,
  };
}

describe("al-tabs controller", () => {
  let world;

  beforeEach(() => {
    world = makeScope("");
    ALTabSystem.setScope(world);
  });

  it("selects the hash name on initial load and pushes nothing", () => {
    world = makeScope("#approvals");
    ALTabSystem.setScope(world);
    const s = buildSurface();
    ALTabSystem.mount(s.root);
    expect(s.bInstalled.getAttribute("aria-selected")).toBe("false");
    expect(s.bApprovals.getAttribute("aria-selected")).toBe("true");
    expect(s.bApprovals.getAttribute("tabindex")).toBe("0");
    expect(s.pApprovals.hasAttribute("hidden")).toBe(false);
    expect(s.pInstalled.hasAttribute("hidden")).toBe(true);
    expect(world.history.pushed).toEqual([]);
    expect(world.history.replaced).toEqual([]);
  });

  it("falls back to the named default and replaces the hash when unknown", () => {
    world = makeScope("#bogus");
    ALTabSystem.setScope(world);
    const s = buildSurface();
    ALTabSystem.mount(s.root);
    expect(s.bInstalled.getAttribute("aria-selected")).toBe("true");
    expect(s.pInstalled.hasAttribute("hidden")).toBe(false);
    expect(s.pApprovals.hasAttribute("hidden")).toBe(true);
    expect(world.history.replaced.length).toBeGreaterThan(0);
    expect(world.history.replaced[0]).toContain("#installed");
    expect(world.history.pushed).toEqual([]);
  });

  it("uses pushState for an intentional click", () => {
    const s = buildSurface();
    ALTabSystem.mount(s.root);
    s.bApprovals.fire("click", {
      target: s.bApprovals,
      preventDefault: () => {},
    });
    expect(s.bApprovals.getAttribute("aria-selected")).toBe("true");
    expect(world.history.pushed).toEqual(["/admin/settings#approvals"]);
  });

  it("moves selection on keyboard arrows and pushes state", () => {
    const s = buildSurface();
    ALTabSystem.mount(s.root);
    s.bInstalled.fire("keydown", {
      target: s.bInstalled,
      key: "ArrowRight",
      preventDefault: () => {},
    });
    expect(s.bApprovals.getAttribute("aria-selected")).toBe("true");
    expect(world.history.pushed).toEqual(["/admin/settings#approvals"]);
    s.bApprovals.fire("keydown", {
      target: s.bApprovals,
      key: "Home",
      preventDefault: () => {},
    });
    expect(s.bInstalled.getAttribute("aria-selected")).toBe("true");
    expect(world.history.pushed[1]).toContain("#installed");
  });

  it("does not write a hash for a nested (hashless) tablist", () => {
    const { root, list } = makeRoot({ defaultName: "basic" }); // no data-tabs-hash
    const bBasic = tab({
      "data-tab": "basic",
      "aria-selected": "true",
      tabindex: "0",
    });
    const bAdvanced = tab({
      "data-tab": "advanced",
      "aria-selected": "false",
      tabindex: "-1",
    });
    list.appendChild(bBasic);
    list.appendChild(bAdvanced);
    root.appendChild(panel({ "data-tab-panel": "basic" }));
    root.appendChild(panel({ "data-tab-panel": "advanced", hidden: "" }));
    ALTabSystem.mount(root);
    bAdvanced.fire("click", { target: bAdvanced, preventDefault: () => {} });
    expect(bAdvanced.getAttribute("aria-selected")).toBe("true");
    expect(world.history.pushed).toEqual([]);
    expect(world.history.replaced).toEqual([]);
  });

  it("restores selection from the hash on hashchange (Back/Forward)", () => {
    const s = buildSurface();
    ALTabSystem.mount(s.root);
    s.bApprovals.fire("click", {
      target: s.bApprovals,
      preventDefault: () => {},
    });
    world.setHash("#store");
    world.fireHashChange();
    expect(s.bStore.getAttribute("aria-selected")).toBe("true");
    expect(s.pStore.hasAttribute("hidden")).toBe(false);
  });

  it("destroy removes listeners so a later click does nothing", () => {
    const s = buildSurface();
    const c = ALTabSystem.mount(s.root);
    c.destroy();
    s.bStore.fire("click", { target: s.bStore, preventDefault: () => {} });
    expect(s.bStore.getAttribute("aria-selected")).toBe("false");
    // hashchange handler removed too
    world.setHash("#store");
    world.fireHashChange();
    expect(s.bStore.getAttribute("aria-selected")).toBe("false");
  });

  it("skip-mounts an inner nested tablist", () => {
    const outer = buildSurface().root;
    const { root, list } = makeRoot({ defaultName: "sub-a" });
    const bA = tab({
      "data-tab": "sub-a",
      "aria-selected": "true",
      tabindex: "0",
    });
    const bB = tab({
      "data-tab": "sub-b",
      "aria-selected": "false",
      tabindex: "-1",
    });
    list.appendChild(bA);
    list.appendChild(bB);
    root.appendChild(panel({ "data-tab-panel": "sub-a" }));
    root.appendChild(panel({ "data-tab-panel": "sub-b", hidden: "" }));
    outer.appendChild(root); // root is nested inside another tabs root
    const c = ALTabSystem.mount(root);
    expect(c).toBeNull();
  });

  it("exposes the public API surface", () => {
    expect(typeof ALTabSystem.mount).toBe("function");
    expect(typeof ALTabSystem.scan).toBe("function");
    expect(typeof ALTabSystem.destroyAll).toBe("function");
    expect(ALTabSystem.VERSION).toBe(1);
  });
});
