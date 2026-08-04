const HOVER_DELAY_MS = 100;
const MAX_CONCURRENT_PRELOADS = 2;
const MAX_CACHE_SIZE = 20;
const VISIBILITY_PRELOAD_DELAY_MS = 500;
const CACHE_CLEANUP_INTERVAL_MS = 60000;
const PREFETCH_ROOT_MARGIN = '50px';
const PREFETCH_THRESHOLD = 0.1;
const PRELOAD_API_PATH = '/api/page-content';

const CRITICAL_PAGES = [
  '/admin/overview',
  '/admin/servers',
  '/admin/users',
  '/user/account',
];

class IntelligentPreloader {
  constructor(router) {
    this.router = router;
    this.preloadQueue = new Set();
    this.preloadingInProgress = new Set();
    this.preloadCache = new Map();
    this.hoverTimeouts = new Map();
    this.config = {
      hoverDelay: HOVER_DELAY_MS,
      maxConcurrentPreloads: MAX_CONCURRENT_PRELOADS,
      maxCacheSize: MAX_CACHE_SIZE,
      preloadOnVisible: true,
      preloadPriority: {
        navigation: 1,
        buttons: 2,
        links: 3,
      },
    };

    this.init();
  }

  init() {
    this.setupHoverPreloading();
    this.setupVisibilityPreloading();
    this.setupPrefetchHints();
    this.cleanupCache();
  }

  setupHoverPreloading() {
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href], button[data-href]');
      if (!link) return;

      const href = link.getAttribute('href') || link.getAttribute('data-href');
      if (!this.shouldPreload(href, link)) return;

      const priority = this.getLinkPriority(link);
      const linkId = this.getLinkId(link);

      if (this.hoverTimeouts.has(linkId)) {
        clearTimeout(this.hoverTimeouts.get(linkId));
      }

      const timeout = setTimeout(() => {
        this.preloadPage(href, priority, 'hover');
      }, this.config.hoverDelay);

      this.hoverTimeouts.set(linkId, timeout);
    });

    document.addEventListener('mouseout', (e) => {
      const link = e.target.closest('a[href], button[data-href]');
      if (!link) return;

      const linkId = this.getLinkId(link);
      if (this.hoverTimeouts.has(linkId)) {
        clearTimeout(this.hoverTimeouts.get(linkId));
        this.hoverTimeouts.delete(linkId);
      }
    });
  }

  setupVisibilityPreloading() {
    if (!this.config.preloadOnVisible || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const link = entry.target;
          const href = link.getAttribute('href') || link.getAttribute('data-href');

          if (this.shouldPreload(href, link)) {
            setTimeout(() => {
              if (entry.isIntersecting) {
                this.preloadPage(href, this.getLinkPriority(link), 'visibility');
              }
            }, VISIBILITY_PRELOAD_DELAY_MS);
          }
        }
      });
    }, {
      rootMargin: PREFETCH_ROOT_MARGIN,
      threshold: PREFETCH_THRESHOLD,
    });

    document.querySelectorAll('a[href], button[data-href]').forEach(link => {
      const href = link.getAttribute('href') || link.getAttribute('data-href');
      if (this.shouldPreload(href, link)) {
        observer.observe(link);
      }
    });
  }

  setupPrefetchHints() {
    CRITICAL_PAGES.forEach(page => {
      this.addPrefetchHint(page);
    });
  }

  addPrefetchHint(href) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  }

  shouldPreload(href, linkElement) {
    if (!href) return false;

    if (href.includes('://') && !href.startsWith(window.location.origin)) return false;

    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;

    if (this.router.cache.has(href) || this.router.preloadCache.has(href)) return false;

    if (this.preloadingInProgress.has(href)) return false;

    if (linkElement && linkElement.hasAttribute('data-no-preload')) return false;

    if (linkElement && linkElement.hasAttribute('download')) return false;

    return true;
  }

  getLinkPriority(linkElement) {
    if (linkElement.closest('.nav-link, .navigation, .sidebar')) {
      return this.config.preloadPriority.navigation;
    }

    if (linkElement.tagName === 'BUTTON' || linkElement.classList.contains('btn')) {
      return this.config.preloadPriority.buttons;
    }

    return this.config.preloadPriority.links;
  }

  getLinkId(linkElement) {
    return linkElement.id ||
           linkElement.getAttribute('href') ||
           linkElement.getAttribute('data-href') ||
           Math.random().toString(36).substr(2, 9);
  }

  async preloadPage(href, priority = 3, source = 'manual') {
    if (!this.shouldPreload(href)) return;

    if (this.preloadingInProgress.size >= this.config.maxConcurrentPreloads) {
      this.preloadQueue.add({ href, priority, source });
      return;
    }

    this.preloadingInProgress.add(href);

    try {
      console.log(`Preloading ${href} (priority: ${priority}, source: ${source})`);

      const response = await fetch(`${PRELOAD_API_PATH}${href}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.router.preloadCache.set(href, data);
        this.preloadCache.set(href, {
          data,
          timestamp: Date.now(),
          priority,
          source,
        });

        window.dispatchEvent(new CustomEvent('pagePreloaded', {
          detail: { href, priority, source, size: JSON.stringify(data).length },
        }));
      }
    } catch (error) {
      console.warn(`Failed to preload ${href}:`, error);
    } finally {
      this.preloadingInProgress.delete(href);
      this.processPreloadQueue();
    }
  }

  processPreloadQueue() {
    if (this.preloadQueue.size === 0) return;
    if (this.preloadingInProgress.size >= this.config.maxConcurrentPreloads) return;

    const sortedQueue = Array.from(this.preloadQueue).sort((a, b) => a.priority - b.priority);

    const next = sortedQueue[0];
    if (next) {
      this.preloadQueue.delete(next);
      this.preloadPage(next.href, next.priority, next.source);
    }
  }

  cleanupCache() {
    setInterval(() => {
      if (this.preloadCache.size <= this.config.maxCacheSize) return;

      const entries = Array.from(this.preloadCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
      toRemove.forEach(([href]) => {
        this.preloadCache.delete(href);
        this.router.preloadCache.delete(href);
      });

      console.log(`Cleaned up ${toRemove.length} preload cache entries`);
    }, CACHE_CLEANUP_INTERVAL_MS);
  }

  preloadNow(href) {
    return this.preloadPage(href, 1, 'manual');
  }

  clearPreloadCache() {
    this.preloadCache.clear();
    this.router.preloadCache.clear();
  }

  getPreloadStats() {
    return {
      cacheSize: this.preloadCache.size,
      queueSize: this.preloadQueue.size,
      inProgress: this.preloadingInProgress.size,
      entries: Array.from(this.preloadCache.entries()).map(([href, info]) => ({
        href,
        priority: info.priority,
        source: info.source,
        age: Date.now() - info.timestamp,
      })),
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.spaRouter) {
    window.preloader = new IntelligentPreloader(window.spaRouter);
  }
});
