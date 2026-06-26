(function () {

  var MOVE_MS  = 300;
  var EASE_MOVE = 'cubic-bezier(0.4, 0, 0.2, 1)';

  var animating = new WeakSet();

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName;
    if (tag === 'CANVAS' || tag === 'SVG'    || tag === 'IMG' ||
        tag === 'BUTTON' || tag === 'INPUT'   || tag === 'SELECT' ||
        tag === 'SCRIPT' || tag === 'STYLE'   || tag === 'A') return true;
    var cls = el.className || '';
    if (cls.indexOf('mobile-top-bar')    !== -1) return true;
    if (cls.indexOf('mobile-bottom-nav') !== -1) return true;
    if (cls.indexOf('mobile-more-sheet') !== -1) return true;
    if (cls.indexOf('animate-spin')      !== -1) return true;
    if (cls.indexOf('nav-link')          !== -1) return true;
    if (cls.indexOf('no-anim')           !== -1) return true;
    if (cls.indexOf('collapsible-row')   !== -1) return true;
    var id = el.id;
    if (id === 'pl-overlay' || id === 'pl-bar' || id === 'active-background') return true;
    if (window.getComputedStyle(el).position === 'fixed') return true;
    return false;
  }

  // Snapshot sibling positions before a DOM change, then FLIP them after.
  function snapSiblings(parent) {
    if (!parent) return new Map();
    var map = new Map();
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
      var last = el.getBoundingClientRect();
      var dy = first.top  - last.top;
      var dx = first.left - last.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
      animating.add(el);
      el.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
        { transform: 'translate(0,0)' }
      ], { duration: MOVE_MS, easing: EASE_MOVE })
        .finished
        .then(function ()  { animating.delete(el); })
        .catch(function () { animating.delete(el); });
    });
  }

  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'childList') {
        var snap = snapSiblings(m.target);
        requestAnimationFrame(function () { flipSiblings(snap); });
      }

      if (m.type === 'attributes') {
        var el = m.target;
        if (shouldSkip(el)) return;
        if (el.closest && el.closest('.no-anim')) return;
        var snap2 = snapSiblings(el.parentElement);
        requestAnimationFrame(function () { flipSiblings(snap2); });
      }
    });
  });

  var OBS_OPTS = {
    childList:       true,
    subtree:         true,
    attributes:      true,
    attributeFilter: ['class', 'style', 'hidden']
  };

  function initObserver() {
    var pc  = document.getElementById('page-content');
    var spb = document.getElementById('server-page-body');
    if (pc)  mo.observe(pc,  OBS_OPTS);
    if (spb) mo.observe(spb, OBS_OPTS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }

  document.addEventListener('al:navigated', function () {
    setTimeout(initObserver, 60);
  });

  // ── Page transition system ─────────────────────────────────────────
  // Per-element-type stagger animations on every navigation.
  //
  // Budget: ALL animations must complete within 800ms total.
  // Worst case = max_base_delay + (N-1) × stagger + max_duration
  // With stagger=10, max_base=60, max_dur=350, 15 elements:
  //   60 + (14 × 10) + 350 = 550ms ✓

  var EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

  var TYPE_BASE_DELAY = {
    'card': 0, 'stat-card': 0, 'table': 10, 'table-row': 20,
    'alert': 5, 'badge': 25, 'avatar': 20, 'icon-box': 15,
    'button': 30, 'input': 35, 'form-group': 25, 'select': 35,
    'nav-item': 10, 'heading': 40, 'code-block': 20,
    'progress-bar': 15, 'empty-state': 25, 'generic': 30
  };

  var ELEMENT_TYPES = [
    { name: 'heading', match: function (el) { return /^H[1-6]$/.test(el.tagName); },
      anim: { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 150, ease: EASING } },
    { name: 'stat-card', match: function (el) { return el.classList && (el.classList.contains('stats-card') || el.getAttribute('data-animate') === 'stat'); },
      anim: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 200, ease: EASING } },
    { name: 'card', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        if (c.indexOf('data-animate-card') !== -1) return true;
        if (c.indexOf('rounded-xl') === -1 && c.indexOf('rounded-2xl') === -1 && c.indexOf('rounded-lg') === -1) return false;
        return c.indexOf('bg-') !== -1 || c.indexOf('border-') !== -1 || c.indexOf('shadow') !== -1;
      }, anim: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 200, ease: EASING } },
    { name: 'table', match: function (el) { return el.tagName === 'TABLE'; },
      anim: { from: { opacity: 0 }, to: { opacity: 1 }, dur: 150, ease: EASING } },
    { name: 'table-row', match: function (el) { return el.tagName === 'TR' && el.parentElement && el.parentElement.tagName === 'TBODY'; },
      anim: { from: { opacity: 0, transform: 'translateX(-3px)' }, to: { opacity: 1, transform: 'translateX(0)' }, dur: 120, ease: EASING } },
    { name: 'badge', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('rounded-md') !== -1 && c.indexOf('px-2') !== -1 && c.indexOf('text-') !== -1 && c.indexOf('font-medium') !== -1;
      }, anim: { from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: 1, transform: 'scale(1)' }, dur: 150, ease: EASING } },
    { name: 'avatar', match: function (el) { return el.tagName === 'IMG' && el.classList && el.className.indexOf('rounded') !== -1; },
      anim: { from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: 1, transform: 'scale(1)' }, dur: 150, ease: EASING } },
    { name: 'icon-box', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('rounded-lg') !== -1 && c.indexOf('bg-neutral-100') !== -1 && el.querySelector && el.querySelector('svg');
      }, anim: { from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: 1, transform: 'scale(1)' }, dur: 150, ease: EASING } },
    { name: 'button', match: function (el) { return el.tagName === 'BUTTON' || (el.tagName === 'A' && el.classList && el.className.indexOf('rounded-xl') !== -1 && el.className.indexOf('bg-') !== -1); },
      anim: { from: { opacity: 0 }, to: { opacity: 1 }, dur: 120, ease: EASING } },
    { name: 'input', match: function (el) { return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'; },
      anim: { from: { opacity: 0, transform: 'translateX(-4px)' }, to: { opacity: 1, transform: 'translateX(0)' }, dur: 150, ease: EASING } },
    { name: 'form-group', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('space-y-') !== -1 || c.indexOf('grid-cols-') !== -1;
      }, anim: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 150, ease: EASING } },
    { name: 'nav-item', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('nav-link') !== -1 || c.indexOf('nav-link2') !== -1 || c.indexOf('mobile-nav-link') !== -1;
      }, anim: { from: { opacity: 0, transform: 'translateX(-4px)' }, to: { opacity: 1, transform: 'translateX(0)' }, dur: 150, ease: EASING } },
    { name: 'alert', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('bg-red-50') !== -1 || c.indexOf('bg-amber-50') !== -1 || c.indexOf('bg-emerald-50') !== -1;
      }, anim: { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 150, ease: EASING } },
    { name: 'code-block', match: function (el) { return el.tagName === 'PRE' || el.tagName === 'CODE'; },
      anim: { from: { opacity: 0 }, to: { opacity: 1 }, dur: 150, ease: EASING } },
    { name: 'progress-bar', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('rounded-full') !== -1 && c.indexOf('h-1') !== -1;
      }, anim: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' }, dur: 250, ease: EASING } },
    { name: 'empty-state', match: function (el) {
        if (!el.classList) return false; var c = el.className; if (typeof c !== 'string') return false;
        return c.indexOf('items-center') !== -1 && c.indexOf('justify-center') !== -1 && c.indexOf('text-center') !== -1 && c.indexOf('mt-') !== -1;
      }, anim: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 200, ease: EASING } },
    { name: 'generic', match: function () { return true; },
      anim: { from: { opacity: 0, transform: 'translateY(3px)' }, to: { opacity: 1, transform: 'translateY(0)' }, dur: 150, ease: EASING } }
  ];

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, NOSCRIPT: 1, CANVAS: 1, SVG: 1, PATH: 1 };

  function classifyElement(el) {
    for (var i = 0; i < ELEMENT_TYPES.length; i++) {
      if (ELEMENT_TYPES[i].match(el)) return ELEMENT_TYPES[i];
    }
    return ELEMENT_TYPES[ELEMENT_TYPES.length - 1];
  }

  function getAnimatedElements(container) {
    if (!container) return [];
    var all = container.querySelectorAll('*');
    var result = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP_TAGS[el.tagName]) continue;
      var cls = el.className || '';
      if (typeof cls === 'string' && (cls.indexOf('no-anim') !== -1 || cls.indexOf('turbo-frame') !== -1)) continue;
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (style.position === 'fixed' || style.position === 'sticky') continue;
      var rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      result.push(el);
    }
    return result;
  }

  // Animate elements in a container with staggered fade-in.
  // Each element starts invisible, animates to visible with fill:'forwards'
  // so it STAYS visible after its animation ends.
  function animateContainer(container) {
    if (!container) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Show all elements immediately without animation
      var all = container.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        all[i].style.opacity = '1';
      }
      return;
    }

    var elements = getAnimatedElements(container);
    if (!elements.length) return;

    var typeCounters = {};
    var perTypeStagger = 10;

    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      var type = classifyElement(el);
      var count = typeCounters[type.name] || 0;
      typeCounters[type.name] = count + 1;

      var baseDelay = TYPE_BASE_DELAY[type.name] || 30;
      var totalDelay = baseDelay + count * perTypeStagger;

      // Set opacity to 0 before animation starts
      el.style.opacity = '0';

      // Animate with fill:'forwards' so element STAYS at opacity:1 after animation
      (function (element, delay, animType) {
        setTimeout(function () {
          element.animate([
            animType.anim.from,
            animType.anim.to
          ], {
            duration: animType.anim.dur,
            delay: 0,
            easing: animType.anim.ease,
            fill: 'forwards'
          });
        }, delay);
      })(el, totalDelay, type);
    }
  }

  // Hide content before Turbo swaps body
  document.addEventListener('turbo:before-render', function () {
    var pc = document.getElementById('page-content');
    if (pc) {
      pc.style.opacity = '0';
      pc.style.visibility = 'hidden';
    }
  });

  // Animate in after Turbo renders new page
  document.addEventListener('turbo:load', function () {
    var pc = document.getElementById('page-content');
    if (!pc) return;
    pc.style.visibility = '';
    pc.style.opacity = '';
    animateContainer(pc);
  });

  // Animate in on initial page load (turbo:load doesn't fire on first load)
  document.addEventListener('DOMContentLoaded', function () {
    var pc = document.getElementById('page-content');
    if (pc) {
      pc.style.opacity = '';
      animateContainer(pc);
    }
  });

  // Public API
  window.staggerAnimate = animateContainer;

  // Public API for addon views
  window.airlinkAnimate = function (el, options) {
    if (!el || el.nodeType !== 1) return;
    var duration = (options && options.duration) || 200;
    var delay    = (options && options.delay)    || 0;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: duration, delay: delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );
  };

  window.airlinkAnimateChildren = function (container, options) {
    if (!container || container.nodeType !== 1) return;
    var baseDelay = (options && options.baseDelay) || 0;
    var stagger   = (options && options.stagger)   || 30;
    Array.from(container.children).forEach(function (child, i) {
      window.airlinkAnimate(child, {
        duration: (options && options.duration) || 250,
        delay: baseDelay + i * stagger,
      });
    });
  };

})();

// ── Motion utilities (merged from motion.js) ──

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
      setTimeout(resolve, 500);
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
      setTimeout(resolve, 500);
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
              }, index * 30);
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

  // ── Stat counter animation ──────────────────────────────────────────────
  window.airlinkCountUp = function (el, target, opts) {
    if (reducedMotion()) { el.textContent = target; return; }
    var o        = opts || {};
    var duration = o.duration || 900;
    var start    = o.from     || 0;
    var suffix   = o.suffix   || '';
    var prefix   = o.prefix   || '';
    var startTime;
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function tick(now) {
      if (!startTime) startTime = now;
      var progress = Math.min((now - startTime) / duration, 1);
      var value    = Math.round(start + (target - start) * ease(progress));
      el.textContent = prefix + value.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  function initCounters() {
    document.querySelectorAll('[data-count-up]').forEach(function (el) {
      var target = parseInt(el.dataset.countUp, 10);
      if (!isNaN(target)) window.airlinkCountUp(el, target);
    });
  }

  document.addEventListener('DOMContentLoaded', initCounters);
  document.addEventListener('al:navigated', function () {
    setTimeout(initCounters, 60);
  });
})();
