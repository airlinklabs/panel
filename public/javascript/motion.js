/**
 * Motion System — Universal viewport-triggered animations
 * Android-like: fade, slide, scale with stagger support
 */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

  function motionAnimate(el, animation, duration) {
    if (prefersReduced) {
      el.style.opacity = '1';
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      el.classList.add('motion-visible');
      el.style.animationName = '';
      void el.offsetWidth; // force reflow
      el.style.animationName = animation || (el.getAttribute('data-animate') || 'fade-up');
      if (duration) el.style.animationDuration = duration + 'ms';
      el.addEventListener('animationend', function handler() {
        el.removeEventListener('animationend', handler);
        resolve();
      }, { once: true });
      // fallback resolve
      setTimeout(resolve, 600);
    });
  }

  function motionAnimateOut(el, animation, duration) {
    if (prefersReduced) {
      el.style.opacity = '0';
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      el.classList.add(animation || 'motion-exit-fade');
      if (duration) el.style.animationDuration = duration + 'ms';
      el.addEventListener('animationend', function handler() {
        el.removeEventListener('animationend', handler);
        resolve();
      }, { once: true });
      setTimeout(resolve, 400);
    });
  }

  // ── Viewport observer ──────────────────────────────────────────────

  function initViewportAnimations() {
    if (prefersReduced) {
      // Show everything immediately
      document.querySelectorAll('[data-animate]').forEach(function (el) {
        el.style.opacity = '1';
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var delay = parseInt(el.getAttribute('data-animate-delay') || '0', 10);
          if (delay > 0) {
            setTimeout(function () { motionAnimate(el); }, delay * 50);
          } else {
            motionAnimate(el);
          }
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('[data-animate]').forEach(function (el) {
      observer.observe(el);
    });
  }

  // ── Group animations ──────────────────────────────────────────────

  function initGroupAnimations() {
    if (prefersReduced) {
      document.querySelectorAll('[data-animate-group] > *').forEach(function (el) {
        el.style.opacity = '1';
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var group = entry.target;
          var children = group.children;
          for (var i = 0; i < children.length; i++) {
            (function (child, index) {
              setTimeout(function () {
                child.style.animationName = 'motion-slide-up';
                child.classList.add('motion-visible');
              }, index * 60);
            })(children[i], i);
          }
          observer.unobserve(group);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('[data-animate-group]').forEach(function (el) {
      observer.observe(el);
    });
  }

  // ── Programmatic API ──────────────────────────────────────────────

  window.motion = {
    animateIn: motionAnimate,
    animateOut: motionAnimateOut,
    prefersReduced: prefersReduced,
    refresh: function () {
      initViewportAnimations();
      initGroupAnimations();
    }
  };

  // ── Init on DOMContentLoaded ──────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initViewportAnimations();
      initGroupAnimations();
    });
  } else {
    initViewportAnimations();
    initGroupAnimations();
  }

  // Re-init on SPA navigation
  document.addEventListener('al:navigated', function () {
    setTimeout(function () {
      initViewportAnimations();
      initGroupAnimations();
    }, 50);
  });
})();
