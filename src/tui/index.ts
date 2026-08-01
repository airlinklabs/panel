import {
  createCliRenderer,
  Box,
  BoxRenderable,
  Text,
  ScrollBoxRenderable,
  TextRenderable,
  TextNodeRenderable,
  type KeyEvent,
  type Renderable,
} from "@opentui/core";
import { watch, openSync, readSync, closeSync, statSync, existsSync, readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { collectStats, panelPid, probe, PANEL_URL, type Stats } from "./stats";

const TUI_DIR = __dirname;
const LOG_DIR = process.env.AIRLINK_LOG_DIR ?? `${TUI_DIR}/../../logs`;
const PANEL_DIR = resolve(TUI_DIR, "../..");
const PANEL_ENTRY = `${PANEL_DIR}/dist/app.js`;
const PANEL_ENV_FILE = `${PANEL_DIR}/.env`;
const LOG_FILES = ["combined.log", "error.log"];
const CODENAME = "Katharos";
const VERSION = readVersion();
const WIDE_MIN_WIDTH = 110;
const SHORT_MAX_HEIGHT = 27;
const BRAND_WIDTH = 58;
const INITIAL_TAIL_LINES = 1000;
const STATS_INTERVAL_MS = 5000;
const HISTORY_LEN = 30;
const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";

const GREEN = "#4ADE80";
const BLUE = "#60A5FA";
const AMBER = "#FFD166";
const RED = "#FF6B6B";
const SPARK_GREEN = "#22C55E";
const TEXT = "#E5E7EB";
const SECONDARY = "#9CA3AF";
const MUTED = "#4B5563";
const DIM = "#6B7280";
const BORDER = "#374151";
const BORDER_FOCUS = "#4ADE80";

function readVersion(): string {
  try {
    return JSON.parse(readFileSync(`${PANEL_DIR}/package.json`, "utf8")).version ?? "dev";
  } catch {
    return "dev";
  }
}

const ART = [
  " █████╗ ██╗██████╗ ██╗     ██╗███╗   ██╗██╗  ██╗",
  "██╔══██╗██║██╔══██╗██║     ██║████╗  ██║██║ ██╔╝",
  "███████║██║██████╔╝██║     ██║██╔██╗ ██║█████╔╝ ",
  "██╔══██║██║██╔══██╗██║     ██║██║╚██╗██║██╔═██╗ ",
  "██║  ██║██║██║  ██║███████╗██║██║ ╚████║██║  ██╗",
  "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝",
];

function logPath(name: string) {
  return `${LOG_DIR}/${name}`;
}

function readTail(name: string, from: number): { lines: string[]; nextOffset: number } {
  const path = logPath(name);
  const size = statSync(path).size;
  if (from > size) from = 0;
  if (from === size) return { lines: [], nextOffset: size };
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - from);
    readSync(fd, buf, 0, buf.length, from);
    const text = buf.toString("utf8");
    const parts = text.split("\n");
    const trailing = parts.pop() ?? "";
    return { lines: parts, nextOffset: size - trailing.length };
  } finally {
    closeSync(fd);
  }
}

function colorForLine(line: string): string {
  if (line.includes("ERROR")) return RED;
  if (line.includes("WARN")) return AMBER;
  if (line.includes("SUCCESS") || line.includes("READY") || line.includes("STARTED")) return GREEN;
  if (line.includes("INFO")) return BLUE;
  return SECONDARY;
}

function fmtBytes(n: number): string {
  if (n >= 2 ** 30) return `${(n / 2 ** 30).toFixed(1)} GB`;
  if (n >= 2 ** 20) return `${(n / 2 ** 20).toFixed(1)} MB`;
  if (n >= 2 ** 10) return `${(n / 2 ** 10).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtDur(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${Math.floor(s)}s`;
}

function sparkline(values: number[], width: number): string {
  if (values.length === 0) return "";
  const win = values.slice(-width);
  const min = Math.min(...win);
  const max = Math.max(...win);
  const range = max - min;
  if (range === 0) return SPARK_BLOCKS[3]!.repeat(win.length);
  let out = "";
  for (const v of win) {
    const idx = Math.min(7, Math.max(0, Math.floor(((v - min) / range) * 8)));
    out += SPARK_BLOCKS[idx]!;
  }
  return out;
}

