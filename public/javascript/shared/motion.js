/**
 * Motion System — Universal viewport-triggered animations
 * Android-like: fade, slide, scale with stagger support
 */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  var _rootStyle = getComputedStyle(document.documentElement);
  var EASING =
    _rootStyle.getPropertyValue("--ease-out").trim() ||
    "cubic-bezier(0.16, 1, 0.3, 1)";
  var DEFAULT_DELAY_MULTIPLIER = 50;
  const GROUP_STAGGER_MS = 40;
  const FALLBACK_RESOLVE_MS = 600;
  const EXIT_FALLBACK_MS = 400;
  const SPA_REATTACH_MS = 50;

  function hintWillChange(el) {
    const anim = el.getAttribute("data-animate") || "";
    el.style.willChange =
      anim === "blur" ? "opacity, transform, filter" : "opacity, transform";
  }

  function dropWillChange(el) {
    el.style.willChange = "";
  }

  function motionAnimate(el, animation, duration) {
    if (prefersReduced) {
      el.style.opacity = "1";
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      el.classList.remove("will-animate");
      el.classList.add("motion-visible");
      el.style.animationName = "";
      hintWillChange(el);
      void el.offsetWidth;
      el.style.animationName =
        animation || el.getAttribute("data-animate") || "fade-up";
      if (duration) el.style.animationDuration = duration + "ms";
      el.addEventListener(
        "animationend",
        function handler() {
          el.removeEventListener("animationend", handler);
          dropWillChange(el);
          resolve();
        },
        { once: true },
      );
      setTimeout(function () {
        dropWillChange(el);
        resolve();
      }, FALLBACK_RESOLVE_MS);
    });
  }

  function motionAnimateOut(el, animation, duration) {
    if (prefersReduced) {
      el.style.opacity = "0";
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      el.classList.add(animation || "motion-exit-fade");
      if (duration) el.style.animationDuration = duration + "ms";
      el.addEventListener(
        "animationend",
        function handler() {
          el.removeEventListener("animationend", handler);
          resolve();
        },
        { once: true },
      );
      setTimeout(resolve, EXIT_FALLBACK_MS);
    });
  }

  function initViewportAnimations() {
    if (prefersReduced) {
      document.querySelectorAll("[data-animate]").forEach(function (el) {
        el.style.opacity = "1";
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const el = entry.target;
            const delay = parseInt(
              el.getAttribute("data-animate-delay") || "0",
              10,
            );
            if (delay > 0) {
              setTimeout(function () {
                motionAnimate(el);
              }, delay * DEFAULT_DELAY_MULTIPLIER);
            } else {
              motionAnimate(el);
            }
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0, rootMargin: "0px" },
    );

    document.querySelectorAll("[data-animate]").forEach(function (el) {
      el.classList.add("will-animate");
      observer.observe(el);
    });
  }

  function initGroupAnimations() {
    if (prefersReduced) {
      document
        .querySelectorAll("[data-animate-group] > *")
        .forEach(function (el) {
          el.style.opacity = "1";
        });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const group = entry.target;
            const children = group.children;
            group.classList.remove("will-animate");
            for (let i = 0; i < children.length; i++) {
              (function (child, index) {
                setTimeout(function () {
                  child.style.animationName = "motion-slide-up";
                  child.classList.add("motion-visible");
                  child.style.willChange = "opacity, transform";
                  child.addEventListener(
                    "animationend",
                    function handler() {
                      child.removeEventListener("animationend", handler);
                      child.style.willChange = "";
                    },
                    { once: true },
                  );
                }, index * GROUP_STAGGER_MS);
              })(children[i], i);
            }
            observer.unobserve(group);
          }
        });
      },
      { threshold: 0.1 },
    );

    document.querySelectorAll("[data-animate-group]").forEach(function (el) {
      el.classList.add("will-animate");
      observer.observe(el);
    });
  }

  window.motion = {
    animateIn: motionAnimate,
    animateOut: motionAnimateOut,
    prefersReduced: prefersReduced,
    refresh: function () {
      initViewportAnimations();
      initGroupAnimations();
    },
  };

  function initMotion() {
    requestAnimationFrame(function () {
      initViewportAnimations();
      initGroupAnimations();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMotion);
  } else {
    initMotion();
  }

  document.addEventListener("al:navigated", function () {
    setTimeout(function () {
      initViewportAnimations();
      initGroupAnimations();
    }, SPA_REATTACH_MS);
  });
})();
