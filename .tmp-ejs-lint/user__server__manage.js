/* inline script 1 */

/* inline script 2 */

/* inline script 3 */

/* inline script 4 */

/* inline script 5 */

function themeVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--theme-' + name).trim();
  return v || fallback;
}

const termTheme = {
  foreground: '#c5c9d1',
  background: themeVar('terminal-bg', '#141414'),
  selectionBackground: '#5DA5D580',
  black: '#1E1E1D',
  brightBlack: '#262625',
  red: '#E54B4B',
  green: '#9ECE58',
  yellow: '#FAED70',
  blue: '#396FE2',
  magenta: '#BB80B3',
  cyan: '#2DDAFD',
  white: '#d0d0d0',
  brightRed: '#FF5370',
  brightGreen: '#C3E88D',
  brightYellow: '#FFCB6B',
  brightBlue: '#82AAFF',
  brightMagenta: '#C792EA',
  brightCyan: '#89DDFF',
  brightWhite: '#ffffff',
  cursor: '#c5c9d1',
  cursorAccent: themeVar('terminal-bg', '#141414')
};

const term = new Terminal({
  disableStdin: true,
  lineHeight: 1.35,
  fontFamily: 'Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  theme: termTheme,
  scrollback: 1000,
  convertEol: true
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

// WebLinksAddon makes URLs in terminal output clickable
const webLinksAddon = new WebLinksAddon.WebLinksAddon();
term.loadAddon(webLinksAddon);

term.open(document.getElementById('terminal'));
fitAddon.fit();

window.addEventListener('resize', () => fitAddon.fit());

// Load the last ~500 console lines from disk (survives restarts) for post-mortems.
const loadHistoryBtn = document.getElementById('loadHistoryBtn');
if (loadHistoryBtn) {
    loadHistoryBtn.addEventListener('click', async () => {
        const btn = loadHistoryBtn;
        btn.disabled = true;
        try {
            const r = await fetch('/server/' + window.location.pathname.split('/')[2] + '/logs/history', { credentials: 'same-origin' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load logs');
            const lines = d.logs || [];
            term.writeln('');
            term.writeln('\x1b[90m— ' + lines.length + ' lines from disk —\x1b[0m');
            lines.forEach(l => term.writeln(l));
            term.writeln('\x1b[90m— end of saved log —\x1b[0m');
        } catch (err) {
            term.writeln('\x1b[31mFailed to load log history: ' + (err.message || err) + '\x1b[0m');
        } finally {
            btn.disabled = false;
        }
    });
}

// Intercept wheel events on the terminal so scrolling the console scrolls
// the terminal buffer rather than the page behind it.
(function () {
    const termEl = document.getElementById('terminal');
    if (!termEl) return;

    termEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // xterm scrolls 3 lines per wheel tick by default; respect deltaMode
        const lines = e.deltaMode === 1 ? e.deltaY : Math.round(e.deltaY / 20);
        term.scrollLines(lines);
    }, { passive: false });

    // Touch: track touch start position and scroll terminal on move
    let touchStartY = 0;
    termEl.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    termEl.addEventListener('touchmove', (e) => {
        const dy = touchStartY - e.touches[0].clientY;
        touchStartY = e.touches[0].clientY;
        e.preventDefault();
        e.stopPropagation();
        term.scrollLines(Math.round(dy / 16));
    }, { passive: false });
})();

    const maxCommands = 10;
    let commandHistory = [];
    let currentCommandIndex = -1;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const path = '/console/null';

    const socketUrl = `${protocol}//${host}${path}`;

    // Short-lived (60s) WS connect token — the browser never sees the node key.
    const _wsTokenCache = { serverId: null, promise: null, fetchedAt: 0 };
    function getWsConnectToken(serverId) {
        const fresh = Date.now() - _wsTokenCache.fetchedAt < 45000 && _wsTokenCache.serverId === serverId;
        if (!fresh) {
            _wsTokenCache.serverId = serverId;
            _wsTokenCache.promise = fetch('/server/' + encodeURIComponent(serverId) + '/ws-token', { credentials: 'same-origin' })
                .then((res) => { if (!res.ok) throw new Error('ws-token'); return res.json(); })
                .then((data) => data.token);
            _wsTokenCache.fetchedAt = Date.now();
        }
        return _wsTokenCache.promise;
    }
    function openTimedSocket(url, serverId) {
        return getWsConnectToken(serverId || 'null').then((token) => new WebSocket(url + '?token=' + encodeURIComponent(token)));
    }

    let socket;

let isReconnecting = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectInterval = 2000;
let reconnectTimer = null;
let wsErrorCount = 0;  // only show offline banner after sustained failures
let historyLoaded = false; // only fetch log history once per page load

function connectWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    isReconnecting = true;

    if (socket) {
        try { socket.close(); } catch {}
        socket = null;
    }

    openConsoleSocket();
}

function setDaemonOfflineBanner(offline) {
    const row = document.getElementById('daemonOfflineWarningRow');
    if (!row) return;
    if (offline) {
        row.classList.remove('hidden');
        lockInput('Console paused — daemon offline');
        writeConsole('system', 'error', 'Console paused — daemon offline');
    } else {
        row.classList.add('hidden');
        unlockInput();
    }
}

async function openConsoleSocket() {
    try {
        const token = await getWsConnectToken('null');
        socket = new WebSocket(socketUrl + '?token=' + encodeURIComponent(token));

        socket.onopen = () => {
            isReconnecting = false;
            reconnectAttempts = 0;
            reconnectInterval = 2000;
            wsErrorCount = 0;
            setDaemonOfflineBanner(false);

            if (!historyLoaded) {
                historyLoaded = true;
                fetch(`/server/null/logs`)
                    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
                    .then((data) => {
                        const lines = data.lines || [];
                        lines.forEach((line) => term.write(maskPrompts(String(line)) + '\r\n'));
                    })
                    .catch(() => {});
            }
        };

        socket.onmessage = handleWebSocketMessage;

        socket.onerror = () => {
            wsErrorCount++;
            if (wsErrorCount >= 3) {
                setDaemonOfflineBanner(true);
            }
        };

        socket.onclose = () => {
            socket = null;
            if (!isReconnecting) {
                scheduleReconnect();
            }
        };
    } catch {
        socket = null;
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (pageHidden) return;
    isReconnecting = true;
    reconnectAttempts++;

    const backoffTime = Math.min(30000, reconnectInterval * Math.pow(1.5, reconnectAttempts - 1));

    if (reconnectAttempts <= maxReconnectAttempts) {
        reconnectTimer = setTimeout(() => {

connectWebSocket();

// Background throttle — close the console socket while the tab is hidden,
// pause reconnect timers, and reconnect immediately when the tab returns.
let pageHidden = document.visibilityState === 'hidden';
document.addEventListener('visibilitychange', () => {
    pageHidden = document.visibilityState === 'hidden';
    if (pageHidden) {
        isReconnecting = false;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (socket) {
            try { socket.close(1000, 'page hidden'); } catch {}
            socket = null;
        }
    } else {
        isReconnecting = false;
// Two-tab console guard — exactly one tab owns console input; every other
// tab renders view-only (notices shown, inputs disabled, sends refused).
// Uses the Web Locks API so ownership transfers automatically when the
// owning tab closes; browsers without Web Locks behave as before.
let consoleOwner = false;
function updateConsoleOwnerUI() {
    const notices = [document.getElementById('consoleReadOnlyNotice'), document.getElementById('consoleReadOnlyNoticeMobile')];
    notices.forEach((n) => { if (n) n.classList.toggle('hidden', consoleOwner); });
    const input = document.getElementById('input');
    const mInput = document.getElementById('mobile-input');
    if (input) input.disabled = !consoleOwner;
    if (mInput) mInput.disabled = !consoleOwner;
}
(function acquireConsoleOwnership() {
    if (!window.navigator.locks || !window.navigator.locks.request) {
        consoleOwner = true;
        updateConsoleOwnerUI();
        return;
    }
    window.navigator.locks.request('al-console-input:null', function () {
        consoleOwner = true;
        updateConsoleOwnerUI();
        return new Promise(function () {});
    });
})();

connectWebSocket();
    }
});
        }, backoffTime);
    } else {

        writeConsole('system', 'error', 'Maximum reconnect attempts reached. Please refresh the page.');
    }
}

connectWebSocket();

    function isDaemonInfraError(text) {
        return text.includes('Failed to attach to container') ||
               text.includes('no such container') ||
               text.includes('No such container') ||
               text.includes('container not available') ||
               text.includes('Attach failed') ||
               text.includes('HTTP code 404') ||
               text.includes('HTTP code 500');
    }

    // Replace any shell prompt variants that show the internal container
    // hostname with the display name "airlinkd". This covers every form the
    // prompt can take depending on shell, distro, and yolks image version:
    //
    //   container@<anything>:~$      -> airlinkd~
    //   container@<anything>:~#      -> airlinkd~
    //   container@<anything>:~       -> airlinkd~
    //   [container@<anything> ~]$    -> airlinkd~
    //   (container@<anything>)~$     -> airlinkd~
    //   root@<anything>:~#           -> airlinkd~
    //
    // The regex matches:
    //   (?:container|root)    - the username yolks creates or root
    //   @[^\s:\])]           - @ followed by any hostname chars (no space/colon/bracket)
    //   (?:[^$#\r\n]*?)      - optional path / tty info
    //   [$#]?\s*             - optional prompt character and trailing space
    // ANSI-aware prompt masking.
    //
    // The problem: Docker's TTY stream interleaves ANSI colour codes through
    // the prompt text. The raw bytes look like:
    //   \r\x1b[01;32mcontainer@petrodactyl\x1b[00m:\x1b[01;34m~\x1b[00m$\x20
    // A plain-text regex won't match across those escape sequences.
    //
    // Solution: strip all ANSI escape codes from a copy of the chunk, run the
    // plain-text regex against that, and if it hits, replace the *entire raw
    // chunk* with "airlinkd~ " — because the chunk is the prompt line itself.
    // If the chunk contains more than just the prompt (i.e. it includes server
    // log output), fall back to replacing in the plain version and writing that.
    //
    // ANSI CSI escape: ESC [ <params> <final-byte>
    // OSC escape:      ESC ] ... ST/BEL
    // Other escapes:   ESC <single-char>
    const ANSI_RE   = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_]|[\u0080-\u009F])/g;
    const PROMPT_RE = /(?:[a-zA-Z0-9_-]+)@[^\s:#\])\r\n]+(?:[^$#\r\n]*?)[$#]\s*/g;

    function maskPrompts(raw) {
        const plain = raw.replace(ANSI_RE, '');
        if (!PROMPT_RE.test(plain)) {
            PROMPT_RE.lastIndex = 0;
            return raw;  // no prompt in this chunk — pass through untouched
        }
        PROMPT_RE.lastIndex = 0;

        // If the chunk is *only* the prompt (CR + colour codes + prompt chars),
        // replace the whole thing cleanly.
        const stripped = plain.replace(/[\r\n]/g, '').trim();
        const isOnlyPrompt = PROMPT_RE.test(stripped) && stripped.replace(PROMPT_RE, '').trim() === '';
        PROMPT_RE.lastIndex = 0;

        if (isOnlyPrompt) {
            return '\r\nairlinkd~ ';
        }

        // Mixed chunk — replace in plain text and write that (loses colour on
        // the prompt line, but preserves all other output correctly).
        return plain.replace(PROMPT_RE, 'airlinkd~ ');
    }

    function handleWebSocketMessage(msg) {
        if (msg.data instanceof Blob) {
            msg.data.arrayBuffer().then(buf => {
                const text = new TextDecoder().decode(buf);
                if (isDaemonInfraError(text)) return;
                if (text.includes('airlinkd server appears to be down')) {
                    socket.close();
                    wsErrorCount = 3;
                    setDaemonOfflineBanner(true);
                    return;
                }
                if (text.includes('Working on')) {
                    term.clear();
                    socket.close();
                    return;
                }
                hideConsolePlaceholder();
                try {
                    const parsed = JSON.parse(text);
                    if (parsed && parsed.event === 'error') {
                        const msg2 = parsed.data && parsed.data.message ? parsed.data.message : text;
                        writeConsole('system', 'error', msg2);
                        return;
                    }
                } catch {}
                term.write(maskPrompts(text));
            });
            return;
        }

        const text = typeof msg.data === 'string' ? msg.data : String(msg.data);
        if (isDaemonInfraError(text)) return;
        if (text.includes('airlinkd server appears to be down')) {
            socket.close();
            wsErrorCount = 3;
            setDaemonOfflineBanner(true);
            return;
        }
        if (text.includes('Working on')) {
            term.clear();
            socket.close();
            return;
        }
        hideConsolePlaceholder();
        try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.event === 'error') {
                const msg2 = parsed.data && parsed.data.message ? parsed.data.message : text;
                writeConsole('system', 'error', msg2);
                return;
            }
        } catch {}
        term.write(maskPrompts(text));
    }

    function writeConsole(prefix, type, message) {
        const ansi = {
            system: '\x1b[33m',
            error: '\x1b[31m',
            info: '\x1b[34m',
            success: '\x1b[32m',
            normal: '\x1b[0m'
        };

        const color = ansi[type.toLowerCase()] || '\x1b[0m';
        const prefixText = (prefix && type !== 'normal') ? `[${prefix}] ` : '';
        term.write(`${color}${prefixText}\x1b[37m${message}\x1b[0m\r\n`);
    }

    function restartWebSocket() {
        if (socket) {
            try { socket.close(); } catch {}
            socket = null;
        }
        setTimeout(connectWebSocket, 500);
    }

    function sendCommand() {
        if (!consoleOwner) return;
        const inputElement = document.getElementById('input');
        const command = inputElement.value.trim();
        if (command && socket) {
            term.write('\u001b[1m\u001b[33m~ \u001b[0m' + command + '\r\n');
            socket.send(JSON.stringify({
                event: 'CMD',
                command: command
            }));

            if (commandHistory.length === maxCommands) {
                commandHistory.shift();
            }
            commandHistory.push(command);
            currentCommandIndex = commandHistory.length;
        }

        // Always clear the field and ghost text after Enter, even if the command
        // was empty — so the user never has to manually clear a failed send.
        inputElement.value = '';
        inputElement.dispatchEvent(new Event('input'));
        clearGhostText();
    }

    function handleKeyUp(event) {
        if (event.key === 'ArrowUp') {
            if (currentCommandIndex > 0) {
                currentCommandIndex--;
                document.getElementById('input').value = commandHistory[currentCommandIndex];
            }
            event.preventDefault();
        } else if (event.key === 'ArrowDown') {
            if (currentCommandIndex < commandHistory.length - 1) {
                currentCommandIndex++;
                document.getElementById('input').value = commandHistory[currentCommandIndex];
            } else {
                currentCommandIndex = commandHistory.length;
                document.getElementById('input').value = '';
            }
            event.preventDefault();
        }
    }

    const startButton = document.getElementById('startButton');
    const consoleInput = document.getElementById('input');

    function lockInput(reason) {
        if (!consoleInput) return;
        consoleInput.disabled = true;
        consoleInput.placeholder = reason || 'Waiting for container...';
    }

    function unlockInput() {
        if (!consoleInput) return;
        consoleInput.disabled = !consoleOwner;
        consoleInput.placeholder = 'null';
    }

    function setButtonLoading(btn, label) {
        if (!btn || btn.dataset.loading === 'true') return;
        btn.dataset.loading = 'true';
        btn.dataset.origLabel = btn.textContent;
        btn.textContent = label;
    }

    function clearButtonLoading(btn) {
        if (!btn || btn.dataset.loading !== 'true') return;
        btn.dataset.loading = 'false';
        if (btn.dataset.origLabel) {
            btn.textContent = btn.dataset.origLabel;
            delete btn.dataset.origLabel;
        }
    }

    ;
    startButton.addEventListener('click', async () => {
        const serverUUID = 'null';

        setStatusText('Starting', 'var(--theme-warning)');
        setStatusLog('Sending start request...');
        lockInput('Starting container...');
        setButtonLoading(startButton, 'Starting…');

        const evtSocket = await openTimedSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events/${serverUUID}`, serverUUID);

        evtSocket.onmessage = (msg) => {
            let parsed;
            try { parsed = JSON.parse(msg.data); } catch { return; }
            if (parsed.event !== 'lifecycle') return;
            const { type, message } = parsed.data;
            setStatusLog(message, type);
            writeConsole('daemon', 'info', message);
            if (type === 'started') { unlockInput(); clearButtonLoading(startButton); }
            if (type === 'error') { setStatusLog(null); showToast(message, 'error'); unlockInput(); clearButtonLoading(startButton); }
        };

        fetch(`/server/${serverUUID}/power/start`, { method: 'POST' })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) {
                    setStatusLog(null);
                    showToast((d && d.error) || 'Failed to start the server.', 'error');
                    unlockInput();
                    clearButtonLoading(startButton);
                    evtSocket.close();
                    return;
                }
                let attempts = 0;
                const maxAttempts = 28;
                const poll = setInterval(() => {
                    attempts++;
                    fetch(`/server/${serverUUID}/status`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.online) {
                                clearInterval(poll);
                                evtSocket.close();
                                setStatusText('Online', 'var(--theme-success)');
                                setStatusLog(null);
                                updateStatusChart('success', 0.1, 0.2);
                                showToast('Server is alive!', 'success');
                                clearButtonLoading(startButton);
                                restartWebSocket();
                            } else if (attempts >= maxAttempts) {
                                clearInterval(poll);
                                evtSocket.close();
                                setStatusLog(null);
                                showToast('Woke it up — give it a sec.', 'success');
                                clearButtonLoading(startButton);
                                restartWebSocket();
                            }
                        })
                        .catch(() => {});
                }, 2500);
            })
            .catch(() => {
                evtSocket.close();
                setStatusLog(null);
                clearButtonLoading(startButton);
                showToast("Couldn't wake the server. Try again?", 'error');
            });
    });
    ;
    startButton.addEventListener('click', () => {
        showToast('This server is suspended. Please contact an administrator for assistance.', 'error');
    });
    ;

    const restartButton = document.getElementById('restartButton');
    ;
    restartButton.addEventListener('click', () => {
        const serverUUID = 'null';
        window.modal.confirm({
          title: 'null',
          body: 'null',
          danger: false,
          confirmLabel: 'null',
          onConfirm: async () => {
          const serverUUID = 'null';
          deliberateStop = true;
          setStatusText('Restarting', 'var(--theme-warning)');
          setStatusLog('Sending restart request...');
          updateStatusChart('warning', 0.1, 0.2);
          lockInput('Restarting container...');
          setButtonLoading(restartButton, 'Restarting…');

          const evtSocketR = await openTimedSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events/${serverUUID}`, serverUUID);

          evtSocketR.onmessage = (msg) => {
              let parsed;
              try { parsed = JSON.parse(msg.data); } catch { return; }
              if (parsed.event !== 'lifecycle') return;
              const { type, message } = parsed.data;
              setStatusLog(message, type);
              writeConsole('daemon', 'info', message);
              if (type === 'started') { unlockInput(); clearButtonLoading(restartButton); if (typeof term !== 'undefined') term.scrollToBottom(); }
              if (type === 'error') { setStatusLog(null); showToast(message, 'error'); unlockInput(); clearButtonLoading(restartButton); }
          };

          fetch(`/server/${serverUUID}/power/restart`, { method: 'POST' })
              .then(r => r.json().then(d => ({ ok: r.ok, d })))
              .then(({ ok, d }) => {
                  if (!ok) {
                      setStatusLog(null);
                      showToast((d && d.error) || 'Failed to restart the server.', 'error');
                      unlockInput();
                      clearButtonLoading(restartButton);
                      evtSocketR.close();
                      return;
                  }
                  let attempts = 0;
                  const maxAttempts = 36;
                  const poll = setInterval(() => {
                      attempts++;
                      fetch(`/server/${serverUUID}/status`)
                          .then(r => r.json())
                          .then(data => {
                              if (data.online) {
                                  clearInterval(poll);
                                  evtSocketR.close();
                                  setStatusText('Online', 'var(--theme-success)');
                                  setStatusLog(null);
                                  updateStatusChart('success', 0.1, 0.2);
                                   showToast('Server rebooted. Back in action.', 'success');
                                  clearButtonLoading(restartButton);
                                  restartWebSocket();
                              } else if (attempts >= maxAttempts) {
                                  clearInterval(poll);
                                  evtSocketR.close();
                                  setStatusLog(null);
                                   showToast('Restarting — one moment.', 'success');
                                  clearButtonLoading(restartButton);
                                  restartWebSocket();
                              }
                          })
                          .catch(() => {});
                  }, 2500);
              })
              .catch(() => {
                  evtSocketR.close();
                  setStatusLog(null);
                  clearButtonLoading(restartButton);
                   showToast("Restart didn't take. Try again?", 'error');
              });
          }
        });
    });
    ;
    restartButton.addEventListener('click', () => {
        showToast('This server is suspended. Please contact an administrator for assistance.', 'error');
    });
    ;

    const stopButton = document.getElementById('stopButton');
    ;
    stopButton.addEventListener('click', () => {
        const serverUUID = 'null';
        window.modal.confirm({
          title: 'null',
          body: 'null',
          danger: true,
          confirmLabel: 'null',
          onConfirm: async () => {

          deliberateStop = true;
          setStatusText('Stopping', 'var(--theme-danger)');
          setStatusLog('Sending stop command...');
          updateStatusChart('danger', 0.1, 0.2);
          setButtonLoading(stopButton, 'Stopping…');

          const evtSocketS = await openTimedSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events/${serverUUID}`, serverUUID);

          evtSocketS.onmessage = (msg) => {
              let parsed;
              try { parsed = JSON.parse(msg.data); } catch { return; }
              if (parsed.event !== 'lifecycle') return;
              const { type, message } = parsed.data;
              writeConsole('daemon', 'info', message);
              setStatusLog(message, type);
              if (type === 'error') { setStatusLog(null); showToast(message, 'error'); clearButtonLoading(stopButton); }
          };

          fetch(`/server/${serverUUID}/power/stop`, { method: 'POST' })
              .then(r => r.json())
              .then(() => {
                  let attempts = 0;
                  const maxAttempts = 20;

                  const poll = setInterval(() => {
                      attempts++;
                      fetch(`/server/${serverUUID}/status`)
                          .then(r => r.json())
                          .then(data => {
                              if (!data.online && !data.starting && !data.stopping) {
                                  clearInterval(poll);
                                  evtSocketS.close();
                                  setAllStatsOffline();
                                  setStatusLog(null);
                                   showToast('Server shut down.', 'success');
                                  clearButtonLoading(stopButton);
                                  restartWebSocket();
                              } else if (attempts >= maxAttempts) {
                                  clearInterval(poll);
                                  evtSocketS.close();
                                  setStatusLog(null);
                                   showToast('Powering down — give it a moment.', 'success');
                                  clearButtonLoading(stopButton);
                                  restartWebSocket();
                                  setAllStatsOffline();
                              }
                          })
                          .catch(() => {});
                  }, 2500);
              })
              .catch(() => {
                  evtSocketS.close();
                  setStatusLog(null);
                  setStatusText('Online', 'var(--theme-success)');
                  updateStatusChart('success', 0.1, 0.2);
                  clearButtonLoading(stopButton);
                   showToast("Couldn't stop the server. Try again?", 'error');
              });
          }
        });
    });
    ;
    stopButton.addEventListener('click', () => {
        showToast('This server is suspended. Please contact an administrator for assistance.', 'error');
    });
    ;

    document.addEventListener('DOMContentLoaded', () => {
        const inputElement = document.getElementById('input');

        inputElement.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                sendCommand();
                clearGhostText();
            }
        });

        inputElement.addEventListener('keydown', function(event) {
            handleKeyUp(event);
        });

        ;
        // Lazy-load the autocomplete module only after the page is idle.
        // This keeps it off the critical path and away from parse/eval during load.
        inputElement.addEventListener('focus', function loadAutocomplete() {
            inputElement.removeEventListener('focus', loadAutocomplete);
            import('/js/mc-autocomplete.js').then(mod => {
                mod.fetchPlayersIfNeeded('null');
                mod.initDesktop(inputElement);
            });
        }, { once: true });
        ;
    });

    // Stubs so the keydown handler doesn't throw before the module loads.
    function clearGhostText() {
        const ghostTyped = document.getElementById('ghost-typed');
        const ghostSuggestion = document.getElementById('ghost-suggestion');
        if (ghostTyped) ghostTyped.textContent = '';
        if (ghostSuggestion) ghostSuggestion.textContent = '';
    }

    function copyServerIP() {
        const ipText = document.getElementById('server-ip-text').textContent.trim();
        navigator.clipboard.writeText(ipText).then(() => {
            document.getElementById('copy-icon').classList.add('hidden');
            document.getElementById('check-icon').classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('copy-icon').classList.remove('hidden');
                document.getElementById('check-icon').classList.add('hidden');
            }, 2000);
        });
    }

    let statsWs;
    let statsReconnectTimer;
    let statsReconnectAttempts = 0;
    let maxStatsReconnectAttempts = 10;
    let statsReconnectInterval = 2000;
    let isStatsReconnecting = false;

    function initStatsWebSocket() {
        if (statsReconnectTimer) {
            clearTimeout(statsReconnectTimer);
            statsReconnectTimer = null;
        }

        if (statsWs && (statsWs.readyState === WebSocket.CONNECTING || statsWs.readyState === WebSocket.OPEN)) {

            return;
        }

        isStatsReconnecting = true;

        if (statsWs) {
            try {
                statsWs.close();
            } catch (e) {

            }
        }

        openTimedSocket(`${protocol}//${host}/status/null`, 'null')
            .then((ws) => {
                statsWs = ws;

                ws.onmessage = event => {
                if (!isValidJson(event.data)) { return; }
                const stats = JSON.parse(event.data);
                if (stats.error) { return; }
                if (!stats.data) { return; }

                if (stats.data.running === false) {
                    if (!lifecycleActive) {
                        setAllStatsOffline();
                        surfaceStoppedState(stats.data);
                    }
                    return;
                }

                updateRamUsage(stats);
                updateCpuUsage(stats);
                updateDiskUsage(stats);
                updateStatus(stats);
                };

                ws.onopen = () => {
                    isStatsReconnecting = false;
                    statsReconnectAttempts = 0;
                    statsReconnectInterval = 2000;
                };

                ws.onerror = () => {
                    // Error — don't change status immediately, wait for reconnect result
                };

                ws.onclose = () => {
                    if (!isStatsReconnecting) {
                        scheduleStatsReconnect();
                    }
                };
            })
            .catch(() => {
                scheduleStatsReconnect();
            });
    }

    function scheduleStatsReconnect() {
        isStatsReconnecting = true;
        statsReconnectAttempts++;
        const backoffTime = Math.min(30000, statsReconnectInterval * Math.pow(1.5, statsReconnectAttempts - 1));

        if (statsReconnectAttempts <= maxStatsReconnectAttempts) {
            statsReconnectTimer = setTimeout(() => {

                initStatsWebSocket();
            }, backoffTime);
        } else {

        }
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatRam(bytes, decimals = 1) {
        if (bytes === 0) return '0 MB';
        const mb = bytes / (1024 * 1024);
        if (mb < 1024) return mb.toFixed(decimals) + ' MB';
        return (mb / 1024).toFixed(decimals) + ' GB';
    }

    function themeColor(name, alpha = 1) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--theme-' + name).trim();
        const m = raw.match(/^#([0-9a-f]{6})$/i) || raw.match(/^#([0-9a-f]{3})$/i);
        if (m) {
            const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
            return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
        }
        return raw ? `color-mix(in srgb, ${raw} ${Math.round(alpha * 100)}%, transparent)` : 'transparent';
    }

    function getChartColors() {
        return {
            border: themeColor('border'),
            fill: themeColor('border', 0.35),
        };
    }

    function createBackgroundChart(canvasId, type = 'line') {
        const colors = getChartColors();
        return new Chart(document.getElementById(canvasId).getContext('2d'), {
                type: type,
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        borderColor: colors.border,
                        backgroundColor: colors.fill,
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: true,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false }
                    },
                    animation: true
                }
            });
        }

    const statusChart = createBackgroundChart('statusChart');
    const ramChart = createBackgroundChart('ramChart');
    const cpuChart = createBackgroundChart('cpuChart');
    const diskChart = createBackgroundChart('diskChart', 'doughnut');

    function updateRamUsage(stats) {
    const ramStatsUsage = stats?.data?.memory?.usage || 0;
    const ramStatsLimit = stats?.data?.memory?.limit || null * 1024 * 1024;
    let ramUsagePercent = Number(stats?.data?.memory?.percentage) || 0;
    const ramUsageInMB = ramStatsUsage / 1024 / 1024;
    const ramLimitInMB = ramStatsLimit / 1024 / 1024;

    if (isNaN(ramUsagePercent)) {
        ramUsagePercent = 0;
    }

    ramUsagePercent = Math.round(ramUsagePercent);

    const ramUsageText = `${ramUsagePercent}% (${formatRam(ramStatsUsage)} / ${formatRam(ramStatsLimit)})`;
    document.getElementById('ramUsage').textContent = ramUsageText;

    if (ramStatsUsage > 0) {
        updateChart(ramChart, ramUsagePercent);
    }
}

    function updateCpuUsage(stats) {
        let cpuUsagePercent = Number(stats?.data?.cpu?.percentage) || 0;

        if (isNaN(cpuUsagePercent)) {
            cpuUsagePercent = 0;
        }

        const cpuAllocPct = null || 100;
        const cores = Math.max(1, Math.round(cpuAllocPct / 100));
        const cpuOfAlloc = cpuAllocPct > 0
            ? Math.round(Math.min(100, (cpuUsagePercent / cpuAllocPct) * 100))
            : 0;

        document.getElementById('cpuUsage').textContent =
            `${cpuOfAlloc}% of ${cores} core${cores === 1 ? '' : 's'}`;

        if (cpuOfAlloc > 0) {
            updateChart(cpuChart, cpuOfAlloc);
        }
    }

    function updateDiskUsage(stats) {
        const diskUsageRaw = parseFloat(stats.data.storage.usage) || 0;
        const diskLimitRaw = 10 * 1024;
        const diskPct = Math.round(diskUsageRaw / diskLimitRaw * 100);
        document.getElementById('diskUsage').textContent = `${diskPct}% (${formatBytes(diskUsageRaw * 1024 * 1024)} / ${formatBytes(diskLimitRaw * 1024 * 1024)})`;
    }

    function updateStatus(stats) {
        if (lifecycleActive) return;
        const statusElement = document.getElementById('status');

        if (stats.data && stats.data.starting === true) {
            statusElement.textContent = 'Starting';
            statusElement.className = 'mt-1 text-lg font-medium tracking-tight leading-snug w-full';
            statusElement.style.color = 'var(--theme-warning)';
            updateStatusChart('warning', 0.1, 0.2);
        } else if (stats.data && stats.data.running === true) {
            statusElement.textContent = 'Online';
            statusElement.className = 'mt-1 text-lg font-medium tracking-tight leading-snug w-full';
            statusElement.style.color = 'var(--theme-success)';
            updateStatusChart('success', 0.1, 0.2);
        } else {
            statusElement.textContent = 'Offline';
            statusElement.className = 'mt-1 text-lg font-medium tracking-tight leading-snug w-full';
            statusElement.style.color = 'var(--theme-danger)';
            updateStatusChart('danger', 0.1, 0.2);
        }
    }

    function updateChart(chart, value) {
        chart.data.labels.push('');
        chart.data.datasets[0].data.push(value);

        if (chart.data.labels.length > 20) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        const colors = getChartColors();
        chart.data.datasets[0].borderColor = colors.border;
        chart.data.datasets[0].backgroundColor = colors.fill;

        chart.update();
    }

    // When true, the lifecycle stream owns the status card — stats polling must not overwrite it.
    let lifecycleActive = false;
    let statusMsgFadeTimer = null;
    // True when the user (or a lifecycle event) deliberately stopped the server.
    // A stop with this flag set is never labeled a crash.
    let deliberateStop = false;

    // ── Crash vs. stop surfacing (S-2) ─────────────────────────────────────
    // Never fabricate: an exit code labels the crash precisely, 137 gets the
    // OOM hint, no exit code gets an honest "stopped unexpectedly" fallback.
    function crashReasonLabel(exitCode) {
        const t = req.translations;
        if (exitCode === 137) return t.serverCrashedOom || 'Server crashed (exit 137 — likely out of memory)';
        if (typeof exitCode === 'number') return (t.serverCrashedExit || 'Server crashed (exit ') + exitCode + ')';
        return null;
    }

    function surfaceStoppedState(data) {
        if (deliberateStop) { deliberateStop = false; return; }
        const reason = crashReasonLabel(data && data.exitCode);
        setStatusText(reason, 'var(--theme-danger)');
        updateStatusChart('danger', 0.1, 0.2);
        const msgEl = document.getElementById('status-msg');
        if (msgEl) {
            const link = document.createElement('a');
            link.href = '/server/null/logs';
            link.textContent = req.translations.openLogs || 'Open logs';
            link.className = 'underline underline-offset-2 hover:opacity-75';
            msgEl.textContent = '';
            msgEl.appendChild(link);
            msgEl.className = 'text-xs font-medium mt-0.5 leading-snug transition-all duration-300';
            msgEl.style.color = 'var(--theme-danger)';
            msgEl.classList.remove('opacity-0', 'translate-y-1', 'pointer-events-none');
        }
        writeConsole('daemon', 'error', reason);
        showToast(reason, 'error');
    }

    // Color map: lifecycle event type → text color token
    const statusColors = {
        pulling:  { cls: 'var(--theme-info)' },
        creating: { cls: 'var(--theme-info)' },
        starting: { cls: 'var(--theme-warning)' },
        started:  { cls: 'var(--theme-warning)' },
        stopping: { cls: 'var(--theme-warning)' },
        stopped:  { cls: 'var(--theme-danger)' },
        killed:   { cls: 'var(--theme-danger)' },
        error:    { cls: 'var(--theme-danger)' },
    };

    // Returns a clean, user-facing label for the status card.
    // Layer-level pulling detail is collapsed to "Pulling image".
    const statusCardLabels = {
        pulling:  'Pulling image',
        creating: 'Creating container',
        starting: 'Starting container',
        started:  'Starting server',
        stopping: 'Stopping server',
        stopped:  'Server stopped',
        killed:   'Server stopped',
        error:    'Error',
    };

    function statusLabel(type) {
        return statusCardLabels[type] || null;
    }

    // Updates the big status label (Online / Offline / Starting etc.)
    function setStatusText(text, colorVar) {
        const el = document.getElementById('status');
        if (!el) return;
        el.textContent = text;
        el.className = 'mt-1 text-lg font-medium tracking-tight leading-snug';
        el.style.color = colorVar;
    }

    // Shows a colored, animated lifecycle label in the status card.
    // The status card always shows the clean label (e.g. "Pulling image"),
    // never raw layer-level daemon output. Pass msg=null to fade out and release.
    function setStatusLog(msg, eventType) {
        const msgEl = document.getElementById('status-msg');
        if (!msgEl) return;

        if (statusMsgFadeTimer) { clearTimeout(statusMsgFadeTimer); statusMsgFadeTimer = null; }

        if (msg === null) {
            msgEl.classList.add('opacity-0', 'translate-y-1');
            statusMsgFadeTimer = setTimeout(() => {
                msgEl.textContent = '';
                msgEl.className = 'text-xs font-medium mt-0.5 leading-snug transition-all duration-300 opacity-0 translate-y-1 pointer-events-none';
                lifecycleActive = false;
                statusMsgFadeTimer = null;
            }, 300);
        } else {
            lifecycleActive = true;
            hideConsolePlaceholder();
            // Use the clean label — never raw layer output in the status card
            const label = statusLabel(eventType) || msg;
            const color = (statusColors[eventType] || { cls: 'text-neutral-500 dark:text-neutral-400' }).cls;
            msgEl.classList.add('opacity-0', 'translate-y-1');
            statusMsgFadeTimer = setTimeout(() => {
                msgEl.textContent = label;
                msgEl.className = `text-xs font-medium mt-0.5 leading-snug transition-all duration-300 ${color}`;
                void msgEl.offsetHeight;
                msgEl.classList.remove('opacity-0', 'translate-y-1');
                statusMsgFadeTimer = null;
            }, 150);
        }
    }

    function updateStatusChart(token, bgAlpha = 0.1, borderAlpha = 0.3) {
        statusChart.data.datasets[0].backgroundColor = themeColor(token, bgAlpha);
        statusChart.data.datasets[0].borderColor = themeColor(token, borderAlpha);
        statusChart.data.labels = [''];
        statusChart.data.datasets[0].data = [100];
        statusChart.update();
    }

    // Function to set all stats to offline state
    function hideConsolePlaceholder() {}
    function showConsolePlaceholder() {}

    function setAllStatsOffline() {
        showConsolePlaceholder();
        // Update status display
        const statusElement = document.getElementById('status');
        statusElement.textContent = 'Offline';
        statusElement.className = 'mt-1 text-lg font-medium tracking-tight';
        statusElement.style.color = 'var(--theme-danger)';

        // Update status chart
        updateStatusChart('danger', 0.1, 0.2);

        // Update RAM usage
        document.getElementById('ramUsage').textContent = `${Math.round(0)}% (0 MB / ${formatRam(null * 1024 * 1024)})`;

        // Update CPU usage
        const cpuAllocPct = null;
        const cpuCores = (cpuAllocPct / 100).toFixed(1);
        document.getElementById('cpuUsage').textContent = `${Math.round(0)}% of ${cpuCores} core${cpuCores === '1.0' ? '' : 's'}`;

        // Update disk usage
        document.getElementById('diskUsage').textContent = `${Math.round(0)}% (0 Bytes / 10 GB)`;

        // Hide players decoration if it exists

        // No need to show daemon down message as it's been removed

        // Reset charts
        resetCharts();
    }

    // Function to reset all charts
    function resetCharts() {
        // Reset RAM chart
        ramChart.data.labels = [];
        ramChart.data.datasets[0].data = [];
        ramChart.update();

        // Reset CPU chart
        cpuChart.data.labels = [];
        cpuChart.data.datasets[0].data = [];
        cpuChart.update();
    }

    function isValidJson(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    initStatsWebSocket();

    // Passive lifecycle stream — receives daemon events for any operation in progress
    // Writes them to the console terminal and manages input lock state
    (function () {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const base = `${proto}://${location.host}/events/null`;

        getWsConnectToken('null').then((token) => {
            const lcSock = new WebSocket(base + '?token=' + encodeURIComponent(token));

            const stateMap = {
            pulling:  { label: 'Pulling image',      color: 'var(--theme-info)' },
            creating: { label: 'Creating container',  color: 'var(--theme-info)' },
            starting: { label: 'Starting container',  color: 'var(--theme-warning)' },
            started:  { label: 'Starting server',     color: 'var(--theme-warning)' },
            stopping: { label: 'Stopping',            color: 'var(--theme-warning)' },
            stopped:  { label: 'Offline',             color: 'var(--theme-danger)' },
            killed:   { label: 'Offline',             color: 'var(--theme-danger)' },
        };

        const lockingStates = new Set(['pulling', 'creating', 'starting']);

        lcSock.onmessage = (msg) => {
            let parsed;
            try { parsed = JSON.parse(msg.data); } catch { return; }
if (parsed.event !== 'lifecycle') return;
            const { type, message } = parsed.data;
            setStatusLog(message, type);
            writeConsole('daemon', 'info', message);
            if (lockingStates.has(type)) { lockInput('Waiting...'); }
            if (type === 'started') { unlockInput(); setStatusLog(null); if (typeof term !== 'undefined') term.scrollToBottom(); }
            if (type === 'stopped' || type === 'killed') { deliberateStop = true; setStatusLog(null); }
            if (type === 'error') { unlockInput(); setStatusLog(null); }
        };
        }).catch(() => {});
    })();

    // ═══════════════════════════════════════════════════════════════
    // MOBILE LAYOUT — separate terminal, charts, buttons
    // ═══════════════════════════════════════════════════════════════
    (function () {
        var mobileEl = document.getElementById('mobile-manage');
        if (!mobileEl) return;

        // Only init mobile terminal if the element exists and is visible
        var mobileTermEl = document.getElementById('mobile-terminal');
        if (!mobileTermEl) return;

        var mobileTerm = new Terminal({
            disableStdin: true,
            lineHeight: 1.3,
            fontFamily: 'Menlo, Monaco, Consolas, monospace',
            fontSize: 11,
            theme: termTheme,
            scrollback: 1000,
            convertEol: true
        });

        var mobileFitAddon = new FitAddon.FitAddon();
        mobileTerm.loadAddon(mobileFitAddon);
        var mobileWebLinksAddon = new WebLinksAddon.WebLinksAddon();
        mobileTerm.loadAddon(mobileWebLinksAddon);
        mobileTerm.open(mobileTermEl);

        function fitMobileTerminal() { mobileFitAddon.fit(); }
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { requestAnimationFrame(fitMobileTerminal); });
        } else {
            setTimeout(fitMobileTerminal, 100);
        }
        window.addEventListener('resize', function () { requestAnimationFrame(fitMobileTerminal); });

        // Touch scroll for mobile terminal
        (function () {
            var touchStartY = 0;
            mobileTermEl.addEventListener('touchstart', function (e) { touchStartY = e.touches[0].clientY; }, { passive: true });
            mobileTermEl.addEventListener('touchmove', function (e) {
                var dy = touchStartY - e.touches[0].clientY;
                touchStartY = e.touches[0].clientY;
                e.preventDefault();
                e.stopPropagation();
                mobileTerm.scrollLines(Math.round(dy / 16));
            }, { passive: false });
        })();

        // Mobile charts
        var mobileStatusChart = createBackgroundChart('mobileStatusChart');
        var mobileRamChart = createBackgroundChart('mobileRamChart');
        var mobileCpuChart = createBackgroundChart('mobileCpuChart');
        var mobileDiskChart = createBackgroundChart('mobileDiskChart', 'doughnut');

        // Share the same WebSocket for stats — update mobile elements too
        var origUpdateRam = updateRamUsage;
        var origUpdateCpu = updateCpuUsage;
        var origUpdateDisk = updateDiskUsage;
        var origUpdateStatus = updateStatus;

        // Patch update functions to also update mobile elements
        var origSetStatusText = setStatusText;
        function patchedSetStatusText(text, colorVar) {
            origSetStatusText(text, colorVar);
            var el = document.getElementById('mobile-status');
            if (el) { el.textContent = text; el.className = 'mt-0.5 text-base font-semibold leading-tight'; el.style.color = colorVar; }
        }

        var origSetStatusLog = setStatusLog;
        function patchedSetStatusLog(msg, eventType) {
            origSetStatusLog(msg, eventType);
            var logEl = document.getElementById('mobile-status-log-text');
            if (!logEl) return;
            if (msg === null) { logEl.textContent = ''; logEl.classList.add('hidden'); return; }
            var label = (statusCardLabels[eventType] || msg);
            var color = (statusColors[eventType] || {}).cls || 'var(--theme-text-muted)';
            logEl.textContent = label;
            logEl.className = 'text-[10px] font-medium truncate';
            logEl.style.color = color;
            logEl.classList.remove('hidden');
        }

        // Override to also write to mobile terminal
        var origWriteConsole = writeConsole;
        function mobileWriteConsole(prefix, type, message) {
            origWriteConsole(prefix, type, message);
            var ansi = { system: '\x1b[33m', error: '\x1b[31m', info: '\x1b[34m', success: '\x1b[32m', normal: '\x1b[0m' };
            var color = ansi[type.toLowerCase()] || '\x1b[0m';
            var prefixText = (prefix && type !== 'normal') ? '[' + prefix + '] ' : '';
            mobileTerm.write(color + prefixText + '\x1b[37m' + message + '\x1b[0m\r\n');
        }

        // Mobile input handling
        var mobileInput = document.getElementById('mobile-input');
        if (mobileInput) {
            mobileInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    if (!consoleOwner) return;
                    var cmd = mobileInput.value.trim();
                    if (cmd && socket) {
                        mobileTerm.write('\u001b[1m\u001b[33m~ \u001b[0m' + cmd + '\r\n');
                        socket.send(JSON.stringify({ event: 'CMD', command: cmd }));
                        if (commandHistory.length === maxCommands) commandHistory.shift();
                        commandHistory.push(cmd);
                        currentCommandIndex = commandHistory.length;
                    }
                    mobileInput.value = '';
                }
            });
            mobileInput.addEventListener('keydown', handleKeyUp);
        }

        // Mobile copy IP
        window.copyMobileServerIP = function () {
            var ipText = document.getElementById('mobile-server-ip-text').textContent.trim();
            navigator.clipboard.writeText(ipText).then(function () {
                document.getElementById('mobile-copy-icon').classList.add('hidden');
                document.getElementById('mobile-check-icon').classList.remove('hidden');
                setTimeout(function () {
                    document.getElementById('mobile-copy-icon').classList.remove('hidden');
                    document.getElementById('mobile-check-icon').classList.add('hidden');
                }, 2000);
            });
        };

        // Mobile button handlers
        var mobileStartBtn = document.getElementById('mobileStartButton');
        var mobileRestartBtn = document.getElementById('mobileRestartButton');
        var mobileStopBtn = document.getElementById('mobileStopButton');

        if (mobileStartBtn) {
            ;
            mobileStartBtn.addEventListener('click', function () { startButton.click(); });
            ;
        }
        if (mobileRestartBtn) {
            ;
            mobileRestartBtn.addEventListener('click', function () { restartButton.click(); });
            ;
        }
        if (mobileStopBtn) {
            ;
            mobileStopBtn.addEventListener('click', function () { stopButton.click(); });
            ;
        }
    })();

