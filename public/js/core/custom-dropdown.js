/**
 * Custom Animated Dropdown - replaces native <select> elements
 * and provides a portal-aware dropdown system for all menus.
 *
 * Usage for <select>: Add class="cs-select" and call initCustomDropdowns()
 * Usage for arbitrary menus: Call initPortalDropdown(trigger, panel, options)
 */
(function () {
  'use strict';

  var OPEN_CLASS = 'cs-open';
  var WRAP_CLASS = 'cs-wrap';

  /* ── Utility: check if element is inside a scrollable container ─── */
  function isInsideScrollable(el) {
    var parent = el.parentElement;
    while (parent && parent !== document.body) {
      var style = getComputedStyle(parent);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
        return true;
      }
      if (style.overflow === 'hidden' || style.overflowY === 'hidden' || style.overflowY === 'clip') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  /* ── Utility: get visible rect of an element ────────────────────── */
  function getVisibleRect(el) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    return {
      top: Math.max(rect.top, 0),
      bottom: Math.min(rect.bottom, vh),
      left: Math.max(rect.left, 0),
      right: Math.min(rect.right, vw),
      width: rect.width,
      height: Math.min(rect.height, vh)
    };
  }

  /* ── Portal dropdown system ─────────────────────────────────────── */
  function positionPortaled(dropdown, trigger) {
    var rect = trigger.getBoundingClientRect();
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    var ddHeight = dropdown.scrollHeight || 240;
    var ddWidth = rect.width;

    var top = rect.bottom + 6;
    var left = rect.left;

    // Flip above if not enough space below
    if (top + ddHeight > vh - 8) {
      top = rect.top - ddHeight - 6;
    }

    // Clamp to viewport
    if (top < 8) top = 8;
    if (left + ddWidth > vw - 8) left = vw - ddWidth - 8;
    if (left < 8) left = 8;

    dropdown.style.position = 'fixed';
    dropdown.style.top = top + 'px';
    dropdown.style.left = left + 'px';
    dropdown.style.width = ddWidth + 'px';
    dropdown.style.zIndex = 'var(--z-dropdown, 30)';
  }

  function portalDropdown(dropdown, trigger) {
    if (!isInsideScrollable(trigger.closest('.cs-wrap') || trigger.parentElement)) {
      dropdown.classList.remove('cs-portaled');
      return;
    }
    positionPortaled(dropdown, trigger);
    document.body.appendChild(dropdown);
    dropdown.classList.add('cs-portaled');
  }

  function unportalDropdown(dropdown) {
    if (dropdown.classList.contains('cs-portaled')) {
      dropdown.classList.remove('cs-portaled');
      dropdown.style.position = '';
      dropdown.style.top = '';
      dropdown.style.left = '';
      dropdown.style.width = '';
      dropdown.style.zIndex = '';
      // Re-parent back
      var wrap = dropdown._csWrap;
      if (wrap) wrap.appendChild(dropdown);
    }
  }

  /* ── Scroll reposition (keeps dropdown open while scrolling) ───── */
  function addScrollReposition(dropdown, trigger) {
    var onScroll = function () {
      if (dropdown.style.display === 'block' || dropdown.style.display === '') {
        positionPortaled(dropdown, trigger);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    // Store cleanup ref
    dropdown._csScrollCleanup = function () {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }

  /* ── <select> replacement buildDropdown ─────────────────────────── */
  function buildDropdown(select) {
    if (select.dataset.csInit) return;
    select.dataset.csInit = '1';

    var wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
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

    var dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown._csWrap = wrap;

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);

    function syncOptions() {
      dropdown.innerHTML = '';
      var opts = select.options;
      for (var i = 0; i < opts.length; i++) {
        var opt = opts[i];
        var item = document.createElement('div');
        item.className = 'cs-option';
        item.setAttribute('role', 'option');
        item.setAttribute('data-value', opt.value);
        item.textContent = opt.text;
        if (opt.disabled) {
          item.classList.add('cs-disabled');
        }
        if (opt.selected) {
          item.classList.add('cs-selected');
        }
        if (!opt.disabled) {
          item.addEventListener('click', (function (o) {
            return function (e) {
              e.stopPropagation();
              select.value = o.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              closeAll();
              syncLabel();
            };
          })(opt));
        }
        dropdown.appendChild(item);
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
      var items = dropdown.querySelectorAll('.cs-option');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('cs-selected', items[i].dataset.value === select.value);
      }
    }

    function closeAll() {
      var allDropdowns = document.querySelectorAll('.cs-dropdown');
      for (var i = 0; i < allDropdowns.length; i++) {
        allDropdowns[i].style.display = 'none';
        unportalDropdown(allDropdowns[i]);
        allDropdowns[i].classList.remove('cs-portaled');
        allDropdowns[i].previousElementSibling.classList.remove(OPEN_CLASS);
        allDropdowns[i].previousElementSibling.setAttribute('aria-expanded', 'false');
        if (allDropdowns[i]._csScrollCleanup) allDropdowns[i]._csScrollCleanup();
      }
    }

    function closeThisDropdown() {
      unportalDropdown(dropdown);
      dropdown.style.display = 'none';
      trigger.classList.remove(OPEN_CLASS);
      trigger.setAttribute('aria-expanded', 'false');
      if (dropdown._csScrollCleanup) dropdown._csScrollCleanup();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.style.display === 'block';
      closeAll();
      if (!isOpen) {
        syncOptions();
        dropdown.style.display = 'block';
        portalDropdown(dropdown, trigger);
        addScrollReposition(dropdown, trigger);
        trigger.classList.add(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target) && e.target !== dropdown && !dropdown.contains(e.target)) {
        closeThisDropdown();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeThisDropdown();
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
  }

  /* ── Generic portal dropdown for arbitrary trigger+panel ────────── */
  function initPortalDropdown(trigger, panel, options) {
    if (!trigger || !panel) return;
    options = options || {};
    var isOpen = false;

    function open() {
      panel.style.display = 'block';
      panel.classList.remove('hidden');
      portalDropdown(panel, trigger);
      addScrollReposition(panel, trigger);
      trigger.setAttribute('aria-expanded', 'true');
      isOpen = true;
    }

    function close() {
      panel.style.display = 'none';
      panel.classList.add('hidden');
      unportalDropdown(panel);
      trigger.setAttribute('aria-expanded', 'false');
      if (panel._csScrollCleanup) panel._csScrollCleanup();
      isOpen = false;
    }

    function toggle() {
      if (isOpen) close(); else open();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', function (e) {
      if (!trigger.contains(e.target) && !panel.contains(e.target)) {
        if (isOpen) close();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });

    // Expose API
    trigger._portalDropdown = { open: open, close: close, toggle: toggle };
    panel._portalDropdown = { open: open, close: close, toggle: toggle };

    return { open: open, close: close, toggle: toggle };
  }

  function initCustomDropdowns() {
    var selects = document.querySelectorAll('.cs-select:not([data-cs-init])');
    for (var i = 0; i < selects.length; i++) {
      buildDropdown(selects[i]);
    }
  }

  window.initCustomDropdown = buildDropdown;
  window.initCustomDropdowns = initCustomDropdowns;
  window.initPortalDropdown = initPortalDropdown;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomDropdowns);
  } else {
    initCustomDropdowns();
  }
  document.addEventListener('turbo:load', initCustomDropdowns);
})();
