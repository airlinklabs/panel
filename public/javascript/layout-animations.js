(function () {

  var SCRIPT_SRC = '/vendor/index.umd.js';

  var registered = new WeakSet();

  // Custom animation function passed to autoAnimate.
  // AutoAnimate calls this with (el, action, oldCoords, newCoords).
  // action is 'add', 'remove', or 'remain'.
  function animateFn(el, action, oldCoords, newCoords) {
    if (action === 'add') {
      return new KeyframeEffect(el, [
        { opacity: 0, transform: 'translateY(14px)', height: '0px', marginTop: '0px', marginBottom: '0px', overflow: 'hidden' },
        { opacity: 1, transform: 'translateY(0)',    height: newCoords.height + 'px' }
      ], {
        duration: 450,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both'
      });
    }

    if (action === 'remove') {
      return new KeyframeEffect(el, [
        { opacity: 1, transform: 'translateY(0)',   height: oldCoords.height + 'px' },
        { opacity: 0, transform: 'translateY(8px)', height: '0px', marginTop: '0px', marginBottom: '0px', overflow: 'hidden' }
      ], {
        duration: 340,
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
        fill: 'both'
      });
    }

    if (action === 'remain') {
      var dy = oldCoords.top  - newCoords.top;
      var dx = oldCoords.left - newCoords.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
      return new KeyframeEffect(el, [
        { transform: 'translate(' + dx + 'px, ' + dy + 'px)' },
        { transform: 'translate(0, 0)' }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'both'
      });
    }
  }

  function animate(el) {
    if (!el || registered.has(el)) return;
    registered.add(el);
    window.autoAnimate(el, animateFn);
  }

  var SELECTORS = [
    '#page-content',
    '#server-page-body',
    '#gridView',
    '#listView',
    '#toast-container',
    '#radar-results',
    '#file-list',
    '#file-table-body',
    '#backup-list',
    '#players-list',
    '#nodes-table-body',
    '#servers-table-body',
    '#users-table-body',
    '#addons-list',
    '#searchResults',
  ];

  function registerSelectors() {
    SELECTORS.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) animate(el);
    });
  }

  function registerDataAttr() {
    document.querySelectorAll('[data-animate]').forEach(animate);
  }

  function boot() {
    if (typeof window.autoAnimate === 'function') {
      registerSelectors();
      registerDataAttr();
      return;
    }

    var s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.onload = function () {
      if (!window.autoAnimate) {
        var candidates = [window.AutoAnimate, window.formkitAutoAnimate];
        for (var i = 0; i < candidates.length; i++) {
          if (candidates[i] && typeof candidates[i].autoAnimate === 'function') {
            window.autoAnimate = candidates[i].autoAnimate;
            break;
          }
          if (typeof candidates[i] === 'function') {
            window.autoAnimate = candidates[i];
            break;
          }
        }
      }
      if (typeof window.autoAnimate === 'function') {
        registerSelectors();
        registerDataAttr();
      }
    };
    s.onerror = function () {};
    document.head.appendChild(s);
  }

  document.addEventListener('al:navigated', function () {
    setTimeout(function () {
      registerSelectors();
      registerDataAttr();
    }, 50);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.layoutAnim = {
    animate: function (el) {
      if (typeof window.autoAnimate === 'function') animate(el);
    }
  };

})();
