(function () {
  const searchButton = document.getElementById("searchButton");
  const searchOverlay = document.getElementById("searchOverlay");
  const searchPanel = document.getElementById("searchPanel");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const navLinks = document.querySelectorAll(".nav-link");

  if (!searchOverlay || !searchInput || !searchResults) {
    // Search UI not present on this page
  } else {
    let activeIndex = -1;
    let searchTimeout = null;
    let lastQuery = "";
    let panelClosing = false;
    let recentSearches = JSON.parse(
      localStorage.getItem("recentSearches") || "[]",
    );

    const SEARCH_DEBOUNCE_MS = 150;
    const CLOSE_ANIMATION_MS = 230;
    const MAX_RECENT_SEARCHES = 5;
    const MIN_RECENT_LENGTH = 2;
    const FUZZY_MIN_TOKEN_LENGTH = 4;
    const FUZZY_MAX_LENGTH_DIFF = 1;

    const SCORE_EXACT = 100;
    const SCORE_PREFIX = 80;
    const SCORE_CONTAINS = 60;
    const SCORE_ALL_TOKENS = 45;
    const SCORE_ANY_TOKEN = 30;
    const SCORE_FUZZY = 15;

    const isAdmin = !!document.querySelector('a[href="/admin/overview"]');

    const typeIcon = {
      server: alIcon("server", "w-4 h-4 shrink-0 text-neutral-400"),
      user: alIcon("user", "w-4 h-4 shrink-0 text-neutral-400"),
      node: alIcon("hard-drive", "w-4 h-4 shrink-0 text-neutral-400"),
      nav: alIcon("search", "w-4 h-4 shrink-0 text-neutral-400"),
      clock: alIcon("clock", "w-4 h-4 shrink-0 text-neutral-400"),
      arrow: alIcon("arrow-up-right", "w-4 h-4 shrink-0 text-neutral-400"),
      feature: alIcon("sparkles", "w-4 h-4 shrink-0 text-neutral-400"),
    };

    function escHtml(t) {
      return window.escHtml(t);
    }

    function highlightMatch(text, term) {
      if (!term) return escHtml(text);
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp("(" + safe + ")", "gi");
      return escHtml(text).replace(
        regex,
        '<mark class="bg-yellow-200 dark:bg-yellow-600/60 text-yellow-950 dark:text-yellow-50 rounded px-0.5">$1</mark>',
      );
    }

    function saveRecentSearch(term) {
      if (!term || term.length < MIN_RECENT_LENGTH) return;
      recentSearches = recentSearches.filter(function (s) {
        return s !== term;
      });
      recentSearches.unshift(term);
      if (recentSearches.length > MAX_RECENT_SEARCHES)
        recentSearches = recentSearches.slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
    }

    function levenshtein(a, b) {
      const m = a.length,
        n = b.length;
      if (!m) return n;
      if (!n) return m;
      let prev = new Array(n + 1);
      let curr = new Array(n + 1);
      for (let j = 0; j <= n; j++) prev[j] = j;
      for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
          curr[j] = Math.min(
            prev[j] + 1,
            curr[j - 1] + 1,
            prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
          );
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
      }
      return prev[n];
    }

    function normalize(s) {
      return (s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    function fuzzyIncludes(token, haystack) {
      if (token.length < FUZZY_MIN_TOKEN_LENGTH) return false;
      const words = haystack.split(/\s+/);
      for (const w of words) {
        if (Math.abs(w.length - token.length) > FUZZY_MAX_LENGTH_DIFF) continue;
        if (levenshtein(w, token) <= 1) return true;
      }
      return false;
    }

    function scoreTerm(term, hay) {
      if (hay === term) return SCORE_EXACT;
      if (hay.startsWith(term)) return SCORE_PREFIX;
      if (hay.includes(term)) return SCORE_CONTAINS;
      const tokens = term.split(" ");
      if (tokens.length > 1 && tokens.every((t) => hay.includes(t)))
        return SCORE_ALL_TOKENS;
      if (tokens.some((t) => hay.includes(t))) return SCORE_ANY_TOKEN;
      if (tokens.some((t) => fuzzyIncludes(t, hay))) return SCORE_FUZZY;
      return 0;
    }

    const navAliases = {
      servers: "instances instances container containers game server",
      overview: "dashboard home control panel main",
      settings: "settings configuration config preferences options",
      users: "users members people accounts memberships",
      nodes: "nodes machines daemons daemon hosts",
      images: "images docker eggs templates boxes",
      addons: "addons plugins extensions mods",
      "airlink cloud": "cloud backup updates airlinkcloud",
      "api keys": "apikeys api keys tokens access auth",
      account: "account profile me my",
      logout: "logout signout sign out exit",
    };

    const pageCatalog = (function () {
      const pages = [
        {
          label: "Servers",
          url: "/server",
          kw: "instances containers game list dashboard",
        },
        { label: "Dashboard", url: "/", kw: "home dashboard start main" },
        {
          label: "Create Server",
          url: "/create-server",
          kw: "new server instance deploy create",
        },
        {
          label: "Account",
          url: "/account",
          kw: "profile me my settings password avatar email",
        },
      ];
      if (isAdmin) {
        pages.push(
          {
            label: "Admin Overview",
            url: "/admin/overview",
            kw: "dashboard home stats system status",
          },
          {
            label: "Admin Settings",
            url: "/admin/settings",
            kw: "configuration preferences panel options site",
          },
          {
            label: "Admin Servers",
            url: "/admin/servers",
            kw: "manage servers list instances delete",
          },
          {
            label: "Admin Users",
            url: "/admin/users",
            kw: "members accounts people manage delete",
          },
          {
            label: "Admin Nodes",
            url: "/admin/nodes",
            kw: "machines daemons hosts workers allocate",
          },
          {
            label: "Admin Images",
            url: "/admin/images",
            kw: "docker eggs templates boxes images",
          },
          {
            label: "Admin Addons",
            url: "/admin/addons",
            kw: "plugins extensions mods installed",
          },
          {
            label: "Airlink Cloud",
            url: "/airlink-cloud/settings",
            kw: "cloud backup updates airlink",
          },
          {
            label: "API Keys",
            url: "/admin/apikeys",
            kw: "tokens access auth api keys",
          },
          {
            label: "Security",
            url: "/admin/settings",
            kw: "ban bans ips rate limit moderation",
          },
          {
            label: "Player Stats",
            url: "/admin/playerstats",
            kw: "players analytics stats leaderboard top",
          },
          {
            label: "Analytics",
            url: "/admin/analytics",
            kw: "charts stats metrics graphs",
          },
          {
            label: "Addon Store",
            url: "/admin/addons/store",
            kw: "plugins store marketplace extensions install",
          },
          {
            label: "Image Store",
            url: "/admin/images#store",
            kw: "images store marketplace eggs templates install",
          },
          {
            label: "API Documentation",
            url: "/admin/api/docs",
            kw: "documentation api reference endpoints docs",
          },
          {
            label: "Create Server",
            url: "/admin/servers/create",
            kw: "new server deploy create admin",
          },
          {
            label: "Create User",
            url: "/admin/users/create",
            kw: "new user account add admin",
          },
          {
            label: "Create Node",
            url: "/admin/nodes/create",
            kw: "new node machine add admin",
          },
          {
            label: "Create Image",
            url: "/admin/images/create",
            kw: "new image docker egg add admin",
          },
          {
            label: "Upload Image",
            url: "/admin/images/upload",
            kw: "upload image docker egg json",
          },
          {
            label: "Radar",
            url: "/admin/radar/scripts",
            kw: "radar scan scripts virustotal virus total",
          },
          {
            label: "Menu",
            url: "/admin/menu",
            kw: "menu navigation sidebar items",
          },
        );
      }
      return pages;
    })();

    const CATALOG_RESULT_LIMIT = 4;
    const NAV_RESULT_LIMIT = 5;

    function getCatalogResults(term) {
      const tNorm = normalize(term);
      const scored = [];
      pageCatalog.forEach(function (page) {
        const hay = normalize(page.label + " " + page.kw);
        const score = scoreTerm(tNorm, hay);
        if (score > 0) {
          scored.push({
            type: "nav",
            label: page.label,
            sub: "",
            url: page.url,
            score: score,
          });
        }
      });
      scored.sort(function (a, b) {
        return b.score - a.score;
      });
      return scored.slice(0, CATALOG_RESULT_LIMIT);
    }

    function getNavResults(term) {
      const scopedLinks = Array.from(navLinks).filter(function (link) {
        if (isAdmin) return true;
        return !(link.getAttribute("href") || "").startsWith("/admin");
      });

      const tNorm = normalize(term);
      const scored = [];
      scopedLinks.forEach(function (link) {
        const label = (link.textContent || "").trim();
        const extra = (
          link.getAttribute("searchdata") ||
          link.getAttribute("data-search") ||
          ""
        ).toLowerCase();
        const alias = navAliases[label.toLowerCase()] || "";
        const hay = normalize(label + " " + extra + " " + alias);
        const score = scoreTerm(tNorm, hay);
        if (score > 0) {
          scored.push({
            type: "nav",
            label: label,
            sub: "",
            url: link.href,
            score: score,
          });
        }
      });
      scored.sort(function (a, b) {
        return b.score - a.score;
      });
      return scored.slice(0, NAV_RESULT_LIMIT);
    }

    function showRecommendations() {
      searchResults.innerHTML = "";
      activeIndex = -1;

      const quickLinks = [
        { label: "Servers", url: "/server", icon: "server" },
        { label: "Account", url: "/account", icon: "user" },
      ];
      if (isAdmin) {
        quickLinks.push({
          label: "Admin Overview",
          url: "/admin/overview",
          icon: "nav",
        });
        quickLinks.push({
          label: "Admin Servers",
          url: "/admin/servers",
          icon: "server",
        });
        quickLinks.push({
          label: "Admin Users",
          url: "/admin/users",
          icon: "user",
        });
      }

      if (quickLinks.length) {
        const hdr = document.createElement("p");
        hdr.className =
          "text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1";
        hdr.textContent = "Quick Links";
        searchResults.appendChild(hdr);

        quickLinks.forEach(function (item) {
          const row = document.createElement("a");
          row.href = item.url;
          row.className =
            "search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer";
          row.innerHTML =
            (typeIcon[item.icon] || typeIcon.nav) +
            '<span class="flex-1 min-w-0"><span class="block truncate">' +
            escHtml(item.label) +
            "</span></span>" +
            typeIcon.arrow;
          row.addEventListener("click", function (e) {
            e.preventDefault();
            closeSearch();
            location.href = item.url;
          });
          searchResults.appendChild(row);
        });
      }

      if (recentSearches.length) {
        const hdr = document.createElement("p");
        hdr.className =
          "text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1";
        hdr.textContent = "Recent";
        searchResults.appendChild(hdr);

        recentSearches.forEach(function (term) {
          const row = document.createElement("div");
          row.className =
            "search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer";
          row.innerHTML =
            typeIcon.clock +
            '<span class="flex-1 min-w-0"><span class="block truncate">' +
            escHtml(term) +
            "</span></span>" +
            '<button class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 p-1" data-remove="' +
            escHtml(term) +
            '" aria-label="Remove">' +
            alIcon("x", "w-3 h-3") +
            "</button>";

          row.addEventListener("click", function (e) {
            if (e.target.closest("[data-remove]")) {
              e.stopPropagation();
              recentSearches = recentSearches.filter(function (s) {
                return s !== term;
              });
              localStorage.setItem(
                "recentSearches",
                JSON.stringify(recentSearches),
              );
              showRecommendations();
              return;
            }
            searchInput.value = term;
            doSearch(term);
          });

          searchResults.appendChild(row);
        });
      }

      searchInput.setAttribute("aria-expanded", "true");
    }

    function renderResults(items, term) {
      searchResults.innerHTML = "";
      activeIndex = -1;
      searchInput.setAttribute("aria-activedescendant", "");

      if (!items.length) {
        const wrap = document.createElement("div");
        wrap.className =
          "flex flex-col items-center gap-2 px-4 py-8 text-center";

        const iconContainer = document.createElement("div");
        iconContainer.innerHTML = alIcon("search-x", "w-8 h-8 mx-auto mb-1", {
          strokeWidth: 1.5,
          style: "color:var(--theme-text-faint);",
        });
        wrap.appendChild(iconContainer);

        const msg = document.createElement("p");
        msg.className =
          "text-sm font-medium text-neutral-600 dark:text-neutral-300";
        msg.textContent =
          (searchOverlay.dataset.emptyTitle || "No results for") +
          ' "' +
          term +
          '"';
        wrap.appendChild(msg);

        const hint = document.createElement("p");
        hint.className =
          "text-xs text-neutral-500 dark:text-neutral-400 max-w-xs";
        hint.textContent =
          searchOverlay.dataset.emptyHint ||
          "Try a different term, or search for a server, user, node, or page.";
        wrap.appendChild(hint);

        searchResults.appendChild(wrap);
        searchInput.setAttribute("aria-expanded", "true");
        return;
      }

      const groups = {};
      items.forEach(function (item) {
        if (!groups[item.type]) groups[item.type] = [];
        groups[item.type].push(item);
      });

      const order = ["server", "user", "node", "feature", "nav"];
      const labels = {
        server: "Servers",
        user: "Users",
        node: "Nodes",
        feature: "Features",
        nav: "Pages",
      };

      order.forEach(function (type) {
        if (!groups[type]) return;

        (groups[type] || []).sort(function (a, b) {
          return (b.score || 0) - (a.score || 0);
        });

        const hdr = document.createElement("p");
        hdr.className =
          "text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 pt-3 pb-1";
        hdr.textContent = labels[type];
        searchResults.appendChild(hdr);

        groups[type].forEach(function (item) {
          const row = document.createElement("a");
          row.href = item.url;
          row.id =
            "search-result-" +
            type +
            "-" +
            searchResults.querySelectorAll(".search-result").length;
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", "false");
          row.className =
            "search-result flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors text-sm cursor-pointer";
          row.innerHTML =
            (typeIcon[item.type] || typeIcon.nav) +
            '<span class="flex-1 min-w-0">' +
            '<span class="block truncate">' +
            highlightMatch(item.label, term) +
            "</span>" +
            (item.sub
              ? '<span class="block text-[11px] text-neutral-400 truncate">' +
                escHtml(item.sub) +
                "</span>"
              : "") +
            "</span>";

          row.addEventListener("click", function (e) {
            e.preventDefault();
            saveRecentSearch(term);
            closeSearch();
            location.href = item.url;
          });

          searchResults.appendChild(row);
        });
      });
      searchInput.setAttribute("aria-expanded", "true");
    }

    async function doSearch(term) {
      if (!term) {
        showRecommendations();
        return;
      }
      searchInput.setAttribute("aria-expanded", "true");

      const navItems = getNavResults(term);
      const catalogItems = getCatalogResults(term);
      try {
        const r = await fetch(
          "/api/v2/system/search?q=" + encodeURIComponent(term),
        );
        const data = await r.json();
        renderResults(
          (data.results || []).concat(navItems, catalogItems),
          term,
        );
      } catch {
        renderResults(navItems.concat(catalogItems), term);
      }
    }

    function updateActiveResult() {
      const rows = searchResults.querySelectorAll(".search-result");
      rows.forEach(function (row, i) {
        const active = i === activeIndex;
        row.classList.toggle("bg-neutral-100", active);
        row.classList.toggle("dark:bg-neutral-700/50", active);
        row.setAttribute("aria-selected", active ? "true" : "false");
      });
      const activeRow = rows[activeIndex];
      searchInput.setAttribute(
        "aria-activedescendant",
        activeRow ? activeRow.id : "",
      );
    }

    function openSearch(fromKeyboard) {
      if (panelClosing) return;
      searchOverlay.classList.remove("hidden");
      searchOverlay.classList.add("flex");

      const panel = searchPanel.getBoundingClientRect();
      let ox = panel.width / 2;
      let oy = panel.height / 2;
      if (!fromKeyboard && searchButton) {
        const btn = searchButton.getBoundingClientRect();
        ox = btn.left + btn.width / 2 - panel.left;
        oy = btn.top + btn.height / 2 - panel.top;
      }
      searchPanel.style.transformOrigin = ox + "px " + oy + "px";

      searchPanel.classList.add("al-dropdown");
      requestAnimationFrame(function () {
        searchPanel.classList.add("open");
      });
      if (searchButton) searchButton.setAttribute("aria-expanded", "true");

      if (!searchInput.value.trim()) showRecommendations();
      requestAnimationFrame(function () {
        searchInput.focus();
      });
    }

    function closeSearch() {
      if (searchOverlay.classList.contains("hidden") || panelClosing) return;
      panelClosing = true;
      if (searchButton) searchButton.setAttribute("aria-expanded", "false");
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.setAttribute("aria-activedescendant", "");
      const done = function () {
        searchOverlay.classList.add("hidden");
        searchOverlay.classList.remove("flex");
        searchPanel.classList.remove("open");
        panelClosing = false;
      };
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      searchPanel.classList.remove("open");
      if (reduced) done();
      else setTimeout(done, CLOSE_ANIMATION_MS);
    }

    if (searchButton) {
      searchButton.addEventListener("click", function () {
        openSearch(false);
      });
    }

    searchOverlay.addEventListener("click", function (e) {
      if (e.target === searchOverlay) closeSearch();
    });

    searchInput.addEventListener("input", function () {
      const term = searchInput.value.trim().toLowerCase();
      if (term === lastQuery) return;
      lastQuery = term;
      clearTimeout(searchTimeout);
      if (!term) {
        showRecommendations();
        return;
      }
      searchTimeout = setTimeout(function () {
        doSearch(term);
      }, SEARCH_DEBOUNCE_MS);
    });

    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
        searchInput.blur();
        return;
      }
      const rows = searchResults.querySelectorAll(".search-result");
      if (!rows.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % rows.length;
        updateActiveResult();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + rows.length) % rows.length;
        updateActiveResult();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && rows[activeIndex]) rows[activeIndex].click();
        else if (rows.length === 1) rows[0].click();
      }
    });

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (searchOverlay.classList.contains("hidden")) {
          openSearch(true);
        } else {
          searchInput.focus();
          searchInput.select();
        }
      } else if (
        e.key === "Escape" &&
        !searchOverlay.classList.contains("hidden")
      ) {
        closeSearch();
      }
    });
  }
})();
