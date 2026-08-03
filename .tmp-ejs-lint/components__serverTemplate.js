/* inline script 1 */

   (function () {
     // Scope to this include's own container — serverTemplate is rendered
     // twice (desktop + mobile mains) and querying the whole document would
     // let the hidden layout's links steal the highlight.
     var root = document.currentScript ? document.currentScript.parentNode : document;
     var navLinks2 = root.querySelectorAll('.nav-link2');

     function updateActiveLink(path) {
       var activeLink = null;
       var bestLen = 0;
       navLinks2.forEach(function(link) {
         link.setAttribute('data-active', 'false');
         var href = link.getAttribute('href') || '';
         var matched = path === href || (href !== '/' && path.startsWith(href + '/'));
         if (matched && href.length >= bestLen) {
           bestLen = href.length;
           activeLink = link;
         }
       });

       if (activeLink) {
         activeLink.setAttribute('data-active', 'true');
       }
     }

     function syncActiveLink() {
       updateActiveLink(window.location.pathname);
     }

     if (document.readyState === 'loading') {
       document.addEventListener('DOMContentLoaded', syncActiveLink);
     } else {
       syncActiveLink();
     }

      window.addEventListener('popstate', syncActiveLink);
      document.addEventListener('al:navigated', syncActiveLink);

      // Mobile group tabs — show the active group's items, keep the current
      // path's group selected on load.
      var tabButtons = root.querySelectorAll('[data-nav-group-tab]');
      var groups = root.querySelectorAll('[data-nav-group]');

      function selectGroup(name) {
        groups.forEach(function(group) {
          group.classList.toggle('hidden', group.getAttribute('data-nav-group') !== name);
        });
        tabButtons.forEach(function(btn) {
          var on = btn.getAttribute('data-nav-group-tab') === name;
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
          if (on) {
            btn.style.color = 'var(--theme-accent)';
            btn.style.borderColor = 'var(--theme-accent)';
          } else {
            btn.style.color = 'var(--theme-text-muted)';
            btn.style.borderColor = 'transparent';
          }
        });
      }

      tabButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          selectGroup(btn.getAttribute('data-nav-group-tab'));
        });
      });
   })();
  