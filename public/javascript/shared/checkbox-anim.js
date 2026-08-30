(function () {
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  var _rootStyle = getComputedStyle(document.documentElement);
  var CHECKBOX_SCALE_UP = "scale(1.3)";
  var CHECKBOX_SCALE_DOWN = "scale(0.75)";
  var CHECKBOX_SCALE_REST = "scale(1)";
  var TRANSITION_VALUE =
    "transform 0.18s " +
    (_rootStyle.getPropertyValue("--ease-bounce").trim() ||
      "cubic-bezier(0.34, 1.56, 0.64, 1)");
  const BOUNCE_MS = 160;
  const SETTLE_MS = 200;
  const SPA_REATTACH_MS = 80;

  function animateCheckbox(cb) {
    if (prefersReduced) {
      cb.style.transform = "";
      return;
    }
    cb.style.transition = TRANSITION_VALUE;
    cb.style.transform = cb.checked ? CHECKBOX_SCALE_UP : CHECKBOX_SCALE_DOWN;
    setTimeout(function () {
      cb.style.transform = CHECKBOX_SCALE_REST;
      setTimeout(function () {
        cb.style.transition = "";
        cb.style.transform = "";
      }, SETTLE_MS);
    }, BOUNCE_MS);
  }

  function attachTo(cb) {
    if (cb.classList.contains("sr-only")) return;
    if (cb.dataset.cbAnim) return;
    cb.dataset.cbAnim = "1";
    cb.addEventListener("change", function () {
      animateCheckbox(this);
    });
  }

  function attachAll() {
    document.querySelectorAll('input[type="checkbox"]').forEach(attachTo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachAll);
  } else {
    attachAll();
  }

  document.addEventListener("al:navigated", function () {
    setTimeout(attachAll, SPA_REATTACH_MS);
  });

  const mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === "INPUT" && node.type === "checkbox") {
          attachTo(node);
        } else {
          if (node.querySelectorAll)
            node.querySelectorAll('input[type="checkbox"]').forEach(attachTo);
        }
      });
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    mo.observe(document.body, { childList: true, subtree: true });
  });

  window.animateCheckbox = animateCheckbox;
})();
