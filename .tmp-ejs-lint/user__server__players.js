/* inline script 1 */

        (function() {
          const REFRESH_MS = 30000;
          const section = document.getElementById('players-section');
          const countdownEl = document.getElementById('refresh-countdown');
          let lastRefresh = Date.now();

          function esc(s) {
            if (typeof s !== 'string') return '';
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          }

          function renderData(data) {
            const info = data.serverInfo;
            const onlineEl = document.getElementById('onlineCount');
            const maxEl = document.getElementById('maxCount');
            const versionEl = document.getElementById('versionLabel');
            if (info) {
              if (onlineEl) onlineEl.textContent = info.onlinePlayers || 0;
              if (maxEl) maxEl.textContent = info.maxPlayers || 0;
              if (versionEl) versionEl.textContent = 'Version: ' + (info.version || 'Unknown');
            }

            const staticEmpty = document.getElementById('no-players-message');
            let dynamicEmpty = document.getElementById('no-players-dynamic');
            let grid = document.getElementById('PlayersGrid');

            if (data.players && data.players.length) {
              if (dynamicEmpty) { dynamicEmpty.remove(); dynamicEmpty = null; }
              if (staticEmpty) staticEmpty.remove();
              if (!grid && section) {
                grid = document.createElement('div');
                grid.id = 'PlayersGrid';
                grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
                section.appendChild(grid);
              }
              grid.innerHTML = data.players.map(p => {
                const name = esc(p.name);
                const uuid = esc(p.uuid);
                return '<div class="relative p-4 al-card shadow-lg group transition-all duration-200">'
                  + '<div class="flex items-center">'
                  + '<img src="https://crafatar.com/avatars/' + uuid + '?size=64&overlay" alt="' + name + '\'s Avatar" class="rounded-lg mr-4" width="64" height="64" loading="lazy">'
                  + '<div><p class="text-lg font-bold" style="color:var(--theme-text-strong)">' + name + '</p>'
                  + '<div class="flex items-center mt-1"><span class="al-dot-online mr-2"></span>'
                  + '<span class="text-xs" style="color:var(--theme-text-muted)">Online</span></div></div></div></div>';
              }).join('');
            } else {
              if (grid) grid.remove();
              if (staticEmpty) staticEmpty.remove();
              if (!dynamicEmpty && section) {
                dynamicEmpty = document.createElement('div');
                dynamicEmpty.id = 'no-players-dynamic';
                dynamicEmpty.className = 'rounded-xl p-8 text-center';
                dynamicEmpty.style.cssText = 'background:var(--theme-bg-card);border:1px solid var(--theme-border)';
                dynamicEmpty.innerHTML = '<h2 class="text-xl font-semibold text-neutral-700 dark:text-neutral-300">No players online</h2>'
                  + '<p class="mt-2 text-sm text-neutral-500 max-w-md mx-auto">Players will appear here when they join.</p>';
                section.appendChild(dynamicEmpty);
              }
            }
          }

          async function refreshPlayers() {
            lastRefresh = Date.now();
            try {
              const res = await fetch('/server/null/players/data', { headers: { 'Accept': 'application/json' } });
              if (!res.ok) return;
              const data = await res.json();
              if (data.error) return;
              renderData(data);
              const banner = document.getElementById('players-error-banner');
              if (banner) banner.style.display = 'none';
            } catch (e) { /* keep the last known state */ }
          }
          window.refreshPlayers = refreshPlayers;

          if (countdownEl) {
            setInterval(function() {
              const remaining = Math.max(0, Math.ceil((REFRESH_MS - (Date.now() - lastRefresh)) / 1000));
              countdownEl.textContent = remaining;
            }, 500);
          }

          refreshPlayers();
          setInterval(refreshPlayers, REFRESH_MS);
        })();
      