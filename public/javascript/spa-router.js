class SPARouter {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.cache = new Map();
    this.preloadCache = new Map();
    this.isNavigating = false;
    this.contentContainer = null;
    this.staticComponents = new Set(['sidebar', 'topbar', 'footer']);
    
    this.init();
  }

  init() {
    this.contentContainer = document.getElementById('spa-content');
    if (!this.contentContainer) {
      console.error('SPA content container not found');
      return;
    }

    window.addEventListener('popstate', (e) => this.handlePopState(e));
    this.setupNavigationInterception();
    this.setupPreloading();
    
    const currentPath = window.location.pathname;
    this.navigate(currentPath, false, true);
  }

  addRoute(path, handler) {
    this.routes.set(path, handler);
  }

  setupNavigationInterception() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || 
          href.startsWith('tel:') || href.includes('://') || 
          link.hasAttribute('download') || link.target === '_blank') {
        return;
      }

      if (link.classList.contains('external-link') || 
          link.hasAttribute('data-no-spa')) {
        return;
      }

      e.preventDefault();
      this.navigate(href);
    });
  }

  setupPreloading() {
    let preloadTimeout;
    
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || this.preloadCache.has(href) || this.cache.has(href)) return;

      clearTimeout(preloadTimeout);
      preloadTimeout = setTimeout(() => {
        this.preloadPage(href);
      }, 100);
    });

    document.addEventListener('mouseout', (e) => {
      clearTimeout(preloadTimeout);
    });
  }

  async preloadPage(path) {
    if (this.preloadCache.has(path) || this.cache.has(path)) return;

    try {
      const response = await fetch(`/api/page-content${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.preloadCache.set(path, data);
        console.log(`Preloaded: ${path}`);
      }
    } catch (error) {
      console.warn(`Failed to preload ${path}:`, error);
    }
  }

  async navigate(path, pushState = true, isInitial = false) {
    if (this.isNavigating && !isInitial) return;

    this.isNavigating = true;
    this.showLoadingState();

    // Preserve component states before navigation
    if (window.componentPersistence && !isInitial) {
      window.componentPersistence.beforeNavigation();
    }

    try {
      let pageData = this.cache.get(path) || this.preloadCache.get(path);

      if (!pageData) {
        pageData = await this.fetchPageData(path);
      }

      if (pageData) {
        this.renderPage(pageData);
        this.cache.set(path, pageData);
        this.preloadCache.delete(path);

        if (pushState && !isInitial) {
          history.pushState({
            path,
            timestamp: Date.now(),
            title: pageData.title || document.title
          }, pageData.title || document.title, path);
        } else if (isInitial) {
          // Replace initial state to ensure proper history
          history.replaceState({
            path,
            timestamp: Date.now(),
            title: pageData.title || document.title
          }, pageData.title || document.title, path);
        }

        this.currentRoute = path;
        this.updateActiveNavigation(path);

        // Restore component states after navigation
        if (window.componentPersistence) {
          setTimeout(() => {
            window.componentPersistence.afterNavigation();
          }, 50);
        }
      }
    } catch (error) {
      console.error('Navigation failed:', error);
      this.showErrorState(error);
    } finally {
      this.hideLoadingState();
      this.isNavigating = false;
    }
  }

  async fetchPageData(path, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(`/api/page-content${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && retryCount < maxRetries) {
          console.warn(`Server error ${response.status}, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return this.fetchPageData(path, retryCount + 1);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please check your connection');
      }

      if (retryCount < maxRetries && (error.message.includes('fetch') || error.message.includes('network'))) {
        console.warn(`Network error, retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.fetchPageData(path, retryCount + 1);
      }

      throw error;
    }
  }

  renderPage(pageData) {
    if (!this.contentContainer) return;

    this.contentContainer.innerHTML = pageData.content;
    
    if (pageData.title) {
      document.title = pageData.title;
    }

    if (pageData.scripts) {
      this.loadScripts(pageData.scripts);
    }

    if (pageData.styles) {
      this.loadStyles(pageData.styles);
    }

    this.executePageScripts();
  }

  loadScripts(scripts) {
    scripts.forEach(scriptSrc => {
      if (document.querySelector(`script[src="${scriptSrc}"]`)) return;
      
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      document.head.appendChild(script);
    });
  }

  loadStyles(styles) {
    styles.forEach(styleSrc => {
      if (document.querySelector(`link[href="${styleSrc}"]`)) return;
      
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = styleSrc;
      document.head.appendChild(link);
    });
  }

  executePageScripts() {
    const scripts = this.contentContainer.querySelectorAll('script');
    scripts.forEach(script => {
      const newScript = document.createElement('script');
      if (script.src) {
        newScript.src = script.src;
      } else {
        newScript.textContent = script.textContent;
      }
      script.parentNode.replaceChild(newScript, script);
    });
  }

  handlePopState(e) {
    const path = e.state?.path || window.location.pathname;

    // Prevent navigation loops
    if (path === this.currentRoute) return;

    // Clear any pending navigation
    if (this.isNavigating) {
      this.isNavigating = false;
      this.hideLoadingState();
    }

    this.navigate(path, false);
  }

  updateActiveNavigation(path) {
    const navLinks = document.querySelectorAll('.nav-link');
    const activeBackground = document.getElementById('active-background');

    navLinks.forEach(link => {
      link.classList.remove('active', 'text-neutral-950', 'font-[405]', 'dark:text-white');
    });

    const activeLink = Array.from(navLinks).find(link => {
      const href = link.getAttribute('href');
      return href && this.normalizePath(href) === this.normalizePath(path);
    });

    if (activeLink && activeBackground) {
      activeLink.classList.add('active', 'text-neutral-950', 'font-[405]', 'dark:text-white');

      const linkRect = activeLink.getBoundingClientRect();
      const navContainer = activeLink.closest('ul');
      const navRect = navContainer.getBoundingClientRect();
      const topOffset = linkRect.top - navRect.top + navContainer.scrollTop;

      activeBackground.style.height = `${linkRect.height}px`;
      activeBackground.style.transform = `translateY(${topOffset}px)`;
      activeBackground.style.opacity = '1';
    }
  }

  normalizePath(path) {
    try {
      const url = new URL(path, window.location.origin);
      return url.pathname.replace(/\/+$/, '') || '/';
    } catch (error) {
      return path.replace(/\/+$/, '') || '/';
    }
  }

  showLoadingState() {
    const loadingIndicator = document.getElementById('spa-loading');
    const loadingOverlay = document.getElementById('spa-loading-overlay');

    if (loadingIndicator) {
      loadingIndicator.classList.remove('hidden');
    }

    // Show overlay for slower requests
    this.loadingTimeout = setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        loadingOverlay.classList.remove('hidden');
      }
    }, 500);
  }

  hideLoadingState() {
    const loadingIndicator = document.getElementById('spa-loading');
    const loadingOverlay = document.getElementById('spa-loading-overlay');

    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
    }

    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
    }

    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
      loadingOverlay.classList.add('hidden');
    }
  }

  showErrorState(error) {
    console.error('SPA Navigation Error:', error);
    this.lastFailedPath = this.currentRoute;

    const errorContainer = document.getElementById('spa-error');
    const errorMessage = document.getElementById('spa-error-message');
    const retryButton = document.getElementById('spa-error-retry');
    const dismissButton = document.getElementById('spa-error-dismiss');

    if (errorContainer && errorMessage) {
      errorMessage.textContent = error.message || 'An unexpected error occurred while loading the page.';
      errorContainer.classList.remove('hidden');

      // Auto-hide after 10 seconds
      setTimeout(() => {
        this.hideErrorState();
      }, 10000);
    }

    // Set up retry functionality
    if (retryButton) {
      retryButton.onclick = () => {
        this.hideErrorState();
        if (this.lastFailedPath) {
          this.navigate(this.lastFailedPath);
        }
      };
    }

    // Set up dismiss functionality
    if (dismissButton) {
      dismissButton.onclick = () => {
        this.hideErrorState();
      };
    }
  }

  hideErrorState() {
    const errorContainer = document.getElementById('spa-error');
    if (errorContainer) {
      errorContainer.classList.add('hidden');
    }
  }

  clearCache() {
    this.cache.clear();
    this.preloadCache.clear();
  }

  getCacheSize() {
    return {
      cache: this.cache.size,
      preload: this.preloadCache.size
    };
  }
}

window.spaRouter = new SPARouter();
