/**
 * Pure toast creation logic — extracted from views/components/toast.ejs
 * for unit testing. The DOM rendering stays in the EJS template.
 *
 * Exposes: window.ALToastLogic (browser) or module.exports (Node tests).
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') window.ALToastLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var colorMap = {
    error:   'var(--theme-danger)',
    success: 'var(--theme-success)',
    warning: 'var(--theme-warning)',
    loading: 'var(--theme-info)',
    info:    'var(--theme-info)',
  };

  /**
   * interpretJob maps a polled endpoint payload to a minimal view:
   *   { message?, done, success, error }
   * Handles both the generic progress convention and the server status
   * convention ({ state: installed|failed }) used by installs.
   */
  function interpretJob(data) {
    if (!data || typeof data !== 'object') return {};
    if (typeof data.state === 'string') {
      var st = data.state;
      if (st === 'installed') return { done: true, success: true, message: 'Installation complete.' };
      if (st === 'failed') return { done: true, success: false, error: data.error || 'Installation failed.' };
      return { message: typeof data.error === 'string' ? data.error : undefined };
    }
    var done = data.done === true || data.success === true || data.success === false || !!data.error;
    return {
      message: typeof data.message === 'string' ? data.message : undefined,
      done: done,
      success: !(data.success === false || !!data.error),
      error: data.error,
    };
  }

  function uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function createRecord(message, type, opts) {
    opts = opts || {};
    var isActive = opts.progress === true || type === 'loading';
    return {
      id: uid(),
      group: typeof opts.group === 'string' && opts.group ? opts.group : null,
      mode: isActive ? 'active' : 'toast',
      message: String(message),
      type: type,
      startedAt: Date.now(),
      duration: isActive ? 0 : (typeof opts.duration === 'number' ? opts.duration : 5000),
      finished: false,
      success: null,
      finishedAt: null,
      job: opts.job && typeof opts.job === 'object' ? Object.assign({}, opts.job) : null,
    };
  }

  return {
    colorMap: colorMap,
    interpretJob: interpretJob,
    createRecord: createRecord,
    uid: uid,
  };
});
