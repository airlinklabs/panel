class ComponentPersistence {
  constructor() {
    this.staticComponents = new Map();
    this.componentStates = new Map();
    this.init();
  }

  init() {
    this.identifyStaticComponents();
    this.preserveComponentStates();
  }

  identifyStaticComponents() {
    const staticSelectors = [
      '#sidebar',
      '#topbar', 
      '#footer',
      '.sidebar',
      '.topbar',
      '.footer',
      '[data-persist="true"]'
    ];

    staticSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element && !this.staticComponents.has(element.id || selector)) {
          const componentId = element.id || this.generateComponentId(selector);
          this.staticComponents.set(componentId, {
            element: element,
            selector: selector,
            html: element.outerHTML,
            state: this.captureComponentState(element)
          });
        }
      });
    });
  }

  generateComponentId(selector) {
    return 'component_' + selector.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
  }

  captureComponentState(element) {
    const state = {
      scrollPosition: {
        top: element.scrollTop,
        left: element.scrollLeft
      },
      activeElements: [],
      formData: {},
      customData: {}
    };

    // Capture active navigation states
    const activeLinks = element.querySelectorAll('.active, .nav-link.active, [aria-current="page"]');
    activeLinks.forEach(link => {
      state.activeElements.push({
        selector: this.getElementSelector(link),
        classes: Array.from(link.classList),
        attributes: this.getElementAttributes(link)
      });
    });

    // Capture form states
    const forms = element.querySelectorAll('form');
    forms.forEach(form => {
      const formData = new FormData(form);
      const formId = form.id || this.generateComponentId('form');
      state.formData[formId] = Object.fromEntries(formData.entries());
    });

    // Capture toggle states (sidebar collapse, etc.)
    const toggleElements = element.querySelectorAll('[data-toggle], .collapsed, .expanded');
    toggleElements.forEach(toggle => {
      const toggleId = toggle.id || this.generateComponentId('toggle');
      state.customData[toggleId] = {
        classes: Array.from(toggle.classList),
        attributes: this.getElementAttributes(toggle),
        style: toggle.style.cssText
      };
    });

    return state;
  }

  getElementSelector(element) {
    if (element.id) return '#' + element.id;
    if (element.className) {
      const classes = Array.from(element.classList).join('.');
      return element.tagName.toLowerCase() + '.' + classes;
    }
    return element.tagName.toLowerCase();
  }

  getElementAttributes(element) {
    const attrs = {};
    for (let attr of element.attributes) {
      if (attr.name.startsWith('data-') || attr.name === 'aria-current') {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  preserveComponentStates() {
    this.staticComponents.forEach((component, componentId) => {
      this.componentStates.set(componentId, component.state);
    });
  }

  restoreComponentStates() {
    this.componentStates.forEach((state, componentId) => {
      const component = this.staticComponents.get(componentId);
      if (component && component.element) {
        this.restoreComponentState(component.element, state);
      }
    });
  }

  restoreComponentState(element, state) {
    // Restore scroll position
    if (state.scrollPosition) {
      element.scrollTop = state.scrollPosition.top;
      element.scrollLeft = state.scrollPosition.left;
    }

    // Restore active elements
    state.activeElements.forEach(activeInfo => {
      const targetElement = element.querySelector(activeInfo.selector);
      if (targetElement) {
        targetElement.className = activeInfo.classes.join(' ');
        Object.entries(activeInfo.attributes).forEach(([name, value]) => {
          targetElement.setAttribute(name, value);
        });
      }
    });

    // Restore form data
    Object.entries(state.formData).forEach(([formId, data]) => {
      const form = element.querySelector(`#${formId}`) || element.querySelector('form');
      if (form) {
        Object.entries(data).forEach(([name, value]) => {
          const input = form.querySelector(`[name="${name}"]`);
          if (input) {
            input.value = value;
          }
        });
      }
    });

    // Restore custom toggle states
    Object.entries(state.customData).forEach(([toggleId, data]) => {
      const toggle = element.querySelector(`#${toggleId}`) || element.querySelector('[data-toggle]');
      if (toggle) {
        toggle.className = data.classes.join(' ');
        Object.entries(data.attributes).forEach(([name, value]) => {
          toggle.setAttribute(name, value);
        });
        if (data.style) {
          toggle.style.cssText = data.style;
        }
      }
    });
  }

  updateComponentState(componentId, newState) {
    if (this.componentStates.has(componentId)) {
      this.componentStates.set(componentId, { ...this.componentStates.get(componentId), ...newState });
    }
  }

  isStaticComponent(element) {
    const elementId = element.id;
    if (elementId && this.staticComponents.has(elementId)) {
      return true;
    }

    // Check if element matches any static selector
    for (let [componentId, component] of this.staticComponents) {
      if (element.matches && element.matches(component.selector)) {
        return true;
      }
      if (component.element === element) {
        return true;
      }
    }

    return false;
  }

  beforeNavigation() {
    // Update states before navigation
    this.staticComponents.forEach((component, componentId) => {
      if (component.element) {
        const currentState = this.captureComponentState(component.element);
        this.componentStates.set(componentId, currentState);
      }
    });
  }

  afterNavigation() {
    // Re-identify components after navigation (in case DOM changed)
    this.identifyStaticComponents();
    
    // Restore states
    this.restoreComponentStates();
  }

  getStaticComponentIds() {
    return Array.from(this.staticComponents.keys());
  }

  getComponentState(componentId) {
    return this.componentStates.get(componentId);
  }
}

// Initialize component persistence
window.componentPersistence = new ComponentPersistence();
