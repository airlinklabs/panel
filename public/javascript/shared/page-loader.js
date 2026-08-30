(function () {
  const NAV_FLAG = "al_nav";
  const FADE_OUT_MS = 120;
  const EASE_OUT = "cubic-bezier(0.16,1,0.3,1)";
  const EASE_IN = "cubic-bezier(0.4,0,1,1)";
  const LOAD_GUARD_MS = 2000;
  const EXACT_MATCH_SCORE = 9999;
  const ACTIVE_BORDER_RADIUS = "0.75rem";
  var PILL_TRANSITION = "none";
  const MOBILE_ACTIVE_CLASSES = [
    "text-neutral-900",
    "dark:text-white",
    "active-mobile",
  ];
  const MOBILE_INACTIVE_CLASSES = ["text-neutral-500", "dark:text-neutral-400"];

  // ── Read nav flag before any paint ───────────────────────────────────────
  const _fromNav = (function () {
    try {
      const v = sessionStorage.getItem(NAV_FLAG);
      if (v) {
        sessionStorage.removeItem(NAV_FLAG);
        return true;
      }
    } catch {
      /* sessionStorage unavailable */
    }
    return false;
  })();

  if (_fromNav) {
    const _pc = el("page-content") || el("server-page-body");
    if (_pc) _pc.style.opacity = "0";
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function el(id) {
    return document.getElementById(id);
  }

  function normalizePath(p) {
    try {
      return (
        new URL(p, window.location.origin).pathname.replace(/\/+$/, "") || "/"
      );
    } catch {
      return p;
    }
  }

  function isNavLink(a) {
    const href = a && a.getAttribute("href");
    if (!href || href === "#" || href.startsWith("#")) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    if (a.hasAttribute("download") || a.target === "_blank") return false;
    if (href.startsWith("http") && !href.startsWith(window.location.origin))
      return false;
    return true;
  }

  function markNavigation() {
    try {
      sessionStorage.setItem(NAV_FLAG, "1");
    } catch {
      /* sessionStorage unavailable */
    }
  }

  // ── Top loading line ─────────────────────────────────────────────────────
  // Reference-counted so a completed request never hides another request's
  // feedback. The line is indeterminate; it never pretends to know progress.

  let loaderEl = null;
  let loaderHideTimer = null;
  let activeCount = 0;

  function applyLoaderTheme() {
    if (!loaderEl) return;
    const rs = getComputedStyle(document.documentElement);
    loaderEl.style.background =
      rs.getPropertyValue("--theme-accent").trim() || "#0a0a0a";
  }

  function ensureLoader() {
    if (loaderEl && loaderEl.isConnected) return loaderEl;
    loaderEl = document.createElement("div");
    loaderEl.id = "al-page-loader";
    loaderEl.setAttribute("role", "progressbar");
    loaderEl.setAttribute("aria-label", "Loading page");
    loaderEl.setAttribute("aria-valuetext", "Loading");
    loaderEl.style.cssText = [
      "position:fixed",
      "inset:0 auto auto 0",
      "z-index:10000",
      "width:38%",
      "height:2px",
      "opacity:0",
      "pointer-events:none",
      "transform:translateX(-110%)",
      "transition:opacity 120ms ease",
    ].join(";");
    applyLoaderTheme();
    document.body.appendChild(loaderEl);
    return loaderEl;
  }

  function requestActivity() {
    activeCount++;
    if (loaderHideTimer) {
      clearTimeout(loaderHideTimer);
      loaderHideTimer = null;
    }
    const loader = ensureLoader();
    applyLoaderTheme();
    loader.style.animation = "none";
    loader.style.opacity = "1";
    void loader.offsetWidth;
    loader.style.animation =
      "al-page-loader-sweep 1.1s cubic-bezier(0.16, 1, 0.3, 1) infinite";
  }

  function releaseActivity() {
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount > 0) return;
    if (loaderHideTimer) clearTimeout(loaderHideTimer);
    loaderHideTimer = setTimeout(function () {
      if (!loaderEl || activeCount > 0) return;
      loaderEl.style.opacity = "0";
      loaderEl.style.animation = "none";
    }, 200);
  }

  window.addEventListener("al:themechange", function () {
    applyLoaderTheme();
  });

  window.ALPageActivity = { start: requestActivity, stop: releaseActivity };

  // ── Content fade ─────────────────────────────────────────────────────────

  function getAnimEl() {
    return el("server-page-body") || el("page-content") || null;
  }

  function hasClass(child, frag) {
    const list = child.classList;
    if (list && typeof list.contains === "function") return list.contains(frag);
    const name = child.className;
    return typeof name === "string" && name.indexOf(frag) !== -1;
  }

  function getAnimatableChildren(container) {
    return Array.from(container.children).filter(function (child) {
      if (hasClass(child, "mobile-top-bar")) return false;
      if (hasClass(child, "mobile-bottom-nav")) return false;
      if (hasClass(child, "mobile-more-sheet")) return false;
      if (hasClass(child, "mobile-server-chrome")) return false;
      const pos = window.getComputedStyle(child).position;
      if (pos === "fixed") return false;
      return true;
    });
  }

  function animateOut(c) {
    if (!c) return;
    const children = getAnimatableChildren(c);
    const targets = children.length ? children : [c];
    targets.forEach(function (t) {
      t.style.transition = "opacity " + FADE_OUT_MS + "ms " + EASE_OUT;
      t.style.opacity = "0";
    });
  }

  function animateIn(c) {
    if (!c) return;
    const children = getAnimatableChildren(c);
    document.documentElement.classList.remove("js-loading");
    c.style.opacity = "1";
    c.style.transform = "";
    if (!children.length) return;
    children.forEach(function (child) {
      child.style.opacity = "1";
      child.style.transform = "";
    });
  }

  function fadeContentOut() {
    animateOut(getAnimEl());
  }

  function fadeContentIn() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        animateIn(getAnimEl());
      });
    });
  }

  // ── Reveal after navigation ───────────────────────────────────────────────

  function revealAfterNav() {
    const _pc = el("page-content") || el("server-page-body");
    if (_pc) _pc.style.opacity = "";
    releaseActivity();
    animateIn(getAnimEl());
  }

  // ── Desktop sidebar highlight ─────────────────────────────────────────────

  function findDesktopActiveLink(path) {
    let best = null;
    let bestLen = 0;
    document.querySelectorAll(".nav-link").forEach(function (link) {
      const href = normalizePath(link.getAttribute("href") || "");
      const matchPrefix = link.getAttribute("data-match-prefix");
      if (!href) return;
      if (path === href) {
        best = link;
        bestLen = EXACT_MATCH_SCORE;
        return;
      }
      if (matchPrefix) {
        if (path.startsWith(matchPrefix) && matchPrefix.length > bestLen) {
          best = link;
          bestLen = matchPrefix.length;
        }
        return;
      }
      if (href === "/") return;
      if (path.startsWith(href) && href.length > bestLen) {
        best = link;
        bestLen = href.length;
      }
    });
    return best;
  }

  function getPillTop(link) {
    const ul = link.closest("ul");
    if (!ul) return 0;
    return (
      link.getBoundingClientRect().top -
      ul.getBoundingClientRect().top +
      ul.scrollTop
    );
  }

  function setDesktopActiveLink(link) {
    var rs = getComputedStyle(document.documentElement);
    var isDark = document.documentElement.classList.contains("dark");
    var pillBg =
      rs.getPropertyValue("--theme-text").trim() ||
      (isDark ? "#e0e0e0" : "#404040");
    var pillFg =
      rs.getPropertyValue("--theme-bg").trim() ||
      (isDark ? "#f5f5f5" : "#161616");
    document.querySelectorAll(".nav-link").forEach(function (l) {
      l.classList.remove("active", "font-medium");
      l.style.color = "";
      l.style.background = "";
    });
    if (!link) return;
    link.classList.add("active", "font-medium");
    link.style.color = pillFg;
    link.style.background = pillBg;
    link.style.borderRadius = ACTIVE_BORDER_RADIUS;
  }

  function movePill(link, animate) {
    const bg = el("active-background");
    if (!bg || !link) return;
    const top = getPillTop(link);
    const h = link.getBoundingClientRect().height;
    bg.style.transition = animate ? PILL_TRANSITION : "none";
    bg.style.height = h + "px";
    bg.style.transform = "translateY(" + top + "px)";
    bg.style.opacity = "1";
  }

  function initDesktopHighlight(fromNav) {
    const bg = el("active-background");
    if (!bg) return;
    const sb = el("pc-sidebar");
    if (sb && sb.style.display === "none") {
      setTimeout(function () {
        initDesktopHighlight(fromNav);
      }, 0);
      return;
    }
    const path = normalizePath(window.location.pathname);
    const active = findDesktopActiveLink(path);
    setDesktopActiveLink(active);
    if (!active) {
      bg.style.opacity = "0";
      return;
    }
    bg.style.transition = "none";
    movePill(active, false);
    void bg.offsetHeight;
    if (!fromNav) {
      bg.style.transition = "opacity 0.18s ease";
      bg.style.opacity = "1";
    }
    setTimeout(
      function () {
        const bgEl = el("active-background");
        if (bgEl) bgEl.style.transition = PILL_TRANSITION;
      },
      fromNav ? 0 : 200,
    );
  }

  // ── Mobile nav highlight ──────────────────────────────────────────────────

  function initMobileHighlight() {
    const path = normalizePath(window.location.pathname);
    document.querySelectorAll(".mobile-nav-link").forEach(function (link) {
      const href = normalizePath(link.getAttribute("href") || "");
      const mPrefix = link.getAttribute("data-match-prefix");
      const mAlso = link.getAttribute("data-match-prefix-also");
      const mExact = link.getAttribute("data-match-exact") === "true";
      let active = false;
      if (mPrefix) active = path.startsWith(mPrefix);
      else if (mExact) active = path === href;
      else active = path === href || (href !== "/" && path.startsWith(href));
      if (!active && mAlso && path.startsWith(mAlso)) active = true;
      link.classList.remove(
        ...MOBILE_INACTIVE_CLASSES,
        ...MOBILE_ACTIVE_CLASSES,
      );
      link.classList.add(active ? "text-neutral-900" : "text-neutral-500");
      link.classList.add(active ? "dark:text-white" : "dark:text-neutral-400");
      if (active) link.classList.add("active-mobile");
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function revealAfterStuckLoad() {
    if (document.documentElement.classList.contains("js-loading")) {
      releaseActivity();
      fadeContentIn();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initDesktopHighlight(_fromNav);
    initMobileHighlight();
    if (_fromNav) {
      revealAfterNav();
    } else {
      window.__alLoadGuard = setTimeout(revealAfterStuckLoad, LOAD_GUARD_MS);
    }
  });

  window.addEventListener("load", function () {
    if (!_fromNav) {
      if (window.__alLoadGuard) {
        clearTimeout(window.__alLoadGuard);
        window.__alLoadGuard = null;
      }
      releaseActivity();
      fadeContentIn();
    }
  });

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      initDesktopHighlight(false);
      initMobileHighlight();
      fadeContentIn();
    }
  });

  // ── Click interception ────────────────────────────────────────────────────

  document.addEventListener(
    "click",
    function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      const a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!isNavLink(a)) return;
      if (a.classList.contains("nav-link")) {
        setDesktopActiveLink(a);
        movePill(a, true);
      }
      if (a.classList.contains("mobile-nav-link")) {
        document.querySelectorAll(".mobile-nav-link").forEach(function (l) {
          l.classList.remove(...MOBILE_ACTIVE_CLASSES);
          l.classList.add(...MOBILE_INACTIVE_CLASSES);
        });
        a.classList.remove(...MOBILE_INACTIVE_CLASSES);
        a.classList.add(...MOBILE_ACTIVE_CLASSES);
      }
      markNavigation();
      fadeContentOut();
      requestActivity();
    },
    true,
  );

  window.addEventListener("al:themechange", function () {
    const path = normalizePath(window.location.pathname);
    const isDark = document.documentElement.classList.contains("dark");
    const active = findDesktopActiveLink(path);
    setDesktopActiveLink(active);
    if (active) movePill(active, false);
    initMobileHighlight();
    const accountLink = document.getElementById("sidebar-account-link");
    if (accountLink) {
      const onAccount = path === "/account" || path.startsWith("/account/");
      const userText = accountLink.querySelector("#sidebar-username");
      var pillRs = getComputedStyle(document.documentElement);
      var pillBg =
        pillRs.getPropertyValue("--theme-text").trim() ||
        (isDark ? "#e0e0e0" : "#404040");
      var pillFg =
        pillRs.getPropertyValue("--theme-bg").trim() ||
        (isDark ? "#f5f5f5" : "#161616");
      if (onAccount) {
        accountLink.style.background = pillBg;
        accountLink.style.color = pillFg;
        accountLink.style.fontWeight = "700";
        if (userText) userText.parentElement.style.color = pillFg;
      } else {
        accountLink.style.background = "";
        accountLink.style.color = "";
        accountLink.style.fontWeight = "";
        if (userText) userText.parentElement.style.color = "";
      }
    }
    const logo = document.getElementById("sidebar-logo-link");
    if (logo) {
      const onCredits = path === "/credits" || path.startsWith("/credits/");
      const logoBlock = document.getElementById("sidebar-logo-block");
      const logoTitle = logo.querySelector("h1");
      const logoImg = logo.querySelector("img");
      if (onCredits) {
        if (logoBlock) {
          logoBlock.style.background = isDark ? "#f0f0f0" : "#000000";
          logoBlock.style.borderRadius = ACTIVE_BORDER_RADIUS;
        }
        logo.style.color = isDark ? "#e0e0e0" : "#404040";
        if (logoImg) logoImg.style.background = "#000000";
        if (logoTitle) {
          logoTitle.style.color = isDark ? "#e0e0e0" : "#404040";
          logoTitle.style.fontWeight = "700";
        }
      } else {
        if (logoBlock) {
          logoBlock.style.background = "";
          logoBlock.style.borderRadius = "";
        }
        logo.style.color = "";
        if (logoImg) logoImg.style.background = "";
        if (logoTitle) {
          logoTitle.style.color = "";
          logoTitle.style.fontWeight = "";
        }
      }
    }
  });

  document.addEventListener(
    "submit",
    function (e) {
      const form = e.target && e.target.closest && e.target.closest("form");
      if (
        !form ||
        form.matches("[hx-get], [hx-post], [hx-put], [hx-patch], [hx-delete]")
      )
        return;
      markNavigation();
      fadeContentOut();
      requestActivity();
    },
    true,
  );
})();
