(function() {
  var currentPath = window.location.pathname;
  var navLinks = document.querySelectorAll('.nav-link2');

  var moreBtn = document.getElementById('server-nav-more-btn') || document.getElementById('mobile-more-btn');
  var moreDropdown = document.getElementById('server-nav-more-dropdown') || document.getElementById('mobile-more-dropdown');

  if (moreBtn && moreDropdown) {
    if (window.initPortalDropdown) {
      moreDropdown.style.display = 'none';
      moreDropdown.classList.add('hidden');
      window.initPortalDropdown(moreBtn, moreDropdown);
    } else {
      moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        moreDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', function() {
        moreDropdown.classList.add('hidden');
      });
    }
  }

  function updateActiveLink() {
    var activeLink = null;
    navLinks.forEach(function(link) {
      if (link.tagName === 'BUTTON') return;
      var href = link.getAttribute('href');
      if (!href) return;
      var normalizedHref = href.replace(/\/$/, '');
      var normalizedPath = currentPath.replace(/\/$/, '');
      if (normalizedHref === normalizedPath || normalizedPath.startsWith(normalizedHref + '/')) {
        activeLink = link;
      }
    });

    navLinks.forEach(function(link) {
      link.removeAttribute('data-active');
      link.classList.remove('bg-neutral-100', 'dark:bg-white/10', 'border-neutral-200', 'dark:border-neutral-700/30', 'text-neutral-900', 'dark:text-white', 'font-medium');
      link.setAttribute('data-active', 'false');
    });

    if (activeLink) {
      activeLink.setAttribute('data-active', 'true');
      activeLink.classList.add('bg-neutral-100', 'dark:bg-white/10', 'border-neutral-200', 'dark:border-neutral-700/30', 'text-neutral-900', 'dark:text-white', 'font-medium');

      if (moreDropdown) {
        var moreLinks = moreDropdown.querySelectorAll('a');
        moreLinks.forEach(function(link) {
          link.classList.remove('bg-neutral-100', 'dark:bg-white/10', 'text-neutral-900', 'dark:text-white', 'font-medium');
        });
        var activeHref = activeLink.getAttribute('href');
        if (activeHref) {
          moreLinks.forEach(function(link) {
            if (link.getAttribute('href') === activeHref) {
              link.classList.add('bg-neutral-100', 'dark:bg-white/10', 'text-neutral-900', 'dark:text-white', 'font-medium');
            }
          });
        }
      }

      var strip = activeLink.closest('.overflow-x-auto');
      if (strip) {
        var linkLeft = activeLink.offsetLeft;
        var linkWidth = activeLink.offsetWidth;
        var stripWidth = strip.offsetWidth;
        strip.scrollLeft = linkLeft - (stripWidth / 2) + (linkWidth / 2);
      }
    }
  }

  updateActiveLink();
  window.addEventListener('popstate', function() {
    currentPath = window.location.pathname;
    updateActiveLink();
  });
})();
