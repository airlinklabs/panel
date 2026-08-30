import { describe, it, expect, vi, beforeEach } from "vitest";
import ALField from "../public/javascript/shared/al-field.js";

/* al-field runs in a browser; the node test env has no DOM, so these tests
   drive the controller through a minimal Element shim supporting the exact
   operations al-field uses: attributes, classList, closest(), querySelector
   (on data-al-field selectors), dataset, focus(), and events. */

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
    this.className = "";
    this.id = attrs["id"] || "";
    this.dataset = {};
    this.dispatched = [];
    this.classListSet = new Set(
      attrs["class"] ? attrs["class"].split(" ") : [],
    );
    this.classList = {
      add: (c) => this.classListSet.add(c),
      remove: (c) => this.classListSet.delete(c),
      contains: (c) => this.classListSet.has(c),
    };
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

function input(attrs) {
  return new FakeEl("input", attrs);
}

function field(overrides = {}) {
  const f = new FakeEl("div", { "data-al-field": "" });
  const control = new FakeEl("div", { class: "al-field-control" });
  const inp = input(
    Object.assign(
      { type: "password", "data-al-field-input": "", id: "pw" },
      overrides.inputAttrs,
    ),
  );
  const toggle = new FakeEl("button", {
    type: "button",
    "data-al-field-toggle": "",
    "aria-label": "Show password",
    "aria-pressed": "false",
  });
  const msg = new FakeEl("p", {
    class: "al-field-message",
    "data-al-field-message": "",
    id: "pw-msg",
  });
  msg.setAttribute("hidden", "");
  control.appendChild(inp);
  control.appendChild(toggle);
  f.appendChild(control);
  f.appendChild(msg);
  return { f, inp, toggle, msg };
}

function makeScope() {
  const scope = {
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  };
  return scope;
}

describe("al-field controller", () => {
  let scope;

  beforeEach(() => {
    scope = makeScope();
    ALField.setScope(scope);
    ALField.destroyAll();
  });

  it("setError marks the field invalid and associates the message", () => {
    const { f, inp, msg } = field();
    ALField.setError(inp, "Password too short");
    expect(inp.getAttribute("aria-invalid")).toBe("true");
    expect(inp.getAttribute("aria-describedby")).toBe("pw-msg");
    expect(msg.textContent).toBe("Password too short");
    expect(msg.hasAttribute("hidden")).toBe(false);
    expect(f.classListSet.has("al-field-invalid")).toBe(true);
  });

  it("setSuccess shows a positive message without aria-invalid", () => {
    const { f, inp, msg } = field();
    ALField.setSuccess(inp, "Looks good");
    expect(inp.getAttribute("aria-invalid")).toBe("false");
    expect(msg.textContent).toBe("Looks good");
    expect(f.classListSet.has("al-field-success")).toBe(true);
    expect(f.classListSet.has("al-field-invalid")).toBe(false);
  });

  it("clear removes error, message, and aria-describedby", () => {
    const { inp, msg } = field();
    ALField.setError(inp, "Something wrong");
    ALField.clear(inp);
    expect(inp.hasAttribute("aria-invalid")).toBe(false);
    expect(inp.hasAttribute("aria-describedby")).toBe(false);
    expect(msg.hasAttribute("hidden")).toBe(true);
    expect(msg.textContent).toBe("");
  });

  it("emits al:field-error when an error is set", () => {
    const { inp } = field();
    const events = [];
    inp.addEventListener("al:field-error", (e) => events.push(e.detail));
    ALField.setError(inp, "No");
    expect(events.length).toBe(1);
    expect(events[0].message).toBe("No");
  });

  it("toggle reveals the password and updates aria-pressed", () => {
    const { f, inp, toggle } = field();
    ALField.enhance(f);
    toggle.fire("click", { target: toggle, preventDefault: () => {} });
    expect(inp.getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.fire("click", { target: toggle, preventDefault: () => {} });
    expect(inp.getAttribute("type")).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggle swaps the button label when data labels are present", () => {
    const { f, inp, toggle } = field();
    toggle.dataset.labelShow = "Show password";
    toggle.dataset.labelHide = "Hide password";
    ALField.enhance(f);
    toggle.fire("click", { target: toggle, preventDefault: () => {} });
    expect(toggle.textContent).toBe("Hide password");
    expect(toggle.getAttribute("aria-label")).toBe("Hide password");
  });

  it("enhance wires every field in the subtree", () => {
    const root = new FakeEl("div");
    const a = field();
    const b = field();
    root.appendChild(a.f);
    root.appendChild(b.f);
    const ctrls = ALField.enhance(root);
    expect(ctrls.length).toBe(2);
  });

  it("destroy removes the toggle listener", () => {
    const { f, inp, toggle } = field();
    const c = ALField.enhance(f)[0];
    c.destroy();
    toggle.fire("click", { target: toggle, preventDefault: () => {} });
    expect(inp.getAttribute("type")).toBe("password");
  });

  it("exposes the public API surface", () => {
    expect(typeof ALField.enhance).toBe("function");
    expect(typeof ALField.destroyAll).toBe("function");
    expect(typeof ALField.setError).toBe("function");
    expect(typeof ALField.setSuccess).toBe("function");
    expect(typeof ALField.clear).toBe("function");
    expect(ALField.VERSION).toBe(1);
  });
});
