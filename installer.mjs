#!/usr/bin/env node
/**
 * Airlink installer front-end with OpenTUI.
 *
 * Requires:
 *   - Bun, or
 *   - Node.js 26.4.0+ with --experimental-ffi
 *
 * Also requires: @opentui/core
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";


const VERSION = "4.0.0-OpenTUI";
const LOG = "/tmp/airlink.log";
const PANEL_REPO = "https://github.com/airlinklabs/panel.git";
const DAEMON_RELEASE_API = "https://api.github.com/repos/airlinklabs/daemon/releases/latest";
const PNPM_STORE = "/root/.pnpm-store";
const PNPM_REGISTRY_DEFAULT = "https://registry.npmjs.org";

const ADDONS = [
  { name: "Modrinth", repo: "https://github.com/airlinklabs/addons.git", branch: "modrinth", key: "modrinth" },
  { name: "Parachute", repo: "https://github.com/airlinklabs/addons.git", branch: "parachute", key: "parachute" },
];

const COLORS = {
  bg: "#0b1020",
  panel: "#10172a",
  panel2: "#111827",
  border: "#26324d",
  border2: "#334155",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#60a5fa",
  accent2: "#22c55e",
  warn: "#f59e0b",
  danger: "#ef4444",
};

const SPINNER = ["-", "\\", "|", "/"];

let Box;
let Text;
let Input;
let Select;
let createCliRenderer;
let InputRenderableEvents;
let SelectRenderableEvents;
let TabSelectRenderable;
let TextAttributes;

async function loadOpenTui() {
  try {
    const OTUI = await import("@opentui/core");
    Box = OTUI.Box;
    Text = OTUI.Text;
    Input = OTUI.Input;
    Select = OTUI.Select;
    createCliRenderer = OTUI.createCliRenderer;
    InputRenderableEvents = OTUI.InputRenderableEvents;
    SelectRenderableEvents = OTUI.SelectRenderableEvents;
    TabSelectRenderable = OTUI.TabSelectRenderable;
    TextAttributes = OTUI.TextAttributes;
  } catch (err) {
    throw new Error(
      "OpenTUI is not installed or could not be loaded. Add it with `bun add @opentui/core` (or install it in the project before running this script).",
    );
  }
}

function nowStamp() {
  return new Date().toISOString().replace("T", " ").replace(/\..+$/, "");
}

function appendLog(line) {
  try {
    fs.appendFileSync(LOG, `[${nowStamp()}] ${line}\n`);
  } catch {}
}

function logInfo(line) {
  appendLog(`INFO: ${line}`);
}

function logWarn(line) {
  appendLog(`WARN: ${line}`);
}

function logError(line) {
  appendLog(`ERROR: ${line}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRoot() {
  return typeof process.geteuid === "function" ? process.geteuid() === 0 : true;
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function quoteShell(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function validPort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function getPrimaryIPv4() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const n of entries || []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return "127.0.0.1";
}

function makeSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function parseOsRelease() {
  const data = fs.readFileSync("/etc/os-release", "utf8");
  const lines = Object.fromEntries(
    data.split("\n").map((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return [null, null];
      const k = line.slice(0, idx);
      const v = line.slice(idx + 1).replace(/^"/, "").replace(/"$/, "");
      return [k, v];
    }).filter(([k]) => k)
  );
  return {
    id: String(lines.ID || "").toLowerCase(),
    versionId: String(lines.VERSION_ID || ""),
  };
}

function detectOs() {
  if (!exists("/etc/os-release")) {
    throw new Error("Cannot detect OS — /etc/os-release missing");
  }
  const { id, versionId } = parseOsRelease();
  let family = "";
  let pkg = "";
  if (["ubuntu", "debian", "linuxmint", "pop", "raspbian"].includes(id)) {
    family = "debian";
    pkg = "apt";
  } else if (["fedora", "centos", "rhel", "rocky", "almalinux", "ol"].includes(id)) {
    family = "redhat";
    pkg = fs.existsSync("/usr/bin/dnf") ? "dnf" : "yum";
  } else if (["arch", "manjaro", "endeavouros"].includes(id)) {
    family = "arch";
    pkg = "pacman";
  } else if (id === "alpine") {
    family = "alpine";
    pkg = "apk";
  } else {
    throw new Error(`Unsupported OS: ${id}. Supported: Ubuntu/Debian/Fedora/RHEL/Arch/Alpine`);
  }
  return { id, versionId, family, pkg };
}

async function execCmd(cmd, {
  cwd = process.cwd(),
  env = {},
  onLine = null,
  quiet = false,
} = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", cmd], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let buffer = "";

    const handle = (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      buffer += text;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part && onLine) onLine(part);
        if (!quiet && part) appendLog(part);
      }
    };

    child.stdout.on("data", handle);
    child.stderr.on("data", handle);

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (buffer) {
        if (onLine) onLine(buffer);
        if (!quiet && buffer) appendLog(buffer);
      }
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error(`Command failed (${code}): ${cmd}\n${stdout}\n${stderr}`));
    });
  });
}

async function fileWriteIfMissing(target, content) {
  if (exists(target)) return false;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, content);
  return true;
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await fsp.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function getLatestNodeLts() {
  try {
    const res = await fetch("https://nodejs.org/dist/index.json", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const lts = data.find((r) => r && r.lts);
    const major = Number(String(lts?.version || "v22.0.0").replace(/^v/, "").split(".")[0]);
    return Number.isFinite(major) ? major : 22;
  } catch (err) {
    logWarn(`Cannot fetch Node index: ${err?.message || err}`);
    return 22;
  }
}

async function selectNpmRegistry() {
  try {
    const res = await fetch("http://ip-api.com/json/?fields=continentCode,countryCode", { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data?.continentCode === "AS") {
      return "https://registry.npmmirror.com";
    }
  } catch {
    logWarn("Registry geolocation unavailable, using npmjs.org");
  }
  return PNPM_REGISTRY_DEFAULT;
}

async function runPkgInstall(pkg, ...names) {
  if (names.length === 0) return;
  const joined = names.map(quoteShell).join(" ");
  if (pkg === "apt") {
    await execCmd(`DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${joined}`);
  } else if (pkg === "dnf" || pkg === "yum") {
    await execCmd(`${pkg} install -y -q ${joined}`);
  } else if (pkg === "pacman") {
    await execCmd(`pacman -Sy --noconfirm --needed ${joined}`);
  } else if (pkg === "apk") {
    await execCmd(`apk add --no-cache -q ${joined}`);
  } else {
    throw new Error(`Unsupported package manager: ${pkg}`);
  }
}

async function ensureDeps(ctx) {
  const deps = ["curl", "wget", "git", "openssl", "unzip"];
  const missing = deps.filter((d) => !commandExists(d));
  if (missing.length) {
    ctx.push(`Installing missing dependencies: ${missing.join(", ")}`);
    await runPkgInstall(ctx.os.pkg, ...missing);
  }
  for (const d of deps) {
    if (!commandExists(d)) throw new Error(`Failed to install dependency: ${d}`);
  }
}

function commandExists(cmd) {
  try {
    fs.accessSync("/bin/sh");
    const res = spawnSync("bash", ["-lc", `command -v ${quoteShell(cmd)} >/dev/null 2>&1`], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function installNode(ctx, major) {
  if (ctx.os.family === "debian") {
    await execCmd(`curl -fsSL https://deb.nodesource.com/setup_${major}.x | bash -`);
    await execCmd(`DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs`);
  } else if (ctx.os.family === "redhat") {
    await execCmd(`curl -fsSL https://rpm.nodesource.com/setup_${major}.x | bash -`);
    await execCmd(`${ctx.os.pkg} install -y -q nodejs`);
  } else if (ctx.os.family === "arch") {
    await execCmd(`pacman -Sy --noconfirm --needed nodejs npm`);
  } else if (ctx.os.family === "alpine") {
    await execCmd(`apk add --no-cache nodejs npm`);
  } else {
    throw new Error(`Unsupported OS family: ${ctx.os.family}`);
  }
}

async function setupNode(ctx) {
  const desiredMajor = await getLatestNodeLts();
  ctx.push(`Latest Node LTS major: ${desiredMajor}`);

  let currentMajor = 0;
  try {
    const out = await execCmd(`node -e "console.log(process.versions.node.split('.')[0])"`, { quiet: true });
    currentMajor = Number(out.stdout.trim() || 0);
  } catch {
    currentMajor = 0;
  }

  if (currentMajor === desiredMajor) {
    ctx.push(`Node.js already on major ${desiredMajor}`);
  } else {
    ctx.push(`Installing Node.js ${desiredMajor}`);
    await installNode(ctx, desiredMajor);
  }

  const registry = await selectNpmRegistry();
  ctx.push(`Using registry: ${registry}`);

  let pnpmPath = null;
  try {
    const out = await execCmd(`command -v pnpm`, { quiet: true });
    pnpmPath = out.stdout.trim();
  } catch {}

  if (!pnpmPath) {
    ctx.push("Installing pnpm");
    await execCmd(`npm install -g pnpm --registry ${quoteShell(registry)} || npm install -g pnpm`);
  }

  await execCmd(`pnpm config set registry ${quoteShell(registry)} || true`);
  await execCmd(`npm config set registry ${quoteShell(registry)} || true`);
}

async function setupDocker(ctx) {
  try {
    await execCmd(`command -v docker`);
    ctx.push("Docker already installed");
    try {
      await execCmd(`systemctl is-active --quiet docker || systemctl enable --now docker`, { quiet: true });
    } catch {}
    return;
  } catch {}

  ctx.push("Installing Docker");
  if (ctx.os.family === "debian" || ctx.os.family === "redhat") {
    await execCmd(`curl -fsSL https://get.docker.com | sh`);
  } else if (ctx.os.family === "arch") {
    await execCmd(`pacman -Sy --noconfirm --needed docker docker-compose`);
  } else if (ctx.os.family === "alpine") {
    await execCmd(`apk add --no-cache docker docker-compose; rc-update add docker boot >/dev/null 2>&1 || true`);
  } else {
    throw new Error(`Unsupported OS family: ${ctx.os.family}`);
  }

  try {
    await execCmd(`systemctl enable --now docker`, { quiet: true });
  } catch {}

  await execCmd(`command -v docker`);
}

async function phasePanelClone(ctx) {
  await fsp.mkdir("/var/www", { recursive: true });
  if (exists("/var/www/panel")) {
    ctx.push("Panel exists — refreshing checkout");
    const tmp = await fsp.mkdtemp("/tmp/al-panel-");
    try {
      await execCmd(`git clone --depth 1 ${quoteShell(PANEL_REPO)} ${quoteShell(tmp)}`);
      if (commandExists("rsync")) {
        await execCmd(`rsync -a --exclude='.env' --exclude='node_modules' --exclude='storage' ${quoteShell(`${tmp}/`)} ${quoteShell("/var/www/panel/")}`);
      } else {
        await execCmd(`cp -a ${quoteShell(tmp)}/. ${quoteShell("/var/www/panel/")}`);
        await execCmd(`rm -rf /var/www/panel/.env /var/www/panel/node_modules /var/www/panel/storage || true`);
      }
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  } else {
    await execCmd(`cd /var/www && git clone --depth 1 ${quoteShell(PANEL_REPO)} panel`);
  }

  if (exists("/var/www/panel/package.json")) {
    try {
      const pkg = await readJson("/var/www/panel/package.json");
      pkg.pnpm ||= {};
      pkg.pnpm.onlyBuiltDependencies = ["@parcel/watcher", "@prisma/client", "@prisma/engines", "prisma"];
      await writeJson("/var/www/panel/package.json", pkg);
    } catch (err) {
      ctx.push(`package.json patch skipped: ${err?.message || err}`);
    }
  }

  try {
    await execCmd(`id www-data >/dev/null 2>&1 && chown -R www-data:www-data /var/www/panel || true`);
  } catch {}
  await execCmd(`chmod -R 755 /var/www/panel || true`);

  if (!exists("/var/www/panel/.env")) {
    const secret = makeSecret(32);
    const serverIp = getPrimaryIPv4();
    const envText = `NAME=${ctx.panel.name}
NODE_ENV=production
URL=http://${serverIp}:${ctx.panel.port}
PORT=${ctx.panel.port}
DATABASE_URL=file:/var/www/panel/storage/dev.db
SESSION_SECRET=${secret}
`;
    await fsp.writeFile("/var/www/panel/.env", envText);
  }
}

async function phasePanelDeps(ctx) {
  if (!exists("/var/www/panel")) throw new Error("Panel directory missing");
  const pnpm = await commandPath("pnpm");
  await execCmd(`NODE_ENV=development ${quoteShell(pnpm)} install --no-frozen-lockfile --store-dir ${quoteShell(PNPM_STORE)} --network-concurrency 16`, { cwd: "/var/www/panel" });
  try {
    await execCmd(`${quoteShell(pnpm)} approve-builds --all || true`, { cwd: "/var/www/panel" });
  } catch {}
  await execCmd(`${quoteShell(pnpm)} add chalk form-data --store-dir ${quoteShell(PNPM_STORE)} || true`, { cwd: "/var/www/panel" });
}

async function phasePanelBuild(ctx) {
  if (!exists("/var/www/panel")) throw new Error("Panel directory missing");
  const pnpm = await commandPath("pnpm");
  await execCmd(`${quoteShell(pnpm)} run migrate:deploy`, { cwd: "/var/www/panel" });
  await execCmd(`${quoteShell(pnpm)} run build`, { cwd: "/var/www/panel" });
}

async function commandPath(cmd) {
  const out = await execCmd(`command -v ${quoteShell(cmd)}`, { quiet: true });
  return out.stdout.trim();
}

async function phasePanelService(ctx) {
  const pnpmBin = await commandPath("pnpm");
  const nodeBinDir = path.dirname(await commandPath("node"));
  const unit = `[Unit]
Description=Airlink Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/panel
EnvironmentFile=/var/www/panel/.env
ExecStart=${pnpmBin} run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=${nodeBinDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
`;
  await fsp.writeFile("/etc/systemd/system/airlink-panel.service", unit);
  await execCmd(`systemctl daemon-reload`);
  await execCmd(`systemctl enable --now airlink-panel`);
  await processAddons(ctx);
}

async function detectPlatform() {
  const kernel = os.platform().toLowerCase();
  const arch = os.arch().toLowerCase();

  let platform = "";
  if (kernel === "linux") platform = "linux";
  else if (kernel === "darwin") platform = "macos";
  else throw new Error(`Unsupported platform: ${kernel}`);

  let archName = "";
  if (arch === "x64" || arch === "amd64") archName = "x64";
  else if (arch === "arm64" || arch === "aarch64") archName = "arm64";
  else throw new Error(`Unsupported architecture: ${arch}`);

  return { platform, arch: archName };
}

async function phaseDaemonDownload(ctx) {
  const { platform, arch } = await detectPlatform();
  ctx.push("Fetching latest daemon release");
  const res = await fetch(DAEMON_RELEASE_API, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Failed to fetch daemon release info (${res.status})`);
  const data = await res.json();
  const tag = data?.tag_name || "unknown";
  ctx.push(`Latest daemon release: ${tag}`);

  const asset = (data.assets || []).find((a) => {
    const name = String(a.name || "");
    return name.startsWith(`airlinkd-${platform}-${arch}-`) && name.endsWith(".zip");
  });
  if (!asset?.browser_download_url) {
    throw new Error(`No daemon binary for ${platform}-${arch} in release ${tag}`);
  }

  const tmp = await fsp.mkdtemp("/tmp/al-daemon-");
  const zipPath = path.join(tmp, "airlinkd.zip");
  try {
    await execCmd(`curl -fsSL --max-time 120 --progress-bar -o ${quoteShell(zipPath)} ${quoteShell(asset.browser_download_url)}`);
    await execCmd(`unzip -o -q ${quoteShell(zipPath)} -d ${quoteShell(tmp)}`);
    if (!exists(path.join(tmp, "airlinkd"))) throw new Error(`Binary airlinkd not found in zip: ${tmp}`);
    await fsp.mkdir("/etc/daemon", { recursive: true });
    await fsp.copyFile(path.join(tmp, "airlinkd"), "/etc/daemon/airlinkd");
    await fsp.chmod("/etc/daemon/airlinkd", 0o755);

    if (!exists("/etc/daemon/.env")) {
      const env = `remote=${ctx.panel.address}
key=${ctx.daemon.key}
port=${ctx.daemon.port}
DEBUG=false
version=1.0.0
environment=production
STATS_INTERVAL=10000
`;
      await fsp.writeFile("/etc/daemon/.env", env);
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

async function phaseDaemonService(ctx) {
  const svc = `[Unit]
Description=Airlink Daemon
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/daemon
EnvironmentFile=/etc/daemon/.env
ExecStart=/etc/daemon/airlinkd
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
  await fsp.writeFile("/etc/systemd/system/airlink-daemon.service", svc);
  await execCmd(`systemctl daemon-reload`);
  await execCmd(`systemctl enable --now airlink-daemon`);
}

async function processAddons(ctx) {
  if (!ctx.addonsChoice || ctx.addonsChoice === "none") return;
  if (!exists("/var/www/panel")) throw new Error("Panel directory missing for addon install");

  let selected = [];
  if (ctx.addonsChoice === "all") {
    selected = ADDONS.slice();
  } else {
    const wanted = ctx.addonsChoice.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    selected = ADDONS.filter((a) => wanted.includes(a.key.toLowerCase()));
  }

  const pnpm = await commandPath("pnpm");
  const dir = "/var/www/panel/storage/addons";
  await fsp.mkdir(dir, { recursive: true });

  for (const addon of selected) {
    const target = path.join(dir, addon.key);
    if (exists(target)) {
      await execCmd(`cd ${quoteShell(target)} && git pull origin ${quoteShell(addon.branch)} || true`);
    } else {
      await execCmd(`git clone --depth 1 --branch ${quoteShell(addon.branch)} ${quoteShell(addon.repo)} ${quoteShell(target)}`);
    }
    await execCmd(`${quoteShell(pnpm)} install --no-frozen-lockfile --store-dir ${quoteShell(PNPM_STORE)}`, { cwd: target });
    await execCmd(`${quoteShell(pnpm)} run build`, { cwd: target });
  }

  try {
    await execCmd(`cd /var/www/panel && npx tailwindcss -i ./public/tw.css -o ./public/styles.css >/dev/null 2>&1 || true`);
  } catch {}
}

async function removePanel() {
  await execCmd(`systemctl stop airlink-panel >/dev/null 2>&1 || true`);
  await execCmd(`systemctl disable airlink-panel >/dev/null 2>&1 || true`);
  await execCmd(`rm -f /etc/systemd/system/airlink-panel.service`);
  await execCmd(`rm -rf /var/www/panel`);
  await execCmd(`systemctl daemon-reload || true`);
}

async function removeDaemon() {
  await execCmd(`systemctl stop airlink-daemon >/dev/null 2>&1 || true`);
  await execCmd(`systemctl disable airlink-daemon >/dev/null 2>&1 || true`);
  await execCmd(`rm -f /etc/systemd/system/airlink-daemon.service`);
  await execCmd(`rm -rf /etc/daemon`);
  await execCmd(`systemctl daemon-reload || true`);
}

async function removeDeps(ctx) {
  if (ctx.os.family === "debian") {
    await execCmd(`DEBIAN_FRONTEND=noninteractive apt-get remove -y nodejs npm docker.io docker-ce docker-ce-cli >/dev/null 2>&1 || true`);
  } else if (ctx.os.family === "redhat") {
    await execCmd(`${ctx.os.pkg} remove -y nodejs npm docker-ce docker-ce-cli >/dev/null 2>&1 || true`);
  } else if (ctx.os.family === "arch") {
    await execCmd(`pacman -R --noconfirm nodejs npm docker >/dev/null 2>&1 || true`);
  } else if (ctx.os.family === "alpine") {
    await execCmd(`apk del nodejs npm docker >/dev/null 2>&1 || true`);
  }
}

async function pingInstallCounter() {
  try {
    await fetch("https://api.counterapi.dev/v2/airlinklabs/installed-air/up", { signal: AbortSignal.timeout(8000) });
  } catch {}
}

function normalizeAddonChoice(choice) {
  if (!choice) return "none";
  const s = choice.trim().toLowerCase();
  if (s === "none" || s === "all") return s;
  const keys = s.split(",").map((x) => x.trim()).filter(Boolean);
  return keys.length ? keys.join(",") : "none";
}

function makeCtx(base = {}) {
  const state = {
    os: null,
    panel: {
      name: "Airlink",
      port: "3000",
      address: "127.0.0.1",
    },
    daemon: {
      port: "3002",
      key: "",
    },
    addonsChoice: "none",
    push: () => {},
    status: () => {},
    task: () => {},
    progress: () => {},
    logLines: [],
    ...base,
  };
  return state;
}

async function askSelect({ title, subtitle, options, defaultIndex = 0 }) {
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    consoleMode: "disabled",
    clearOnShutdown: true,
    exitOnCtrlC: true,
    targetFps: 30,
  });
  try {
    renderer.setTerminalTitle?.(`Airlink Installer — ${title}`);
    const menu = new Select({
      width: Math.min(76, Math.max(44, Math.floor(renderer.width * 0.72))),
      height: Math.min(14, options.length + 2),
      selectedIndex: defaultIndex,
      options: options.map((opt) => ({
        name: opt.name,
        description: opt.description || "",
        value: opt.value,
      })),
      backgroundColor: COLORS.panel,
      selectedBackgroundColor: COLORS.border2,
      selectedTextColor: COLORS.text,
      textColor: COLORS.text,
      descriptionColor: COLORS.muted,
    });

    const frame = Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
        backgroundColor: COLORS.bg,
      },
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border,
          padding: 1,
          flexDirection: "column",
          gap: 1,
          width: "100%",
        },
        Text({ content: "Airlink Installer", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Text({ content: title, fg: COLORS.text }),
        Text({ content: subtitle, fg: COLORS.muted }),
      ),
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border2,
          padding: 1,
          backgroundColor: COLORS.panel,
        },
        menu,
      ),
      Text({ content: "↑/↓ or j/k  •  enter select  •  esc quit", fg: COLORS.muted }),
    );

    renderer.root.add(frame);
    menu.focus();

    const value = await new Promise((resolve, reject) => {
      const cleanup = () => {
        try { renderer.destroy(); } catch {}
      };
      menu.on(SelectRenderableEvents.ITEM_SELECTED, (index, option) => {
        cleanup();
        resolve(option?.value ?? options[index]?.value ?? index);
      });
      renderer.on("destroy", () => {
        reject(new Error("Renderer destroyed"));
      });
    });

    return value;
  } finally {
    try { renderer.destroy(); } catch {}
  }
}

async function askInput({ title, subtitle, placeholder, initial = "", note = "" }) {
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    consoleMode: "disabled",
    clearOnShutdown: true,
    exitOnCtrlC: true,
    targetFps: 30,
  });
  try {
    renderer.setTerminalTitle?.(`Airlink Installer — ${title}`);
    const input = new Input({
      width: Math.min(56, Math.max(30, Math.floor(renderer.width * 0.5))),
      placeholder,
      value: initial,
      backgroundColor: COLORS.panel2,
      focusedBackgroundColor: "#162033",
      textColor: COLORS.text,
      cursorColor: COLORS.accent2,
      maxLength: 256,
    });

    const frame = Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
        backgroundColor: COLORS.bg,
      },
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border,
          padding: 1,
          flexDirection: "column",
          gap: 1,
          width: "100%",
        },
        Text({ content: "Airlink Installer", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Text({ content: title, fg: COLORS.text }),
        Text({ content: subtitle, fg: COLORS.muted }),
      ),
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border2,
          padding: 1,
          flexDirection: "column",
          gap: 1,
          backgroundColor: COLORS.panel,
        },
        Text({ content: note || "Type a value and press Enter.", fg: COLORS.muted }),
        input,
      ),
      Text({ content: "enter confirm  •  esc restore default", fg: COLORS.muted }),
    );

    renderer.root.add(frame);
    input.focus();

    const value = await new Promise((resolve, reject) => {
      const cleanup = () => {
        try { renderer.destroy(); } catch {}
      };
      input.on(InputRenderableEvents.ENTER, (val) => {
        cleanup();
        resolve(String(val ?? ""));
      });
      renderer.on("destroy", () => {
        reject(new Error("Renderer destroyed"));
      });
    });

    return value;
  } finally {
    try { renderer.destroy(); } catch {}
  }
}

async function askConfirm({ title, subtitle, message, defaultYes = true }) {
  const choice = await askSelect({
    title,
    subtitle,
    options: [
      { name: "Yes", description: message, value: true },
      { name: "No", description: "Cancel this action", value: false },
    ],
    defaultIndex: defaultYes ? 0 : 1,
  });
  return Boolean(choice);
}

async function askAddonChoice() {
  const choice = await askSelect({
    title: "Optional addons",
    subtitle: "Choose how addons should be handled.",
    options: [
      { name: "None", description: "Skip addon installation", value: "none" },
      { name: "All", description: "Install every available addon", value: "all" },
      { name: "Custom list", description: "Enter addon keys separated by commas", value: "custom" },
    ],
  });
  if (choice === "custom") {
    const keys = ADDONS.map((a) => `${a.key} (${a.name})`).join(", ");
    const raw = await askInput({
      title: "Custom addon list",
      subtitle: "Use addon keys, comma separated.",
      placeholder: "modrinth,parachute",
      note: `Available keys: ${keys}`,
    });
    return normalizeAddonChoice(raw);
  }
  return choice;
}

async function gatherPanelConfig() {
  const name = await askInput({
    title: "Panel name",
    subtitle: "Displayed in the panel and system summary.",
    placeholder: "Airlink",
    initial: "Airlink",
  });
  let port = "";
  while (true) {
    port = await askInput({
      title: "Panel port",
      subtitle: "Must be between 1 and 65535.",
      placeholder: "3000",
      initial: "3000",
    });
    if (validPort(port)) break;
    await askConfirm({
      title: "Invalid port",
      subtitle: "Try again.",
      message: "That port is not valid.",
      defaultYes: true,
    });
  }
  return { name: name || "Airlink", port };
}

async function gatherDaemonConfig() {
  const address = await askInput({
    title: "Panel address",
    subtitle: "IP address or hostname the daemon should reach.",
    placeholder: "127.0.0.1",
    initial: "127.0.0.1",
  });
  let port = "";
  while (true) {
    port = await askInput({
      title: "Daemon port",
      subtitle: "Must be between 1 and 65535.",
      placeholder: "3002",
      initial: "3002",
    });
    if (validPort(port)) break;
  }
  const key = await askInput({
    title: "Daemon auth key",
    subtitle: "Paste the key from panel > Nodes.",
    placeholder: "",
    initial: "",
    note: "This value is required for daemon registration.",
  });
  return {
    address: address || "127.0.0.1",
    port,
    key,
  };
}

function installTasks(mode) {
  if (mode === "both") {
    return [
      { label: "Check dependencies", run: (ctx) => ensureDeps(ctx) },
      { label: "Install Node.js", run: (ctx) => setupNode(ctx) },
      { label: "Install Docker", run: (ctx) => setupDocker(ctx) },
      { label: "Clone panel", run: (ctx) => phasePanelClone(ctx) },
      { label: "Panel dependencies", run: (ctx) => phasePanelDeps(ctx) },
      { label: "Build panel", run: (ctx) => phasePanelBuild(ctx) },
      { label: "Start panel service", run: (ctx) => phasePanelService(ctx) },
      { label: "Download daemon binary", run: (ctx) => phaseDaemonDownload(ctx) },
      { label: "Start daemon service", run: (ctx) => phaseDaemonService(ctx) },
    ];
  }
  if (mode === "panel") {
    return [
      { label: "Check dependencies", run: (ctx) => ensureDeps(ctx) },
      { label: "Install Node.js", run: (ctx) => setupNode(ctx) },
      { label: "Install Docker", run: (ctx) => setupDocker(ctx) },
      { label: "Clone panel", run: (ctx) => phasePanelClone(ctx) },
      { label: "Panel dependencies", run: (ctx) => phasePanelDeps(ctx) },
      { label: "Build panel", run: (ctx) => phasePanelBuild(ctx) },
      { label: "Start panel service", run: (ctx) => phasePanelService(ctx) },
    ];
  }
  if (mode === "daemon") {
    return [
      { label: "Check dependencies", run: (ctx) => ensureDeps(ctx) },
      { label: "Install Docker", run: (ctx) => setupDocker(ctx) },
      { label: "Download daemon binary", run: (ctx) => phaseDaemonDownload(ctx) },
      { label: "Start daemon service", run: (ctx) => phaseDaemonService(ctx) },
    ];
  }
  if (mode === "deps") {
    return [
      { label: "Check dependencies", run: (ctx) => ensureDeps(ctx) },
      { label: "Install Node.js", run: (ctx) => setupNode(ctx) },
      { label: "Install Docker", run: (ctx) => setupDocker(ctx) },
    ];
  }
  if (mode === "addons") {
    return [
      { label: "Check dependencies", run: (ctx) => ensureDeps(ctx) },
      { label: "Install addons", run: (ctx) => processAddons(ctx) },
    ];
  }
  if (mode === "remove-panel") {
    return [{ label: "Removing panel", run: () => removePanel() }];
  }
  if (mode === "remove-daemon") {
    return [{ label: "Removing daemon", run: () => removeDaemon() }];
  }
  if (mode === "remove-all") {
    return [
      { label: "Removing panel", run: () => removePanel() },
      { label: "Removing daemon", run: () => removeDaemon() },
      { label: "Removing dependencies", run: (ctx) => removeDeps(ctx) },
    ];
  }
  throw new Error(`Unknown mode: ${mode}`);
}

async function runProgress(mode, ctx) {
  const tasks = installTasks(mode);
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    consoleMode: "disabled",
    clearOnShutdown: true,
    exitOnCtrlC: true,
    targetFps: 30,
    backgroundColor: COLORS.bg,
  });

  try {
    renderer.setTerminalTitle?.(`Airlink Installer — ${mode}`);
    const taskLines = tasks.map((t) => `[ ] ${t.label}`);
    const taskText = Text({ content: taskLines.join("\n"), fg: COLORS.text });
    const statusText = Text({ content: "Preparing...", fg: COLORS.warn });
    const logText = Text({ content: "", fg: COLORS.muted });
    const spinnerText = Text({ content: "-", fg: COLORS.accent2 });
    const pctText = Text({ content: "0%", fg: COLORS.accent });

    const frame = Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
        backgroundColor: COLORS.bg,
      },
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border,
          padding: 1,
          flexDirection: "column",
          gap: 1,
        },
        Text({ content: "Airlink Installer", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Text({ content: `Version ${VERSION}`, fg: COLORS.text }),
        Text({ content: `Mode: ${mode}`, fg: COLORS.muted }),
      ),
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border2,
          padding: 1,
          flexDirection: "column",
          gap: 1,
          backgroundColor: COLORS.panel,
        },
        Text({ content: "Tasks", fg: COLORS.text, attributes: TextAttributes.BOLD }),
        taskText,
      ),
      Box(
        {
          borderStyle: "rounded",
          borderColor: COLORS.border2,
          padding: 1,
          flexDirection: "column",
          gap: 1,
          backgroundColor: COLORS.panel2,
          flexGrow: 1,
        },
        Box(
          { flexDirection: "row", justifyContent: "space-between" },
          Text({ content: "Status", fg: COLORS.text, attributes: TextAttributes.BOLD }),
          Text({ content: " ", fg: COLORS.muted }),
        ),
        statusText,
        Text({ content: "Log tail", fg: COLORS.text, attributes: TextAttributes.BOLD }),
        logText,
      ),
      Box(
        { flexDirection: "row", justifyContent: "space-between" },
        Text({ content: "Running...", fg: COLORS.muted }),
        Box(
          { flexDirection: "row", gap: 1 },
          Text({ content: "Spinner", fg: COLORS.muted }),
          spinnerText,
          Text({ content: "Progress", fg: COLORS.muted }),
          pctText,
        ),
      ),
    );

    renderer.root.add(frame);
    renderer.requestLive?.();

    const push = (line) => {
      if (!line) return;
      ctx._logs.push(line);
      if (ctx._logs.length > 10) ctx._logs = ctx._logs.slice(-10);
      logText.content = ctx._logs.join("\n");
    };

    ctx.push = push;
    ctx.status = (line) => {
      statusText.content = line;
    };
    ctx.task = (idx, line) => {
      const next = tasks.map((t, i) => `${i < idx ? "[✓]" : i === idx ? "[>]" : "[ ]"} ${t.label}`);
      taskText.content = next.join("\n");
      pctText.content = `${Math.floor((idx / tasks.length) * 100)}%`;
      statusText.content = line;
    };
    ctx.progress = (pct) => {
      pctText.content = `${pct}%`;
    };

    let spin = 0;
    const timer = setInterval(() => {
      spinnerText.content = SPINNER[spin % SPINNER.length];
      spin += 1;
    }, 120);

    try {
      for (let i = 0; i < tasks.length; i++) {
        ctx.task(i, `Working on: ${tasks[i].label}`);
        await tasks[i].run(ctx);
        taskText.content = tasks.map((t, idx) => `${idx <= i ? "[✓]" : "[ ]"} ${t.label}`).join("\n");
        statusText.content = `Done: ${tasks[i].label}`;
      }
      pctText.content = "100%";
      statusText.content = "Installation complete";
      await pingInstallCounter();
      await sleep(800);
    } finally {
      clearInterval(timer);
      renderer.dropLive?.();
    }
  } catch (err) {
    logError(err?.stack || err?.message || String(err));
    throw err;
  } finally {
    try { renderer.destroy(); } catch {}
  }
}

async function viewLogs() {
  try {
    await execCmd(`command -v less`);
    await execCmd(`less ${quoteShell(LOG)}`);
  } catch {
    if (exists(LOG)) {
      process.stdout.write(await fsp.readFile(LOG, "utf8"));
    } else {
      console.log("No log file found.");
    }
  }
}

async function reviewSummary(ctx, mode) {
  const lines = [
    `Mode: ${mode}`,
    `Panel name: ${ctx.panel.name}`,
    `Panel port: ${ctx.panel.port}`,
  ];
  if (mode !== "panel" && mode !== "deps") {
    lines.push(`Panel address: ${ctx.panel.address}`);
    lines.push(`Daemon port: ${ctx.daemon.port}`);
  }
  if (mode === "both" || mode === "panel" || mode === "addons") {
    lines.push(`Addons: ${ctx.addonsChoice || "none"}`);
  }
  lines.push("");
  lines.push("Proceed with these settings?");
  return await askConfirm({
    title: "Review settings",
    subtitle: "Double-check the final installer configuration.",
    message: lines.join("\n"),
    defaultYes: true,
  });
}

async function interactiveMain() {
  const mainChoice = await askSelect({
    title: "Main menu",
    subtitle: "Pick what Airlink should do.",
    options: [
      { name: "Install Panel + Daemon", description: "Full stack install with services", value: "both" },
      { name: "Install Panel only", description: "Panel, Node.js, Docker, and service", value: "panel" },
      { name: "Install Daemon only", description: "Daemon binary and service", value: "daemon" },
      { name: "Install Addons only", description: "Build and attach addons for an existing panel", value: "addons" },
      { name: "Setup dependencies only", description: "Node.js, Docker, and base tools", value: "deps" },
      { name: "Remove Panel", description: "Stop and delete the panel", value: "remove-panel" },
      { name: "Remove Daemon", description: "Stop and delete the daemon", value: "remove-daemon" },
      { name: "Remove everything", description: "Remove panel, daemon, and dependencies", value: "remove-all" },
      { name: "View logs", description: `Open ${LOG}`, value: "logs" },
      { name: "Exit", description: "Close the installer", value: "exit" },
    ],
  });

  if (mainChoice === "exit") return;
  if (mainChoice === "logs") {
    await viewLogs();
    return;
  }

  const ctx = makeCtx({ _logs: [] });
  ctx.os = detectOs();
  appendLog(`=== Airlink Installer ${VERSION} started ===`);
  appendLog(`Detected OS: ${ctx.os.id} ${ctx.os.versionId} (${ctx.os.family})`);

  if (mainChoice === "both" || mainChoice === "panel") {
    ctx.panel = {
      ...ctx.panel,
      ...(await gatherPanelConfig()),
    };
  }

  if (mainChoice === "both" || mainChoice === "daemon") {
    ctx.daemon = {
      ...ctx.daemon,
      ...(await gatherDaemonConfig()),
    };
  }

  if (mainChoice === "both" || mainChoice === "panel" || mainChoice === "addons") {
    ctx.addonsChoice = await askAddonChoice();
  }

  if (mainChoice === "remove-panel" || mainChoice === "remove-daemon" || mainChoice === "remove-all") {
    const ok = await askConfirm({
      title: "Confirm removal",
      subtitle: "This action cannot be undone.",
      message: mainChoice === "remove-all"
        ? "Remove panel, daemon, and dependencies?"
        : mainChoice === "remove-panel"
          ? "Remove the panel?"
          : "Remove the daemon?",
      defaultYes: false,
    });
    if (!ok) return;
  } else {
    const ok = await reviewSummary(ctx, mainChoice);
    if (!ok) return;
  }

  switch (mainChoice) {
    case "both":
    case "panel":
    case "daemon":
    case "addons":
    case "deps":
    case "remove-panel":
    case "remove-daemon":
    case "remove-all":
      await runProgress(mainChoice, ctx);
      break;
    default:
      break;
  }

  if (mainChoice === "both" || mainChoice === "panel") {
    console.log("");
    console.log(`Panel: http://${getPrimaryIPv4()}:${ctx.panel.port}`);
  }
  if (mainChoice === "both" || mainChoice === "daemon") {
    console.log(`Daemon port: ${ctx.daemon.port}`);
  }
  console.log(`Logs: ${LOG}`);
}

async function main() {
  if (!isRoot()) {
    console.error("Run as root or with sudo.");
    process.exit(1);
  }

  try {
    await fsp.mkdir(path.dirname(LOG), { recursive: true });
    await fsp.appendFile(LOG, "");
  } catch {}

  try {
    await loadOpenTui();
    await interactiveMain();
  } catch (err) {
    logError(err?.stack || err?.message || String(err));
    console.error("");
    console.error(`error: ${err?.message || err}`);
    console.error(`log: ${LOG}`);
    process.exitCode = 1;
  }
}

await main();
