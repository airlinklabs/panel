/* inline script 1 */

(function () {
  var wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var ws = new WebSocket(wsProtocol + '//' + window.location.host + '/online-check');
  ws.addEventListener('error', function () {});

  function themeVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // Highlight account/logout when on those pages
  function markSpecialLinks(path) {
    var pillBg = themeVar('--theme-text', '#171717');
    var pillFg = themeVar('--theme-bg', '#f0f0f0');
    var account = document.getElementById('sidebar-account-link');
    var logout  = document.getElementById('sidebar-logout-link');
    var logo = document.getElementById('sidebar-logo-link');
    if (account) {
      var onAccount = path === '/account' || path.startsWith('/account/');
      var userText = account.querySelector('#sidebar-username');
      if (onAccount) {
        account.style.background = pillBg;
        account.style.color = pillFg;
        account.style.fontWeight = '700';
        if (userText) userText.parentElement.style.color = pillFg;
      } else {
        account.style.background = '';
        account.style.color = '';
        account.style.fontWeight = '';
        if (userText) userText.parentElement.style.color = '';
      }
    }
    if (logo) {
      var onCredits = path === '/credits' || path.startsWith('/credits/');
      var logoBlock = document.getElementById('sidebar-logo-block');
      var logoTitle = logo.querySelector('h1');
      var logoImg = logo.querySelector('img');
      if (onCredits) {
        if (logoBlock) {
          logoBlock.style.background = pillBg;
          logoBlock.style.borderRadius = '0.75rem';
        }
        logo.style.color = pillFg;
        if (logoImg) logoImg.style.background = pillFg;
        if (logoTitle) {
          logoTitle.style.color = pillFg;
          logoTitle.style.fontWeight = '700';
        }
      } else {
        if (logoBlock) {
          logoBlock.style.background = '';
          logoBlock.style.borderRadius = '';
        }
        logo.style.color = '';
        if (logoImg) logoImg.style.background = '';
        if (logoTitle) {
          logoTitle.style.color = '';
          logoTitle.style.fontWeight = '';
        }
      }
    }
    if (logout) {
      logout.style.background = '';
    }
  }

  // Mark active nav link
  function markActiveNav(path) {
    var pillBg = themeVar('--theme-text', '#171717');
    var pillFg = themeVar('--theme-bg', '#f0f0f0');

    // Server control links: highlight the single best match only
    var srvLinks = document.querySelectorAll('[data-server-control-link]');
    var srvBest = null;
    var bestLen = -1;
    srvLinks.forEach(function(link) {
      link.classList.remove('active');
      link.style.color = '';
      link.style.background = '';
      var href = link.getAttribute('href') || '';
      var matched = path === href || (href !== '/' && path.startsWith(href + '/'));
      if (matched && href.length > bestLen) {
        bestLen = href.length;
        srvBest = link;
      }
    });
    if (srvBest) {
      srvBest.classList.add('active');
      srvBest.style.color = pillFg;
      srvBest.style.background = pillBg;
      srvBest.style.borderRadius = '0.75rem';
    }

    var links = document.querySelectorAll('.nav-link');
    links.forEach(function(link) {
      if (link.hasAttribute('data-server-control-link')) return;
      var href = link.getAttribute('href');
      var prefix = link.getAttribute('data-match-prefix');
      // On a server page the server controls own the highlight — don't
      // also light up the Dashboard item whose prefix matches /server.
      if (srvBest && prefix && path.startsWith(prefix)) return;
      var active = false;
      if (href && path === href) {
        active = true;
      } else if (prefix && path.startsWith(prefix)) {
        active = true;
      } else if (href && path.startsWith(href + '/')) {
        active = true;
      }
      if (active) {
        link.classList.add('active');
        link.style.color = pillFg;
        link.style.background = pillBg;
        link.style.borderRadius = '0.75rem';
      } else {
        link.classList.remove('active');
        link.style.color = '';
        link.style.background = '';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    markSpecialLinks(window.location.pathname);
    markActiveNav(window.location.pathname);
    // Show sidebar
    document.getElementById('pc-sidebar').style.display = '';
  });
  document.addEventListener('al:navigated', function () {
    markSpecialLinks(window.location.pathname);
    markActiveNav(window.location.pathname);
  });
})();

/* inline script 2 */

/* inline script 3 */

(function() {
  var btn = document.getElementById('theme-toggle-topbar');
  btn.addEventListener('click', function() {
    if (typeof toggleTheme === 'function') toggleTheme();
  });
})();

/* inline script 4 */

(function () {
  var ov = document.getElementById('pl-overlay');
  if (!ov) return;
  ov.style.left   = '224px';
  ov.style.top    = '64px';
  ov.style.right  = '0';
  ov.style.bottom = '0';
  ov.style.display = 'flex';
})();
