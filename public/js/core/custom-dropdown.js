/**
 * Custom Animated Dropdown - replaces native <select> elements
 * Usage: Add class="cs-select" to any <select> and call initCustomDropdowns()
 * or call initCustomDropdown(selectElement) for a single select.
 */
(function () {
  'use strict';

  var OPEN_CLASS = 'cs-open';
  var WRAP_CLASS = 'cs-wrap';

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
        allDropdowns[i].classList.remove('cs-portaled');
        allDropdowns[i].previousElementSibling.classList.remove(OPEN_CLASS);
        allDropdowns[i].previousElementSibling.setAttribute('aria-expanded', 'false');
      }
    }

    function isInsideScrollable(el) {
      var parent = el.parentElement;
      while (parent && parent !== document.body) {
        var style = getComputedStyle(parent);
        var ov = style.overflow + style.overflowY + style.overflowX;
        if (parent.scrollHeight > parent.clientHeight && (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
          return true;
        }
        if (style.overflow === 'hidden' || style.overflowY === 'hidden' || style.overflowX === 'hidden') {
          return true;
        }
        if (style.overflow === 'clip' || style.overflowY === 'clip') {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    }

    function portalDropdown() {
      if (!isInsideScrollable(wrap)) {
        dropdown.classList.remove('cs-portaled');
        return;
      }
      var rect = trigger.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.top = (rect.bottom + 6) + 'px';
      dropdown.style.width = rect.width + 'px';
      dropdown.style.zIndex = 'var(--z-dropdown, 30)';
      document.body.appendChild(dropdown);
      dropdown.classList.add('cs-portaled');
    }

    function unportalDropdown() {
      if (dropdown.classList.contains('cs-portaled')) {
        dropdown.classList.remove('cs-portaled');
        dropdown.style.position = '';
        dropdown.style.left = '';
        dropdown.style.top = '';
        dropdown.style.width = '';
        dropdown.style.zIndex = '';
        wrap.appendChild(dropdown);
      }
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.style.display === 'block';
      closeAll();
      if (!isOpen) {
        syncOptions();
        dropdown.style.display = 'block';
        portalDropdown();
        trigger.classList.add(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target) && e.target !== dropdown && !dropdown.contains(e.target)) {
        unportalDropdown();
        dropdown.style.display = 'none';
        trigger.classList.remove(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        unportalDropdown();
        dropdown.style.display = 'none';
        trigger.classList.remove(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'false');
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

  function initCustomDropdowns() {
    var selects = document.querySelectorAll('.cs-select:not([data-cs-init])');
    for (var i = 0; i < selects.length; i++) {
      buildDropdown(selects[i]);
    }
  }

  window.initCustomDropdown = buildDropdown;
  window.initCustomDropdowns = initCustomDropdowns;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomDropdowns);
  } else {
    initCustomDropdowns();
  }
})();
