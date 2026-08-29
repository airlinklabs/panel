/**
 * Alpine.js bootstrap module — shared data factories for repeated local behaviour.
 *
 * Registered factories:
 * - disclosure: open/closed toggle for expandable sections
 * - confirmAction: temporary confirmation state for destructive actions
 * - formDirty: tracks whether a form has unsaved changes
 * - tabs: tab switcher with URL hash sync
 * - autoSaveForm: manages a group of auto-save fields with save button
 * - togglePanel: slide-out panel with open/close state
 * - stepWizard: multi-step form progression
 * - dropdown: positioned dropdown menu with click-outside
 * - formValidator: real-time inline field validation
 * - fileExplorer: file manager state (selection, path, view mode)
 * - serverConsole: console state (scroll lock, font size)
 */
(function () {
  if (window.__alpineBootstrap) return;
  window.__alpineBootstrap = true;

  document.addEventListener("alpine:init", function () {
    // ── Disclosure ──────────────────────────────────────────────────────
    Alpine.data("disclosure", function () {
      return {
        open: false,
        toggle: function () {
          this.open = !this.open;
        },
      };
    });

    // ── Confirm action ──────────────────────────────────────────────────
    Alpine.data("confirmAction", function (opts) {
      return {
        confirming: false,
        requestConfirm: function () {
          this.confirming = true;
        },
        confirm: function () {
          this.confirming = false;
          if (opts && typeof opts.onConfirm === "function") opts.onConfirm();
        },
        cancel: function () {
          this.confirming = false;
        },
      };
    });

    // ── Form dirty tracker ──────────────────────────────────────────────
    Alpine.data("formDirty", function () {
      return {
        dirty: false,
        reset: function () {
          this.dirty = false;
        },
      };
    });

    // ── Tabs with URL hash sync ────────────────────────────────────────
    Alpine.data("tabs", function (opts) {
      var initial = (opts && opts.initial) || "general";
      var hashSync = opts && opts.hashSync !== false;

      // Read initial tab from URL hash if hashSync enabled
      if (hashSync && window.location.hash) {
        var hashTab = window.location.hash.replace("#", "");
        if (hashTab) initial = hashTab;
      }

      return {
        current: initial,
        select: function (tab) {
          this.current = tab;
          if (hashSync) {
            history.replaceState(null, null, "#" + tab);
          }
        },
        isActive: function (tab) {
          return this.current === tab;
        },
      };
    });

    // ── Auto-save form ─────────────────────────────────────────────────
    // Wraps auto-save.js with Alpine reactive state.
    // Usage: <form x-data="autoSaveForm({ url: '/api/...', method: 'PATCH' })">
    Alpine.data("autoSaveForm", function (config) {
      config = config || {};
      return {
        saving: false,
        dirty: false,
        lastSaved: null,
        error: null,
        _autoSave: null,

        init: function () {
          var self = this;
          var form = this.$el;
          if (!form || form.tagName !== "FORM") return;

          this._autoSave = window.autoSave(form, {
            url: config.url,
            method: config.method || "PATCH",
            debounce: config.debounce != null ? config.debounce : 500,
            indicator: config.indicator || null,
            gatherData: config.gatherData || null,
            transformPayload: config.transformPayload || null,
            onSaved: function (data) {
              self.saving = false;
              self.dirty = false;
              self.lastSaved = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              self.error = null;
              if (config.onSaved) config.onSaved(data);
            },
            onError: function (err) {
              self.saving = false;
              self.error = err;
              if (config.onError) config.onError(err);
            },
          });

          // Watch for state changes
          form.addEventListener("input", function () {
            self.dirty = true;
          });
        },

        save: function () {
          if (this._autoSave) {
            this.saving = true;
            this._autoSave.save();
          }
        },
      };
    });

    // ── Toggle panel (slide-out sidebar) ────────────────────────────────
    Alpine.data("togglePanel", function () {
      return {
        open: false,
        toggle: function () {
          this.open = !this.open;
        },
        close: function () {
          this.open = false;
        },
        openPanel: function () {
          this.open = true;
        },
      };
    });

    // ── Step wizard ────────────────────────────────────────────────────
    // steps: [{ name, validate? }]
    Alpine.data("stepWizard", function (steps) {
      steps = steps || [];
      return {
        currentStep: 0,
        steps: steps,
        errors: {},

        next: function () {
          var step = this.steps[this.currentStep];
          if (step && step.validate) {
            var errs = step.validate();
            if (errs && Object.keys(errs).length > 0) {
              this.errors = errs;
              return;
            }
          }
          this.errors = {};
          if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
          }
        },

        prev: function () {
          this.errors = {};
          if (this.currentStep > 0) {
            this.currentStep--;
          }
        },

        goTo: function (idx) {
          this.errors = {};
          this.currentStep = idx;
        },

        isFirst: function () {
          return this.currentStep === 0;
        },
        isLast: function () {
          return this.currentStep === this.steps.length - 1;
        },
        isStepActive: function (idx) {
          return this.currentStep === idx;
        },
      };
    });

    // ── Dropdown ───────────────────────────────────────────────────────
    Alpine.data("dropdown", function () {
      return {
        open: false,
        toggle: function () {
          this.open = !this.open;
        },
        close: function () {
          this.open = false;
        },
      };
    });

    // ── Form validator ─────────────────────────────────────────────────
    // rules: { fieldName: [{ test: (val) => bool, message: '...' }] }
    Alpine.data("formValidator", function (rules) {
      rules = rules || {};
      return {
        errors: {},
        touched: {},

        validate: function (fieldName, value) {
          var fieldRules = rules[fieldName] || [];
          var errs = [];
          for (var i = 0; i < fieldRules.length; i++) {
            if (!fieldRules[i].test(value)) {
              errs.push(fieldRules[i].message);
            }
          }
          if (errs.length > 0) {
            this.errors[fieldName] = errs;
          } else {
            delete this.errors[fieldName];
          }
          return errs.length === 0;
        },

        validateAll: function () {
          var valid = true;
          var keys = Object.keys(rules);
          for (var i = 0; i < keys.length; i++) {
            var el = this.$el.querySelector('[name="' + keys[i] + '"]');
            if (el) {
              if (!this.validate(keys[i], el.value)) valid = false;
              this.touched[keys[i]] = true;
            }
          }
          return valid;
        },

        hasError: function (fieldName) {
          return !!(
            this.errors[fieldName] && this.errors[fieldName].length > 0
          );
        },

        getError: function (fieldName) {
          return (this.errors[fieldName] && this.errors[fieldName][0]) || "";
        },

        clearError: function (fieldName) {
          delete this.errors[fieldName];
        },

        onInput: function (fieldName, value) {
          this.touched[fieldName] = true;
          this.validate(fieldName, value);
        },
      };
    });

    // ── File explorer ──────────────────────────────────────────────────
    Alpine.data("fileExplorer", function () {
      return {
        currentPath: "/",
        selected: [],
        viewMode: "list", // 'list' | 'grid'
        sortBy: "name",
        sortDir: "asc",

        selectFile: function (name) {
          var idx = this.selected.indexOf(name);
          if (idx === -1) this.selected.push(name);
          else this.selected.splice(idx, 1);
        },

        selectAll: function (names) {
          if (this.selected.length === names.length) {
            this.selected = [];
          } else {
            this.selected = names.slice();
          }
        },

        clearSelection: function () {
          this.selected = [];
        },

        navigate: function (path) {
          this.currentPath = path;
          this.selected = [];
        },
        goUp: function () {
          var parts = this.currentPath.split("/").filter(Boolean);
          parts.pop();
          this.currentPath = "/" + parts.join("/");
          this.selected = [];
        },

        toggleView: function () {
          this.viewMode = this.viewMode === "list" ? "grid" : "list";
        },

        toggleSort: function (col) {
          if (this.sortBy === col)
            this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
          else {
            this.sortBy = col;
            this.sortDir = "asc";
          }
        },
      };
    });

    // ── Server console ─────────────────────────────────────────────────
    Alpine.data("serverConsole", function () {
      return {
        connected: false,
        scrollLock: true,
        fontSize: 13,
        lines: [],

        toggleScrollLock: function () {
          this.scrollLock = !this.scrollLock;
        },
        increaseFont: function () {
          this.fontSize = Math.min(24, this.fontSize + 1);
        },
        decreaseFont: function () {
          this.fontSize = Math.max(10, this.fontSize - 1);
        },
        clear: function () {
          this.lines = [];
        },
      };
    });
  });

  // Expose factories globally for documentation
  window.al = window.al || {};
  window.al.disclosure = function () {
    return {
      open: false,
      toggle: function () {
        this.open = !this.open;
      },
    };
  };
  window.al.confirmAction = function (opts) {
    return {
      confirming: false,
      requestConfirm: function () {
        this.confirming = true;
      },
      confirm: function () {
        this.confirming = false;
        if (opts && typeof opts.onConfirm === "function") opts.onConfirm();
      },
      cancel: function () {
        this.confirming = false;
      },
    };
  };
  window.al.formDirty = function () {
    return {
      dirty: false,
      reset: function () {
        this.dirty = false;
      },
    };
  };
  window.al.tabs = function (opts) {
    var initial = (opts && opts.initial) || "general";
    return {
      current: initial,
      select: function (t) {
        this.current = t;
      },
      isActive: function (t) {
        return this.current === t;
      },
    };
  };
  window.al.autoSaveForm = function (c) {
    return { saving: false, dirty: false, lastSaved: null };
  };
  window.al.togglePanel = function () {
    return {
      open: false,
      toggle: function () {
        this.open = !this.open;
      },
    };
  };
  window.al.stepWizard = function (s) {
    return { currentStep: 0, steps: s || [] };
  };
  window.al.dropdown = function () {
    return {
      open: false,
      toggle: function () {
        this.open = !this.open;
      },
    };
  };
})();
