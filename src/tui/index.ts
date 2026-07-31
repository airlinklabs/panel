import {
  createCliRenderer,
  Box,
  BoxRenderable,
  Text,
  ScrollBoxRenderable,
  TextRenderable,
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
const BRAND_WIDTH = 56;
const INITIAL_TAIL_LINES = 1000;
const STATS_INTERVAL_MS = 5000;

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
  if (line.includes("ERROR")) return "#FF6B6B";
  if (line.includes("WARN")) return "#FFD166";
  if (line.includes("INFO")) return "#7CB7FF";
  return "#9CA3AF";
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

function statLines(stats: Stats): { text: string; fg: string }[] {
  const lines: { text: string; fg: string }[] = [];
  const panelState = stats.panelOnline ? "online" : "offline";
  const panelExtra = stats.panelPid ? ` · up ${fmtDur(stats.panelUptimeSec ?? 0)}` : "";
  lines.push({
    text: `● Panel       ${panelState}${panelExtra}`,
    fg: stats.panelOnline ? "#4ADE80" : "#FF6B6B",
  });
  lines.push({
    text: `● Daemon      ${stats.daemonOnline ? "online" : "offline"}${stats.daemonName ? ` (${stats.daemonName})` : ""}`,
    fg: stats.daemonOnline ? "#4ADE80" : "#FF6B6B",
  });
  if (stats.serverName) {
    const state =
      stats.serverOnline === true ? "running" : stats.serverExists === false ? "not installed" : "stopped";
    const name = stats.serverName.length > 11 ? stats.serverName.slice(0, 10) + "…" : stats.serverName;
    lines.push({
      text: `● ${name.padEnd(11)} ${state}`,
      fg: stats.serverOnline === true ? "#4ADE80" : "#FFD166",
    });
  } else {
    lines.push({ text: "● Server      none configured", fg: "#6B7280" });
  }
  if (stats.users !== null && stats.sessions !== null && stats.logins24h !== null) {
    lines.push({
      text: `Users ${stats.users} · Sessions ${stats.sessions} · Logins 24h ${stats.logins24h}`,
      fg: "#9CA3AF",
    });
  } else {
    lines.push({ text: "Database      unavailable", fg: "#FF6B6B" });
  }
  lines.push({
    text: `CPU ${stats.cpu ?? "–"}% · RAM ${stats.memUsedGb ?? "–"}/${stats.memTotalGb ?? "–"} GB`,
    fg: "#9CA3AF",
  });
  lines.push({
    text: `Disk ${stats.diskUsedGb}/${stats.diskTotalGb} GB (${Math.round(((stats.diskUsedGb ?? 0) / (stats.diskTotalGb ?? 1)) * 100)}%)`,
    fg: "#9CA3AF",
  });
  lines.push({ text: `Load ${stats.load} · Up ${fmtDur(stats.sysUptimeSec)}`, fg: "#9CA3AF" });
  lines.push({
    text: `Errors 24h ${stats.errors24h ?? "–"} · Logs ${fmtBytes(stats.logBytes)} · DB ${fmtBytes(stats.dbBytes ?? 0)}`,
    fg: "#9CA3AF",
  });
  return lines;
}

type CliRenderer = Awaited<ReturnType<typeof createCliRenderer>>;

function renderStats(container: Renderable, renderer: CliRenderer, stats: Stats) {
  for (const child of Array.from(container.getChildren() as unknown as Renderable[])) {
    container.remove(child);
  }
  for (const line of statLines(stats)) {
    container.add(new TextRenderable(renderer, { content: line.text, fg: line.fg, width: "100%" }));
  }
}

async function main() {
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

  function clearLogs() {
    for (const child of Array.from(logs.getChildren() as unknown as Renderable[])) {
      logs.remove(child);
    }
  }

  function fillFromFile(name: string) {
    clearLogs();
    if (!existsSync(logPath(name))) {
      logs.add(
        new TextRenderable(renderer, {
          content: `(no ${name} yet — waiting for panel logs)`,
          fg: "#6B7280",
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

   // ── Brand panel (persistent; properties mutated on resize) ──────────────
   const brand = Box(
     {
       id: "brand",
       width: BRAND_WIDTH,
       height: "100%",
       flexDirection: "column",
       paddingX: 1,
       paddingY: 1,
       gap: 1,
       borderStyle: "rounded",
       borderColor: "#374151",
       title: "Airlink Panel",
       titleColor: "#4ADE80",
     },
     Box({ id: "art-box", flexDirection: "column" }, Text({ content: ART.join("\n"), fg: "#4ADE80" })),
     Text({ content: `Codename: ${CODENAME}  ·  v${VERSION}`, fg: "#60A5FA" }),
     Box(
       { id: "stats-box", flexDirection: "column", gap: 0 },
       Text({ content: "Collecting stats…", fg: "#6B7280" })
     ),
     Text({ content: "[Tab] logs · [k] stop · [r] start · [Ctrl+C] quit", fg: "#4B5563" })
   );

  const logsWrap = Box({ id: "logs-wrap", flexGrow: 1, flexDirection: "column" }, logs);
  const outer = Box(
    { id: "outer", width: "100%", height: "100%", flexDirection: "row", gap: 1 },
    brand,
    logsWrap
  );
  renderer.root.add(outer);

  const realOuter = renderer.root.getRenderable("outer")!;
  const realBrand = realOuter.getRenderable("brand")!;
  const statsBox = realBrand.getRenderable("stats-box")!;
  const realArt = realBrand.getRenderable("art-box")! as unknown as BoxRenderable;
  let currentArt: string[] | null = ART;

  function applyLayout() {
    const wide = renderer.width >= WIDE_MIN_WIDTH;
    const short = renderer.height <= SHORT_MAX_HEIGHT;
    realOuter.flexDirection = wide ? "row" : "column";
    realBrand.width = wide ? BRAND_WIDTH : "100%";
    realBrand.height = wide ? "100%" : "auto";
    const artLines = wide ? (short ? ART.slice(0, 3) : ART) : null;
    if (currentArt !== artLines) {
      currentArt = artLines;
      for (const child of Array.from(realArt.getChildren() as unknown as Renderable[])) {
        realArt.remove(child);
      }
      if (artLines) {
        realArt.add(new TextRenderable(renderer, { content: artLines.join("\n"), fg: "#4ADE80", width: "100%" }));
      }
    }
  }

  function switchFile() {
    const idx = LOG_FILES.indexOf(currentFile);
    currentFile = LOG_FILES[(idx + 1) % LOG_FILES.length] ?? currentFile;
    fillFromFile(currentFile);
  }

  applyLayout();
  fillFromFile(currentFile);

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
      renderStats(statsBox, renderer, stats);
    } catch (error) {
      // keep previous stats if a collection fails
    }
  };
  void refreshStats();
  const statsTimer = setInterval(() => void refreshStats(), STATS_INTERVAL_MS);

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "tab") switchFile();
    else if (key.name === "k") stopPanel();
    else if (key.name === "r") startPanel();
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
