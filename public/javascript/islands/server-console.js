/**
 * server-console — xterm + WebSocket + Chart.js island
 *
 * Mount: ServerConsole.mount(root, config)
 * Destroy: calls teardown, removes all listeners, closes sockets.
 *
 * config = {
 *   serverUUID, serverName, serverSuspended,
 *   serverMemory, serverCpu, serverStorage,
 *   wsTokenUrl, logsHistoryUrl, powerBaseUrl,
 *   translations: { typeACommand, confirmRestartServer, ... },
 *   features: ['auto-complete'],
 * }
 */
let Terminal, FitAddon, WebLinksAddon, Chart;
async function loadDeps() {
  if (Terminal) return;
  await import("/vendor/@xterm/xterm/lib/xterm.js");
  Terminal = self.Terminal;
  await import("/vendor/@xterm/addon-fit/lib/addon-fit.js");
  FitAddon = self.FitAddon;
  await import("/vendor/@xterm/addon-web-links/lib/addon-web-links.js");
  WebLinksAddon = self.WebLinksAddon;
  await import("/vendor/chart.js/dist/chart.js");
  Chart = self.Chart || self.chart;
  if (!Terminal || !FitAddon || !WebLinksAddon || !Chart) {
    throw new Error("Required console libraries did not load.");
  }
}

function themeVar(name, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-" + name)
    .trim();
  return v || fallback;
}

function themeColor(name, alpha = 1) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-" + name)
    .trim();
  const m = raw.match(/^#([0-9a-f]{6})$/i) || raw.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const h =
      m[1].length === 3
        ? m[1]
            .split("")
            .map((c) => c + c)
            .join("")
        : m[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
  }
  return raw
    ? `color-mix(in srgb, ${raw} ${Math.round(alpha * 100)}%, transparent)`
    : "transparent";
}

const darkTermPalette = {
  black: "#1E1E1D",
  brightBlack: "#262625",
  red: "#E54B4B",
  green: "#9ECE58",
  yellow: "#FAED70",
  blue: "#396FE2",
  magenta: "#BB80B3",
  cyan: "#2DDAFD",
  white: "#d0d0d0",
  brightRed: "#FF5370",
  brightGreen: "#C3E88D",
  brightYellow: "#FFCB6B",
  brightBlue: "#82AAFF",
  brightMagenta: "#C792EA",
  brightCyan: "#89DDFF",
  brightWhite: "#ffffff",
};
const lightTermPalette = {
  black: "#1E1E1D",
  brightBlack: "#4D4D4C",
  red: "#C42B2B",
  green: "#4B8B3C",
  yellow: "#9A7B0B",
  blue: "#2B5FD9",
  magenta: "#A34FA3",
  cyan: "#0E7F8F",
  white: "#383838",
  brightRed: "#B71C1C",
  brightGreen: "#3D7A2E",
  brightYellow: "#7A5E00",
  brightBlue: "#1E4BB8",
  brightMagenta: "#8B2F8B",
  brightCyan: "#096A78",
  brightWhite: "#000000",
};

const ANSI_RE =
  /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_]|[\u0080-\u009F])/g;
