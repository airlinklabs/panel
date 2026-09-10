(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/timeoutManager.js
  var defaultTimeoutProvider = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timeoutId) => clearTimeout(timeoutId),
    setInterval: (callback, delay) => setInterval(callback, delay),
    clearInterval: (intervalId) => clearInterval(intervalId)
  };
  var TimeoutManager = class {
    #provider = defaultTimeoutProvider;
    #providerCalled = false;
    setTimeoutProvider(provider) {
      if (true) {
        if (this.#providerCalled && provider !== this.#provider)
          console.error(`[timeoutManager]: Switching provider after calls to previous provider might result in unexpected behavior.`, {
            previous: this.#provider,
            provider
          });
      }
      this.#provider = provider;
      if (true)
        this.#providerCalled = false;
    }
    setTimeout(callback, delay) {
      if (true)
        this.#providerCalled = true;
      return this.#provider.setTimeout(callback, delay);
    }
    clearTimeout(timeoutId) {
      this.#provider.clearTimeout(timeoutId);
    }
    setInterval(callback, delay) {
      if (true)
        this.#providerCalled = true;
      return this.#provider.setInterval(callback, delay);
    }
    clearInterval(intervalId) {
      this.#provider.clearInterval(intervalId);
    }
  };
  var timeoutManager = new TimeoutManager;
  function systemSetTimeoutZero(callback) {
    setTimeout(callback, 0);
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/utils.js
  var isServer = typeof window === "undefined" || "Deno" in globalThis;
  function noop() {}
  function functionalUpdate(updater, input) {
    return typeof updater === "function" ? updater(input) : updater;
  }
  function isValidTimeout(value) {
    return typeof value === "number" && value >= 0 && value !== Infinity;
  }
  function timeUntilStale(updatedAt, staleTime) {
    return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0);
  }
  function resolveQueryValue(value, query) {
    return typeof value === "function" ? value(query) : value;
  }
  function matchQuery(filters, query) {
    const { type = "all", exact, fetchStatus, predicate, queryKey, stale } = filters;
    if (queryKey) {
      if (exact) {
        if (query.queryHash !== hashQueryKeyByOptions(queryKey, query.options))
          return false;
      } else if (!partialMatchKey(query.queryKey, queryKey))
        return false;
    }
    if (type !== "all") {
      const isActive = query.isActive();
      if (type === "active" && !isActive)
        return false;
      if (type === "inactive" && isActive)
        return false;
    }
    if (typeof stale === "boolean" && query.isStale() !== stale)
      return false;
    if (fetchStatus && fetchStatus !== query.state.fetchStatus)
      return false;
    if (predicate && !predicate(query))
      return false;
    return true;
  }
  function matchMutation(filters, mutation) {
    const { exact, status, predicate, mutationKey } = filters;
    if (mutationKey) {
      if (!mutation.options.mutationKey)
        return false;
      if (exact) {
        if (hashKey(mutation.options.mutationKey) !== hashKey(mutationKey))
          return false;
      } else if (!partialMatchKey(mutation.options.mutationKey, mutationKey))
        return false;
    }
    if (status && mutation.state.status !== status)
      return false;
    if (predicate && !predicate(mutation))
      return false;
    return true;
  }
  function hashQueryKeyByOptions(queryKey, options) {
    return (options?.queryKeyHashFn || hashKey)(queryKey);
  }
  function hashKey(queryKey) {
    return JSON.stringify(queryKey, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
      result[key] = val[key];
      return result;
    }, {}) : val);
  }
  function partialMatchKey(a, b) {
    if (a === b)
      return true;
    if (typeof a !== typeof b)
      return false;
    if (a && b && typeof a === "object" && typeof b === "object") {
      if (Array.isArray(a) && Array.isArray(b)) {
        for (let i = 0;i < b.length; i++)
          if (!partialMatchKey(a[i], b[i]))
            return false;
        return true;
      }
      const bKeys = Object.keys(b);
      for (const key of bKeys)
        if (!partialMatchKey(a[key], b[key]))
          return false;
      return true;
    }
    return false;
  }
  var hasOwn = Object.prototype.hasOwnProperty;
  function replaceEqualDeep(a, b, depth = 0) {
    if (a === b)
      return a;
    if (depth > 500)
      return b;
    const array = isPlainArray(a) && isPlainArray(b);
    if (!array && !(isPlainObject(a) && isPlainObject(b)))
      return b;
    const aSize = (array ? a : Object.keys(a)).length;
    const bItems = array ? b : Object.keys(b);
    const bSize = bItems.length;
    const copy = array ? new Array(bSize) : {};
    let equalItems = 0;
    for (let i = 0;i < bSize; i++) {
      const key = array ? i : bItems[i];
      const aItem = a[key];
      const bItem = b[key];
      if (aItem === bItem) {
        copy[key] = aItem;
        if (array ? i < aSize : hasOwn.call(a, key))
          equalItems++;
        continue;
      }
      if (aItem === null || bItem === null || typeof aItem !== "object" || typeof bItem !== "object") {
        copy[key] = bItem;
        continue;
      }
      const v = replaceEqualDeep(aItem, bItem, depth + 1);
      copy[key] = v;
      if (v === aItem)
        equalItems++;
    }
    return aSize === bSize && equalItems === aSize ? a : copy;
  }
  function shallowEqualObjects(a, b) {
    if (!b || Object.keys(a).length !== Object.keys(b).length)
      return false;
    for (const key in a)
      if (a[key] !== b[key])
        return false;
    return true;
  }
  function isPlainArray(value) {
    return Array.isArray(value) && value.length === Object.keys(value).length;
  }
  function isPlainObject(o) {
    if (!hasObjectPrototype(o))
      return false;
    const ctor = o.constructor;
    if (ctor === undefined)
      return true;
    const prot = ctor.prototype;
    if (!hasObjectPrototype(prot))
      return false;
    if (!prot.hasOwnProperty("isPrototypeOf"))
      return false;
    if (Object.getPrototypeOf(o) !== Object.prototype)
      return false;
    return true;
  }
  function hasObjectPrototype(o) {
    return Object.prototype.toString.call(o) === "[object Object]";
  }
  function sleep(timeout) {
    return new Promise((resolve) => {
      timeoutManager.setTimeout(resolve, timeout);
    });
  }
  function replaceData(prevData, data, options) {
    if (typeof options.structuralSharing === "function")
      return options.structuralSharing(prevData, data);
    else if (options.structuralSharing !== false) {
      if (true)
        try {
          return replaceEqualDeep(prevData, data);
        } catch (error) {
          console.error(`Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${options.queryHash}]: ${error}`);
          throw error;
        }
      return replaceEqualDeep(prevData, data);
    }
    return data;
  }
  function addToEnd(items, item, max = 0) {
    const newItems = [...items, item];
    return max && newItems.length > max ? newItems.slice(1) : newItems;
  }
  function addToStart(items, item, max = 0) {
    const newItems = [item, ...items];
    return max && newItems.length > max ? newItems.slice(0, -1) : newItems;
  }
  var skipToken = Symbol();
  function ensureQueryFn(options, fetchOptions) {
    if (true) {
      if (options.queryFn === skipToken)
        console.error(`Attempted to invoke queryFn when set to skipToken. This is likely a configuration error. Query hash: '${options.queryHash}'`);
    }
    if (!options.queryFn && fetchOptions?.initialPromise)
      return () => fetchOptions.initialPromise;
    if (!options.queryFn || options.queryFn === skipToken)
      return () => Promise.reject(/* @__PURE__ */ new Error(`Missing queryFn: '${options.queryHash}'`));
    return options.queryFn;
  }
  function addConsumeAwareSignal(object, getSignal, onCancelled) {
    let consumed = false;
    let signal;
    Object.defineProperty(object, "signal", {
      enumerable: true,
      get: () => {
        signal ??= getSignal();
        if (consumed)
          return signal;
        consumed = true;
        if (signal.aborted)
          onCancelled();
        else
          signal.addEventListener("abort", onCancelled, { once: true });
        return signal;
      }
    });
    return object;
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/environmentManager.js
  var isServerFn = () => isServer;
  var isServer2 = () => isServerFn();

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/subscribable.js
  var Subscribable = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new Set;
      this.subscribe = this.subscribe.bind(this);
    }
    subscribe(listener) {
      this.listeners.add(listener);
      this.onSubscribe();
      return () => {
        this.listeners.delete(listener);
        this.onUnsubscribe();
      };
    }
    hasListeners() {
      return this.listeners.size > 0;
    }
    onSubscribe() {}
    onUnsubscribe() {}
  };

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/focusManager.js
  var FocusManager = class extends Subscribable {
    #focused;
    #cleanup;
    #setup;
    constructor() {
      super();
      this.#setup = (onFocus) => {
        if (typeof window !== "undefined" && window.addEventListener) {
          const listener = () => onFocus();
          window.addEventListener("visibilitychange", listener, false);
          return () => {
            window.removeEventListener("visibilitychange", listener);
          };
        }
      };
    }
    onSubscribe() {
      if (!this.#cleanup)
        this.setEventListener(this.#setup);
    }
    onUnsubscribe() {
      if (!this.hasListeners()) {
        this.#cleanup?.();
        this.#cleanup = undefined;
      }
    }
    setEventListener(setup) {
      this.#setup = setup;
      this.#cleanup?.();
      this.#cleanup = setup((focused) => {
        if (typeof focused === "boolean")
          this.setFocused(focused);
        else
          this.onFocus();
      });
    }
    setFocused(focused) {
      if (this.#focused !== focused) {
        this.#focused = focused;
        this.onFocus();
      }
    }
    onFocus() {
      const isFocused = this.isFocused();
      this.listeners.forEach((listener) => {
        listener(isFocused);
      });
    }
    isFocused() {
      if (typeof this.#focused === "boolean")
        return this.#focused;
      return globalThis.document?.visibilityState !== "hidden";
    }
  };
  var focusManager = new FocusManager;

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/notifyManager.js
  var defaultScheduler = systemSetTimeoutZero;
  function createNotifyManager() {
    let queue = [];
    let transactions = 0;
    let notifyFn = (callback) => {
      callback();
    };
    let batchNotifyFn = (callback) => {
      callback();
    };
    let scheduleFn = defaultScheduler;
    const schedule = (callback) => {
      if (transactions)
        queue.push(callback);
      else
        scheduleFn(() => {
          notifyFn(callback);
        });
    };
    const flush = () => {
      const originalQueue = queue;
      queue = [];
      if (originalQueue.length)
        scheduleFn(() => {
          batchNotifyFn(() => {
            originalQueue.forEach((callback) => {
              notifyFn(callback);
            });
          });
        });
    };
    return {
      batch: (callback) => {
        let result;
        transactions++;
        try {
          result = callback();
        } finally {
          transactions--;
          if (!transactions)
            flush();
        }
        return result;
      },
      batchCalls: (callback) => {
        return (...args) => {
          schedule(() => {
            callback(...args);
          });
        };
      },
      schedule,
      setNotifyFunction: (fn) => {
        notifyFn = fn;
      },
      setBatchNotifyFunction: (fn) => {
        batchNotifyFn = fn;
      },
      setScheduler: (fn) => {
        scheduleFn = fn;
      }
    };
  }
  var notifyManager = createNotifyManager();

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/onlineManager.js
  var OnlineManager = class extends Subscribable {
    #online = true;
    #cleanup;
    #setup;
    constructor() {
      super();
      this.#setup = (onOnline) => {
        if (typeof window !== "undefined" && window.addEventListener) {
          const onlineListener = () => onOnline(true);
          const offlineListener = () => onOnline(false);
          window.addEventListener("online", onlineListener, false);
          window.addEventListener("offline", offlineListener, false);
          return () => {
            window.removeEventListener("online", onlineListener);
            window.removeEventListener("offline", offlineListener);
          };
        }
      };
    }
    onSubscribe() {
      if (!this.#cleanup)
        this.setEventListener(this.#setup);
    }
    onUnsubscribe() {
      if (!this.hasListeners()) {
        this.#cleanup?.();
        this.#cleanup = undefined;
      }
    }
    setEventListener(setup) {
      this.#setup = setup;
      this.#cleanup?.();
      this.#cleanup = setup(this.setOnline.bind(this));
    }
    setOnline(online) {
      if (this.#online !== online) {
        this.#online = online;
        this.listeners.forEach((listener) => {
          listener(online);
        });
      }
    }
    isOnline() {
      return this.#online;
    }
  };
  var onlineManager = new OnlineManager;

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/retryer.js
  function defaultRetryDelay(failureCount) {
    return Math.min(1000 * 2 ** failureCount, 30000);
  }
  function canFetch(networkMode) {
    return (networkMode ?? "online") === "online" ? onlineManager.isOnline() : true;
  }
  var CancelledError = class extends Error {
    constructor(options) {
      super("CancelledError");
      this.revert = options?.revert;
      this.silent = options?.silent;
    }
  };
  function createRetryer(config) {
    let isRetryCancelled = false;
    let failureCount = 0;
    let continueFn;
    let status = "pending";
    let promiseResolve;
    let promiseReject;
    const promise = new Promise((resolve, reject) => {
      promiseResolve = resolve;
      promiseReject = reject;
    });
    promise.catch(noop);
    const isResolved = () => status !== "pending";
    const cancel = (cancelOptions) => {
      if (!isResolved()) {
        const error = new CancelledError(cancelOptions);
        reject(error);
        config.onCancel?.(error);
      }
    };
    const cancelRetry = () => {
      isRetryCancelled = true;
    };
    const continueRetry = () => {
      isRetryCancelled = false;
    };
    const canContinue = () => focusManager.isFocused() && (config.networkMode === "always" || onlineManager.isOnline()) && config.canRun();
    const canStart = () => canFetch(config.networkMode) && config.canRun();
    const resolve = (value) => {
      if (!isResolved()) {
        continueFn?.();
        status = "resolved";
        promiseResolve(value);
      }
    };
    const reject = (value) => {
      if (!isResolved()) {
        continueFn?.();
        status = "rejected";
        promiseReject(value);
      }
    };
    const pause = () => {
      return new Promise((continueResolve) => {
        continueFn = (value) => {
          if (isResolved() || canContinue())
            continueResolve(value);
        };
        config.onPause?.();
      }).then(() => {
        continueFn = undefined;
        if (!isResolved())
          config.onContinue?.();
      });
    };
    const run = () => {
      if (isResolved())
        return;
      let promiseOrValue;
      const initialPromise = failureCount === 0 ? config.initialPromise : undefined;
      try {
        promiseOrValue = initialPromise ?? config.fn();
      } catch (error) {
        promiseOrValue = Promise.reject(error);
      }
      Promise.resolve(promiseOrValue).then(resolve).catch((error) => {
        if (isResolved())
          return;
        const retry = config.retry ?? (isServer2() ? 0 : 3);
        const retryDelay = config.retryDelay ?? defaultRetryDelay;
        const delay = typeof retryDelay === "function" ? retryDelay(failureCount, error) : retryDelay;
        const shouldRetry = retry === true || typeof retry === "number" && failureCount < retry || typeof retry === "function" && retry(failureCount, error);
        if (isRetryCancelled || !shouldRetry) {
          reject(error);
          return;
        }
        failureCount++;
        config.onFail?.(failureCount, error);
        sleep(delay).then(() => {
          return canContinue() ? undefined : pause();
        }).then(() => {
          if (isRetryCancelled)
            reject(error);
          else
            run();
        });
      });
    };
    return {
      promise,
      status: () => status,
      cancel,
      continue: () => {
        continueFn?.();
        return promise;
      },
      cancelRetry,
      continueRetry,
      canStart,
      start: () => {
        if (canStart())
          run();
        else
          pause().then(run);
        return promise;
      }
    };
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/removable.js
  var Removable = class {
    #gcTimeout;
    destroy() {
      this.clearGcTimeout();
    }
    scheduleGc() {
      this.clearGcTimeout();
      if (isValidTimeout(this.gcTime))
        this.#gcTimeout = timeoutManager.setTimeout(() => {
          this.optionalRemove();
        }, this.gcTime);
    }
    updateGcTime(newGcTime) {
      this.gcTime = Math.max(this.gcTime || 0, newGcTime ?? (isServer2() ? Infinity : 300000));
    }
    clearGcTimeout() {
      if (this.#gcTimeout !== undefined) {
        timeoutManager.clearTimeout(this.#gcTimeout);
        this.#gcTimeout = undefined;
      }
    }
  };

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/infiniteQueryBehavior.js
  function infiniteQueryBehavior(pages) {
    return { onFetch: (context, query) => {
      const options = context.options;
      const direction = context.fetchOptions?.meta?.fetchMore?.direction;
      const oldPages = context.state.data?.pages || [];
      const oldPageParams = context.state.data?.pageParams || [];
      let result = {
        pages: [],
        pageParams: []
      };
      let currentPage = 0;
      const fetchFn = async () => {
        let cancelled = false;
        const addSignalProperty = (object) => {
          addConsumeAwareSignal(object, () => context.signal, () => cancelled = true);
        };
        const queryFn = ensureQueryFn(context.options, context.fetchOptions);
        const fetchPage = async (data, param, previous) => {
          if (cancelled)
            return Promise.reject(context.signal.reason);
          if (param == null && data.pages.length)
            return Promise.resolve(data);
          const createQueryFnContext = () => {
            const queryFnContext = {
              client: context.client,
              queryKey: context.queryKey,
              pageParam: param,
              direction: previous ? "backward" : "forward",
              meta: context.options.meta
            };
            addSignalProperty(queryFnContext);
            return queryFnContext;
          };
          const queryFnContext = createQueryFnContext();
          const page = await queryFn(queryFnContext);
          const { maxPages } = context.options;
          const addTo = previous ? addToStart : addToEnd;
          return {
            pages: addTo(data.pages, page, maxPages),
            pageParams: addTo(data.pageParams, param, maxPages)
          };
        };
        if (direction && oldPages.length) {
          const previous = direction === "backward";
          const pageParamFn = previous ? getPreviousPageParam : getNextPageParam;
          const oldData = {
            pages: oldPages,
            pageParams: oldPageParams
          };
          result = await fetchPage(oldData, pageParamFn(options, oldData), previous);
        } else {
          const remainingPages = pages ?? oldPages.length;
          do {
            const param = currentPage === 0 ? oldPageParams[0] ?? options.initialPageParam : getNextPageParam(options, result);
            if (currentPage > 0 && param == null)
              break;
            result = await fetchPage(result, param);
            currentPage++;
          } while (currentPage < remainingPages);
        }
        return result;
      };
      if (context.options.persister)
        context.fetchFn = () => {
          return context.options.persister?.(fetchFn, {
            client: context.client,
            queryKey: context.queryKey,
            meta: context.options.meta,
            signal: context.signal
          }, query);
        };
      else
        context.fetchFn = fetchFn;
    } };
  }
  function getNextPageParam(options, { pages, pageParams }) {
    const lastIndex = pages.length - 1;
    return pages.length > 0 ? options.getNextPageParam(pages[lastIndex], pages, pageParams[lastIndex], pageParams) : undefined;
  }
  function getPreviousPageParam(options, { pages, pageParams }) {
    return pages.length > 0 ? options.getPreviousPageParam?.(pages[0], pages, pageParams[0], pageParams) : undefined;
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/query.js
  var Query = class extends Removable {
    #queryType;
    #initialState;
    #revertState;
    #cache;
    #client;
    #retryer;
    #defaultOptions;
    #abortSignalConsumed;
    constructor(config) {
      super();
      this.#abortSignalConsumed = false;
      this.#defaultOptions = config.defaultOptions;
      this.setOptions(config.options);
      this.observers = [];
      this.#client = config.client;
      this.#cache = this.#client.getQueryCache();
      this.queryKey = config.queryKey;
      this.queryHash = config.queryHash;
      this.#initialState = getDefaultState(this.options);
      this.state = config.state ?? this.#initialState;
      this.scheduleGc();
    }
    get meta() {
      return this.options.meta;
    }
    get queryType() {
      return this.#queryType;
    }
    get promise() {
      return this.#retryer?.promise;
    }
    setOptions(options) {
      this.options = {
        ...this.#defaultOptions,
        ...options
      };
      if (options?._type)
        this.#queryType = options._type;
      this.updateGcTime(this.options.gcTime);
      if (this.state && this.state.data === undefined) {
        const defaultState = getDefaultState(this.options);
        if (defaultState.data !== undefined) {
          this.setState(successState(defaultState.data, defaultState.dataUpdatedAt));
          this.#initialState = defaultState;
        }
      }
    }
    optionalRemove() {
      if (!this.observers.length && this.state.fetchStatus === "idle")
        this.#cache.remove(this);
    }
    setData(newData, options) {
      const data = replaceData(this.state.data, newData, this.options);
      this.#dispatch({
        data,
        type: "success",
        dataUpdatedAt: options?.updatedAt,
        manual: options?.manual
      });
      return data;
    }
    setState(state) {
      this.#dispatch({
        type: "setState",
        state
      });
    }
    cancel(options) {
      const promise = this.#retryer?.promise;
      this.#retryer?.cancel(options);
      return promise ? promise.then(noop).catch(noop) : Promise.resolve();
    }
    destroy() {
      super.destroy();
      this.cancel({ silent: true });
    }
    get resetState() {
      return this.#initialState;
    }
    reset() {
      this.destroy();
      this.setState(this.resetState);
    }
    isActive() {
      return this.observers.some((observer) => resolveQueryValue(observer.options.enabled, this) !== false);
    }
    isDisabled() {
      if (this.getObserversCount() > 0)
        return !this.isActive();
      return this.options.queryFn === skipToken || !this.isFetched();
    }
    isFetched() {
      return this.state.dataUpdateCount + this.state.errorUpdateCount > 0;
    }
    isStatic() {
      if (this.getObserversCount() > 0)
        return this.observers.some((observer) => resolveQueryValue(observer.options.staleTime, this) === "static");
      return false;
    }
    isStale() {
      if (this.getObserversCount() > 0)
        return this.observers.some((observer) => observer.getCurrentResult().isStale);
      return this.state.data === undefined || this.state.isInvalidated;
    }
    isStaleByTime(staleTime = 0) {
      if (this.state.data === undefined)
        return true;
      if (staleTime === "static")
        return false;
      if (this.state.isInvalidated)
        return true;
      return !timeUntilStale(this.state.dataUpdatedAt, staleTime);
    }
    onFocus() {
      this.observers.find((x) => x.shouldFetchOnWindowFocus())?.refetch({ cancelRefetch: false });
      this.#retryer?.continue();
    }
    onOnline() {
      this.observers.find((x) => x.shouldFetchOnReconnect())?.refetch({ cancelRefetch: false });
      this.#retryer?.continue();
    }
    addObserver(observer) {
      if (!this.observers.includes(observer)) {
        this.observers.push(observer);
        this.clearGcTimeout();
        this.#cache.notify({
          type: "observerAdded",
          query: this,
          observer
        });
      }
    }
    removeObserver(observer) {
      const index = this.observers.indexOf(observer);
      if (index !== -1) {
        this.observers.splice(index, 1);
        if (!this.observers.length) {
          if (this.#retryer) {
            if (this.#abortSignalConsumed || this.state.fetchStatus === "paused" && this.state.status === "pending")
              this.#retryer.cancel({ revert: true });
            else
              this.#retryer.cancelRetry();
          }
          this.scheduleGc();
        }
        this.#cache.notify({
          type: "observerRemoved",
          query: this,
          observer
        });
      }
    }
    getObserversCount() {
      return this.observers.length;
    }
    invalidate() {
      if (!this.state.isInvalidated)
        this.#dispatch({ type: "invalidate" });
    }
    async fetch(options, fetchOptions) {
      if (this.state.fetchStatus !== "idle" && this.#retryer?.status() !== "rejected") {
        if (this.state.data !== undefined && fetchOptions?.cancelRefetch)
          this.cancel({ silent: true });
        else if (this.#retryer) {
          this.#retryer.continueRetry();
          return this.#retryer.promise;
        }
      }
      if (options)
        this.setOptions(options);
      if (!this.options.queryFn) {
        const observer = this.observers.find((x) => x.options.queryFn);
        if (observer)
          this.setOptions(observer.options);
      }
      if (true) {
        if (!Array.isArray(this.options.queryKey))
          console.error(`As of v4, queryKey needs to be an Array. If you are using a string like 'repoData', please change it to an Array, e.g. ['repoData']`);
      }
      const abortController = new AbortController;
      const addSignalProperty = (object) => {
        Object.defineProperty(object, "signal", {
          enumerable: true,
          get: () => {
            this.#abortSignalConsumed = true;
            return abortController.signal;
          }
        });
      };
      const fetchFn = () => {
        const queryFn = ensureQueryFn(this.options, fetchOptions);
        const createQueryFnContext = () => {
          const queryFnContext = {
            client: this.#client,
            queryKey: this.queryKey,
            meta: this.meta
          };
          addSignalProperty(queryFnContext);
          return queryFnContext;
        };
        const queryFnContext = createQueryFnContext();
        this.#abortSignalConsumed = false;
        if (this.options.persister)
          return this.options.persister(queryFn, queryFnContext, this);
        return queryFn(queryFnContext);
      };
      const createFetchContext = () => {
        const context = {
          fetchOptions,
          options: this.options,
          queryKey: this.queryKey,
          client: this.#client,
          state: this.state,
          fetchFn
        };
        addSignalProperty(context);
        return context;
      };
      const context = createFetchContext();
      (this.#queryType === "infinite" ? infiniteQueryBehavior(this.options.pages) : this.options.behavior)?.onFetch(context, this);
      this.#revertState = this.state;
      if (this.state.fetchStatus === "idle" || this.state.fetchMeta !== context.fetchOptions?.meta)
        this.#dispatch({
          type: "fetch",
          meta: context.fetchOptions?.meta
        });
      const retryer = this.#retryer = createRetryer({
        initialPromise: fetchOptions?.initialPromise,
        fn: context.fetchFn,
        onCancel: (error) => {
          if (error instanceof CancelledError && error.revert)
            this.setState({
              ...this.#revertState,
              fetchStatus: "idle"
            });
          abortController.abort();
        },
        onFail: (failureCount, error) => {
          this.#dispatch({
            type: "failed",
            failureCount,
            error
          });
        },
        onPause: () => {
          this.#dispatch({ type: "pause" });
        },
        onContinue: () => {
          this.#dispatch({ type: "continue" });
        },
        retry: context.options.retry,
        retryDelay: context.options.retryDelay,
        networkMode: context.options.networkMode,
        canRun: () => true
      });
      try {
        const data = await retryer.start();
        if (data === undefined) {
          if (true)
            console.error(`Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ${this.queryHash}`);
          throw new Error(`${this.queryHash} data is undefined`);
        }
        this.setData(data);
        this.#cache.config.onSuccess?.(data, this);
        this.#cache.config.onSettled?.(data, this.state.error, this);
        return data;
      } catch (error) {
        if (error instanceof CancelledError) {
          if (error.silent)
            return this.#retryer.promise;
          else if (error.revert) {
            if (this.state.data === undefined)
              throw error;
            return this.state.data;
          }
        }
        this.#dispatch({
          type: "error",
          error
        });
        this.#cache.config.onError?.(error, this);
        this.#cache.config.onSettled?.(this.state.data, error, this);
        throw error;
      } finally {
        if (this.#retryer === retryer)
          this.#retryer = undefined;
        this.scheduleGc();
      }
    }
    #dispatch(action) {
      const reducer = (state) => {
        switch (action.type) {
          case "failed":
            return {
              ...state,
              fetchFailureCount: action.failureCount,
              fetchFailureReason: action.error
            };
          case "pause":
            return {
              ...state,
              fetchStatus: "paused"
            };
          case "continue":
            return {
              ...state,
              fetchStatus: "fetching"
            };
          case "fetch":
            return {
              ...state,
              ...fetchState(state.data, this.options),
              fetchMeta: action.meta ?? null
            };
          case "success":
            const newState = {
              ...state,
              ...successState(action.data, action.dataUpdatedAt),
              dataUpdateCount: state.dataUpdateCount + 1,
              ...!action.manual && {
                fetchStatus: "idle",
                fetchFailureCount: 0,
                fetchFailureReason: null
              }
            };
            this.#revertState = action.manual ? newState : undefined;
            return newState;
          case "error":
            const error = action.error;
            return {
              ...state,
              error,
              errorUpdateCount: state.errorUpdateCount + 1,
              errorUpdatedAt: Date.now(),
              fetchFailureCount: state.fetchFailureCount + 1,
              fetchFailureReason: error,
              fetchStatus: "idle",
              status: "error",
              isInvalidated: true
            };
          case "invalidate":
            return {
              ...state,
              isInvalidated: true
            };
          case "setState":
            return {
              ...state,
              ...action.state
            };
        }
      };
      this.state = reducer(this.state);
      notifyManager.batch(() => {
        this.observers.slice().forEach((observer) => {
          observer.onQueryUpdate();
        });
        this.#cache.notify({
          query: this,
          type: "updated",
          action
        });
      });
    }
  };
  function fetchState(data, options) {
    return {
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchStatus: canFetch(options.networkMode) ? "fetching" : "paused",
      ...data === undefined && {
        error: null,
        status: "pending"
      }
    };
  }
  function successState(data, dataUpdatedAt) {
    return {
      data,
      dataUpdatedAt: dataUpdatedAt ?? Date.now(),
      error: null,
      isInvalidated: false,
      status: "success"
    };
  }
  function getDefaultState(options) {
    const data = typeof options.initialData === "function" ? options.initialData() : options.initialData;
    const hasData = data !== undefined;
    const initialDataUpdatedAt = hasData ? typeof options.initialDataUpdatedAt === "function" ? options.initialDataUpdatedAt() : options.initialDataUpdatedAt : 0;
    return {
      data,
      dataUpdateCount: 0,
      dataUpdatedAt: hasData ? initialDataUpdatedAt ?? Date.now() : 0,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: hasData ? "success" : "pending",
      fetchStatus: "idle"
    };
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/queryObserver.js
  var QueryObserver = class extends Subscribable {
    #client;
    #currentQuery = undefined;
    #currentQueryInitialState = undefined;
    #currentResult = undefined;
    #currentResultState;
    #currentResultOptions;
    #selectError;
    #selectFn;
    #selectResult;
    #lastQueryWithDefinedData;
    #staleTimeoutId;
    #refetchIntervalId;
    #currentRefetchInterval;
    #trackedProps = /* @__PURE__ */ new Set;
    constructor(client, options) {
      super();
      this.options = options;
      this.#client = client;
      this.#selectError = null;
      this.bindMethods();
      this.setOptions(options);
    }
    bindMethods() {
      this.refetch = this.refetch.bind(this);
    }
    onSubscribe() {
      if (this.listeners.size === 1) {
        this.#currentQuery.addObserver(this);
        if (shouldFetchOnMount(this.#currentQuery, this.options))
          this.#executeFetch();
        else
          this.updateResult();
        this.#updateTimers();
      }
    }
    onUnsubscribe() {
      if (!this.hasListeners())
        this.destroy();
    }
    shouldFetchOnReconnect() {
      return shouldFetchOn(this.#currentQuery, this.options, this.options.refetchOnReconnect);
    }
    shouldFetchOnWindowFocus() {
      return shouldFetchOn(this.#currentQuery, this.options, this.options.refetchOnWindowFocus);
    }
    destroy() {
      this.listeners = /* @__PURE__ */ new Set;
      this.#clearStaleTimeout();
      this.#clearRefetchInterval();
      this.#currentQuery.removeObserver(this);
    }
    setOptions(options) {
      const prevOptions = this.options;
      const prevQuery = this.#currentQuery;
      this.options = this.#client.defaultQueryOptions(options);
      if (this.options.enabled !== undefined && typeof this.options.enabled !== "boolean" && typeof this.options.enabled !== "function" && typeof resolveQueryValue(this.options.enabled, this.#currentQuery) !== "boolean")
        throw new Error("Expected enabled to be a boolean or a callback that returns a boolean");
      this.#updateQuery();
      this.#currentQuery.setOptions(this.options);
      if (prevOptions._defaulted && !shallowEqualObjects(this.options, prevOptions))
        this.#client.getQueryCache().notify({
          type: "observerOptionsUpdated",
          query: this.#currentQuery,
          observer: this
        });
      const mounted = this.hasListeners();
      if (mounted && shouldFetchOptionally(this.#currentQuery, prevQuery, this.options, prevOptions))
        this.#executeFetch();
      this.updateResult();
      if (mounted && (this.#currentQuery !== prevQuery || resolveQueryValue(this.options.enabled, this.#currentQuery) !== resolveQueryValue(prevOptions.enabled, this.#currentQuery) || resolveQueryValue(this.options.staleTime, this.#currentQuery) !== resolveQueryValue(prevOptions.staleTime, this.#currentQuery)))
        this.#updateStaleTimeout();
      const nextRefetchInterval = this.#computeRefetchInterval();
      if (mounted && (this.#currentQuery !== prevQuery || resolveQueryValue(this.options.enabled, this.#currentQuery) !== resolveQueryValue(prevOptions.enabled, this.#currentQuery) || nextRefetchInterval !== this.#currentRefetchInterval))
        this.#updateRefetchInterval(nextRefetchInterval);
    }
    getOptimisticResult(options) {
      const query = this.#client.getQueryCache().build(this.#client, options);
      const result = this.createResult(query, options);
      if (!shallowEqualObjects(this.getCurrentResult(), result)) {
        this.#currentResult = result;
        this.#currentResultOptions = this.options;
        this.#currentResultState = this.#currentQuery.state;
      }
      return result;
    }
    getCurrentResult() {
      return this.#currentResult;
    }
    trackResult(result, onPropTracked) {
      return new Proxy(result, { get: (target, key) => {
        this.trackProp(key);
        onPropTracked?.(key);
        return Reflect.get(target, key);
      } });
    }
    trackProp(key) {
      this.#trackedProps.add(key);
    }
    getCurrentQuery() {
      return this.#currentQuery;
    }
    refetch({ ...options } = {}) {
      return this.fetch({ ...options });
    }
    fetchOptimistic(options) {
      const defaultedOptions = this.#client.defaultQueryOptions(options);
      const query = this.#client.getQueryCache().build(this.#client, defaultedOptions);
      let unsubscribe = () => {};
      let resolveEarly;
      const cachePromise = new Promise((resolve) => {
        resolveEarly = resolve;
        unsubscribe = this.#client.getQueryCache().subscribe((event) => {
          if (event.type === "updated" && event.query.queryHash === query.queryHash && query.state.data !== undefined) {
            unsubscribe();
            resolve(this.createResult(query, defaultedOptions));
          }
        });
      });
      return Promise.race([query.fetch().then(() => {
        const result = this.createResult(query, defaultedOptions);
        resolveEarly?.(result);
        return result;
      }).finally(() => {
        unsubscribe();
      }), cachePromise]);
    }
    fetch(fetchOptions) {
      return this.#executeFetch({
        ...fetchOptions,
        cancelRefetch: fetchOptions.cancelRefetch ?? true
      }).then(() => {
        this.updateResult();
        return this.#currentResult;
      });
    }
    #executeFetch(fetchOptions) {
      this.#updateQuery();
      let promise = this.#currentQuery.fetch(this.options, fetchOptions);
      if (!fetchOptions?.throwOnError)
        promise = promise.catch(noop);
      return promise;
    }
    #shouldScheduleTimer(timeout) {
      return !isServer2() && resolveQueryValue(this.options.enabled, this.#currentQuery) !== false && isValidTimeout(timeout);
    }
    #updateStaleTimeout() {
      this.#clearStaleTimeout();
      const staleTime = resolveQueryValue(this.options.staleTime, this.#currentQuery);
      if (this.#currentResult.isStale || !this.#shouldScheduleTimer(staleTime))
        return;
      const timeout = timeUntilStale(this.#currentResult.dataUpdatedAt, staleTime) + 1;
      this.#staleTimeoutId = timeoutManager.setTimeout(() => {
        if (!this.#currentResult.isStale)
          this.updateResult();
      }, timeout);
    }
    #computeRefetchInterval() {
      return (typeof this.options.refetchInterval === "function" ? this.options.refetchInterval(this.#currentQuery) : this.options.refetchInterval) ?? false;
    }
    #updateRefetchInterval(nextInterval) {
      this.#clearRefetchInterval();
      this.#currentRefetchInterval = nextInterval;
      if (this.#currentRefetchInterval === 0 || !this.#shouldScheduleTimer(this.#currentRefetchInterval))
        return;
      this.#refetchIntervalId = timeoutManager.setInterval(() => {
        if (this.options.refetchIntervalInBackground || focusManager.isFocused())
          this.#executeFetch();
      }, this.#currentRefetchInterval);
    }
    #updateTimers() {
      this.#updateStaleTimeout();
      this.#updateRefetchInterval(this.#computeRefetchInterval());
    }
    #clearStaleTimeout() {
      if (this.#staleTimeoutId !== undefined) {
        timeoutManager.clearTimeout(this.#staleTimeoutId);
        this.#staleTimeoutId = undefined;
      }
    }
    #clearRefetchInterval() {
      if (this.#refetchIntervalId !== undefined) {
        timeoutManager.clearInterval(this.#refetchIntervalId);
        this.#refetchIntervalId = undefined;
      }
    }
    createResult(query, options) {
      const prevQuery = this.#currentQuery;
      const prevOptions = this.options;
      const prevResult = this.#currentResult;
      const prevResultState = this.#currentResultState;
      const prevResultOptions = this.#currentResultOptions;
      const queryInitialState = query !== prevQuery ? query.state : this.#currentQueryInitialState;
      const { state } = query;
      let newState = { ...state };
      let isPlaceholderData = false;
      let data;
      if (options._optimisticResults) {
        const mounted = this.hasListeners();
        const fetchOnMount = !mounted && shouldFetchOnMount(query, options);
        const fetchOptionally = mounted && shouldFetchOptionally(query, prevQuery, options, prevOptions);
        if (fetchOnMount || fetchOptionally)
          newState = {
            ...newState,
            ...fetchState(state.data, query.options)
          };
        if (options._optimisticResults === "isRestoring")
          newState.fetchStatus = "idle";
      }
      let { error, errorUpdatedAt, status } = newState;
      data = newState.data;
      let skipSelect = false;
      if (options.placeholderData !== undefined && data === undefined && status === "pending") {
        let placeholderData;
        if (prevResult?.isPlaceholderData && options.placeholderData === prevResultOptions?.placeholderData) {
          placeholderData = prevResult.data;
          skipSelect = true;
        } else
          placeholderData = typeof options.placeholderData === "function" ? options.placeholderData(this.#lastQueryWithDefinedData?.state.data, this.#lastQueryWithDefinedData) : options.placeholderData;
        if (placeholderData !== undefined) {
          status = "success";
          data = replaceData(prevResult?.data, placeholderData, options);
          isPlaceholderData = true;
        }
      }
      if (options.select && data !== undefined && !skipSelect) {
        if (prevResult && data === prevResultState?.data && options.select === this.#selectFn)
          data = this.#selectResult;
        else
          try {
            this.#selectFn = options.select;
            data = options.select(data);
            data = replaceData(prevResult?.data, data, options);
            this.#selectResult = data;
            this.#selectError = null;
          } catch (selectError) {
            this.#selectError = selectError;
          }
      } else if (data === undefined)
        this.#selectError = null;
      if (this.#selectError) {
        error = this.#selectError;
        data = this.#selectResult;
        errorUpdatedAt = Date.now();
        status = "error";
        isPlaceholderData = false;
      }
      const isFetching = newState.fetchStatus === "fetching";
      const isPending = status === "pending";
      const isError = status === "error";
      const isLoading = isPending && isFetching;
      const hasData = data !== undefined;
      return {
        status,
        fetchStatus: newState.fetchStatus,
        isPending,
        isSuccess: status === "success",
        isError,
        isInitialLoading: isLoading,
        isLoading,
        data,
        dataUpdatedAt: newState.dataUpdatedAt,
        error,
        errorUpdatedAt,
        failureCount: newState.fetchFailureCount,
        failureReason: newState.fetchFailureReason,
        errorUpdateCount: newState.errorUpdateCount,
        isFetched: query.isFetched(),
        isFetchedAfterMount: newState.dataUpdateCount > queryInitialState.dataUpdateCount || newState.errorUpdateCount > queryInitialState.errorUpdateCount,
        isFetching,
        isRefetching: isFetching && !isPending,
        isLoadingError: isError && !hasData,
        isPaused: newState.fetchStatus === "paused",
        isPlaceholderData,
        isRefetchError: isError && hasData,
        isStale: isStale(query, options),
        refetch: this.refetch,
        isEnabled: resolveQueryValue(options.enabled, query) !== false
      };
    }
    updateResult() {
      const prevResult = this.#currentResult;
      const nextResult = this.createResult(this.#currentQuery, this.options);
      this.#currentResultState = this.#currentQuery.state;
      this.#currentResultOptions = this.options;
      if (this.#currentResultState.data !== undefined)
        this.#lastQueryWithDefinedData = this.#currentQuery;
      if (shallowEqualObjects(nextResult, prevResult))
        return;
      this.#currentResult = nextResult;
      const shouldNotifyListeners = () => {
        if (!prevResult)
          return true;
        const { notifyOnChangeProps } = this.options;
        const notifyOnChangePropsValue = typeof notifyOnChangeProps === "function" ? notifyOnChangeProps() : notifyOnChangeProps;
        if (notifyOnChangePropsValue === "all" || !notifyOnChangePropsValue && !this.#trackedProps.size)
          return true;
        const includedProps = new Set(notifyOnChangePropsValue ?? this.#trackedProps);
        if (this.options.throwOnError)
          includedProps.add("error");
        return Object.keys(this.#currentResult).some((key) => {
          const typedKey = key;
          return this.#currentResult[typedKey] !== prevResult[typedKey] && includedProps.has(typedKey);
        });
      };
      const notifyListeners = shouldNotifyListeners();
      notifyManager.batch(() => {
        if (notifyListeners)
          this.listeners.forEach((listener) => {
            listener(this.#currentResult);
          });
        this.#client.getQueryCache().notify({
          query: this.#currentQuery,
          type: "observerResultsUpdated"
        });
      });
    }
    #updateQuery() {
      const query = this.#client.getQueryCache().build(this.#client, this.options);
      if (query === this.#currentQuery)
        return;
      const prevQuery = this.#currentQuery;
      this.#currentQuery = query;
      this.#currentQueryInitialState = query.state;
      if (this.hasListeners()) {
        prevQuery?.removeObserver(this);
        query.addObserver(this);
      }
    }
    onQueryUpdate() {
      this.updateResult();
      if (this.hasListeners())
        this.#updateTimers();
    }
  };
  function shouldLoadOnMount(query, options) {
    return resolveQueryValue(options.enabled, query) !== false && query.state.data === undefined && !(query.state.status === "error" && resolveQueryValue(options.retryOnMount, query) === false);
  }
  function shouldFetchOnMount(query, options) {
    return shouldLoadOnMount(query, options) || query.state.data !== undefined && shouldFetchOn(query, options, options.refetchOnMount);
  }
  function shouldFetchOn(query, options, field) {
    if (resolveQueryValue(options.enabled, query) !== false && resolveQueryValue(options.staleTime, query) !== "static") {
      const value = typeof field === "function" ? field(query) : field;
      return value === "always" || value !== false && isStale(query, options);
    }
    return false;
  }
  function shouldFetchOptionally(query, prevQuery, options, prevOptions) {
    return (query !== prevQuery || resolveQueryValue(prevOptions.enabled, query) === false) && (!options.suspense || query.state.status !== "error") && isStale(query, options);
  }
  function isStale(query, options) {
    return resolveQueryValue(options.enabled, query) !== false && query.isStaleByTime(resolveQueryValue(options.staleTime, query));
  }
  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/mutation.js
  var Mutation = class extends Removable {
    #client;
    #observers;
    #mutationCache;
    #retryer;
    constructor(config) {
      super();
      this.#client = config.client;
      this.mutationId = config.mutationId;
      this.#mutationCache = config.mutationCache;
      this.#observers = [];
      this.state = config.state || getDefaultState2();
      this.setOptions(config.options);
      this.scheduleGc();
    }
    setOptions(options) {
      this.options = options;
      this.updateGcTime(this.options.gcTime);
    }
    get meta() {
      return this.options.meta;
    }
    addObserver(observer) {
      if (!this.#observers.includes(observer)) {
        this.#observers.push(observer);
        this.clearGcTimeout();
        this.#mutationCache.notify({
          type: "observerAdded",
          mutation: this,
          observer
        });
      }
    }
    removeObserver(observer) {
      this.#observers = this.#observers.filter((x) => x !== observer);
      this.scheduleGc();
      this.#mutationCache.notify({
        type: "observerRemoved",
        mutation: this,
        observer
      });
    }
    optionalRemove() {
      if (!this.#observers.length) {
        if (this.state.status === "pending")
          this.scheduleGc();
        else
          this.#mutationCache.remove(this);
      }
    }
    continue() {
      return this.#retryer?.continue() ?? (this.state.status === "pending" ? this.execute(this.state.variables) : Promise.resolve());
    }
    async execute(variables) {
      const onContinue = () => {
        this.#dispatch({ type: "continue" });
      };
      const mutationFnContext = {
        client: this.#client,
        meta: this.options.meta,
        mutationKey: this.options.mutationKey
      };
      const retryer = this.#retryer = createRetryer({
        fn: () => {
          if (!this.options.mutationFn)
            return Promise.reject(/* @__PURE__ */ new Error("No mutationFn found"));
          return this.options.mutationFn(variables, mutationFnContext);
        },
        onFail: (failureCount, error) => {
          this.#dispatch({
            type: "failed",
            failureCount,
            error
          });
        },
        onPause: () => {
          this.#dispatch({ type: "pause" });
        },
        onContinue,
        retry: this.options.retry ?? 0,
        retryDelay: this.options.retryDelay,
        networkMode: this.options.networkMode,
        canRun: () => this.#mutationCache.canRun(this)
      });
      const restored = this.state.status === "pending";
      const isPaused = !retryer.canStart();
      try {
        if (restored)
          onContinue();
        else {
          this.#dispatch({
            type: "pending",
            variables,
            isPaused
          });
          if (this.#mutationCache.config.onMutate)
            await this.#mutationCache.config.onMutate(variables, this, mutationFnContext);
          const context = await this.options.onMutate?.(variables, mutationFnContext);
          if (context !== this.state.context)
            this.#dispatch({
              type: "pending",
              context,
              variables,
              isPaused
            });
        }
        const data = await retryer.start();
        await this.#mutationCache.config.onSuccess?.(data, variables, this.state.context, this, mutationFnContext);
        await this.options.onSuccess?.(data, variables, this.state.context, mutationFnContext);
        await this.#mutationCache.config.onSettled?.(data, null, this.state.variables, this.state.context, this, mutationFnContext);
        await this.options.onSettled?.(data, null, variables, this.state.context, mutationFnContext);
        this.#dispatch({
          type: "success",
          data
        });
        return data;
      } catch (error) {
        try {
          await this.#mutationCache.config.onError?.(error, variables, this.state.context, this, mutationFnContext);
        } catch (e) {
          Promise.reject(e);
        }
        try {
          await this.options.onError?.(error, variables, this.state.context, mutationFnContext);
        } catch (e) {
          Promise.reject(e);
        }
        try {
          await this.#mutationCache.config.onSettled?.(undefined, error, this.state.variables, this.state.context, this, mutationFnContext);
        } catch (e) {
          Promise.reject(e);
        }
        try {
          await this.options.onSettled?.(undefined, error, variables, this.state.context, mutationFnContext);
        } catch (e) {
          Promise.reject(e);
        }
        this.#dispatch({
          type: "error",
          error
        });
        throw error;
      } finally {
        if (this.#retryer === retryer)
          this.#retryer = undefined;
        this.#mutationCache.runNext(this);
      }
    }
    #dispatch(action) {
      const reducer = (state) => {
        switch (action.type) {
          case "failed":
            return {
              ...state,
              failureCount: action.failureCount,
              failureReason: action.error
            };
          case "pause":
            return {
              ...state,
              isPaused: true
            };
          case "continue":
            return {
              ...state,
              isPaused: false
            };
          case "pending":
            return {
              ...state,
              context: action.context,
              data: undefined,
              failureCount: 0,
              failureReason: null,
              error: null,
              isPaused: action.isPaused,
              status: "pending",
              variables: action.variables,
              submittedAt: Date.now()
            };
          case "success":
            return {
              ...state,
              data: action.data,
              failureCount: 0,
              failureReason: null,
              error: null,
              status: "success",
              isPaused: false
            };
          case "error":
            return {
              ...state,
              data: undefined,
              error: action.error,
              failureCount: state.failureCount + 1,
              failureReason: action.error,
              isPaused: false,
              status: "error"
            };
        }
      };
      this.state = reducer(this.state);
      notifyManager.batch(() => {
        this.#observers.forEach((observer) => {
          observer.onMutationUpdate(action);
        });
        this.#mutationCache.notify({
          mutation: this,
          type: "updated",
          action
        });
      });
    }
  };
  function getDefaultState2() {
    return {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: "idle",
      variables: undefined,
      submittedAt: 0
    };
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/mutationCache.js
  var MutationCache = class extends Subscribable {
    #mutations;
    #scopes;
    #mutationId;
    constructor(config = {}) {
      super();
      this.config = config;
      this.#mutations = /* @__PURE__ */ new Set;
      this.#scopes = /* @__PURE__ */ new Map;
      this.#mutationId = 0;
    }
    build(client, options, state) {
      const mutation = new Mutation({
        client,
        mutationCache: this,
        mutationId: ++this.#mutationId,
        options: client.defaultMutationOptions(options),
        state
      });
      this.add(mutation);
      return mutation;
    }
    add(mutation) {
      this.#mutations.add(mutation);
      const scope = scopeFor(mutation);
      if (typeof scope === "string") {
        const scopedMutations = this.#scopes.get(scope);
        if (scopedMutations)
          scopedMutations.push(mutation);
        else
          this.#scopes.set(scope, [mutation]);
      }
      this.notify({
        type: "added",
        mutation
      });
    }
    remove(mutation) {
      if (this.#mutations.delete(mutation)) {
        const scope = scopeFor(mutation);
        if (typeof scope === "string") {
          const scopedMutations = this.#scopes.get(scope);
          if (scopedMutations) {
            if (scopedMutations.length > 1) {
              const index = scopedMutations.indexOf(mutation);
              if (index !== -1)
                scopedMutations.splice(index, 1);
            } else if (scopedMutations[0] === mutation)
              this.#scopes.delete(scope);
          }
        }
      }
      this.notify({
        type: "removed",
        mutation
      });
    }
    canRun(mutation) {
      const scope = scopeFor(mutation);
      if (typeof scope === "string") {
        const firstPendingMutation = this.#scopes.get(scope)?.find((m) => m.state.status === "pending");
        return !firstPendingMutation || firstPendingMutation === mutation;
      } else
        return true;
    }
    runNext(mutation) {
      const scope = scopeFor(mutation);
      if (typeof scope === "string")
        return this.#scopes.get(scope)?.find((m) => m !== mutation && m.state.isPaused)?.continue() ?? Promise.resolve();
      else
        return Promise.resolve();
    }
    clear() {
      notifyManager.batch(() => {
        this.#mutations.forEach((mutation) => {
          this.notify({
            type: "removed",
            mutation
          });
        });
        this.#mutations.clear();
        this.#scopes.clear();
      });
    }
    getAll() {
      return Array.from(this.#mutations);
    }
    find(filters) {
      const defaultedFilters = {
        exact: true,
        ...filters
      };
      return this.getAll().find((mutation) => matchMutation(defaultedFilters, mutation));
    }
    findAll(filters = {}) {
      return this.getAll().filter((mutation) => matchMutation(filters, mutation));
    }
    notify(event) {
      notifyManager.batch(() => {
        this.listeners.forEach((listener) => {
          listener(event);
        });
      });
    }
    resumePausedMutations() {
      const pausedMutations = this.getAll().filter((x) => x.state.isPaused);
      return notifyManager.batch(() => Promise.all(pausedMutations.map((mutation) => mutation.continue().catch(noop))));
    }
  };
  function scopeFor(mutation) {
    return mutation.options.scope?.id;
  }

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/mutationObserver.js
  var MutationObserver = class extends Subscribable {
    #client;
    #currentResult = undefined;
    #currentMutation;
    #mutateOptions;
    constructor(client, options) {
      super();
      this.#client = client;
      this.setOptions(options);
      this.bindMethods();
      this.#updateResult();
    }
    bindMethods() {
      this.mutate = this.mutate.bind(this);
      this.reset = this.reset.bind(this);
    }
    setOptions(options) {
      const prevOptions = this.options;
      this.options = this.#client.defaultMutationOptions(options);
      if (!shallowEqualObjects(this.options, prevOptions))
        this.#client.getMutationCache().notify({
          type: "observerOptionsUpdated",
          mutation: this.#currentMutation,
          observer: this
        });
      if (prevOptions?.mutationKey && this.options.mutationKey && hashKey(prevOptions.mutationKey) !== hashKey(this.options.mutationKey))
        this.reset();
      else if (this.#currentMutation?.state.status === "pending")
        this.#currentMutation.setOptions(this.options);
    }
    onSubscribe() {
      if (this.listeners.size === 1 && this.#currentMutation) {
        this.#currentMutation.addObserver(this);
        this.#updateResult();
      }
    }
    onUnsubscribe() {
      if (!this.hasListeners())
        this.#currentMutation?.removeObserver(this);
    }
    onMutationUpdate(action) {
      this.#updateResult();
      this.#notify(action);
    }
    getCurrentResult() {
      return this.#currentResult;
    }
    reset() {
      this.#currentMutation?.removeObserver(this);
      this.#currentMutation = undefined;
      this.#updateResult();
      this.#notify();
    }
    mutate(variables, options) {
      this.#mutateOptions = options;
      this.#currentMutation?.removeObserver(this);
      this.#currentMutation = this.#client.getMutationCache().build(this.#client, this.options);
      this.#currentMutation.addObserver(this);
      return this.#currentMutation.execute(variables);
    }
    #updateResult() {
      const state = this.#currentMutation?.state ?? getDefaultState2();
      this.#currentResult = {
        ...state,
        isPending: state.status === "pending",
        isSuccess: state.status === "success",
        isError: state.status === "error",
        isIdle: state.status === "idle",
        mutate: this.mutate,
        reset: this.reset
      };
    }
    #notify(action) {
      notifyManager.batch(() => {
        if (this.#mutateOptions && this.hasListeners()) {
          const variables = this.#currentResult.variables;
          const onMutateResult = this.#currentResult.context;
          const context = {
            client: this.#client,
            meta: this.options.meta,
            mutationKey: this.options.mutationKey
          };
          if (action?.type === "success") {
            try {
              this.#mutateOptions.onSuccess?.(action.data, variables, onMutateResult, context);
            } catch (e) {
              Promise.reject(e);
            }
            try {
              this.#mutateOptions.onSettled?.(action.data, null, variables, onMutateResult, context);
            } catch (e) {
              Promise.reject(e);
            }
          } else if (action?.type === "error") {
            try {
              this.#mutateOptions.onError?.(action.error, variables, onMutateResult, context);
            } catch (e) {
              Promise.reject(e);
            }
            try {
              this.#mutateOptions.onSettled?.(undefined, action.error, variables, onMutateResult, context);
            } catch (e) {
              Promise.reject(e);
            }
          }
        }
        this.listeners.forEach((listener) => {
          listener(this.#currentResult);
        });
      });
    }
  };
  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/queryCache.js
  var QueryCache = class extends Subscribable {
    #queries;
    constructor(config = {}) {
      super();
      this.config = config;
      this.#queries = /* @__PURE__ */ new Map;
    }
    build(client, options, state) {
      const queryKey = options.queryKey;
      const queryHash = options.queryHash ?? hashQueryKeyByOptions(queryKey, options);
      let query = this.get(queryHash);
      if (!query) {
        query = new Query({
          client,
          queryKey,
          queryHash,
          options: client.defaultQueryOptions(options),
          state,
          defaultOptions: client.getQueryDefaults(queryKey)
        });
        this.add(query);
      }
      return query;
    }
    add(query) {
      if (!this.#queries.has(query.queryHash)) {
        this.#queries.set(query.queryHash, query);
        this.notify({
          type: "added",
          query
        });
      }
    }
    remove(query) {
      const queryInMap = this.#queries.get(query.queryHash);
      if (queryInMap) {
        query.destroy();
        if (queryInMap === query)
          this.#queries.delete(query.queryHash);
        this.notify({
          type: "removed",
          query
        });
      }
    }
    clear() {
      notifyManager.batch(() => {
        this.getAll().forEach((query) => {
          this.remove(query);
        });
      });
    }
    get(queryHash) {
      return this.#queries.get(queryHash);
    }
    getAll() {
      return [...this.#queries.values()];
    }
    find(filters) {
      const defaultedFilters = {
        exact: true,
        ...filters
      };
      return this.getAll().find((query) => matchQuery(defaultedFilters, query));
    }
    findAll(filters = {}) {
      const queries = this.getAll();
      return Object.keys(filters).length > 0 ? queries.filter((query) => matchQuery(filters, query)) : queries;
    }
    notify(event) {
      notifyManager.batch(() => {
        this.listeners.forEach((listener) => {
          listener(event);
        });
      });
    }
    onFocus() {
      notifyManager.batch(() => {
        this.getAll().forEach((query) => {
          query.onFocus();
        });
      });
    }
    onOnline() {
      notifyManager.batch(() => {
        this.getAll().forEach((query) => {
          query.onOnline();
        });
      });
    }
  };

  // node_modules/.pnpm/@tanstack+query-core@5.102.8/node_modules/@tanstack/query-core/build/modern/queryClient.js
  var QueryClient = class {
    #queryCache;
    #mutationCache;
    #defaultOptions;
    #queryDefaults;
    #mutationDefaults;
    #mountCount;
    #unsubscribeFocus;
    #unsubscribeOnline;
    constructor(config = {}) {
      this.#queryCache = config.queryCache || new QueryCache;
      this.#mutationCache = config.mutationCache || new MutationCache;
      this.#defaultOptions = config.defaultOptions || {};
      this.#queryDefaults = /* @__PURE__ */ new Map;
      this.#mutationDefaults = /* @__PURE__ */ new Map;
      this.#mountCount = 0;
    }
    mount() {
      this.#mountCount++;
      if (this.#mountCount !== 1)
        return;
      this.#unsubscribeFocus = focusManager.subscribe(async (focused) => {
        if (focused) {
          await this.resumePausedMutations();
          this.#queryCache.onFocus();
        }
      });
      this.#unsubscribeOnline = onlineManager.subscribe(async (online) => {
        if (online) {
          await this.resumePausedMutations();
          this.#queryCache.onOnline();
        }
      });
    }
    unmount() {
      this.#mountCount--;
      if (this.#mountCount !== 0)
        return;
      this.#unsubscribeFocus?.();
      this.#unsubscribeFocus = undefined;
      this.#unsubscribeOnline?.();
      this.#unsubscribeOnline = undefined;
    }
    isFetching(filters) {
      return this.#queryCache.findAll({
        ...filters,
        fetchStatus: "fetching"
      }).length;
    }
    isMutating(filters) {
      return this.#mutationCache.findAll({
        ...filters,
        status: "pending"
      }).length;
    }
    getQueryData(queryKey) {
      const options = this.defaultQueryOptions({ queryKey });
      return this.#queryCache.get(options.queryHash)?.state.data;
    }
    ensureQueryData(options) {
      const defaultedOptions = this.defaultQueryOptions(options);
      const query = this.#queryCache.build(this, defaultedOptions);
      const cachedData = query.state.data;
      if (cachedData === undefined)
        return this.fetchQuery(options);
      if (options.revalidateIfStale && query.isStaleByTime(resolveQueryValue(defaultedOptions.staleTime, query)))
        this.prefetchQuery(defaultedOptions);
      return Promise.resolve(cachedData);
    }
    getQueriesData(filters) {
      return this.#queryCache.findAll(filters).map(({ queryKey, state }) => {
        return [queryKey, state.data];
      });
    }
    setQueryData(queryKey, updater, options) {
      const defaultedOptions = this.defaultQueryOptions({ queryKey });
      const prevData = this.#queryCache.get(defaultedOptions.queryHash)?.state.data;
      const data = functionalUpdate(updater, prevData);
      if (data === undefined)
        return;
      return this.#queryCache.build(this, defaultedOptions).setData(data, {
        ...options,
        manual: true
      });
    }
    setQueriesData(filters, updater, options) {
      return notifyManager.batch(() => this.#queryCache.findAll(filters).map(({ queryKey }) => [queryKey, this.setQueryData(queryKey, updater, options)]));
    }
    getQueryState(queryKey) {
      const options = this.defaultQueryOptions({ queryKey });
      return this.#queryCache.get(options.queryHash)?.state;
    }
    removeQueries(filters) {
      const queryCache = this.#queryCache;
      notifyManager.batch(() => {
        queryCache.findAll(filters).forEach((query) => {
          queryCache.remove(query);
        });
      });
    }
    resetQueries(filters, options) {
      const queryCache = this.#queryCache;
      return notifyManager.batch(() => {
        const matched = queryCache.findAll(filters);
        const queriesToRefetch = new Set(matched);
        matched.forEach((query) => {
          query.reset();
        });
        return this.refetchQueries({
          type: "active",
          predicate: (query) => queriesToRefetch.has(query)
        }, options);
      });
    }
    cancelQueries(filters, cancelOptions = {}) {
      const defaultedCancelOptions = {
        revert: true,
        ...cancelOptions
      };
      const promises = notifyManager.batch(() => this.#queryCache.findAll(filters).map((query) => query.cancel(defaultedCancelOptions)));
      return Promise.all(promises).then(noop).catch(noop);
    }
    invalidateQueries(filters, options = {}) {
      return notifyManager.batch(() => {
        this.#queryCache.findAll(filters).forEach((query) => {
          query.invalidate();
        });
        if (filters?.refetchType === "none")
          return Promise.resolve();
        return this.refetchQueries({
          ...filters,
          type: filters?.refetchType ?? filters?.type ?? "active"
        }, options);
      });
    }
    refetchQueries(filters, options = {}) {
      const fetchOptions = {
        ...options,
        cancelRefetch: options.cancelRefetch ?? true
      };
      const promises = notifyManager.batch(() => this.#queryCache.findAll(filters).filter((query) => !query.isDisabled() && !query.isStatic()).map((query) => {
        let promise = query.fetch(undefined, fetchOptions);
        if (!fetchOptions.throwOnError)
          promise = promise.catch(noop);
        return query.state.fetchStatus === "paused" ? Promise.resolve() : promise;
      }));
      return Promise.all(promises).then(noop);
    }
    async query(options) {
      const defaultedOptions = this.defaultQueryOptions(options);
      if (defaultedOptions.retry === undefined)
        defaultedOptions.retry = false;
      const query = this.#queryCache.build(this, defaultedOptions);
      const queryData = query.isStaleByTime(resolveQueryValue(defaultedOptions.staleTime, query)) ? await query.fetch(defaultedOptions) : query.state.data;
      const select = defaultedOptions.select;
      if (select)
        return select(queryData);
      return queryData;
    }
    fetchQuery(options) {
      const defaultedOptions = this.defaultQueryOptions(options);
      if (defaultedOptions.retry === undefined)
        defaultedOptions.retry = false;
      const query = this.#queryCache.build(this, defaultedOptions);
      return query.isStaleByTime(resolveQueryValue(defaultedOptions.staleTime, query)) ? query.fetch(defaultedOptions) : Promise.resolve(query.state.data);
    }
    prefetchQuery(options) {
      return this.fetchQuery(options).then(noop).catch(noop);
    }
    infiniteQuery(options) {
      options._type = "infinite";
      return this.query(options);
    }
    fetchInfiniteQuery(options) {
      options._type = "infinite";
      return this.fetchQuery(options);
    }
    prefetchInfiniteQuery(options) {
      return this.fetchInfiniteQuery(options).then(noop).catch(noop);
    }
    ensureInfiniteQueryData(options) {
      options._type = "infinite";
      return this.ensureQueryData(options);
    }
    resumePausedMutations() {
      if (onlineManager.isOnline())
        return this.#mutationCache.resumePausedMutations();
      return Promise.resolve();
    }
    getQueryCache() {
      return this.#queryCache;
    }
    getMutationCache() {
      return this.#mutationCache;
    }
    getDefaultOptions() {
      return this.#defaultOptions;
    }
    setDefaultOptions(options) {
      this.#defaultOptions = options;
    }
    setQueryDefaults(queryKey, options) {
      this.#queryDefaults.set(hashKey(queryKey), {
        queryKey,
        defaultOptions: options
      });
    }
    getQueryDefaults(queryKey) {
      const defaults = [...this.#queryDefaults.values()];
      const result = {};
      defaults.forEach((queryDefault) => {
        if (partialMatchKey(queryKey, queryDefault.queryKey))
          Object.assign(result, queryDefault.defaultOptions);
      });
      return result;
    }
    setMutationDefaults(mutationKey, options) {
      this.#mutationDefaults.set(hashKey(mutationKey), {
        mutationKey,
        defaultOptions: options
      });
    }
    getMutationDefaults(mutationKey) {
      const defaults = [...this.#mutationDefaults.values()];
      const result = {};
      defaults.forEach((queryDefault) => {
        if (partialMatchKey(mutationKey, queryDefault.mutationKey))
          Object.assign(result, queryDefault.defaultOptions);
      });
      return result;
    }
    defaultQueryOptions(options) {
      if (options._defaulted)
        return options;
      const defaultedOptions = {
        ...this.#defaultOptions.queries,
        ...this.getQueryDefaults(options.queryKey),
        ...options,
        _defaulted: true
      };
      if (!defaultedOptions.queryHash)
        defaultedOptions.queryHash = hashQueryKeyByOptions(defaultedOptions.queryKey, defaultedOptions);
      if (defaultedOptions.refetchOnReconnect === undefined)
        defaultedOptions.refetchOnReconnect = defaultedOptions.networkMode !== "always";
      if (defaultedOptions.throwOnError === undefined)
        defaultedOptions.throwOnError = !!defaultedOptions.suspense;
      if (!defaultedOptions.networkMode && defaultedOptions.persister)
        defaultedOptions.networkMode = "offlineFirst";
      if (defaultedOptions.queryFn === skipToken)
        defaultedOptions.enabled = false;
      return defaultedOptions;
    }
    defaultMutationOptions(options) {
      if (options?._defaulted)
        return options;
      return {
        ...this.#defaultOptions.mutations,
        ...options?.mutationKey && this.getMutationDefaults(options.mutationKey),
        ...options,
        _defaulted: true
      };
    }
    clear() {
      this.#queryCache.clear();
      this.#mutationCache.clear();
    }
  };
  // public/javascript/vendor/_entry.js
  window.ALQuery = { QueryClient, QueryCache, QueryObserver, MutationCache, MutationObserver };
})();
