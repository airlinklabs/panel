/**
 * Event Delegation System for CSP Compliance
 *
 * Replaces inline onclick/onchange/onsubmit handlers with data-* attributes
 * and a single delegated event listener. This allows removing 'unsafe-inline'
 * from scriptSrcAttr CSP directive.
 *
 * Usage in EJS:
 *   <button data-action="close-modal" data-target="#myModal">Close</button>
 *   <button data-action="submit-form" data-form="#myForm">Submit</button>
 *   <input data-action="toggle-visibility" data-target="#password">
 *
 * Supported actions:
 *   - click: Generic click handler (calls window[data-action])
 *   - close-modal: Closes a <dialog> element
 *   - open-modal: Opens a <dialog> element
 *   - submit-form: Submits a form
 *   - toggle-visibility: Toggles element visibility
 *   - copy-to-clipboard: Copies text to clipboard
 *   - navigate: Navigates to URL
 *   - prevent-default: Prevents default and stops propagation
 */
(function() {
  'use strict';

  const DELEGATION_ATTR = 'data-action';
  const handlers = {};

  // Register a custom action handler
  function registerAction(name, handler) {
    handlers[name] = handler;
  }

  // Built-in action handlers
  registerAction('close-modal', function(e, el) {
    const target = el.dataset.target;
    if (target) {
      const dialog = document.querySelector(target);
      if (dialog && dialog.tagName === 'DIALOG') {
        dialog.close();
      } else if (dialog) {
        dialog.classList.add('hidden');
        dialog.setAttribute('aria-hidden', 'true');
      }
    } else {
      // Close nearest parent dialog
      const dialog = el.closest('dialog');
      if (dialog) dialog.close();
    }
  });

  registerAction('open-modal', function(e, el) {
    const target = el.dataset.target;
    if (target) {
      const dialog = document.querySelector(target);
      if (dialog && dialog.tagName === 'DIALOG') {
        dialog.showModal();
      } else if (dialog) {
        dialog.classList.remove('hidden');
        dialog.removeAttribute('aria-hidden');
      }
    }
  });

  registerAction('submit-form', function(e, el) {
    const target = el.dataset.form || el.dataset.target;
    if (target) {
      const form = document.querySelector(target);
      if (form && form.tagName === 'FORM') {
        form.submit();
      }
    }
  });

  registerAction('toggle-visibility', function(e, el) {
    const target = el.dataset.target;
    if (target) {
      const element = document.querySelector(target);
      if (element) {
        element.classList.toggle('hidden');
        const isHidden = element.classList.contains('hidden');
        el.setAttribute('aria-expanded', String(!isHidden));
      }
    }
  });

  registerAction('copy-to-clipboard', function(e, el) {
    const text = el.dataset.text || el.dataset.value;
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        el.classList.add('copied');
        setTimeout(function() { el.classList.remove('copied'); }, 2000);
      });
    }
  });

  registerAction('navigate', function(e, el) {
    const url = el.dataset.url || el.dataset.href;
    if (url) {
      window.location.href = url;
    }
  });

  registerAction('prevent-default', function(e, el) {
    e.preventDefault();
    e.stopPropagation();
  });

  // Main delegation handler
  function handleDelegatedEvent(e) {
    const target = e.target;
    if (!target || !target.getAttribute) return;

    // Find the closest element with data-action
    const actionEl = target.closest('[' + DELEGATION_ATTR + ']');
    if (!actionEl) return;

    const actionName = actionEl.getAttribute(DELEGATION_ATTR);
    if (!actionName) return;

    // Check for custom action handler first
    if (handlers[actionName]) {
      handlers[actionName](e, actionEl);
      return;
    }

    // Check for window-level handler (legacy support)
    if (typeof window[actionName] === 'function') {
      window[actionName](e, actionEl);
      return;
    }

    // Check for data-callback attribute
    const callbackName = actionEl.dataset.callback;
    if (callbackName && typeof window[callbackName] === 'function') {
      window[callbackName](e, actionEl);
    }
  }

  // Attach to document
  document.addEventListener('click', handleDelegatedEvent, true);
  document.addEventListener('submit', handleDelegatedEvent, true);
  document.addEventListener('change', handleDelegatedEvent, true);
  document.addEventListener('keydown', handleDelegatedEvent, true);

  // Expose for manual registration
  window.ALEventDelegation = {
    register: registerAction,
    handle: handleDelegatedEvent
  };

  // Auto-initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Mark delegated elements for analytics/debugging
      document.querySelectorAll('[' + DELEGATION_ATTR + ']').forEach(function(el) {
        el.setAttribute('data-delegated', 'true');
      });
    });
  }
})();
