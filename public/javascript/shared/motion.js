/**
 * Motion System — Universal viewport-triggered animations
 * Android-like: fade, slide, scale with stagger support
 */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

  // Transient compositing hint — granted for the duration of the
  // animation only, never left on at rest (see motion.css).
  function hintWillChange(el) {
    var anim = el.getAttribute('data-animate') || '';
    el.style.willChange = anim === 'blur' ? 'opacity, transform, filter' : 'opacity, transform';
  }

  function dropWillChange(el) {
    el.style.willChange = '';
  }

  function motionAnimate(el, animation, duration) {
    if (prefersReduced) {
      el.style.opacity = '1';
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      el.classList.remove('will-animate');
      el.classList.add('motion-visible');
      el.style.animationName = '';
      hintWillChange(el);
      void el.offsetWidth; // force reflow
      el.style.animationName = animation || (el.getAttribute('data-animate') || 'fade-up');
      if (duration) el.style.animationDuration = duration + 'ms';
      el.addEventListener('animationend', function handler() {
        el.removeEventListener('animationend', handler);
        dropWillChange(el);
        resolve();
      }, { once: true });
      // fallback resolve
      setTimeout(function () { dropWillChange(el); resolve(); }, 600);
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
    }, { threshold: 0, rootMargin: '0px' });

    document.querySelectorAll('[data-animate]').forEach(function (el) {
      // Hide only now, after JS is confirmed running — content is
      // visible by default without JS (progressive enhancement).
      el.classList.add('will-animate');
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
          group.classList.remove('will-animate');
          for (var i = 0; i < children.length; i++) {
            (function (child, index) {
              setTimeout(function () {
                child.style.animationName = 'motion-slide-up';
                child.classList.add('motion-visible');
                child.style.willChange = 'opacity, transform';
                child.addEventListener('animationend', function handler() {
                  child.removeEventListener('animationend', handler);
                  child.style.willChange = '';
                }, { once: true });
              }, index * 40);
            })(children[i], i);
          }
          observer.unobserve(group);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('[data-animate-group]').forEach(function (el) {
      el.classList.add('will-animate');
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

  function initMotion() {
    requestAnimationFrame(function () {
      initViewportAnimations();
      initGroupAnimations();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMotion);
  } else {
    initMotion();
  }

  // Re-init on SPA navigation
  document.addEventListener('al:navigated', function () {
    setTimeout(function () {
      initViewportAnimations();
      initGroupAnimations();
    }, 50);
  });
})();
