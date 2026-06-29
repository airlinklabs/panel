/**
 * Custom Dropdown System — Portal-based dropdowns for the entire panel.
 *
 * Replaces native <select> elements (via cs-select class) and provides
 * a generic activator+panel dropdown API (initPortalDropdown).
 *
 * Globals:
 *   initCustomDropdowns()           — scan all .cs-select, build replacements
 *   initCustomDropdown(el)          — build replacement for one <select>
 *   initPortalDropdown(trigger, panel, options) — generic dropdown
 *
 * Every dropdown uses position:fixed, repositions on scroll/resize,
 * flips direction near viewport edges, and closes on outside click / Escape.
 */
(function () {
  'use strict';

  var PANEL_BG = 'bg-white dark:bg-neutral-800';
  var PANEL_BORDER = 'border border-neutral-200 dark:border-neutral-700';
  var PANEL_RADIUS = 'rounded-xl shadow-xl';
  var ANIM_CUBIC = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var ANIM_MS = 220;
  var FLIP_THRESHOLD = 260;

  /* ── Track all open dropdowns for close-all ─────────────────────── */
  var openInstances = [];

  /* ── Helpers ────────────────────────────────────────────────────── */
  function isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  function getComputedBg(el) {
    return isDarkMode() ? 'rgb(38, 38, 38)' : '#ffffff';
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function closeAll(except) {
    for (var i = openInstances.length - 1; i >= 0; i--) {
      if (openInstances[i] !== except) {
        openInstances[i].close();
      }
    }
  }

  /* ── Position a panel relative to its trigger ───────────────────── */
  function positionPanel(panel, trigger) {
    var tRect = trigger.getBoundingClientRect();
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    var pH = panel.scrollHeight || 240;
    var pW = tRect.width;

    var spaceBelow = vh - tRect.bottom;
    var openUp = spaceBelow < FLIP_THRESHOLD;

    var top = openUp ? tRect.top - pH - 6 : tRect.bottom + 6;
    var left = tRect.left;

    if (top < 8) top = 8;
    if (left + pW > vw - 8) left = vw - pW - 8;
    if (left < 8) left = 8;

    panel.style.position = 'fixed';
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.width = pW + 'px';
    panel.style.zIndex = 'var(--z-dropdown)';
  }

  /* ── Scroll / resize reposition ─────────────────────────────────── */
  function addReposition(panel, trigger) {
    var onRepos = function () {
      if (panel.getAttribute('aria-hidden') === 'false') {
        positionPanel(panel, trigger);
      }
    };
    window.addEventListener('scroll', onRepos, { passive: true });
    window.addEventListener('resize', onRepos, { passive: true });
    panel._ddReposCleanup = function () {
      window.removeEventListener('scroll', onRepos);
      window.removeEventListener('resize', onRepos);
    };
  }

  /* ── Generic portal dropdown (initPortalDropdown) ────────────────── */
  function initPortalDropdown(trigger, panel, options) {
    if (!trigger || !panel) return null;
    options = options || {};

    var state = { open: false };

    function open() {
      if (state.open) return;
      closeAll({ close: function () {} });
      panel.style.display = 'block';
      panel.classList.remove('hidden');
      panel.setAttribute('aria-hidden', 'false');
      panel.style.pointerEvents = 'auto';
      positionPanel(panel, trigger);
      addReposition(panel, trigger);
      trigger.setAttribute('aria-expanded', 'true');
      state.open = true;
      openInstances.push(inst);
    }

    function close() {
      if (!state.open) return;
      panel.style.display = 'none';
      panel.classList.add('hidden');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.pointerEvents = '';
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.width = '';
      panel.style.zIndex = '';
      trigger.setAttribute('aria-expanded', 'false');
      if (panel._ddReposCleanup) {
        panel._ddReposCleanup();
        panel._ddReposCleanup = null;
      }
      state.open = false;
      var idx = openInstances.indexOf(inst);
      if (idx !== -1) openInstances.splice(idx, 1);
    }

    function toggle() {
      state.open ? close() : open();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', function (e) {
      if (!trigger.contains(e.target) && !panel.contains(e.target)) {
        if (state.open) close();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) close();
    });

    var inst = { open: open, close: close, toggle: toggle };
    trigger._portalDropdown = inst;
    panel._portalDropdown = inst;
    return inst;
  }

  /* ── <select> replacement (buildDropdown) ────────────────────────── */
  function buildDropdown(select) {
    if (select.dataset.csInit) return;
    select.dataset.csInit = '1';

    var wrap = document.createElement('div');
    wrap.className = 'cs-wrap';
    wrap.style.position = 'relative';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var label = document.createElement('span');
    label.className = 'cs-label';
    trigger.appendChild(label);

    var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    var cp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cp.setAttribute('stroke-linecap', 'round');
    cp.setAttribute('stroke-linejoin', 'round');
    cp.setAttribute('d', 'M19 9l-7 7-7-7');
    chevron.appendChild(cp);
    trigger.appendChild(chevron);

    var panel = document.createElement('div');
    panel.className = 'cs-dropdown ' + PANEL_BG + ' ' + PANEL_BORDER + ' ' + PANEL_RADIUS;
    panel.setAttribute('role', 'listbox');
    panel.style.display = 'none';
    panel.style.pointerEvents = 'auto';

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    function syncOptions() {
      panel.innerHTML = '';
      var opts = select.options;
      for (var i = 0; i < opts.length; i++) {
        var opt = opts[i];
        var item = document.createElement('div');
        item.className = 'cs-option';
        item.setAttribute('role', 'option');
        item.setAttribute('data-value', opt.value);
        item.textContent = opt.text;
        if (opt.disabled) item.classList.add('cs-disabled');
        if (opt.selected) item.classList.add('cs-selected');
        if (!opt.disabled) {
          item.addEventListener('click', (function (o) {
            return function (ev) {
              ev.stopPropagation();
              select.value = o.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              inst.close();
              syncLabel();
            };
          })(opt));
        }
        panel.appendChild(item);
      }
    }

    function syncLabel() {
      var sel = select.options[select.selectedIndex];
      if (sel && sel.value) {
        label.textContent = sel.text;
        label.classList.remove('cs-placeholder');
      } else {
        var ph = select.querySelector('option[disabled][selected]');
        label.textContent = ph ? ph.text : 'Select\u2026';
        label.classList.add('cs-placeholder');
      }
      var items = panel.querySelectorAll('.cs-option');
      for (var j = 0; j < items.length; j++) {
        items[j].classList.toggle('cs-selected', items[j].dataset.value === select.value);
      }
    }

    function doOpen() {
      syncOptions();
      panel.style.display = 'block';
      panel.classList.remove('hidden');
      panel.setAttribute('aria-hidden', 'false');
      positionPanel(panel, trigger);
      addReposition(panel, trigger);
      trigger.setAttribute('aria-expanded', 'true');
      openInstances.push(inst);
    }

    function doClose() {
      panel.style.display = 'none';
      panel.classList.add('hidden');
      panel.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      if (panel._ddReposCleanup) {
        panel._ddReposCleanup();
        panel._ddReposCleanup = null;
      }
      var idx = openInstances.indexOf(inst);
      if (idx !== -1) openInstances.splice(idx, 1);
    }

    function doToggle() {
      panel.getAttribute('aria-hidden') === 'false' ? doClose() : doOpen();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAll(inst);
      doToggle();
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) doClose();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') doClose();
    });

    var obs = new MutationObserver(function () {
      syncOptions();
      syncLabel();
    });
    obs.observe(select, { childList: true, subtree: true, attributes: true });
    select.addEventListener('change', syncLabel);

    syncOptions();
    syncLabel();

    var inst = { open: doOpen, close: doClose, toggle: doToggle };
    trigger._portalDropdown = inst;
    panel._portalDropdown = inst;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  function initCustomDropdowns() {
    var selects = document.querySelectorAll('.cs-select:not([data-cs-init])');
    for (var i = 0; i < selects.length; i++) {
      buildDropdown(selects[i]);
    }
  }

  function initCustomDropdown(el) {
    if (el) buildDropdown(el);
  }

  window.initCustomDropdowns = initCustomDropdowns;
  window.initCustomDropdown = initCustomDropdown;
  window.initPortalDropdown = initPortalDropdown;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomDropdowns);
  } else {
    initCustomDropdowns();
  }
  document.addEventListener('turbo:load', initCustomDropdowns);
})();
