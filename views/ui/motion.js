window.motion = {
  in(el, preset = 'fadeUp', delay = 0) {
    if (!el) return;
    el.style.animationDelay = delay + 'ms';
    el.classList.add('anim-' + preset.replace(/([A-Z])/g, '-$1').toLowerCase());
  },
  out(el, cb) {
    if (!el) { if (cb) cb(); return; }
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(cb, 210);
  }
};