const PROMPT_RE = /(?:[a-zA-Z0-9_-]+)@[^\s:#\])\r\n]+(?:[^$#\r\n]*?)[$#]\s*/g;

function maskPrompts(raw) {
  const plain = raw.replace(ANSI_RE, "");
  if (!PROMPT_RE.test(plain)) {
    PROMPT_RE.lastIndex = 0;
    return raw;
  }
  PROMPT_RE.lastIndex = 0;
  const stripped = plain.replace(/[\r\n]/g, "").trim();
  const isOnlyPrompt =
    PROMPT_RE.test(stripped) && stripped.replace(PROMPT_RE, "").trim() === "";
  PROMPT_RE.lastIndex = 0;
  if (isOnlyPrompt) return "\r\nairlinkd~ ";
  return plain.replace(PROMPT_RE, "airlinkd~ ");
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024,
    dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatRam(bytes, decimals = 1) {
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return mb.toFixed(decimals) + " MB";
  return (mb / 1024).toFixed(decimals) + " GB";
}

export async function mount(root, config) {
  await loadDeps();

  if (!root || !root.querySelector("#terminal")) {
    throw new Error("Server console root is incomplete.");
  }

  const termTheme = {
    foreground: "#c5c9d1",
    background: "#141414",
    selectionBackground: "#5DA5D580",
    cursor: "#c5c9d1",
    cursorAccent: "#141414",
  };
  function applyTermTheme() {
    const isDark = document.documentElement.classList.contains("dark");
    termTheme.background = themeVar("bg", "#141414");
    termTheme.foreground = themeVar("text", "#c5c9d1");
    termTheme.cursor = termTheme.foreground;
    termTheme.cursorAccent = termTheme.background;
    Object.assign(termTheme, isDark ? darkTermPalette : lightTermPalette);
  }
  applyTermTheme();

  let serverOnline = config.initialStatus?.online ?? false;
  let lifecycleActive = false;
  let deliberateStop = false;
  let serverStopped = false;
  let logsAutoLoaded = false;
  let installLogsLoaded = false;
  let historyLoaded = false;
  let consoleOwner = false;
  let pageHidden = document.visibilityState === "hidden";

  const termEl = root.querySelector("#terminal");
  const term = new Terminal({
    disableStdin: true,
    lineHeight: 1.35,
    fontFamily: "Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    theme: termTheme,
    scrollback: 1000,
    convertEol: true,
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(termEl);
  fitAddon.fit();

  const mobileTermEl = root.querySelector("#mobile-terminal");
  let mobileTerm = null;
  if (mobileTermEl) {
    mobileTerm = new Terminal({
      disableStdin: true,
      lineHeight: 1.3,
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: 11,
      theme: termTheme,
      scrollback: 1000,
      convertEol: true,
    });
    const mobileFit = new FitAddon.FitAddon();
    mobileTerm.loadAddon(mobileFit);
    mobileTerm.loadAddon(new WebLinksAddon.WebLinksAddon());
    mobileTerm.open(mobileTermEl);
    if (document.fonts?.ready)
      document.fonts.ready.then(() =>
        requestAnimationFrame(() => mobileFit.fit()),
      );
    else setTimeout(() => mobileFit.fit(), 100);
  }

  function setTerminalTheme() {
    applyTermTheme();
    term.options.theme = { ...termTheme };
    term.refresh(0, term.rows - 1);
    if (mobileTerm) {
      mobileTerm.options.theme = { ...termTheme };
      mobileTerm.refresh(0, mobileTerm.rows - 1);
    }
  }
  // theme-init.js owns this public hook. Keep the legacy alias while older
  // server templates are still being migrated.
  window.setTerminalTheme = setTerminalTheme;
  window._manageTermTheme = setTerminalTheme;

  const controllers = new Set();
  let recentLogsCtrl = null;
  let socket = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let wsErrorCount = 0;
  let connectionErrorFired = false;
  const maxReconnect = 10;

  const maxCommands = 10;
  let commandHistory = [];
  let currentCommandIndex = -1;

  // Charts
  function getChartColors() {
    return { border: themeColor("border"), fill: themeColor("border", 0.35) };
  }
  function createBgChart(canvasId, type = "line") {
    const colors = getChartColors();
    return new Chart(root.querySelector("#" + canvasId).getContext("2d"), {
      type,
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: colors.border,
            backgroundColor: colors.fill,
            borderWidth: 1,
            pointRadius: 0,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 0 },
      },
    });
  }
  const statusChart = createBgChart("statusChart");
  const ramChart = createBgChart("ramChart");
  const cpuChart = createBgChart("cpuChart");
  const diskChart = createBgChart("diskChart", "doughnut");
  diskChart.update();

  let chartUpdatePending = null;
  const chartsPending = new Set();
  function scheduleChartUpdate(chart) {
    chartsPending.add(chart);
    if (chartUpdatePending) return;
    chartUpdatePending = requestAnimationFrame(() => {
      chartUpdatePending = null;
      Array.from(chartsPending).forEach((c) => c.update());
      chartsPending.clear();
    });
  }
  function updateChart(chart, value) {
    chart.data.labels.push("");
    chart.data.datasets[0].data.push(value);
    if (chart.data.labels.length > 20) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    const colors = getChartColors();
    chart.data.datasets[0].borderColor = colors.border;
    chart.data.datasets[0].backgroundColor = colors.fill;
    scheduleChartUpdate(chart);
  }
  function updateStatusChart(token, bgAlpha = 0.1, borderAlpha = 0.3) {
    statusChart.data.datasets[0].backgroundColor = themeColor(token, bgAlpha);
    statusChart.data.datasets[0].borderColor = themeColor(token, borderAlpha);
    statusChart.data.labels = [""];
    statusChart.data.datasets[0].data = [100];
    statusChart.update();
  }
  function resetCharts() {
    ramChart.data.labels = [];
    ramChart.data.datasets[0].data = [];
    ramChart.update();
    cpuChart.data.labels = [];
    cpuChart.data.datasets[0].data = [];
    cpuChart.update();
  }

  // Status helpers
  const statusColors = {
    pulling: { cls: "var(--theme-info)" },
    creating: { cls: "var(--theme-info)" },
    starting: { cls: "var(--theme-warning)" },
    started: { cls: "var(--theme-warning)" },
    stopping: { cls: "var(--theme-warning)" },
    stopped: { cls: "var(--theme-danger)" },
    killed: { cls: "var(--theme-danger)" },
    error: { cls: "var(--theme-danger)" },
  };
  const statusCardLabels = {
    pulling: "Pulling image",
    creating: "Creating container",
    starting: "Starting container",
    started: "Starting server",
    stopping: "Stopping server",
    stopped: "Server stopped",
    killed: "Server stopped",
    error: "Error",
  };
  let statusMsgFadeTimer = null;

  function setStatusText(text, colorVar) {
    const el = root.querySelector("#status");
    if (!el) return;
    el.textContent = text;
    el.className = "mt-1 text-lg font-medium tracking-tight leading-snug";
    el.style.color = colorVar;
    const mob = root.querySelector("#mobile-status");
    if (mob) {
      mob.textContent = text;
      mob.className = "mt-0.5 text-base font-semibold leading-tight";
      mob.style.color = colorVar;
    }
  }
  function setStatusLog(msg, eventType) {
    const msgEl = root.querySelector("#status-msg");
    if (!msgEl) return;
    if (statusMsgFadeTimer) {
      clearTimeout(statusMsgFadeTimer);
      statusMsgFadeTimer = null;
    }
    if (msg === null) {
      msgEl.classList.add("opacity-0", "translate-y-1");
      statusMsgFadeTimer = setTimeout(() => {
        msgEl.textContent = "";
        msgEl.className =
          "text-xs font-medium mt-0.5 leading-snug transition-all duration-300 opacity-0 translate-y-1 pointer-events-none";
        lifecycleActive = false;
        statusMsgFadeTimer = null;
      }, 300);
    } else {
      lifecycleActive = true;
      const label = statusCardLabels[eventType] || msg;
      const color = (
        statusColors[eventType] || { cls: "var(--theme-text-muted)" }
      ).cls;
      msgEl.classList.add("opacity-0", "translate-y-1");
      statusMsgFadeTimer = setTimeout(() => {
        msgEl.textContent = label;
        msgEl.className = `text-xs font-medium mt-0.5 leading-snug transition-all duration-300 ${color}`;
        void msgEl.offsetHeight;
        msgEl.classList.remove("opacity-0", "translate-y-1");
        statusMsgFadeTimer = null;
      }, 150);
      const mobLog = root.querySelector("#mobile-status-log-text");
      if (mobLog) {
        mobLog.textContent = label;
        mobLog.className = "text-[10px] font-medium truncate";
        mobLog.style.color = color;
        mobLog.classList.remove("hidden");
      }
    }
  }
  function showQueueStatus(pos, total, avail) {
    const box = root.querySelector("#queue-status"),
      posEl = root.querySelector("#queue-position"),
      availEl = root.querySelector("#queue-available");
    if (!box || !posEl || !availEl) return;
    posEl.textContent = `Queued — position ${pos || "?"} of ${total || "?"}`;
    if (avail) {
      const p = [];
      if (avail.memoryMb > 0) p.push(`${Math.round(avail.memoryMb)} MB RAM`);
      if (avail.cpuPercent > 0) p.push(`${Math.round(avail.cpuPercent)}% CPU`);
      if (avail.diskMb > 0) p.push(`${Math.round(avail.diskMb)} MB disk`);
      availEl.textContent = p.length ? "Available: " + p.join(" · ") : "";
    } else availEl.textContent = "";
    box.classList.remove("hidden");
  }
  function hideQueueStatus() {
    const box = root.querySelector("#queue-status");
    if (box) box.classList.add("hidden");
  }

  function updateLoadLogsButton() {
    const b = root.querySelector("#loadHistoryBtn");
    if (!b) return;
    b.disabled = serverOnline;
    b.style.opacity = serverOnline ? "0.45" : "";
    b.style.pointerEvents = serverOnline ? "none" : "";
    b.title = serverOnline
      ? "Live console active — logs are streamed in real time"
      : "Load recent console output from disk";
  }
  updateLoadLogsButton();

  function writeConsole(prefix, type, message) {
    const ansi = {
      system: "\x1b[33m",
      error: "\x1b[31m",
      info: "\x1b[34m",
      success: "\x1b[32m",
      normal: "\x1b[0m",
    };
    const color = ansi[type.toLowerCase()] || "\x1b[0m";
    const pfx = prefix && type !== "normal" ? `[${prefix}] ` : "";
    term.write(`${color}${pfx}\x1b[37m${message}\x1b[0m\r\n`);
    if (mobileTerm)
      mobileTerm.write(`${color}${pfx}\x1b[37m${message}\x1b[0m\r\n`);
  }

  async function loadRecentLogs(showMarkers) {
    const ctrl = new AbortController();
    if (recentLogsCtrl) recentLogsCtrl.abort();
    recentLogsCtrl = ctrl;
    controllers.add(ctrl);
    try {
      const r = await fetch(config.logsHistoryUrl, {
        credentials: "same-origin",
        signal: ctrl.signal,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load logs");
      const lines = d.logs || [];
      if (lines.length === 0) return;
      if (showMarkers) {
        term.writeln("");
        term.writeln(`\x1b[90m— ${lines.length} lines from disk —\x1b[0m`);
      }
      lines.forEach((l) => term.writeln(maskPrompts(String(l))));
      if (showMarkers) term.writeln("\x1b[90m— end of saved log —\x1b[0m");
      term.scrollToBottom();
    } catch (err) {
      if (err?.name === "AbortError") return;
      term.writeln(
        "\x1b[31mFailed to load log history: " +
          (err.message || err) +
          "\x1b[0m",
      );
    } finally {
      controllers.delete(ctrl);
      if (recentLogsCtrl === ctrl) recentLogsCtrl = null;
    }
  }

  const _wsTokenCache = { serverId: null, promise: null, fetchedAt: 0 };
  function getWsConnectToken(serverId) {
    const fresh =
      Date.now() - _wsTokenCache.fetchedAt < 45000 &&
      _wsTokenCache.serverId === serverId;
    if (!fresh) {
      _wsTokenCache.serverId = serverId;
      _wsTokenCache.promise = fetch(config.wsTokenUrl, {
        credentials: "same-origin",
      })
        .then((r) => {
          if (!r.ok) throw new Error("ws-token");
          return r.json();
        })
        .then((d) => d.token);
      _wsTokenCache.fetchedAt = Date.now();
    }
    return _wsTokenCache.promise;
  }

  function isDaemonInfraError(text) {
    return (
      text.includes("Failed to attach to container") ||
      text.includes("no such container") ||
      text.includes("No such container") ||
      text.includes("container not available") ||
      text.includes("Attach failed") ||
      text.includes("HTTP code 404") ||
      text.includes("HTTP code 500")
    );
  }

  function handleWSMessage(msg) {
    const process = (text) => {
      if (isDaemonInfraError(text)) return;
      if (text.includes("airlinkd server appears to be down")) {
        socket.close();
        wsErrorCount = 3;
        setDaemonOfflineBanner(true);
        return;
      }
      if (text.includes("Working on")) {
        term.clear();
        socket.close();
        return;
      }
      try {
        const p = JSON.parse(text);
        if (p?.event === "error") {
          writeConsole("system", "error", p.data?.message || text);
          return;
        }
      } catch {}
      term.write(maskPrompts(text));
      if (mobileTerm) mobileTerm.write(maskPrompts(text));
    };
    if (msg.data instanceof Blob) {
      msg.data
        .arrayBuffer()
        .then((buf) => process(new TextDecoder().decode(buf)));
    } else process(typeof msg.data === "string" ? msg.data : String(msg.data));
  }

  function setDaemonOfflineBanner(offline) {
    const row = root.querySelector("#daemonOfflineWarningRow"),
      mob = root.querySelector("#mobileDaemonOfflineWarning");
    if (row) row.classList.toggle("hidden", !offline);
    if (mob) mob.classList.toggle("hidden", !offline);
    if (offline) {
      lockInput("Console paused — daemon offline");
      writeConsole("system", "error", "Console paused — daemon offline");
    } else unlockInput();
  }

  function lockInput(reason) {
    const inp = root.querySelector("#input");
    if (inp) {
      inp.disabled = true;
      inp.placeholder = reason || "Waiting for container...";
    }
  }
  function unlockInput() {
    const inp = root.querySelector("#input");
    if (inp) {
      inp.disabled = !consoleOwner;
      inp.placeholder = config.translations.typeACommand || "Type a command...";
    }
  }

  function openConsoleSocket() {
    getWsConnectToken(config.serverUUID)
      .then((token) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(
          `${protocol}//${location.host}/console/${config.serverUUID}?token=${encodeURIComponent(token)}`,
        );
        socket.onopen = () => {
          reconnectAttempts = 0;
          wsErrorCount = 0;
          connectionErrorFired = false;
          setDaemonOfflineBanner(false);
          if (!historyLoaded) {
            historyLoaded = true;
            fetch(config.logsHistoryUrl, { credentials: "same-origin" })
              .then((r) => (r.ok ? r.json() : Promise.reject()))
              .then((d) => {
                (d.logs || []).forEach((l) =>
                  term.write(maskPrompts(String(l)) + "\r\n"),
                );
              })
              .catch(() => {});
          }
        };
        socket.onmessage = handleWSMessage;
        socket.onerror = () => {
          if (connectionErrorFired) return;
          connectionErrorFired = true;
          wsErrorCount++;
          if (wsErrorCount >= 3) setDaemonOfflineBanner(true);
        };
        socket.onclose = () => {
          socket = null;
          if (!serverStopped && reconnectAttempts < maxReconnect) {
            reconnectAttempts++;
            reconnectTimer = setTimeout(
              () => {
                if (!pageHidden) openConsoleSocket();
              },
              Math.min(30000, 2000 * Math.pow(1.5, reconnectAttempts - 1)),
            );
          }
        };
      })
      .catch(() => {
        socket = null;
      });
  }

  function connectWebSocket() {
    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN)
    )
      return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try {
        socket.close();
      } catch {}
      socket = null;
    }
    openConsoleSocket();
  }

  function sendCommand() {
    if (!consoleOwner) return;
    const inp = root.querySelector("#input");
    const cmd = inp.value.trim();
    if (cmd && socket) {
      term.write("\u001b[1m\u001b[33m~ \u001b[0m" + cmd + "\r\n");
      socket.send(JSON.stringify({ event: "CMD", command: cmd }));
      if (commandHistory.length === maxCommands) commandHistory.shift();
      commandHistory.push(cmd);
      currentCommandIndex = commandHistory.length;
    }
    inp.value = "";
  }

  function handleKeyUp(event) {
    const inp = root.querySelector("#input");
    if (event.key === "ArrowUp") {
      if (currentCommandIndex > 0) {
        currentCommandIndex--;
        inp.value = commandHistory[currentCommandIndex];
      }
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      if (currentCommandIndex < commandHistory.length - 1) {
        currentCommandIndex++;
        inp.value = commandHistory[currentCommandIndex];
      } else {
        currentCommandIndex = commandHistory.length;
        inp.value = "";
      }
      event.preventDefault();
    }
  }

  // Console ownership (two-tab guard)
  if (navigator.locks?.request) {
    navigator.locks.request(`al-console-input:${config.serverUUID}`, () => {
      consoleOwner = true;
      updateConsoleOwnerUI();
      return new Promise(() => {});
    });
  } else {
    consoleOwner = true;
    updateConsoleOwnerUI();
  }
  function updateConsoleOwnerUI() {
    const notices = [
      root.querySelector("#consoleReadOnlyNotice"),
      root.querySelector("#consoleReadOnlyNoticeMobile"),
    ];
    notices.forEach((n) => {
      if (n) n.classList.toggle("hidden", consoleOwner);
    });
    const inp = root.querySelector("#input"),
      minp = root.querySelector("#mobile-input");
    if (inp) inp.disabled = !consoleOwner;
    if (minp) minp.disabled = !consoleOwner;
  }

  // Power actions
  let powerBtn = null,
    powerKind = null,
    powerTimer = null,
    powerToast = null;
  function forceReleasePower() {
    if (!powerBtn) return;
    const btn = powerBtn;
    powerBtn = null;
    powerKind = null;
    powerToast = null;
    if (powerTimer) {
      clearTimeout(powerTimer);
      powerTimer = null;
    }
    btn.disabled = false;
    btn.textContent = btn.dataset.origLabel || btn.textContent;
    setStatusLog(null);
  }
  function beginPower(btn, kind, toastMsg) {
    forceReleasePower();
    powerBtn = btn;
    powerKind = kind;
    powerToast = toastMsg || null;
    btn.dataset.origLabel = btn.textContent;
    btn.textContent =
      kind === "start"
        ? "Starting…"
        : kind === "restart"
          ? "Restarting…"
          : "Stopping…";
    btn.disabled = true;
    powerTimer = setTimeout(forceReleasePower, 90000);
  }
  function finishPower(ok, message) {
    if (!powerBtn) return;
    const btn = powerBtn,
      toast = powerToast;
    powerBtn = null;
    powerKind = null;
    powerToast = null;
    if (powerTimer) {
      clearTimeout(powerTimer);
      powerTimer = null;
    }
    btn.disabled = false;
    btn.textContent = btn.dataset.origLabel || btn.textContent;
    delete btn.dataset.origLabel;
    setStatusLog(null);
    hideQueueStatus();
    window.showToast?.(
      ok === false
        ? message || "That operation failed."
        : message || toast || "Done.",
      ok === false ? "error" : "success",
    );
  }

  function updateStatus(data) {
    if (!data || !data.data) return;
    serverOnline = true;
    updateLoadLogsButton();
    setStatusText("Online", "var(--theme-success)");
    updateStatusChart("success", 0.1, 0.2);
  }

  function surfaceStoppedState(data) {
    if (deliberateStop) {
      deliberateStop = false;
      return;
    }
    let reason = null;
    if (data?.exitCode === 137)
      reason = "Server crashed (exit 137 — likely out of memory)";
    else if (typeof data?.exitCode === "number")
      reason = "Server crashed (exit " + data.exitCode + ")";
    if (reason) {
      setStatusText(reason, "var(--theme-danger)");
      updateStatusChart("danger", 0.1, 0.2);
      writeConsole("daemon", "error", reason);
      window.showToast?.(reason, "error");
    }
  }

  function setAllStatsOffline() {
    serverOnline = false;
    updateLoadLogsButton();
    root.querySelector("#ramUsage").textContent =
      `0% (0 MB / ${formatRam(config.serverMemory * 1024 * 1024)})`;
    const cores = Math.max(1, Math.round(config.serverCpu / 100));
    root.querySelector("#cpuUsage").textContent =
      `0% of ${cores} core${cores === 1 ? "" : "s"}`;
    const diskMB = config.serverStorage;
    root.querySelector("#diskUsage").textContent =
      diskMB > 0
        ? `0% (0 Bytes / ${formatBytes(diskMB * 1024 * 1024)})`
        : "0 bytes used (unlimited disk)";
    resetCharts();
    if (lifecycleActive) return;
    setStatusText("Offline", "var(--theme-danger)");
    updateStatusChart("danger", 0.1, 0.2);
  }

  function updateRamUsage(stats) {
    const usage = stats?.data?.memory?.usage || 0;
    const limit =
      stats?.data?.memory?.limit || config.serverMemory * 1024 * 1024;
    let pct = Number(stats?.data?.memory?.percentage) || 0;
    if (isNaN(pct)) pct = 0;
    pct = Math.round(pct);
    root.querySelector("#ramUsage").textContent =
      `${pct}% (${formatRam(usage)} / ${formatRam(limit)})`;
    if (usage > 0) updateChart(ramChart, pct);
    const mob = root.querySelector("#mobile-ramUsage");
    if (mob) mob.textContent = `${pct}%`;
    if (pct > 0 && mobileTerm) {
      const mc =
        root.querySelector(
          "#mobileRamChart",
        ); /* mobile chart update handled below */
    }
  }
  function updateCpuUsage(stats) {
    let pct = Number(stats?.data?.cpu?.percentage) || 0;
    if (isNaN(pct)) pct = 0;
    const allocPct = config.serverCpu || 100;
    const cores = Math.max(1, Math.round(allocPct / 100));
    const ofAlloc =
      allocPct > 0 ? Math.round(Math.min(100, (pct / allocPct) * 100)) : 0;
    root.querySelector("#cpuUsage").textContent =
      `${ofAlloc}% of ${cores} core${cores === 1 ? "" : "s"}`;
    if (ofAlloc > 0) updateChart(cpuChart, ofAlloc);
    const mob = root.querySelector("#mobile-cpuUsage");
    if (mob) mob.textContent = `${ofAlloc}%`;
  }
  function updateDiskUsage(stats) {
    const diskMB = config.serverStorage;
    const usage = parseFloat(stats?.data?.storage?.usage) || 0;
    const el = root.querySelector("#diskUsage");
    if (!el) return;
    if (diskMB <= 0) {
      el.textContent = `${formatBytes(usage * 1024 * 1024)} used (unlimited disk)`;
      return;
    }
    const pct = Math.round((usage / diskMB) * 100);
    el.textContent = `${pct}% (${formatBytes(usage * 1024 * 1024)} / ${formatBytes(diskMB * 1024 * 1024)})`;
    const mob = root.querySelector("#mobile-diskUsage");
    if (mob) mob.textContent = `${pct}%`;
  }

  // Lifecycle handling
  const lifecycleLocks = { pulling: 1, creating: 1, starting: 1 };
  function handleLifecycle(data) {
    if (!data || typeof data.type !== "string") return;
    const { type, message } = data;
    setStatusLog(message, type);
    writeConsole("daemon", "info", message);
    if (lifecycleLocks[type]) {
      hideQueueStatus();
      lockInput("Waiting...");
    }
    if (type === "started") {
      serverOnline = true;
      updateLoadLogsButton();
      unlockInput();
      setStatusLog(null);
      term.scrollToBottom();
      if (!logsAutoLoaded) {
        logsAutoLoaded = true;
        loadRecentLogs(false);
      }
      if (!socket || socket.readyState !== 1) connectWebSocket();
      finishPower(true);
    } else if (type === "stopped" || type === "killed") {
      serverOnline = false;
      updateLoadLogsButton();
      deliberateStop = true;
      serverStopped = true;
      setStatusLog(null);
      loadRecentLogs(false);
      if (powerKind === "stop") finishPower(true);
    } else if (type === "installing") {
      if (!installLogsLoaded) {
        installLogsLoaded = true;
        loadRecentLogs(false);
      }
    } else if (type === "error") {
      serverOnline = false;
      updateLoadLogsButton();
      unlockInput();
      setStatusLog(null);
      finishPower(
        false,
        message ||
          "Something went wrong while the server was handling your request.",
      );
    }
  }

  // Realtime
  const rt = window.alRealtime,
    st = window.alState;
  function resubscribeRealtime() {
    if (rt) {
      rt.watch(config.serverUUID);
      rt.watchEvents(config.serverUUID);
    }
  }

  if (rt && st) {
    resubscribeRealtime();
    rt.onStatusChange((s) => {
      if (s === "connected") resubscribeRealtime();
    });
    st.observe("server:status:" + config.serverUUID, (snap) => {
      if (!snap || snap.status !== "success" || !snap.data) return;
      if (snap.data.running === false) {
        if (!lifecycleActive) {
          setAllStatsOffline();
          surfaceStoppedState(snap.data);
        }
        return;
      }
      updateStatus({ data: snap.data });
    });
    st.observe("server:stats:" + config.serverUUID, (snap) => {
      if (!snap || snap.status !== "success" || !snap.data) return;
      updateRamUsage({ data: snap.data });
      updateCpuUsage({ data: snap.data });
      updateDiskUsage({ data: snap.data });
    });
    st.observe("server:queue:" + config.serverUUID, (snap) => {
      if (!snap?.data) return;
      const q = snap.data;
      if (q.queued && typeof q.position === "number") {
        setStatusText("Queued", "var(--theme-warning)");
        setStatusLog("Waiting for capacity...");
        showQueueStatus(q.position, q.total, q.available);
      } else hideQueueStatus();
    });
    rt.subscribe((evt) => {
      if (!evt || typeof evt.type !== "string") return;
      const rid =
        evt.resource?.type === "server" ? String(evt.resource.id) : null;
      if (rid && rid !== config.serverUUID) return;
      if (evt.type === "server.lifecycle.changed") {
        handleLifecycle(evt.state);
        return;
      }
      if (
        evt.type === "server.power.start.failed" ||
        evt.type === "server.start.failed"
      ) {
        setStatusText("Offline", "var(--theme-danger)");
        updateStatusChart("danger", 0.1, 0.2);
        finishPower(false, evt.error?.message || "The server couldn't start.");
        return;
      }
      if (evt.type === "server.power.stop.failed") {
        finishPower(
          false,
          evt.error?.message || "Couldn't stop the server. Try again?",
        );
        return;
      }
      if (evt.type === "server.power.started") {
        setStatusText("Online", "var(--theme-success)");
        updateStatusChart("success", 0.1, 0.2);
        if (powerKind === "start" || powerKind === "restart") {
          finishPower(true);
          if (!socket || socket.readyState !== 1) connectWebSocket();
        }
        return;
      }
      if (evt.type === "server.power.stopped") {
        if (powerKind === "stop") {
          finishPower(true);
          setAllStatsOffline();
          setStatusText("Offline", "var(--theme-danger)");
          updateStatusChart("danger", 0.1, 0.2);
          setStatusLog(null);
        }
      }
    });
  }

  // Event listeners
  const listeners = [];
  function listen(el, evt, fn, opts) {
    el.addEventListener(evt, fn, opts);
    listeners.push([el, evt, fn, opts]);
  }
  const onResize = () => fitAddon.fit();
  listen(window, "resize", onResize);
  listen(document, "visibilitychange", () => {
    pageHidden = document.visibilityState === "hidden";
    if (pageHidden) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        try {
          socket.close(1000, "page hidden");
        } catch {}
        socket = null;
      }
    } else {
      connectWebSocket();
      resubscribeRealtime();
    }
  });
  listen(window, "beforeunload", teardown);
  listen(window, "pagehide", teardown);

  const input = root.querySelector("#input");
  if (input) {
    listen(input, "keypress", (e) => {
      if (e.key === "Enter") sendCommand();
    });
    listen(input, "keydown", handleKeyUp);
  }
  const loadBtn = root.querySelector("#loadHistoryBtn");
  if (loadBtn)
    listen(loadBtn, "click", () => {
      if (!serverOnline) loadRecentLogs(true);
    });
  async function copyServerAddress(
    sourceSelector,
    copyIconSelector,
    checkIconSelector,
  ) {
    const address = root.querySelector(sourceSelector)?.textContent?.trim();
    if (!address) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const input = document.createElement("textarea");
        input.value = address;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Copy is unavailable.");
      }
      root.querySelector(copyIconSelector)?.classList.add("hidden");
      root.querySelector(checkIconSelector)?.classList.remove("hidden");
      window.showToast?.("Server address copied.", "success");
      setTimeout(() => {
        root.querySelector(copyIconSelector)?.classList.remove("hidden");
        root.querySelector(checkIconSelector)?.classList.add("hidden");
      }, 1600);
    } catch {
      window.showToast?.("Could not copy the server address.", "error");
    }
  }
  const copyIpBtn = root.querySelector("#copy-ip-btn");
  if (copyIpBtn)
    listen(copyIpBtn, "click", () =>
      copyServerAddress("#server-ip-text", "#copy-icon", "#check-icon"),
    );
  const mobileCopyIpBtn = root.querySelector("#mobile-copy-ip-btn");
  if (mobileCopyIpBtn)
    listen(mobileCopyIpBtn, "click", () =>
      copyServerAddress(
        "#mobile-server-ip-text",
        "#mobile-copy-icon",
        "#mobile-check-icon",
      ),
    );
  const cancelBtn = root.querySelector("#cancelQueueBtn");
  if (cancelBtn)
    listen(cancelBtn, "click", async () => {
      cancelBtn.disabled = true;
      cancelBtn.textContent = "Cancelling...";
      try {
        const r = await fetch(`${config.powerBaseUrl}/queue/cancel`, {
          method: "POST",
          headers: {
            "csrf-token":
              document.querySelector('meta[name="csrf-token"]')?.content || "",
          },
        });
        const d = await r.json();
        if (d.success) {
          hideQueueStatus();
          setStatusLog(null);
          setStatusText("Offline", "var(--theme-danger)");
          window.showToast?.("Queued start cancelled.", "success");
        } else window.showToast?.(d.error || "Failed to cancel.", "error");
      } catch {
        window.showToast?.("Failed to cancel.", "error");
      } finally {
        cancelBtn.disabled = false;
        cancelBtn.textContent = "Cancel start";
      }
    });

  // Power buttons
  const startBtn = root.querySelector("#startButton");
  if (startBtn && !config.serverSuspended)
    listen(startBtn, "click", async () => {
      logsAutoLoaded = false;
      installLogsLoaded = false;
      serverStopped = false;
      historyLoaded = false;
      setStatusText("Starting", "var(--theme-warning)");
      setStatusLog("Sending start request...");
      lockInput("Starting container...");
      beginPower(startBtn, "start", "Server is alive!");
      try {
        const r = await fetch(`${config.powerBaseUrl}/start`, {
          method: "POST",
          headers: {
            "csrf-token":
              document.querySelector('meta[name="csrf-token"]')?.content || "",
          },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          finishPower(false, d.error || "Failed to start.");
          unlockInput();
          setStatusText("Offline", "var(--theme-danger)");
          updateStatusChart("danger", 0.1, 0.2);
          return;
        }
        if (d.queued) {
          setStatusText("Queued", "var(--theme-warning)");
          setStatusLog("Waiting for capacity...");
          showQueueStatus(d.position, d.total, null);
          window.showToast?.(
            `Server queued (position ${d.position || "?"}).`,
            "info",
          );
          return;
        }
        setStatusLog("Starting container...", "starting");
      } catch {
        finishPower(false, "Couldn't wake the server. Try again?");
        unlockInput();
      }
    });
  const restartBtn = root.querySelector("#restartButton");
  if (restartBtn && !config.serverSuspended)
    listen(restartBtn, "click", () => {
      window.modal.confirm({
        title: config.translations.confirmRestartServer || "Restart server?",
        body:
          config.translations.confirmRestartDesc ||
          "Everyone gets disconnected. You sure?",
        confirmLabel: config.translations.restartServer || "Restart Server",
        onConfirm: async () => {
          deliberateStop = true;
          logsAutoLoaded = false;
          installLogsLoaded = false;
          serverStopped = false;
          historyLoaded = false;
          setStatusText("Restarting", "var(--theme-warning)");
          setStatusLog("Sending restart request...");
          updateStatusChart("warning", 0.1, 0.2);
          lockInput("Restarting container...");
          beginPower(restartBtn, "restart", "Server rebooted. Back in action.");
          try {
            const r = await fetch(`${config.powerBaseUrl}/restart`, {
              method: "POST",
              headers: {
                "csrf-token":
                  document.querySelector('meta[name="csrf-token"]')?.content ||
                  "",
              },
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
              finishPower(false, d.error || "Failed to restart.");
              unlockInput();
              return;
            }
            if (d.queued) {
              setStatusText("Queued", "var(--theme-warning)");
              setStatusLog("Waiting for capacity...");
              showQueueStatus(d.position, d.total, null);
              return;
            }
            setStatusLog("Restarting server...", "starting");
          } catch {
            finishPower(false, "Restart didn't take. Try again?");
            unlockInput();
          }
        },
      });
    });
  const stopBtn = root.querySelector("#stopButton");
  if (stopBtn && !config.serverSuspended)
    listen(stopBtn, "click", () => {
      window.modal.confirm({
        title: config.translations.confirmStopServer || "Stop server?",
        body:
          config.translations.confirmStopDesc ||
          "Everyone gets disconnected. You sure?",
        danger: true,
        confirmLabel: config.translations.stopServer || "Stop Server",
        onConfirm: async () => {
          deliberateStop = true;
          setStatusText("Stopping", "var(--theme-danger)");
          setStatusLog("Sending stop command...");
          updateStatusChart("danger", 0.1, 0.2);
          beginPower(stopBtn, "stop", "Server shut down.");
          try {
            const r = await fetch(`${config.powerBaseUrl}/stop`, {
              method: "POST",
              headers: {
                "csrf-token":
                  document.querySelector('meta[name="csrf-token"]')?.content ||
                  "",
              },
            });
            if (!r.ok) {
              const d = await r.json().catch(() => ({}));
              finishPower(false, d.error || "Couldn't stop.");
              setStatusText("Online", "var(--theme-success)");
              updateStatusChart("success", 0.1, 0.2);
              return;
            }
            setStatusLog("Stopping server...", "stopping");
          } catch {
            finishPower(false, "Couldn't stop. Try again?");
            setStatusText("Online", "var(--theme-success)");
            updateStatusChart("success", 0.1, 0.2);
          }
        },
      });
    });

  // Mobile buttons
  const mobStart = root.querySelector("#mobileStartButton");
  const mobRestart = root.querySelector("#mobileRestartButton");
  const mobStop = root.querySelector("#mobileStopButton");
  if (mobStart && startBtn) listen(mobStart, "click", () => startBtn.click());
  if (mobRestart && restartBtn)
    listen(mobRestart, "click", () => restartBtn.click());
  if (mobStop && stopBtn) listen(mobStop, "click", () => stopBtn.click());

  // Mobile input
  const mobInput = root.querySelector("#mobile-input");
  if (mobInput) {
    listen(mobInput, "keypress", (e) => {
      if (e.key === "Enter" && consoleOwner) {
        const cmd = mobInput.value.trim();
        if (cmd && socket) {
          mobileTerm?.write(`\u001b[1m\u001b[33m~ \u001b[0m${cmd}\r\n`);
          socket.send(JSON.stringify({ event: "CMD", command: cmd }));
          if (commandHistory.length === maxCommands) commandHistory.shift();
          commandHistory.push(cmd);
          currentCommandIndex = commandHistory.length;
        }
        mobInput.value = "";
      }
    });
    listen(mobInput, "keydown", handleKeyUp);
  }

  connectWebSocket();

  function teardown() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (statusMsgFadeTimer) {
      clearTimeout(statusMsgFadeTimer);
      statusMsgFadeTimer = null;
    }
    if (chartUpdatePending) {
      cancelAnimationFrame(chartUpdatePending);
      chartUpdatePending = null;
    }
    controllers.forEach((c) => c.abort());
    controllers.clear();
    if (socket) {
      try {
        socket.close(1000, "page navigating");
      } catch {}
      socket = null;
    }
    if (rt) {
      try {
        rt.unwatch(config.serverUUID);
      } catch {}
      try {
        rt.unwatchEvents(config.serverUUID);
      } catch {}
    }
    listeners.forEach(([el, evt, fn, opts]) =>
      el.removeEventListener(evt, fn, opts),
    );
    listeners.length = 0;
    term.dispose();
    mobileTerm?.dispose();
    if (window.setTerminalTheme === setTerminalTheme)
      window.setTerminalTheme = null;
    if (window._manageTermTheme === setTerminalTheme)
      window._manageTermTheme = null;
  }

  return { teardown };
}
