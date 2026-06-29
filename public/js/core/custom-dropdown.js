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
 * Every dropdown uses position:absolute within its .cs-wrap parent,
 * and closes on outside click / Escape.
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
    var wrap = trigger.closest('.cs-wrap') || trigger.parentNode;
    if (!wrap) return;
    var isDocker = trigger.id === 'dockerImage';
    if (isDocker) {
      var tRect = trigger.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.top = (tRect.bottom + 2) + 'px';
      panel.style.left = tRect.left + 'px';
      panel.style.width = tRect.width + 'px';
      panel.style.zIndex = '2147483647';
    } else {
      panel.style.position = 'absolute';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.width = '';
      panel.style.zIndex = '';
    }
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
      panel.classList.add('cs-open');
      panel.setAttribute('aria-hidden', 'false');
      panel.style.pointerEvents = 'auto';
      trigger.classList.add('cs-open');
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
      panel.classList.remove('cs-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.pointerEvents = '';
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.width = '';
      panel.style.zIndex = '';
      trigger.classList.remove('cs-open');
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

    var focusedIdx = -1;
    function getNavItems() {
      return panel.querySelectorAll('button:not([disabled]), a[href], [role="option"], .cs-option:not(.cs-disabled)');
    }
    function highlightNavItem(idx) {
      var items = getNavItems();
      if (!items.length) return;
      items.forEach(function (el) { el.classList.remove('cs-focused'); });
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      focusedIdx = idx;
      items[focusedIdx].classList.add('cs-focused');
      items[focusedIdx].scrollIntoView({ block: 'nearest' });
    }

    document.addEventListener('keydown', function (e) {
      if (!state.open) return;
      if (e.key === 'Escape') { close(); trigger.focus(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlightNavItem(focusedIdx + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlightNavItem(focusedIdx - 1); return; }
      if (e.key === 'Enter' && focusedIdx >= 0) {
        e.preventDefault();
        var items = getNavItems();
        if (items[focusedIdx]) items[focusedIdx].click();
      }
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!state.open) open();
        highlightNavItem(focusedIdx + (e.key === 'ArrowDown' ? 1 : -1));
      }
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
      panel.classList.add('cs-open');
      panel.setAttribute('aria-hidden', 'false');
      trigger.classList.add('cs-open');
      positionPanel(panel, trigger);
      addReposition(panel, trigger);
      trigger.setAttribute('aria-expanded', 'true');
      openInstances.push(inst);
    }

    function doClose() {
      panel.style.display = 'none';
      panel.classList.add('hidden');
      panel.classList.remove('cs-open');
      panel.setAttribute('aria-hidden', 'true');
      trigger.classList.remove('cs-open');
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

    var focusedIdx = -1;
    function highlightOption(idx) {
      var items = panel.querySelectorAll('.cs-option:not(.cs-disabled)');
      if (!items.length) return;
      items.forEach(function (el) { el.classList.remove('cs-focused'); });
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      focusedIdx = idx;
      items[focusedIdx].classList.add('cs-focused');
      items[focusedIdx].scrollIntoView({ block: 'nearest' });
    }

    document.addEventListener('keydown', function (e) {
      if (panel.getAttribute('aria-hidden') !== 'false') return;
      if (e.key === 'Escape') { doClose(); trigger.focus(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlightOption(focusedIdx + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlightOption(focusedIdx - 1); return; }
      if (e.key === 'Enter' && focusedIdx >= 0) {
        e.preventDefault();
        var items = panel.querySelectorAll('.cs-option:not(.cs-disabled)');
        if (items[focusedIdx]) items[focusedIdx].click();
      }
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (panel.getAttribute('aria-hidden') !== 'false') doOpen();
        highlightOption(focusedIdx + (e.key === 'ArrowDown' ? 1 : -1));
      }
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
