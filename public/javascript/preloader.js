class IntelligentPreloader {
  constructor(router) {
    this.router = router;
    this.preloadQueue = new Set();
    this.preloadingInProgress = new Set();
    this.preloadCache = new Map();
    this.hoverTimeouts = new Map();
    this.config = {
      hoverDelay: 100, // ms to wait before preloading on hover
      maxConcurrentPreloads: 2,
      maxCacheSize: 20,
      preloadOnVisible: true, // preload when links become visible
      preloadPriority: {
        navigation: 1,
        buttons: 2,
        links: 3
      }
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

      // Clear any existing timeout for this link
      if (this.hoverTimeouts.has(linkId)) {
        clearTimeout(this.hoverTimeouts.get(linkId));
      }

      // Set new timeout
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
            // Delay preload to avoid preloading everything immediately
            setTimeout(() => {
              if (entry.isIntersecting) { // Check again in case user scrolled away
                this.preloadPage(href, this.getLinkPriority(link), 'visibility');
              }
            }, 500);
          }
        }
      });
    }, {
      rootMargin: '50px',
      threshold: 0.1
    });

    // Observe navigation links
    document.querySelectorAll('a[href], button[data-href]').forEach(link => {
      const href = link.getAttribute('href') || link.getAttribute('data-href');
      if (this.shouldPreload(href, link)) {
        observer.observe(link);
      }
    });
  }

  setupPrefetchHints() {
    // Add prefetch hints for critical pages
    const criticalPages = [
      '/admin/overview',
      '/admin/servers',
      '/admin/users',
      '/user/account'
    ];

    criticalPages.forEach(page => {
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
    
    // Skip external links
    if (href.includes('://') && !href.startsWith(window.location.origin)) return false;
    
    // Skip anchors, mailto, tel
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    
    // Skip if already cached or preloaded
    if (this.router.cache.has(href) || this.router.preloadCache.has(href)) return false;
    
    // Skip if currently preloading
    if (this.preloadingInProgress.has(href)) return false;
    
    // Skip if marked as no-preload
    if (linkElement.hasAttribute('data-no-preload')) return false;
    
    // Skip download links
    if (linkElement.hasAttribute('download')) return false;
    
    return true;
  }

  getLinkPriority(linkElement) {
    // Navigation links get highest priority
    if (linkElement.closest('.nav-link, .navigation, .sidebar')) {
      return this.config.preloadPriority.navigation;
    }
    
    // Buttons get medium priority
    if (linkElement.tagName === 'BUTTON' || linkElement.classList.contains('btn')) {
      return this.config.preloadPriority.buttons;
    }
    
    // Regular links get lowest priority
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

    // Check concurrent preload limit
    if (this.preloadingInProgress.size >= this.config.maxConcurrentPreloads) {
      this.preloadQueue.add({ href, priority, source });
      return;
    }

    this.preloadingInProgress.add(href);

    try {
      console.log(`Preloading ${href} (priority: ${priority}, source: ${source})`);
      
      const response = await fetch(`/api/page-content${href}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.router.preloadCache.set(href, data);
        this.preloadCache.set(href, {
          data,
          timestamp: Date.now(),
          priority,
          source
        });

        // Trigger custom event for analytics/debugging
        window.dispatchEvent(new CustomEvent('pagePreloaded', {
          detail: { href, priority, source, size: JSON.stringify(data).length }
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

    // Sort queue by priority
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

      // Remove oldest entries
      const entries = Array.from(this.preloadCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
      toRemove.forEach(([href]) => {
        this.preloadCache.delete(href);
        this.router.preloadCache.delete(href);
      });

      console.log(`Cleaned up ${toRemove.length} preload cache entries`);
    }, 60000); // Clean every minute
  }

  // Public API methods
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
        age: Date.now() - info.timestamp
      }))
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Initialize preloader when router is available
document.addEventListener('DOMContentLoaded', () => {
  if (window.spaRouter) {
    window.preloader = new IntelligentPreloader(window.spaRouter);
  }
});
