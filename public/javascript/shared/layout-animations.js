(function () {
  var _rootStyle = getComputedStyle(document.documentElement);
  var MOVE_MS = 340;
  var EASE_MOVE =
    _rootStyle.getPropertyValue("--ease-standard").trim() ||
    "cubic-bezier(0.4, 0, 0.2, 1)";
  const DEFAULT_DURATION = 260;
  const DEFAULT_STAGGER = 40;
  const POSITION_THRESHOLD = 1;
  const SPA_REATTACH_MS = 60;

  const animating = new WeakSet();

  const SKIP_TAGS = new Set([
    "CANVAS",
    "SVG",
    "IMG",
    "BUTTON",
    "INPUT",
    "SELECT",
    "SCRIPT",
    "STYLE",
    "A",
  ]);
  const SKIP_CLASS_FRAGMENTS = [
    "mobile-top-bar",
    "mobile-bottom-nav",
    "mobile-more-sheet",
    "animate-spin",
    "nav-link",
    "no-anim",
    "collapsible-row",
  ];
  const SKIP_IDS = new Set(["al-activity-chip", "active-background"]);

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return true;
    const cls = el.className;
    const clsStr =
      typeof cls === "string"
        ? cls
        : el.classList
          ? el.classList.toString()
          : "";
    if (SKIP_CLASS_FRAGMENTS.some((frag) => clsStr.indexOf(frag) !== -1))
      return true;
    const id = el.id;
    if (SKIP_IDS.has(id)) return true;
    if (window.getComputedStyle(el).position === "fixed") return true;
    return false;
  }

  function snapSiblings(parent) {
    if (!parent) return new Map();
    const map = new Map();
    Array.from(parent.children).forEach(function (child) {
      if (!shouldSkip(child) && !animating.has(child)) {
        map.set(child, child.getBoundingClientRect());
      }
    });
    return map;
  }

  function flipSiblings(snap) {
    snap.forEach(function (first, el) {
      if (animating.has(el)) return;
      const last = el.getBoundingClientRect();
      const dy = first.top - last.top;
      const dx = first.left - last.left;
      if (
        Math.abs(dy) < POSITION_THRESHOLD &&
        Math.abs(dx) < POSITION_THRESHOLD
      )
        return;
      animating.add(el);
      el.animate(
        [
          { transform: "translate(" + dx + "px," + dy + "px)" },
          { transform: "translate(0,0)" },
        ],
        { duration: MOVE_MS, easing: EASE_MOVE },
      )
        .finished.then(function () {
          animating.delete(el);
        })
        .catch(function () {
          animating.delete(el);
        });
    });
  }

  const mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === "childList") {
        const snap = snapSiblings(m.target);
        requestAnimationFrame(function () {
          flipSiblings(snap);
        });
      }

      if (m.type === "attributes") {
        const el = m.target;
        if (shouldSkip(el)) return;
        if (el.closest && el.closest(".no-anim")) return;
        const snap2 = snapSiblings(el.parentElement);
        requestAnimationFrame(function () {
          flipSiblings(snap2);
        });
      }
    });
  });

  const OBS_OPTS = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  };

  function init() {
    const pc = document.getElementById("page-content");
    const spb = document.getElementById("server-page-body");
    if (pc) mo.observe(pc, OBS_OPTS);
    if (spb) mo.observe(spb, OBS_OPTS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  document.addEventListener("al:navigated", function () {
    setTimeout(init, SPA_REATTACH_MS);
  });

  window.airlinkAnimate = function (el, options) {
    if (!el || el.nodeType !== 1) return;
    const duration = (options && options.duration) || DEFAULT_DURATION;
    const delay = (options && options.delay) || 0;
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: duration,
        delay: delay,
        easing: EASE_MOVE,
        fill: "backwards",
      },
    );
  };

  window.airlinkAnimateChildren = function (container, options) {
    if (!container || container.nodeType !== 1) return;
    const baseDelay = (options && options.baseDelay) || 0;
    const stagger = (options && options.stagger) || DEFAULT_STAGGER;
    Array.from(container.children).forEach(function (child, i) {
      window.airlinkAnimate(child, {
        duration: (options && options.duration) || DEFAULT_DURATION,
        delay: baseDelay + i * stagger,
      });
    });
  };
})();
