/* Physics motion engine — springs for popups, panels, and press feedback.
 *
 * API:
 *   Phys.to(el, props, opts)            spring props {x,y,scale,rotate,opacity} to targets → Promise
 *   Phys.set(el, props)                 apply instantly
 *   Phys.enter(el, opts)                open animation: panel springs in, backdrop fades → Promise
 *   Phys.exit(el, opts)                 close animation: panel springs out fast, done() after
 *   Phys.press(el)                      one-shot press impulse
 *   Phys.bindPress()                    global delegated press feedback (buttons, cards, nav)
 *
 * opts for enter/exit: { panel, y, scale, stiffness, damping, duration }
 *   panel: element or selector of the panel to spring (auto-detected:
 *   [role="dialog"], .relative, or first element child of el)
 *
 * All springs respect prefers-reduced-motion (instant, no motion).
 */
(function () {
  if (window.Phys) return;

  const REDUCED =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stateKey = '__physState';

  function readState(el) {
    if (!el[stateKey]) {
      el[stateKey] = {
        raf: null,
        x: 0, y: 0, scale: 1, rotate: 0, opacity: 1,
        vx: 0, vy: 0, vs: 0, vr: 0, vo: 0,
        target: null,
        resolve: null,
      };
    }
    return el[stateKey];
  }

  function apply(el, s) {
    let t = '';
    if (s.x !== 0 || s.y !== 0 || s.scale !== 1 || s.rotate !== 0) {
      t = 'translate3d(' + s.x.toFixed(3) + 'px,' + s.y.toFixed(3) + 'px,0) scale(' +
        s.scale.toFixed(4) + ') rotate(' + s.rotate.toFixed(3) + 'deg)';
    }
    el.style.transform = t;
    if (s.opacity !== undefined) el.style.opacity = String(s.opacity);
  }

  function springStep(s, key, target, stiffness, damping, mass, dt) {
    const v = s[key];
    const f = (target - s[key]);
    const a = (f * stiffness - v * damping) / mass;
    return v + a * dt;
  }

  function runSpring(el, s, opts) {
    const { stiffness = 220, damping = 16, mass = 1, duration = 500 } = opts;
    const t = s.target;
    let last = performance.now();
    let elapsed = 0;

    function tick(now) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      elapsed += dt;

      s.vx = springStep(s, 'vx', t.x, stiffness, damping, mass, dt);
      s.vy = springStep(s, 'vy', t.y, stiffness, damping, mass, dt);
      s.vs = springStep(s, 'vs', t.scale, stiffness, damping, mass, dt);
      s.vr = springStep(s, 'vr', t.rotate, stiffness, damping, mass, dt);
      if (t.opacity !== undefined) s.vo = springStep(s, 'vo', t.opacity, stiffness, damping, mass, dt);

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.scale += s.vs * dt;
      s.rotate += s.vr * dt;
      if (t.opacity !== undefined) s.opacity += s.vo * dt;

      apply(el, s);

      const settled =
        Math.abs(s.vx) < 0.001 && Math.abs(s.x - t.x) < 0.002 &&
        Math.abs(s.vy) < 0.001 && Math.abs(s.y - t.y) < 0.002 &&
        Math.abs(s.vs) < 0.0004 && Math.abs(s.scale - t.scale) < 0.0006 &&
        Math.abs(s.vr) < 0.001 && Math.abs(s.rotate - t.rotate) < 0.002 &&
        (t.opacity === undefined || (Math.abs(s.vo) < 0.0005 && Math.abs(s.opacity - t.opacity) < 0.002));

      if (!settled && elapsed < duration + 1000) {
        s.raf = requestAnimationFrame(tick);
      } else {
        apply(el, t);
        s.raf = null;
        if (s.resolve) { const r = s.resolve; s.resolve = null; r(); }
      }
    }

    s.raf = requestAnimationFrame(tick);
  }

  function to(el, props, opts) {
    const s = readState(el);
    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = null; }
    s.target = {
      x: props.x !== undefined ? props.x : s.x,
      y: props.y !== undefined ? props.y : s.y,
      scale: props.scale !== undefined ? props.scale : s.scale,
      rotate: props.rotate !== undefined ? props.rotate : s.rotate,
      opacity: props.opacity !== undefined ? props.opacity : s.opacity,
    };
    if (s.resolve) { s.resolve(); s.resolve = null; }
    return new Promise((resolve) => {
      s.resolve = resolve;
      if (REDUCED) {
        s.x = s.target.x; s.y = s.target.y; s.scale = s.target.scale;
        s.rotate = s.target.rotate; s.opacity = s.target.opacity;
        s.vx = s.vy = s.vs = s.vr = s.vo = 0;
        apply(el, s);
        const r = s.resolve; s.resolve = null; r();
        return;
      }
      runSpring(el, s, opts);
    });
  }

  function set(el, props) {
    const s = readState(el);
    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = null; }
    if (s.resolve) { s.resolve(); s.resolve = null; }
    s.x = props.x !== undefined ? props.x : s.x;
    s.y = props.y !== undefined ? props.y : s.y;
    s.scale = props.scale !== undefined ? props.scale : s.scale;
    s.rotate = props.rotate !== undefined ? props.rotate : s.rotate;
    s.opacity = props.opacity !== undefined ? props.opacity : s.opacity;
    s.target = { x: s.x, y: s.y, scale: s.scale, rotate: s.rotate, opacity: s.opacity };
    s.vx = s.vy = s.vs = s.vr = s.vo = 0;
    apply(el, s);
  }

  function resolvePanel(el, panel) {
    if (typeof panel === 'string') return el.querySelector(panel);
    if (panel instanceof Element) return panel;
    return (
      el.querySelector('[role="dialog"]') ||
      el.querySelector('.relative') ||
      (el.firstElementChild && el.firstElementChild.tagName !== 'STYLE' ? el.firstElementChild : el)
    );
  }

  function enter(el, opts) {
    opts = opts || {};
    const panel = resolvePanel(el, opts.panel);
    const y = opts.y !== undefined ? opts.y : 16;
    const scale = opts.scale !== undefined ? opts.scale : 0.94;
    const stiffness = opts.stiffness || 240;
    const damping = opts.damping || 17;

    el.style.transition = 'opacity 0.18s ease';
    el.style.opacity = '0';
    if (el.classList.contains('opacity-0')) el.classList.remove('opacity-0', 'pointer-events-none');
    el.classList.add('phys-visible');
    void el.offsetHeight;
    el.style.opacity = '1';

    set(panel, { x: 0, y: y, scale: scale, opacity: REDUCED ? 1 : 0 });
    return to(panel, { x: 0, y: 0, scale: 1, opacity: 1 }, { stiffness, damping });
  }

  function exit(el, opts) {
    opts = opts || {};
    const panel = resolvePanel(el, opts.panel);
    const done = opts.done || function () {};
    if (REDUCED) { done(); return Promise.resolve(); }
    return to(
      panel,
      { x: 0, y: 8, scale: 0.95, opacity: 0 },
      { stiffness: 340, damping: 24 }
    ).then(function () {
      el.style.transition = 'opacity 0.14s ease';
      el.style.opacity = '0';
      setTimeout(function () {
        el.style.opacity = '';
        el.style.transition = '';
        el.classList.remove('phys-visible');
        done();
      }, 140);
    });
  }

  /* Press impulse — scale toward the touch point with a springy pop-back */
  function press(el) {
    if (REDUCED) return;
    try {
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.965)' }],
        { duration: 100, easing: 'ease-out', fill: 'forwards' }
      );
    } catch (e) { /* animation unsupported — ignore */ }
  }

  function pressBack(el) {
    if (REDUCED) return;
    try {
      el.animate(
        [
          { transform: 'scale(0.965)' },
          { transform: 'scale(1.012)', offset: 0.55 },
          { transform: 'scale(1)' },
        ],
        { duration: 280, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
    } catch (e) { /* ignore */ }
  }

  const PRESS_SELECTOR =
    'button, [role="button"], .al-card, .nav-link, .mobile-nav-link, .m-tab, .tab-btn, ' +
    '.cs-trigger, .al-btn-primary, .al-btn-secondary, .al-btn-ghost, .al-btn-danger, [data-press]';

  let bound = false;

  function bindPress() {
    if (bound || typeof document === 'undefined') return;
    bound = true;
    document.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      const t = e.target.closest(PRESS_SELECTOR);
      if (!t || t.disabled) return;
      if (t.closest('.phys-no-press')) return;
      press(t);
      let released = false;
      const release = function () {
        if (released) return;
        released = true;
        pressBack(t);
        t.removeEventListener('pointerup', release);
        t.removeEventListener('pointercancel', release);
        t.removeEventListener('pointerleave', release);
      };
      t.addEventListener('pointerup', release, { once: true });
      t.addEventListener('pointercancel', release, { once: true });
      t.addEventListener('pointerleave', release, { once: true });
    });
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPress);
  } else if (typeof document !== 'undefined') {
    bindPress();
  }

  window.Phys = { to: to, set: set, enter: enter, exit: exit, press: press, bindPress: bindPress };
})();