function bar(pct: number, width = 10): { text: string; fg: string } {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = Math.round((clamped / 100) * width);
  const fg = clamped < 60 ? GREEN : clamped <= 85 ? AMBER : RED;
  return { text: "█".repeat(filled) + "░".repeat(width - filled), fg };
}

function pushCapped(arr: number[], value: number) {
  arr.push(value);
  if (arr.length > HISTORY_LEN) arr.splice(0, arr.length - HISTORY_LEN);
}

function clearChildren(container: Renderable) {
  for (const child of Array.from(container.getChildren() as unknown as Renderable[])) {
    container.remove(child);
  }
}

type CliRenderer = Awaited<ReturnType<typeof createCliRenderer>>;

function renderInto(container: Renderable, renderer: CliRenderer, lines: { text: string; fg: string }[]) {
  clearChildren(container);
  for (const line of lines) {
    container.add(new TextRenderable(renderer, { content: line.text, fg: line.fg, width: "100%" }));
  }
}

async function main() {
  const headless = process.argv.includes("--no-tui") || process.env.NO_TUI === "1";
  if (headless) {
    const child = spawn("node", [`--env-file=${PANEL_ENV_FILE}`, PANEL_ENTRY], {
      cwd: PANEL_DIR,
      stdio: "inherit",
    });
    console.log(`Airlink Panel running (headless) — PID ${child.pid ?? "?"} — Ctrl+C to stop`);
    const exit = () => {
      child.kill("SIGTERM");
      setTimeout(() => process.exit(0), 1500);
    };
    process.on("SIGINT", exit);
    process.on("SIGTERM", exit);
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
    backgroundColor: "#0D1117",
  });

  let panelChild: ChildProcess | null = null;
  let panelStartedAt = 0;
  let panelStopRequested = false;
  let externalMode = false;
  let shuttingDown = false;

  function startPanel() {
    if (panelChild || externalMode) return;
    panelStopRequested = false;
    const child = spawn("node", [`--env-file=${PANEL_ENV_FILE}`, PANEL_ENTRY], {
      cwd: PANEL_DIR,
      stdio: "ignore",
    });
    panelChild = child;
    panelStartedAt = Date.now();
    child.on("error", (error) => {
      panelChild = null;
      console.error("Failed to start panel:", error);
    });
    child.on("exit", (code, signal) => {
      panelChild = null;
      if (shuttingDown || panelStopRequested) return;
      console.error(`Panel exited (code ${code ?? "?"}${signal ? `, ${signal}` : ""}) — press [r] to restart.`);
    });
  }

  function stopPanel() {
    const child = panelChild;
    if (child) {
      panelStopRequested = true;
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      child.once("exit", () => clearTimeout(timer));
      return;
    }
    if (externalMode) {
      const p = panelPid();
      if (p.pid) {
        try {
          process.kill(p.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
      externalMode = false;
    }
  }

  function shutdownPanel() {
    const child = panelChild;
    if (!child) return;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 1500);
  }

  const panelUp = await probe(PANEL_URL, 1500);
  if (panelUp) externalMode = true;
  else startPanel();

  let currentFile = LOG_FILES[0] ?? "combined.log";
  let offsets: Record<string, number> = {};
  let hostDetail = false;
  let daemonDetail = false;
  let shortMode = false;
  let focus: "left" | "right" | "logs" = "left";
  let lastStats: Stats | null = null;
  let pulseUntil = 0;
  const cpuHistory: number[] = [];
  const memHistory: number[] = [];
  const netRxHistory: number[] = [];
  const netTxHistory: number[] = [];

  const logs = new ScrollBoxRenderable(renderer, {
    id: "logs",
    width: "100%",
    height: "100%",
    stickyScroll: true,
    stickyStart: "bottom",
    viewportCulling: true,
    scrollbarOptions: {
      trackOptions: { foregroundColor: "#4B5563", backgroundColor: "#1F2937" },
    },
  });

  const brand = Box(
    {
      id: "brand",
      width: "100%",
      flexDirection: "column",
      paddingX: 1,
      paddingY: 1,
      gap: 1,
      borderStyle: "rounded",
      borderColor: BORDER,
      title: "Airlink Panel",
      titleColor: GREEN,
    },
    Box({ id: "art-box", flexDirection: "column" }, Text({ content: ART.join("\n"), fg: GREEN })),
    Text({ content: `Airlink Panel v${VERSION} · ${CODENAME}`, fg: BLUE })
  );

  const statusPanel = Box(
    {
      id: "status",
      width: "100%",
      height: 7,
      flexDirection: "column",
      gap: 0,
      paddingX: 1,
      borderStyle: "rounded",
      borderColor: BORDER,
      title: "Status",
      titleColor: SECONDARY,
    },
    Text({ content: "Collecting stats…", fg: MUTED })
  );

  const hostPanel = Box(
    {
      id: "host",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      gap: 0,
      paddingX: 1,
      borderStyle: "rounded",
      borderColor: BORDER,
      title: "Host",
      titleColor: SECONDARY,
    },
    Text({ content: "Collecting stats…", fg: MUTED })
  );

  const dbPanel = Box(
    {
      id: "db",
      width: "100%",
      height: 5,
      flexDirection: "column",
      gap: 0,
      paddingX: 1,
      borderStyle: "rounded",
      borderColor: BORDER,
      title: "Database",
      titleColor: SECONDARY,
    },
    Text({ content: "Collecting stats…", fg: MUTED })
  );

  const connectionPanel = Box(
    {
      id: "connection",
      width: "100%",
      height: 7,
      flexDirection: "column",
      gap: 0,
      paddingX: 1,
      borderStyle: "rounded",
      borderColor: BORDER,
      title: "Connection",
      titleColor: SECONDARY,
    },
    Text({ content: "Collecting stats…", fg: MUTED })
  );

  const left = Box(
    { id: "left", width: BRAND_WIDTH, height: "100%", flexDirection: "column", gap: 1 },
    brand,
    statusPanel,
    hostPanel,
    dbPanel
  );
  const right = Box(
    { id: "right", flexGrow: 1, height: "100%", flexDirection: "column", gap: 1 },
    connectionPanel,
    logs
  );
  const main = Box({ id: "main", flexGrow: 1, flexDirection: "row", gap: 1 }, left, right);
  const hintBar = Box({ id: "hint", width: "100%", height: 1, paddingX: 1 });
  const outer = Box(
    { id: "outer", width: "100%", height: "100%", flexDirection: "column" },
    main,
    hintBar
  );
  renderer.root.add(outer);

  const realOuter = renderer.root.getRenderable("outer")!;
  const realMain = realOuter.getRenderable("main")! as unknown as BoxRenderable;
  const realLeft = realMain.getRenderable("left")! as unknown as BoxRenderable;
  const realRight = realMain.getRenderable("right")! as unknown as BoxRenderable;
  const realBrand = realLeft.getRenderable("brand")! as unknown as BoxRenderable;
  const artBox = realBrand.getRenderable("art-box")! as unknown as BoxRenderable;
  const statusBox = realLeft.getRenderable("status")! as unknown as BoxRenderable;
  const hostBox = realLeft.getRenderable("host")! as unknown as BoxRenderable;
  const dbBox = realLeft.getRenderable("db")! as unknown as BoxRenderable;
  const connBox = realRight.getRenderable("connection")! as unknown as BoxRenderable;
  const hintBox = realOuter.getRenderable("hint")! as unknown as BoxRenderable;
  let currentArt: string[] | null = ART;

  function applyLayout() {
    const wide = renderer.width >= WIDE_MIN_WIDTH;
    const short = renderer.height <= SHORT_MAX_HEIGHT;
    shortMode = short;
    realMain.flexDirection = wide ? "row" : "column";
    realLeft.width = wide ? BRAND_WIDTH : "100%";
    realLeft.height = wide ? "100%" : "auto";
    hostBox.flexGrow = wide ? 1 : 0;
    realBrand.gap = wide && !short ? 1 : 0;
    realBrand.paddingY = wide && !short ? 1 : 0;
    artBox.height = wide ? "auto" : 0;
    dbBox.height = short ? 0 : 5;
    dbBox.border = !short;
    if (short) clearChildren(dbBox);
    const artLines = wide ? (short ? null : ART) : null;
    if (currentArt !== artLines) {
      currentArt = artLines;
      clearChildren(artBox);
      if (artLines) {
        artBox.add(new TextRenderable(renderer, { content: artLines.join("\n"), fg: GREEN, width: "100%" }));
      }
    }
    renderHint();
  }

  function clearLogs() {
    clearChildren(logs);
  }

  function fillFromFile(name: string) {
    clearLogs();
    if (!existsSync(logPath(name))) {
      logs.add(
        new TextRenderable(renderer, {
          content: `(no ${name} yet — waiting for panel logs)`,
          fg: DIM,
          width: "100%",
        })
      );
      return;
    }
    offsets[name] = 0;
    const { lines, nextOffset } = readTail(name, 0);
    offsets[name] = nextOffset;
    for (const line of lines.slice(-INITIAL_TAIL_LINES)) {
      logs.add(new TextRenderable(renderer, { content: line, fg: colorForLine(line), width: "100%" }));
    }
  }

  function appendNewLines() {
    if (!existsSync(logPath(currentFile))) return;
    const { lines, nextOffset } = readTail(currentFile, offsets[currentFile] ?? 0);
    offsets[currentFile] = nextOffset;
    for (const line of lines) {
      logs.add(new TextRenderable(renderer, { content: line, fg: colorForLine(line), width: "100%" }));
    }
  }

  function switchFile() {
    const idx = LOG_FILES.indexOf(currentFile);
    currentFile = LOG_FILES[(idx + 1) % LOG_FILES.length] ?? currentFile;
    fillFromFile(currentFile);
    updateLogsTitle();
  }

  function updateLogsTitle() {
    logs.title = `Logs — ${currentFile}${logs.stickyScroll ? "" : " (paused)"}`;
    logs.titleColor = logs.stickyScroll ? SECONDARY : AMBER;
  }

  function dot(online: boolean): string {
    if (!online) return "○";
    if (Date.now() < pulseUntil && Math.floor(Date.now() / 1000) % 2 === 0) return "○";
    return "●";
  }

  function renderStatus(s: Stats) {
    const lines: { text: string; fg: string }[] = [];
    const pOnline = s.panelOnline;
    const pExtra = s.panelPid ? ` · up ${fmtDur(s.panelUptimeSec ?? 0)}` : "";
    lines.push({ text: `${dot(pOnline)} Panel      ${pOnline ? "online" : "offline"}${pExtra}`, fg: pOnline ? GREEN : RED });
    const dOnline = s.daemonOnline;
    lines.push({
      text: `${dot(dOnline)} Daemon     ${dOnline ? "online" : "offline"}${s.daemonName ? ` · ${s.daemonName}` : ""}`,
      fg: dOnline ? GREEN : RED,
    });
    if (s.serverName) {
      const state = s.serverOnline === true ? "running" : s.serverExists === false ? "not installed" : "stopped";
      const name = s.serverName.length > 12 ? s.serverName.slice(0, 11) + "…" : s.serverName;
      lines.push({
        text: `${dot(s.serverOnline === true)} Server     ${name.padEnd(13)} ${state}`,
        fg: s.serverOnline === true ? GREEN : AMBER,
      });
    } else {
      lines.push({ text: "○ Server      none configured", fg: DIM });
    }
    if (daemonDetail) {
      lines.push({ text: `Node ${s.nodeAddr ?? "—"}:${s.nodePort ?? "—"} · key ${s.nodeKeyPrefix ?? "—"}…`, fg: SECONDARY });
      lines.push({
        text: `Daemon RTT ${s.daemonRttMs !== null ? `${s.daemonRttMs} ms` : "—"} · check ${s.lastDaemonCheckAtMs !== null ? `${fmtDur(Math.floor((Date.now() - s.lastDaemonCheckAtMs) / 1000))} ago` : "—"}`,
        fg: SECONDARY,
      });
    } else {
      lines.push({
        text: `Users ${s.users ?? "–"} · Sessions ${s.sessions ?? "–"} · Logins 24h ${s.logins24h ?? "–"}`,
        fg: SECONDARY,
      });
      lines.push({ text: `Errors 24h ${s.errors24h ?? "–"} · Logs ${fmtBytes(s.logBytes)} · DB ${fmtBytes(s.dbBytes ?? 0)}`, fg: SECONDARY });
    }
    renderInto(statusBox, renderer, lines);
  }

  function renderHost(s: Stats) {
    const lines: { text: string; fg: string }[] = [];
    if (s.cpu !== null) {
      const b = bar(s.cpu);
      lines.push({ text: `CPU  ${b.text} ${String(s.cpu).padStart(3)}%`, fg: b.fg });
      if (hostDetail && cpuHistory.length > 0) {
        lines.push({ text: `     ${sparkline(cpuHistory, 14)}`, fg: SPARK_GREEN });
      }
    } else {
      lines.push({ text: "CPU  —", fg: SECONDARY });
    }
    if (s.memUsedGb !== null && s.memTotalGb !== null) {
      const pct = (s.memUsedGb / s.memTotalGb) * 100;
      const b = bar(pct);
      lines.push({ text: `RAM  ${b.text} ${String(Math.round(pct)).padStart(3)}% ${s.memUsedGb}/${s.memTotalGb} GB`, fg: b.fg });
      if (hostDetail && memHistory.length > 0) {
        lines.push({ text: `     ${sparkline(memHistory, 14)}`, fg: SPARK_GREEN });
      }
    } else {
      lines.push({ text: "RAM  —", fg: SECONDARY });
    }
    if (hostDetail && s.swapUsedGb !== null && s.swapTotalGb !== null) {
      const pct = s.swapTotalGb ? (s.swapUsedGb / s.swapTotalGb) * 100 : 0;
      const b = bar(pct);
      lines.push({ text: `Swap ${b.text} ${String(Math.round(pct)).padStart(3)}% ${s.swapUsedGb}/${s.swapTotalGb} GB`, fg: b.fg });
    }
    if (s.diskUsedGb !== null && s.diskTotalGb !== null) {
      const pct = (s.diskUsedGb / s.diskTotalGb) * 100;
      const b = bar(pct);
      lines.push({ text: `Disk ${b.text} ${String(Math.round(pct)).padStart(3)}% ${s.diskUsedGb}/${s.diskTotalGb} GB`, fg: b.fg });
    } else {
      lines.push({ text: "Disk —", fg: SECONDARY });
    }
    lines.push({ text: `Load ${s.load} · Up ${fmtDur(s.sysUptimeSec)}`, fg: SECONDARY });
    renderInto(hostBox, renderer, lines);
  }

  function renderDb(s: Stats) {
    if (shortMode) return;
    const healthy = s.users !== null;
    const lines: { text: string; fg: string }[] = [
      { text: `${healthy ? "●" : "○"} SQLite · ${healthy ? "healthy" : "unavailable"}`, fg: healthy ? GREEN : RED },
    ];
    if (healthy) {
      lines.push({ text: `Size ${fmtBytes(s.dbBytes ?? 0)} · users ${s.users} · sessions ${s.sessions}`, fg: SECONDARY });
      lines.push({ text: `Logins ${s.logins24h} today · Errors 24h ${s.errors24h ?? "–"}`, fg: SECONDARY });
    } else {
      lines.push({ text: "Database file not readable", fg: SECONDARY });
    }
    renderInto(dbBox, renderer, lines);
  }

  function renderConnection(s: Stats) {
    clearChildren(connBox);
    const add = (text: string, fg: string) =>
      connBox.add(new TextRenderable(renderer, { content: text, fg, width: "100%" }));
    add(`RTT Panel → Daemon   ${s.daemonRttMs !== null ? `${s.daemonRttMs} ms` : "—"}`, SECONDARY);
    add(`Node ${s.nodeAddr ?? "—"}:${s.nodePort ?? "—"} · key ${s.nodeKeyPrefix ?? "—"}…`, SECONDARY);
    if (s.nets.length > 0) {
      const n = s.nets[0]!;
      add(`Net  ${n.iface.padEnd(6)} ↓ ${fmtBytes(n.rxBps)}/s  ↑ ${fmtBytes(n.txBps)}/s`, SECONDARY);
      const sparkRow = new TextRenderable(renderer, { width: "100%" });
      const label = new TextNodeRenderable({ fg: SECONDARY });
      label.add(`     ↓ `);
      const rx = new TextNodeRenderable({ fg: BLUE });
      rx.add(sparkline(netRxHistory, 12));
      const sep = new TextNodeRenderable({ fg: SECONDARY });
      sep.add(`  ↑ `);
      const tx = new TextNodeRenderable({ fg: GREEN });
      tx.add(sparkline(netTxHistory, 12));
      sparkRow.add(label);
      sparkRow.add(rx);
      sparkRow.add(sep);
      sparkRow.add(tx);
      connBox.add(sparkRow);
    } else {
      add("Net  — no traffic", SECONDARY);
    }
    const total = s.logins24h !== null ? s.logins24h + (s.errors24h ?? 0) : null;
    add(
      `API  24h ${s.logins24h ?? "–"}/${total ?? "–"} · ${s.apiSuccessRate !== null ? `${s.apiSuccessRate}%` : "—"} · Sessions ${s.sessions ?? "–"}`,
      SECONDARY
    );
  }

  function setFocus(next: "left" | "right" | "logs") {
    focus = next;
    const leftBoxes = shortMode ? [realBrand, statusBox, hostBox] : [realBrand, statusBox, hostBox, dbBox];
    for (const box of leftBoxes) {
      box.borderColor = focus === "left" ? BORDER_FOCUS : BORDER;
    }
    connBox.borderColor = focus === "right" ? BORDER_FOCUS : BORDER;
    logs.borderColor = focus === "logs" ? BORDER_FOCUS : BORDER;
  }

  function renderHint() {
    clearChildren(hintBox);
    const hint = new TextRenderable(renderer, { width: "100%" });
    const wide = renderer.width >= WIDE_MIN_WIDTH;
    const parts: [string, string][] = wide
      ? [
          ["[", GREEN], ["Tab", TEXT], ["] logs", MUTED], [" · ", BORDER],
          ["[", GREEN], ["1", TEXT], ["] left", MUTED], [" · ", BORDER],
          ["[", GREEN], ["2", TEXT], ["] right", MUTED], [" · ", BORDER],
          ["[", GREEN], ["n", TEXT], ["] logs", MUTED], [" · ", BORDER],
          ["[", GREEN], ["↑/↓", TEXT], ["] scroll", MUTED], [" · ", BORDER],
          ["[", GREEN], ["f", TEXT], ["] follow", MUTED], [" · ", BORDER],
          ["[", GREEN], ["c", TEXT], ["] clear", MUTED], [" · ", BORDER],
          ["[", GREEN], ["h", TEXT], ["] host detail", MUTED], [" · ", BORDER],
          ["[", GREEN], ["d", TEXT], ["] daemon detail", MUTED], [" · ", BORDER],
          ["[", GREEN], ["s", TEXT], ["] refresh", MUTED], [" · ", BORDER],
          ["[", GREEN], ["k", TEXT], ["] stop", MUTED], [" · ", BORDER],
          ["[", GREEN], ["r", TEXT], ["] start", MUTED], [" · ", BORDER],
          ["[", GREEN], ["Ctrl+C", TEXT], ["] quit", MUTED],
        ]
      : [
          ["[", GREEN], ["Tab", TEXT], ["] logs", MUTED], [" · ", BORDER],
          ["[", GREEN], ["n", TEXT], ["] focus", MUTED], [" · ", BORDER],
          ["[", GREEN], ["↑/↓", TEXT], ["] scroll", MUTED], [" · ", BORDER],
          ["[", GREEN], ["f", TEXT], ["] follow", MUTED], [" · ", BORDER],
          ["[", GREEN], ["c", TEXT], ["] clear", MUTED], [" · ", BORDER],
          ["[", GREEN], ["h", TEXT], ["] host", MUTED], [" · ", BORDER],
          ["[", GREEN], ["d", TEXT], ["] daemon", MUTED], [" · ", BORDER],
          ["[", GREEN], ["s", TEXT], ["] refresh", MUTED], [" · ", BORDER],
          ["[", GREEN], ["k", TEXT], ["] stop", MUTED], [" · ", BORDER],
          ["[", GREEN], ["r", TEXT], ["] start", MUTED], [" · ", BORDER],
          ["[", GREEN], ["Ctrl+C", TEXT], ["] quit", MUTED],
        ];
    for (const [text, fg] of parts) {
      const node = new TextNodeRenderable({ fg });
      node.add(text);
      hint.add(node);
    }
    hintBox.add(hint);
  }

  const refreshStats = async () => {
    try {
      const stats = await collectStats();
      if (panelChild) {
        stats.panelOnline = true;
        stats.panelPid = panelChild.pid ?? null;
        stats.panelUptimeSec = Math.floor((Date.now() - panelStartedAt) / 1000);
      } else if (panelStopRequested) {
        stats.panelOnline = false;
        stats.panelPid = null;
        stats.panelUptimeSec = null;
      }
      if (lastStats) {
        const changed =
          stats.panelOnline !== lastStats.panelOnline ||
          stats.daemonOnline !== lastStats.daemonOnline ||
          stats.serverOnline !== lastStats.serverOnline;
        if (changed) pulseUntil = Date.now() + 3000;
      }
      if (stats.cpu !== null) pushCapped(cpuHistory, stats.cpu);
      if (stats.memUsedGb !== null && stats.memTotalGb !== null) {
        pushCapped(memHistory, (stats.memUsedGb / stats.memTotalGb) * 100);
      }
      if (stats.nets.length > 0) {
        const topNet = stats.nets[0]!;
        pushCapped(netRxHistory, topNet.rxBps);
        pushCapped(netTxHistory, topNet.txBps);
      }
      lastStats = stats;
      renderStatus(stats);
      renderHost(stats);
      renderDb(stats);
      renderConnection(stats);
    } catch {
      /* keep previous stats if a collection fails */
    }
  };

  applyLayout();
  fillFromFile(currentFile);
  setFocus("left");
  updateLogsTitle();
  void refreshStats();
  const statsTimer = setInterval(() => void refreshStats(), STATS_INTERVAL_MS);

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    switch (key.name) {
      case "tab":
        switchFile();
        break;
      case "1":
        setFocus("left");
        break;
      case "2":
        setFocus("right");
        break;
      case "n":
        setFocus("logs");
        break;
      case "up":
        logs.stickyScroll = false;
        updateLogsTitle();
        logs.scrollBy(-3);
        break;
      case "down":
        logs.stickyScroll = false;
        updateLogsTitle();
        logs.scrollBy(3);
        break;
      case "f":
        logs.stickyScroll = !logs.stickyScroll;
        updateLogsTitle();
        break;
      case "c":
        clearLogs();
        break;
      case "s":
        void refreshStats();
        break;
      case "h":
        hostDetail = !hostDetail;
        if (lastStats) renderHost(lastStats);
        break;
      case "d":
        daemonDetail = !daemonDetail;
        if (lastStats) renderStatus(lastStats);
        break;
      case "k":
        stopPanel();
        break;
      case "r":
        startPanel();
        break;
    }
  });

  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(LOG_DIR, { persistent: false }, (_evt, filename) => {
      if (filename && String(filename) === currentFile) appendNewLines();
    });
  } catch {
    /* log dir may not exist yet */
  }

  renderer.on("resize", () => applyLayout());
  process.on("SIGTERM", () => renderer.destroy());
  process.on("SIGHUP", () => renderer.destroy());
  process.on("SIGINT", () => renderer.destroy());
  renderer.on("destroy", () => {
    clearInterval(statsTimer);
    watcher?.close();
    shuttingDown = true;
    shutdownPanel();
    setTimeout(() => process.exit(0), 2000);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
