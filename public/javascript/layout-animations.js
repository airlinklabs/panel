(function () {

  var MOVE_MS  = 340;
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
        // Don't FLIP siblings when the changed element is inside a no-anim container —
        // those elements manage their own animation (e.g. max-height transitions).
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

  function init() {
    var pc  = document.getElementById('page-content');
    var spb = document.getElementById('server-page-body');
    if (pc)  mo.observe(pc,  OBS_OPTS);
    if (spb) mo.observe(spb, OBS_OPTS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('al:navigated', function () {
    setTimeout(init, 60);
  });

  // Public API for addon views that don't set dontfuckinganimateme.
  // Call window.airlinkAnimate(el) on any element to run the standard
  // entrance animation: fade in + slight upward slide.
  window.airlinkAnimate = function (el, options) {
    if (!el || el.nodeType !== 1) return;
    var duration = (options && options.duration) || 260;
    var delay    = (options && options.delay)    || 0;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: duration, delay: delay, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'backwards' }
    );
  };

  // Animate all direct children of a container element.
  // Each child staggers by 40ms so they cascade rather than all pop at once.
  window.airlinkAnimateChildren = function (container, options) {
    if (!container || container.nodeType !== 1) return;
    var baseDelay = (options && options.baseDelay) || 0;
    var stagger   = (options && options.stagger)   || 40;
    Array.from(container.children).forEach(function (child, i) {
      window.airlinkAnimate(child, {
        duration: (options && options.duration) || 260,
        delay: baseDelay + i * stagger,
      });
    });
  };

})();
