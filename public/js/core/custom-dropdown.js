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
 * Every dropdown portals its panel to document.body and uses fixed
 * positioning so overflow-hidden ancestors cannot clip the menu.
 */
(function () {
  'use strict';

  /* ── Track all open dropdowns for close-all ─────────────────────── */
  var openInstances = [];

  /* ── Helpers ────────────────────────────────────────────────────── */
  function closeAll(except) {
    for (var i = openInstances.length - 1; i >= 0; i--) {
      if (openInstances[i] !== except) {
        openInstances[i].close();
      }
    }
  }

  function getItemText(item) {
    return (item.textContent || '').trim().toLowerCase();
  }

  function isKeyboardOpenKey(e) {
    return e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp';
  }

  function setItemActive(items, activeIdx, activeClass) {
    for (var i = 0; i < items.length; i++) {
      var active = i === activeIdx;
      items[i].classList.toggle(activeClass || 'cs-focused', active);
      items[i].setAttribute('aria-selected', active ? 'true' : 'false');
      if (!items[i].hasAttribute('tabindex')) items[i].setAttribute('tabindex', '-1');
    }
    if (items[activeIdx]) {
      items[activeIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function isInModal(trigger) {
    return !!(trigger && trigger.closest('[role="dialog"], #globalModal'));
  }

  function getDropdownZIndex(trigger) {
    return isInModal(trigger) ? 'var(--z-modal-dropdown, 65)' : 'var(--z-dropdown, 40)';
  }

  function portalPanel(panel) {
    if (!panel || panel.parentNode === document.body) return;
    panel._ddOriginalParent = panel.parentNode;
    panel._ddOriginalNextSibling = panel.nextSibling;
    document.body.appendChild(panel);
    panel.classList.add('cs-portaled');
  }

  function restorePanel(panel) {
    if (!panel || !panel._ddOriginalParent) return;
    panel.classList.remove('cs-portaled');
    if (panel._ddOriginalNextSibling && panel._ddOriginalNextSibling.parentNode === panel._ddOriginalParent) {
      panel._ddOriginalParent.insertBefore(panel, panel._ddOriginalNextSibling);
    } else {
      panel._ddOriginalParent.appendChild(panel);
    }
    panel._ddOriginalParent = null;
    panel._ddOriginalNextSibling = null;
  }

  function getScrollParents(el) {
    var parents = [];
    var node = el ? el.parentElement : null;
    var overflowRe = /(auto|scroll|overlay)/;
    while (node && node !== document.body && node !== document.documentElement) {
      var style = window.getComputedStyle(node);
      if (overflowRe.test(style.overflow + style.overflowY + style.overflowX)) {
        parents.push(node);
      }
      node = node.parentElement;
    }
    return parents;
  }

  function isTriggerInViewport(trigger) {
    if (!trigger || !trigger.isConnected) return false;
    var rect = trigger.getBoundingClientRect();
    return rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
  }

  /* ── Position a panel relative to its trigger ───────────────────── */
  function positionPanel(panel, trigger) {
    if (!panel || !trigger) return;
    var rect = trigger.getBoundingClientRect();
    var panelHeight = 240;
    var spaceBelow = window.innerHeight - rect.bottom;
    var openAbove = spaceBelow < panelHeight && rect.top > panelHeight;

    panel.style.position = 'fixed';
    panel.style.width = rect.width + 'px';
    panel.style.left = rect.left + 'px';
    panel.style.zIndex = getDropdownZIndex(trigger);
    panel.classList.toggle('cs-modal-layer', isInModal(trigger));

    if (openAbove) {
      panel.style.top = '';
      panel.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
    } else {
      panel.style.bottom = '';
      panel.style.top = (rect.bottom + 2) + 'px';
    }
  }

  /* ── Scroll / resize reposition ─────────────────────────────────── */
  function addReposition(panel, trigger, closeFn) {
    if (panel._ddReposCleanup) {
      panel._ddReposCleanup();
      panel._ddReposCleanup = null;
    }
    var onRepos = function () {
      if (panel.getAttribute('aria-hidden') === 'false') {
        if (!isTriggerInViewport(trigger)) {
          if (typeof closeFn === 'function') closeFn();
          return;
        }
        positionPanel(panel, trigger);
      }
    };
    var scrollParents = getScrollParents(trigger);
    window.addEventListener('scroll', onRepos, { passive: true });
    window.addEventListener('resize', onRepos, { passive: true });
    scrollParents.forEach(function (parent) {
      parent.addEventListener('scroll', onRepos, { passive: true });
    });
    panel._ddReposCleanup = function () {
      window.removeEventListener('scroll', onRepos);
      window.removeEventListener('resize', onRepos);
      scrollParents.forEach(function (parent) {
        parent.removeEventListener('scroll', onRepos);
      });
    };
  }

  /* ── Generic portal dropdown (initPortalDropdown) ────────────────── */
  function initPortalDropdown(trigger, panel, options) {
    if (!trigger || !panel) return null;
    options = options || {};

    var state = { open: false };

    function open() {
      if (state.open) return;
      closeAll(inst);
      portalPanel(panel);
      panel.style.display = 'block';
      panel.classList.remove('hidden');
      panel.classList.add('cs-open');
      panel.setAttribute('aria-hidden', 'false');
      trigger.classList.add('cs-open');
      positionPanel(panel, trigger);
      addReposition(panel, trigger, close);
      trigger.setAttribute('aria-expanded', 'true');
      state.open = true;
      if (openInstances.indexOf(inst) === -1) openInstances.push(inst);
    }

    function close() {
      if (!state.open) return;
      panel.style.display = 'none';
      panel.classList.add('hidden');
      panel.classList.remove('cs-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.width = '';
      panel.style.zIndex = '';
      panel.style.bottom = '';
      panel.classList.remove('cs-modal-layer');
      trigger.classList.remove('cs-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (panel._ddReposCleanup) {
        panel._ddReposCleanup();
        panel._ddReposCleanup = null;
      }
      restorePanel(panel);
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
    var typeBuffer = '';
    var typeTimer = null;
    function getNavItems() {
      return panel.querySelectorAll('button:not([disabled]), a[href], [role="option"], .cs-option:not(.cs-disabled)');
    }
    function highlightNavItem(idx) {
      var items = getNavItems();
      if (!items.length) return;
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      focusedIdx = idx;
      setItemActive(items, focusedIdx, 'cs-focused');
    }
    function highlightByPrefix(prefix) {
      var items = getNavItems();
      prefix = (prefix || '').toLowerCase();
      for (var i = 0; i < items.length; i++) {
        var idx = (focusedIdx + 1 + i) % items.length;
        if (getItemText(items[idx]).indexOf(prefix) === 0) {
          highlightNavItem(idx);
          return;
        }
      }
    }

    document.addEventListener('keydown', function (e) {
      if (!state.open) return;
      if (e.key === 'Escape') { close(); trigger.focus(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlightNavItem(focusedIdx + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlightNavItem(focusedIdx - 1); return; }
      if (e.key === 'Home') { e.preventDefault(); highlightNavItem(0); return; }
      if (e.key === 'End') { e.preventDefault(); highlightNavItem(getNavItems().length - 1); return; }
      if ((e.key === 'Enter' || e.key === ' ') && focusedIdx >= 0) {
        e.preventDefault();
        var items = getNavItems();
        if (items[focusedIdx]) items[focusedIdx].click();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typeBuffer += e.key.toLowerCase();
        clearTimeout(typeTimer);
        typeTimer = setTimeout(function () { typeBuffer = ''; }, 500);
        highlightByPrefix(typeBuffer);
      }
    });

    trigger.addEventListener('keydown', function (e) {
      if (isKeyboardOpenKey(e)) {
        e.preventDefault();
        if (!state.open) open();
        if (e.key === 'ArrowUp') highlightNavItem(focusedIdx - 1);
        else highlightNavItem(focusedIdx >= 0 ? focusedIdx : 0);
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
    if (select.classList.contains('cs-sm')) wrap.classList.add('cs-sm');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    if (select.classList.contains('cs-sm')) trigger.classList.add('cs-sm');
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
    panel.className = 'cs-dropdown';
    if (select.classList.contains('cs-sm')) panel.classList.add('cs-sm');
    panel.setAttribute('role', 'listbox');
    panel.style.display = 'none';

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
        item.setAttribute('tabindex', '-1');
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
      closeAll(inst);
      syncOptions();
      portalPanel(panel);
      panel.style.display = 'block';
      panel.classList.remove('hidden');
      panel.classList.add('cs-open');
      panel.setAttribute('aria-hidden', 'false');
      trigger.classList.add('cs-open');
      positionPanel(panel, trigger);
      addReposition(panel, trigger, doClose);
      trigger.setAttribute('aria-expanded', 'true');
      if (openInstances.indexOf(inst) === -1) openInstances.push(inst);
    }

    function doClose() {
      panel.style.display = 'none';
      panel.classList.add('hidden');
      panel.classList.remove('cs-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.width = '';
      panel.style.zIndex = '';
      panel.style.bottom = '';
      panel.classList.remove('cs-modal-layer');
      trigger.classList.remove('cs-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (panel._ddReposCleanup) {
        panel._ddReposCleanup();
        panel._ddReposCleanup = null;
      }
      restorePanel(panel);
      var idx = openInstances.indexOf(inst);
      if (idx !== -1) openInstances.splice(idx, 1);
    }

    function doToggle() {
      panel.getAttribute('aria-hidden') === 'false' ? doClose() : doOpen();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      doToggle();
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target) && !panel.contains(e.target)) doClose();
    });

    var focusedIdx = -1;
    var typeBuffer = '';
    var typeTimer = null;
    function highlightOption(idx) {
      var items = panel.querySelectorAll('.cs-option:not(.cs-disabled)');
      if (!items.length) return;
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      focusedIdx = idx;
      setItemActive(items, focusedIdx, 'cs-focused');
    }
    function highlightOptionByPrefix(prefix) {
      var items = panel.querySelectorAll('.cs-option:not(.cs-disabled)');
      prefix = (prefix || '').toLowerCase();
      for (var i = 0; i < items.length; i++) {
        var idx = (focusedIdx + 1 + i) % items.length;
        if (getItemText(items[idx]).indexOf(prefix) === 0) {
          highlightOption(idx);
          return;
        }
      }
    }

    document.addEventListener('keydown', function (e) {
      if (panel.getAttribute('aria-hidden') !== 'false') return;
      if (e.key === 'Escape') { doClose(); trigger.focus(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlightOption(focusedIdx + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlightOption(focusedIdx - 1); return; }
      if (e.key === 'Home') { e.preventDefault(); highlightOption(0); return; }
      if (e.key === 'End') { e.preventDefault(); highlightOption(panel.querySelectorAll('.cs-option:not(.cs-disabled)').length - 1); return; }
      if ((e.key === 'Enter' || e.key === ' ') && focusedIdx >= 0) {
        e.preventDefault();
        var items = panel.querySelectorAll('.cs-option:not(.cs-disabled)');
        if (items[focusedIdx]) items[focusedIdx].click();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typeBuffer += e.key.toLowerCase();
        clearTimeout(typeTimer);
        typeTimer = setTimeout(function () { typeBuffer = ''; }, 500);
        highlightOptionByPrefix(typeBuffer);
      }
    });

    trigger.addEventListener('keydown', function (e) {
      if (isKeyboardOpenKey(e)) {
        e.preventDefault();
        if (panel.getAttribute('aria-hidden') !== 'false') doOpen();
        if (e.key === 'ArrowUp') highlightOption(focusedIdx - 1);
        else highlightOption(focusedIdx >= 0 ? focusedIdx : 0);
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
  window.closeAllDropdowns = function () {
    closeAll();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomDropdowns);
  } else {
    initCustomDropdowns();
  }
  document.addEventListener('turbo:load', initCustomDropdowns);
})();
