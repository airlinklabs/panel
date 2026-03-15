(function () {
  var SPRINT_MS   = 380;
  var HOLD_MS     = 280;
  var FADE_OUT_MS = 340;

  var messages = [
    'Loading...',
    'Fetching data...',
    'Setting things up...',
    'Almost there...',
    'One moment...',
  ];

  var barEl        = null;
  var messageEl    = null;
  var progInterval = null;
  var msgInterval  = null;
  var msgIndex     = 0;
  var hiding       = false;
  var showing      = false;

  function el(id) { return document.getElementById(id); }

  // ── Progress bar ──────────────────────────────────────────────────────────
  function setBar(pct) {
    if (!barEl) barEl = el('pl-bar');
    if (barEl) barEl.style.width = pct + '%';
  }

  function cycleMessage() {
    if (!messageEl) messageEl = el('pl-msg');
    if (!messageEl) return;
    messageEl.style.opacity = '0';
    setTimeout(function () {
      if (!messageEl) return;
      msgIndex = (msgIndex + 1) % messages.length;
      messageEl.textContent = messages[msgIndex];
      messageEl.style.opacity = '1';
    }, 180);
  }

  function startProgress() {
    barEl     = el('pl-bar');
    messageEl = el('pl-msg');
    var pct = 0;
    progInterval = setInterval(function () {
      if (hiding) { clearInterval(progInterval); return; }
      var step = (82 - pct) * 0.065 + 1.2;
      pct = Math.min(pct + step, 82);
      setBar(pct);
    }, 90);
    msgIndex = 0;
    msgInterval = setInterval(cycleMessage, 2200);
  }

  function stopProgress() {
    clearInterval(progInterval);
    clearInterval(msgInterval);
    progInterval = null;
    msgInterval  = null;
  }

  // ── Hide (smooth) ─────────────────────────────────────────────────────────
  function hide() {
    var ov = el('pl-overlay');
    if (!ov || hiding) return;
    hiding  = true;
    showing = false;
    stopProgress();

    if (!barEl) barEl = el('pl-bar');
    if (barEl) {
      barEl.style.transition = 'width ' + SPRINT_MS + 'ms cubic-bezier(0.16,1,0.3,1)';
      setBar(100);
    }

    setTimeout(function () {
      var ov2 = el('pl-overlay');
      if (!ov2) return;
      ov2.style.transition = 'opacity ' + FADE_OUT_MS + 'ms cubic-bezier(0.4,0,1,1)';
      ov2.style.opacity = '0';

      var inner = el('pl-inner');
      if (inner) {
        inner.style.transition =
          'transform ' + (FADE_OUT_MS - 40) + 'ms cubic-bezier(0.4,0,1,1),' +
          'opacity '   + (FADE_OUT_MS - 40) + 'ms cubic-bezier(0.4,0,1,1)';
        inner.style.transform = 'translateY(-8px)';
        inner.style.opacity   = '0';
      }

      setTimeout(function () {
        var ov3 = el('pl-overlay');
        if (ov3 && ov3.parentNode) ov3.parentNode.removeChild(ov3);
        barEl     = null;
        messageEl = null;
        hiding    = false;
      }, FADE_OUT_MS);
    }, SPRINT_MS + HOLD_MS);
  }

  // ── Show (navigation between pages) ──────────────────────────────────────
  // Chrome is already rendered when this runs, so we can read exact offsets.
  function show() {
    if (el('pl-overlay') || showing) return;
    showing = true;
    hiding  = false;

    var dark = false;
    try {
      var stored = localStorage.getItem('theme');
      if (stored === 'dark') dark = true;
      else if (!stored) dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {}

    var bg    = dark ? '#141414' : '#ffffff';
    var fg    = dark ? '#ffffff' : '#171717';
    var muted = '#737373';
    var track = dark ? '#2a2a2a' : '#e5e5e5';
    var bar   = dark ? '#ffffff' : '#171717';

    // Work out which chrome elements are present and get their exact rects
    var top = 0, left = 0, bottom = 0;

    var sidebar  = el('pc-sidebar');
    var colcont  = el('colcont');
    var topBarEl = document.querySelector('.mobile-top-bar');
    var botNavEl = document.querySelector('.mobile-bottom-nav');

    if (sidebar && colcont && window.innerWidth >= 1024) {
      left = Math.round(sidebar.getBoundingClientRect().right);
      var stickyBar = colcont.querySelector('.sticky');
      if (stickyBar) top = Math.round(stickyBar.getBoundingClientRect().bottom);
    } else {
      if (topBarEl) top    = Math.round(topBarEl.getBoundingClientRect().bottom);
      if (botNavEl) bottom = Math.round(window.innerHeight - botNavEl.getBoundingClientRect().top);
    }

    var ov = document.createElement('div');
    ov.id = 'pl-overlay';
    ov.style.cssText =
      'position:fixed;' +
      'top:'    + top    + 'px;' +
      'left:'   + left   + 'px;' +
      'right:0;' +
      'bottom:' + bottom + 'px;' +
      'z-index:99998;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:' + bg + ';opacity:1;pointer-events:all;';

    var inner = document.createElement('div');
    inner.id = 'pl-inner';
    inner.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:18px;';

    var logo = document.createElement('img');
    logo.src = '/assets/logo.png';
    logo.alt = '';
    logo.style.cssText = 'width:42px;height:42px;object-fit:contain;border-radius:10px;display:block;';
    logo.onerror = function () { logo.style.display = 'none'; };

    var parts = document.title.split(' - ');
    var titleEl = document.createElement('p');
    titleEl.textContent = parts[0] || document.title;
    titleEl.style.cssText =
      'margin:0;margin-top:-4px;font-family:inherit;font-size:14px;font-weight:600;' +
      'letter-spacing:-0.015em;color:' + fg + ';';

    var trackEl = document.createElement('div');
    trackEl.style.cssText =
      'width:128px;height:1.5px;border-radius:2px;background:' + track + ';overflow:hidden;';

    barEl = document.createElement('div');
    barEl.id = 'pl-bar';
    barEl.style.cssText =
      'height:100%;width:0%;border-radius:2px;background:' + bar + ';' +
      'transition:width 260ms cubic-bezier(0.4,0,0.2,1);';
    trackEl.appendChild(barEl);

    messageEl = document.createElement('p');
    messageEl.id = 'pl-msg';
    messageEl.textContent = messages[0];
    messageEl.style.cssText =
      'margin:0;margin-top:-4px;font-family:inherit;font-size:11px;' +
      'color:' + muted + ';letter-spacing:0.01em;transition:opacity 180ms ease;';

    inner.appendChild(logo);
    inner.appendChild(titleEl);
    inner.appendChild(trackEl);
    inner.appendChild(messageEl);
    ov.appendChild(inner);
    document.body.insertBefore(ov, document.body.firstChild);

    startProgress();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  // Start progress once the server-rendered overlay is in the DOM
  // (template.ejs has already positioned and shown it by this point)
  document.addEventListener('DOMContentLoaded', function () {
    if (el('pl-overlay')) startProgress();
  });

  // Page fully loaded — fade out
  window.addEventListener('load', function () {
    hide();
  });

  // Back/forward cache
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      show();
      setTimeout(hide, 400);
    }
  });

  // Navigate away — show overlay over content area instantly
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.hasAttribute('download') || a.target === '_blank') return;
    if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    show();
  }, true);

  document.addEventListener('submit', function () {
    show();
  }, true);
})();
