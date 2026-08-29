/**
 * Auto-save utility — debounced field-level save with indicator feedback.
 *
 * Usage:
 *   autoSave(document.querySelector('form'), {
 *     url: '/api/v2/servers/:id/settings',
 *     method: 'PATCH',
 *     debounce: 500,
 *     indicator: '#save-indicator',
 *     onSaved: (data) => {},
 *     onError: (err) => {},
 *   });
 *
 * Returns { save(), destroy() }.
 * save() is also available as window.autoSave.save for button triggers.
 */
(function () {
  if (window.autoSave) return;

  var instances = new WeakMap();

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }

  function formatDate() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes().toString().padStart(2, "0");
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + " " + ap;
  }

  /**
   * Collect form data as JSON. Handles inputs, textareas, selects, checkboxes.
   * Skips fields without a name attribute.
   */
  function collectFormData(form) {
    var data = {};
    var inputs = form.querySelectorAll("input, textarea, select");
    inputs.forEach(function (el) {
      var name = el.name || el.getAttribute("data-field-name");
      if (!name) return;

      if (el.type === "checkbox") {
        data[name] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[name] = el.value;
      } else if (el.tagName === "SELECT" && el.multiple) {
        var vals = [];
        el.querySelectorAll("option").forEach(function (opt) {
          if (opt.selected) vals.push(opt.value);
        });
        data[name] = vals;
      } else {
        data[name] = el.value;
      }
    });
    return data;
  }

  /**
   * Show indicator text with fade-in/out.
   */
  function showIndicator(el, text, duration) {
    if (!el) return;
    el.textContent = text;
    el.style.opacity = "1";
    el.style.transition = "opacity 0.15s ease-in";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.style.opacity = "0";
    }, duration || 2000);
  }

  /**
   * Create an auto-save instance on a form element.
   */
  function createAutoSave(form, opts) {
    opts = opts || {};
    var config = {
      url: opts.url,
      method: (opts.method || "PATCH").toUpperCase(),
      debounce: opts.debounce != null ? opts.debounce : 500,
      indicator: opts.indicator || null,
      onSaved: opts.onSaved || null,
      onError: opts.onError || null,
      gatherData: opts.gatherData || null,
      transformPayload: opts.transformPayload || null,
    };

    var indicator =
      typeof config.indicator === "string"
        ? document.querySelector(config.indicator)
        : config.indicator;

    var state = {
      saving: false,
      dirty: false,
      lastSaved: null,
      error: null,
    };

    function save() {
      if (state.saving) return Promise.resolve();

      state.saving = true;
      state.dirty = false;
      state.error = null;
      showIndicator(indicator, "Saving...", 10000);

      var payload;
      if (config.gatherData) {
        payload = config.gatherData(form);
      } else {
        payload = collectFormData(form);
      }

      if (config.transformPayload) {
        payload = config.transformPayload(payload);
      }

      // Resolve URL with :param replacements from data attributes
      var url = config.url;
      var urlParams = form.querySelectorAll("[data-auto-save-url-param]");
      urlParams.forEach(function (el) {
        var key = el.getAttribute("data-auto-save-url-param");
        var val = el.value || el.textContent;
        url = url.replace(":" + key, encodeURIComponent(val));
      });

      // Also try data-auto-save-url on the form itself
      if (form.dataset.autoSaveUrl) {
        url = form.dataset.autoSaveUrl;
      }

      return fetch(url, {
        method: config.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (d) {
                throw new Error(
                  d.error || d.message || "Save failed (" + res.status + ")",
                );
              });
          }
          return res.json();
        })
        .then(function (data) {
          state.saving = false;
          state.lastSaved = formatDate();
          showIndicator(indicator, "\u2713 Saved", 2000);
          if (config.onSaved) config.onSaved(data, form);
          return data;
        })
        .catch(function (err) {
          state.saving = false;
          state.error = err;
          showIndicator(indicator, "Save failed", 3000);
          if (config.onError) config.onError(err, form);
          else if (window.showToast)
            showToast(err.message || "Failed to save", "error");
          return null;
        });
    }

    var debouncedSave = debounce(save, config.debounce);

    function markDirty() {
      state.dirty = true;
    }

    // Attach listeners
    function attach() {
      form.addEventListener("input", function (e) {
        if (!e.target.name && !e.target.dataset.fieldName) return;
        markDirty();
        debouncedSave();
      });

      form.addEventListener("change", function (e) {
        if (!e.target.name && !e.target.dataset.fieldName) return;
        markDirty();
        // Save immediately on change (select, checkbox, radio)
        if (
          e.target.tagName === "SELECT" ||
          e.target.type === "checkbox" ||
          e.target.type === "radio"
        ) {
          save();
        }
      });

      form.addEventListener(
        "blur",
        function (e) {
          if (!e.target.name && !e.target.dataset.fieldName) return;
          if (state.dirty) save();
        },
        true,
      );

      // Save button click
      var saveBtn = form.querySelector("[data-auto-save-btn]");
      if (saveBtn) {
        saveBtn.addEventListener("click", function (e) {
          e.preventDefault();
          save();
        });
      }
    }

    function destroy() {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      instances.delete(form);
    }

    attach();

    var instance = {
      save: save,
      destroy: destroy,
      getState: function () {
        return Object.assign({}, state);
      },
    };

    instances.set(form, instance);
    return instance;
  }

  /**
   * Auto-save a single field (outside a form).
   */
  function createFieldSave(field, opts) {
    opts = opts || {};
    var config = {
      url: opts.url,
      method: (opts.method || "PATCH").toUpperCase(),
      debounce: opts.debounce != null ? opts.debounce : 500,
      indicator: opts.indicator || null,
      onSaved: opts.onSaved || null,
      onError: opts.onError || null,
      getPayload:
        opts.getPayload ||
        function (f) {
          var name = f.name || f.getAttribute("data-field-name");
          var obj = {};
          if (name) obj[name] = f.type === "checkbox" ? f.checked : f.value;
          return obj;
        },
    };

    var indicator =
      typeof config.indicator === "string"
        ? document.querySelector(config.indicator)
        : config.indicator;

    var state = { saving: false, dirty: false, lastSaved: null, error: null };

    function save() {
      if (state.saving) return Promise.resolve();
      state.saving = true;
      state.dirty = false;
      showIndicator(indicator, "Saving...", 10000);

      var payload = config.getPayload(field);
      var url = config.url;

      return fetch(url, {
        method: config.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (d) {
                throw new Error(d.error || d.message || "Save failed");
              });
          }
          return res.json();
        })
        .then(function (data) {
          state.saving = false;
          state.lastSaved = formatDate();
          showIndicator(indicator, "\u2713 Saved", 2000);
          if (config.onSaved) config.onSaved(data);
          return data;
        })
        .catch(function (err) {
          state.saving = false;
          state.error = err;
          showIndicator(indicator, "Failed", 3000);
          if (config.onError) config.onError(err);
          else if (window.showToast)
            showToast(err.message || "Failed to save", "error");
          return null;
        });
    }

    var debouncedSave = debounce(save, config.debounce);

    field.addEventListener("input", function () {
      state.dirty = true;
      debouncedSave();
    });
    field.addEventListener("change", function () {
      state.dirty = true;
      if (
        field.tagName === "SELECT" ||
        field.type === "checkbox" ||
        field.type === "radio"
      ) {
        save();
      }
    });
    field.addEventListener("blur", function () {
      if (state.dirty) save();
    });

    return {
      save: save,
      getState: function () {
        return Object.assign({}, state);
      },
    };
  }

  // Expose
  window.autoSave = createAutoSave;
  window.autoSave.createFieldSave = createFieldSave;
  window.autoSave.collectFormData = collectFormData;
})();
