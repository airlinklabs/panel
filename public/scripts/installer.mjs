#!/usr/bin/env node

/**
 * installer.mjs — Airlink full-stack installer.
 *
 * Installs panel + daemon (or either alone) on a fresh Linux host.
 * Interactive TUI or non-interactive via CLI flags.
 *
 * Commands (non-interactive):
 *   node public/scripts/installer.mjs install              # both panel + daemon
 *   node public/scripts/installer.mjs install --panel-only
 *   node public/scripts/installer.mjs install --daemon-only
 *   node public/scripts/installer.mjs install --name "My Panel" --port 3000
 *   node public/scripts/installer.mjs remove               # remove everything
 *   node public/scripts/installer.mjs remove --panel-only
 *   node public/scripts/installer.mjs remove --daemon-only
 *   node public/scripts/installer.mjs logs
 *
 * Interactive (no args):
 *   node public/scripts/installer.mjs
 */

import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  chmodSync,
  mkdtempSync,
  appendFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

// ---
// Constants
// ---

const VERSION = "3.2.0-Stable";
const LOG_PATH = "/tmp/airlink.log";
const PANEL_REPO = "https://github.com/airlinklabs/panel.git";
const DAEMON_RELEASE_API =
  "https://api.github.com/repos/airlinklabs/daemon/releases/latest";

const ADDONS = [
  {
    name: "Modrinth",
    repo: "https://github.com/airlinklabs/addons.git",
    branch: "modrinth",
    dir: "modrinth",
  },
  {
    name: "Parachute",
    repo: "https://github.com/airlinklabs/addons.git",
    branch: "parachute",
    dir: "parachute",
  },
];

// ---
// Terminal helpers
// ---

const TTY = process.stdout.isTTY;
import chalk from "chalk";
import boxen from "boxen";
const C = {
  reset: "",
  bold: TTY ? chalk.bold("") : "",
  dim: TTY ? chalk.dim("") : "",
  rev: "",
  green: TTY ? chalk.green("") : "",
  red: TTY ? chalk.red("") : "",
  gray: TTY ? chalk.gray("") : "",
  cyan: TTY ? chalk.cyan("") : "",
  yellow: TTY ? chalk.yellow("") : "",
  hideCur: TTY ? "\x1b[?25l" : "",
  showCur: TTY ? "\x1b[?25h" : "",
  clear: TTY ? "\x1b[2J\x1b[H" : "",
};

function logWrite(line) {
  const ts = new Date().toISOString().slice(11, 19);
  try {
    appendFileSync(LOG_PATH, `[${ts}] ${line}\n`);
  } catch {
    /* best effort */
  }
}

function die(msg) {
  process.stdout.write(`${C.showCur}`);
  process.stdout.write(`${C.clear}`);
  console.error(`\n  ${C.bold}error:${C.reset} ${msg}\n`);
  logWrite(`ERROR: ${msg}`);
  process.exit(1);
}

// ---
// ANSI helpers
// ---

function moveTo(row, col) {
  process.stdout.write(`\x1b[${row};${col}H`);
}

// ---
// Logging
// ---

function logInfo(msg) {
  logWrite(`INFO: ${msg}`);
}
function logOk(msg) {
  logWrite(`OK: ${msg}`);
}
function logWarn(msg) {
  logWrite(`WARN: ${msg}`);
}
function logError(msg) {
  logWrite(`ERROR: ${msg}`);
}

// ---
// TUI state
// ---

let termRows = 24;
let termCols = 80;
let tuiActive = false;
let installing = false;

function measureTerm() {
  termRows = process.stdout.rows || 24;
  termCols = process.stdout.columns || 80;
  if (termRows < 18) {
    termRows = 18;
  }
  if (termCols < 60) {
    termCols = 60;
  }
}

function tuiInit() {
  measureTerm();
  process.stdout.write("\x1b[?1049h"); // alt screen
  process.stdout.write(C.hideCur);
  tuiActive = true;
  process.on("SIGINT", () => {
    tuiCleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    tuiCleanup();
    process.exit(0);
  });
}

function tuiCleanup() {
  if (!tuiActive) {
    return;
  }
  tuiActive = false;
  process.stdout.write(C.showCur);
  process.stdout.write("\x1b[?1049l"); // restore screen
}

// ---
// TUI drawing primitives
// ---

function tuiBox(row, col, w, h, title = "") {
  const inner = w - 2;
  moveTo(row, col);

  if (title) {
    let t = title;
    if (t.length + 4 > inner) {
      t = t.slice(0, inner - 4);
    }
    const dashes = inner - t.length - 2;
    const left = Math.floor(dashes / 2);
    const right = dashes - left;
    let line = "+";
    if (left > 0) {
      line += " ".repeat(left).replace(/ /g, "-");
    }
    line += ` ${C.bold}${t}${C.reset} `;
    if (right > 0) {
      line += " ".repeat(right).replace(/ /g, "-");
    }
    line += "+";
    process.stdout.write(line);
  } else {
    process.stdout.write(`+${"-".repeat(inner)}+`);
  }

  for (let r = 1; r < h - 1; r++) {
    moveTo(row + r, col);
    process.stdout.write(`|${" ".repeat(inner)}|`);
  }

  moveTo(row + h - 1, col);
  process.stdout.write(`+${"-".repeat(inner)}+`);
}

function tuiHline(row, col, w) {
  moveTo(row, col);
  process.stdout.write(`+${"-".repeat(w - 2)}+`);
}

// ---
// Key reading (raw mode)
// ---

let lastKey = "";

function readKey() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf-8");

    const handler = (data) => {
      if (stdin.setRawMode) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.removeListener("data", handler);
      stdin.pause();

      const k = data;
      if (k === "\x1b") {
        lastKey = "ESC";
      } else if (k === "\x1b[A") {
        lastKey = "UP";
      } else if (k === "\x1b[B") {
        lastKey = "DOWN";
      } else if (k === "\x1b[C") {
        lastKey = "RIGHT";
      } else if (k === "\x1b[D") {
        lastKey = "LEFT";
      } else if (k === "" || k === "\n" || k === "\r") {
        lastKey = "ENTER";
      } else if (k === "\x7f" || k === "\b") {
        lastKey = "BACKSPACE";
      } else if (k === " ") {
        lastKey = "SPACE";
      } else {
        lastKey = k;
      }
      resolve();
    };

    stdin.on("data", handler);
  });
}

// ---
// TUI menu
// ---

let tuiResult = 0;

async function tuiMenu(title, items) {
  measureTerm();
  const count = items.length;
  let selected = 0;

  const maxLen = Math.max(...items.map((s) => s.length));
  let boxW = Math.floor(termCols * 0.6);
  if (boxW < maxLen + 10) {
    boxW = maxLen + 10;
  }
  if (boxW < 60) {
    boxW = 60;
  }
  if (boxW > termCols - 4) {
    boxW = termCols - 4;
  }

  const bannerH = 7;
  const gap = 1;
  const boxH = count + 6;
  const totalH = bannerH + gap + boxH;
  let boxR = Math.floor((termRows - totalH) / 2) + bannerH + gap;
  if (boxR < bannerH + gap + 1) {
    boxR = bannerH + gap + 1;
  }
  const boxC = Math.floor((termCols - boxW) / 2);
  const inner = boxW - 2;

  while (true) {
    process.stdout.write(C.clear);
    tuiBox(boxR, boxC, boxW, boxH, title);

    moveTo(boxR + 1, boxC + 2);
    process.stdout.write(
      `${C.dim}${"arrows/jk move  enter select  0-9 hotkey  esc/q quit".padEnd(inner)}${C.reset}`,
    );

    tuiHline(boxR + 2, boxC, boxW);

    for (let i = 0; i < count; i++) {
      moveTo(boxR + 3 + i, boxC + 1);
      const label = ` [${i}] ${items[i]}`;
      if (i === selected) {
        process.stdout.write(`${C.rev}${label.padEnd(inner)}${C.reset}`);
      } else {
        process.stdout.write(label.padEnd(inner));
      }
    }

    moveTo(boxR + boxH - 2, boxC + 2);
    process.stdout.write(`${C.dim}v${VERSION}${C.reset}`);

    await readKey();

    if (lastKey === "UP" || lastKey === "k") {
      if (selected > 0) {
        selected--;
      }
    } else if (lastKey === "DOWN" || lastKey === "j") {
      if (selected < count - 1) {
        selected++;
      }
    } else if (lastKey === "ENTER") {
      tuiResult = selected;
      return true;
    } else if (lastKey === "ESC" || lastKey === "q" || lastKey === "Q") {
      if (!installing) {
        return false;
      }
    } else if (/^[0-9]$/.test(lastKey)) {
      const n = parseInt(lastKey, 10);
      if (n < count) {
        tuiResult = n;
        return true;
      }
    }
  }
}

// ---
// TUI checklist
// ---

let tuiMulti = "";

async function tuiChecklist(title, items) {
  measureTerm();
  const count = items.length;
  let cursor = 0;
  const checked = new Array(count).fill(false);

  const maxLen = Math.max(...items.map((s) => s.length));
  let boxW = maxLen + 14;
  if (boxW < 50) {
    boxW = 50;
  }
  if (boxW > termCols - 4) {
    boxW = termCols - 4;
  }

  const boxH = count + 6;
  const boxR = Math.floor((termRows - boxH) / 2);
  const boxC = Math.floor((termCols - boxW) / 2);
  const inner = boxW - 2;

  while (true) {
    process.stdout.write(C.clear);
    tuiBox(boxR, boxC, boxW, boxH, title);

    moveTo(boxR + 1, boxC + 2);
    process.stdout.write(
      `${C.dim}${"space/num toggle  enter confirm  q skip".padEnd(inner)}${C.reset}`,
    );

    tuiHline(boxR + 2, boxC, boxW);

    for (let i = 0; i < count; i++) {
      moveTo(boxR + 3 + i, boxC + 1);
      const num = i + 1;
      const mark = checked[i] ? "[x]" : "[ ]";
      const label = ` [${num}] ${mark} ${items[i]}`;
      if (i === cursor) {
        process.stdout.write(`${C.rev}${label.padEnd(inner)}${C.reset}`);
      } else {
        process.stdout.write(label.padEnd(inner));
      }
    }

    await readKey();

    if (lastKey === "UP" || lastKey === "k") {
      if (cursor > 0) {
        cursor--;
      }
    } else if (lastKey === "DOWN" || lastKey === "j") {
      if (cursor < count - 1) {
        cursor++;
      }
    } else if (lastKey === "SPACE") {
      checked[cursor] = !checked[cursor];
    } else if (/^[0-9]$/.test(lastKey)) {
      const n = parseInt(lastKey, 10);
      if (n < count) {
        checked[n] = !checked[n];
        cursor = n;
      }
    } else if (lastKey === "ENTER") {
      tuiMulti = checked
        .map((c, i) => (c ? String(i) : null))
        .filter(Boolean)
        .join(" ");
      return true;
    } else if (lastKey === "ESC" || lastKey === "q" || lastKey === "Q") {
      if (!installing) {
        tuiMulti = "";
        return false;
      }
    }
  }
}

// ---
// TUI text input
// ---

let tuiInput = "";

async function tuiTextInput(prompt, defaultValue = "", errorMsg = "") {
  measureTerm();
  let value = defaultValue;

  let boxW = Math.floor(termCols / 2) + 10;
  if (boxW < 50) {
    boxW = 50;
  }
  if (boxW > termCols - 4) {
    boxW = termCols - 4;
  }

  let boxH = 9;
  if (errorMsg) {
    boxH = 10;
  }
  const boxR = Math.floor((termRows - boxH) / 2);
  const boxC = Math.floor((termCols - boxW) / 2);
  const inner = boxW - 2;
  const fieldW = boxW - 8;

  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
  }
  process.stdout.write(C.showCur);

  while (true) {
    process.stdout.write(C.clear);
    tuiBox(boxR, boxC, boxW, boxH, "Input");

    moveTo(boxR + 1, boxC + 3);
    process.stdout.write(prompt.padEnd(inner));

    if (errorMsg) {
      moveTo(boxR + 2, boxC + 3);
      process.stdout.write(`${C.red}${errorMsg.padEnd(inner)}${C.reset}`);
    }

    const fieldRow = boxR + 4;
    moveTo(fieldRow, boxC + 3);
    process.stdout.write(`+${"-".repeat(fieldW)}+`);

    moveTo(fieldRow + 1, boxC + 3);
    let display = value;
    if (display.length > fieldW - 2) {
      display = display.slice(-(fieldW - 2));
    }
    process.stdout.write(`| ${display.padEnd(fieldW - 2)} |`);

    moveTo(fieldRow + 2, boxC + 3);
    process.stdout.write(`+${"-".repeat(fieldW)}+`);

    moveTo(boxR + boxH - 2, boxC + 3);
    process.stdout.write(
      `${C.dim}${"esc = restore default   enter = confirm".padEnd(inner)}${C.reset}`,
    );

    let cursorX = boxC + 5 + value.length;
    if (cursorX > boxC + 3 + fieldW - 1) {
      cursorX = boxC + 3 + fieldW - 1;
    }
    moveTo(fieldRow + 1, cursorX);

    await readKey();

    if (lastKey === "ENTER") {
      tuiInput = value;
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdout.write(C.hideCur);
      return;
    } else if (lastKey === "BACKSPACE") {
      if (value.length > 0) {
        value = value.slice(0, -1);
      }
    } else if (lastKey === "ESC") {
      value = defaultValue;
    } else if (lastKey.length === 1 && lastKey >= " ") {
      value += lastKey;
    }
  }
}

// ---
// TUI confirm dialog
// ---

async function tuiConfirm(prompt) {
  measureTerm();
  let selected = 0;

  const boxW = Math.min(52, termCols - 4);
  const boxH = 7;
  const boxR = Math.floor((termRows - boxH) / 2);
  const boxC = Math.floor((termCols - boxW) / 2);
  const inner = boxW - 2;

  while (true) {
    process.stdout.write(C.clear);
    tuiBox(boxR, boxC, boxW, boxH, "Confirm");

    moveTo(boxR + 2, boxC + 3);
    process.stdout.write(prompt.padEnd(inner));

    moveTo(boxR + 4, boxC + 10);
    if (selected === 0) {
      process.stdout.write(`${C.rev}  yes  ${C.reset}       no  `);
    } else {
      process.stdout.write(`  yes        ${C.rev}  no  ${C.reset}`);
    }

    moveTo(boxR + 6, boxC + 3);
    process.stdout.write(
      `${C.dim}${"left/right or h/l  y/n  enter confirm".padEnd(inner)}${C.reset}`,
    );

    await readKey();

    if (lastKey === "LEFT" || lastKey === "h" || lastKey === "H") {
      selected = 0;
    } else if (lastKey === "RIGHT" || lastKey === "l" || lastKey === "L") {
      selected = 1;
    } else if (lastKey === "y" || lastKey === "Y") {
      return true;
    } else if (lastKey === "n" || lastKey === "N") {
      return false;
    } else if (lastKey === "ENTER") {
      return selected === 0;
    } else if (lastKey === "q" || lastKey === "Q" || lastKey === "ESC") {
      return false;
    }
  }
}

// ---
// TUI progress
// ---

let progressTasks = [];
let progressCurrent = 0;

function tuiProgressInit(tasks) {
  progressTasks = tasks;
  progressCurrent = 0;
}

function tuiProgressDraw() {
  const total = progressTasks.length;
  process.stdout.write(C.clear);
  measureTerm();

  let boxW = termCols - 8;
  if (boxW < 54) {
    boxW = 54;
  }
  if (boxW > 90) {
    boxW = 90;
  }

  const boxH = total + 9;
  let boxR = Math.floor((termRows - boxH) / 2);
  if (boxR < 1) {
    boxR = 1;
  }
  const boxC = Math.floor((termCols - boxW) / 2);
  const inner = boxW - 2;
  const barW = boxW - 10;

  tuiBox(boxR, boxC, boxW, boxH, "Installing");

  moveTo(boxR + 1, boxC + 3);
  process.stdout.write(`${C.dim}Airlink v${VERSION}${C.reset}`);
  tuiHline(boxR + 2, boxC, boxW);

  for (let i = 0; i < total; i++) {
    moveTo(boxR + 3 + i, boxC + 3);
    const label = progressTasks[i].padEnd(inner - 6);
    if (i < progressCurrent) {
      process.stdout.write(
        `${C.green}[+]${C.reset} ${C.dim}${label}${C.reset}`,
      );
    } else if (i === progressCurrent) {
      process.stdout.write(
        `${C.cyan}[>]${C.reset} ${C.bold}${label}${C.reset}`,
      );
    } else {
      process.stdout.write(`${C.dim}[ ] ${label}${C.reset}`);
    }
  }

  tuiHline(boxR + boxH - 4, boxC, boxW);

  const pct = total > 0 ? Math.floor((progressCurrent * 100) / total) : 0;
  const filled = Math.floor((pct * barW) / 100);
  const empty = barW - filled;

  moveTo(boxR + boxH - 3, boxC + 3);
  process.stdout.write(
    `[${"#".repeat(filled)}${" ".repeat(empty)}] ${String(pct).padStart(3)}%`,
  );

  return { boxR, boxC, boxW, boxH };
}

async function tuiProgressStep(label, fn) {
  const { boxR, boxC, boxW } = tuiProgressDraw();
  const spinnerRow = boxR + 3 + progressCurrent;
  const spinnerCol = boxC + boxW - 4;

  // Run the function
  let status = 0;
  try {
    await fn();
  } catch {
    status = 1;
  }

  // Show result
  moveTo(spinnerRow, spinnerCol);
  if (status === 0) {
    process.stdout.write("   ");
    logOk(label);
  } else {
    process.stdout.write(`${C.red}!${C.reset}`);
    logError(label);
    await sleep(800);
    tuiCleanup();
    die(`${label} failed`);
  }

  progressCurrent++;
  await sleep(50);
}

function tuiProgressFinish() {
  progressCurrent = progressTasks.length;
  tuiProgressDraw();
}

// ---
// Non-interactive spinner
// ---

let niStep = 0;
let niTotal = 0;

function niStart(total) {
  niTotal = total;
  niStep = 0;
}

async function niRun(label, fn) {
  niStep++;
  process.stdout.write(
    `\r  ${C.gray}[${String(niStep).padStart(2, "0")}/${String(niTotal).padStart(2, "0")}]${C.reset} ${label.padEnd(42)} `,
  );

  let status = 0;
  try {
    await fn();
  } catch {
    status = 1;
  }

  // Clear spinner line
  process.stdout.write(`\r${" ".repeat(76)}\r`);

  if (status === 0) {
    process.stdout.write(
      `  ${C.gray}[${String(niStep).padStart(2, "0")}/${String(niTotal).padStart(2, "0")}]${C.reset} ${label.padEnd(42)} ${C.green}done${C.reset}\n`,
    );
    logOk(label);
  } else {
    process.stdout.write(
      `  ${C.gray}[${String(niStep).padStart(2, "0")}/${String(niTotal).padStart(2, "0")}]${C.reset} ${label.padEnd(42)} ${C.red}FAIL${C.reset}\n`,
    );
    logError(label);
    die(`${label} failed`);
  }
}

// ---
// Helpers
// ---

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  }).trim();
}

function shOk(cmd) {
  try {
    sh(cmd);
    return true;
  } catch {
    return false;
  }
}

function validPort(p) {
  return /^[0-9]+$/.test(p) && Number(p) >= 1 && Number(p) <= 65535;
}

function getAddonField(config, idx) {
  return config.split("|")[idx - 1] || "";
}

// ---
// OS detection
// ---

let osId = "";
let osVer = "";
let osFamily = "";
let pkgManager = "";

function detectOs() {
  if (!existsSync("/etc/os-release")) {
    die("Cannot detect OS — /etc/os-release missing");
  }

  const content = readFileSync("/etc/os-release", "utf-8");
  const get = (key) => {
    const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].replace(/"/g, "") : "";
  };

  osId = get("ID");
  osVer = get("VERSION_ID");

  switch (osId) {
    case "ubuntu":
    case "debian":
    case "linuxmint":
    case "pop":
    case "raspbian":
      osFamily = "debian";
      pkgManager = "apt";
      break;
    case "fedora":
    case "centos":
    case "rhel":
    case "rocky":
    case "almalinux":
    case "ol":
      osFamily = "redhat";
      pkgManager = shOk("command -v dnf") ? "dnf" : "yum";
      break;
    case "arch":
    case "manjaro":
    case "endeavouros":
      osFamily = "arch";
      pkgManager = "pacman";
      break;
    case "alpine":
      osFamily = "alpine";
      pkgManager = "apk";
      break;
    default:
      die(
        `Unsupported OS: ${osId}. Supported: Ubuntu/Debian/Fedora/RHEL/Arch/Alpine`,
      );
  }
  logInfo(`Detected OS: ${osId} ${osVer} (${osFamily})`);
}

function pkgInstall(...pkgs) {
  switch (pkgManager) {
    case "apt":
      sh("DEBIAN_FRONTEND=noninteractive apt-get update -qq");
      sh(
        `DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${pkgs.join(" ")}`,
      );
      break;
    case "dnf":
    case "yum":
      sh(`${pkgManager} install -y -q ${pkgs.join(" ")}`);
      break;
    case "pacman":
      sh(`pacman -Sy --noconfirm --needed ${pkgs.join(" ")}`);
      break;
    case "apk":
      sh(`apk add --no-cache -q ${pkgs.join(" ")}`);
      break;
  }
}

// ---
// Dependency check
// ---

function ensureDeps() {
  const deps = ["curl", "wget", "git", "openssl", "unzip"];
  const missing = deps.filter((d) => !shOk(`command -v ${d}`));
  if (missing.length > 0) {
    logInfo(`Installing missing: ${missing.join(", ")}`);
    pkgInstall(...missing);
  }
  for (const d of deps) {
    if (!shOk(`command -v ${d}`)) {
      die(`Failed to install: ${d}`);
    }
  }
}

// ---
// Node.js
// ---

function getLatestNodeLts() {
  try {
    const idx = sh(
      "curl -fsSL --max-time 15 https://nodejs.org/dist/index.json",
    );
    const data = JSON.parse(idx);
    for (const r of data) {
      if (r.lts && r.lts !== false) {
        return r.version.replace(/^v/, "").split(".")[0];
      }
    }
  } catch {
    /* fallback */
  }
  logWarn("Can't fetch node index, defaulting to 22");
  return "22";
}

function selectNpmRegistry() {
  let registry = "https://registry.npmjs.org";
  try {
    const geo = sh(
      'curl -fsSL --max-time 8 "http://ip-api.com/json/?fields=continentCode"',
    );
    const continent = JSON.parse(geo).continentCode;
    if (continent === "AS") {
      registry = "https://registry.npmmirror.com";
      logInfo("Registry: npmmirror.com (Asia)");
    }
  } catch {
    /* use default */
  }

  if (!shOk(`curl -fsSL --max-time 6 ${registry}/npm -o /dev/null`)) {
    logWarn(`${registry} unreachable, falling back`);
    registry = "https://registry.npmjs.org";
  }

  sh(`pnpm config set registry "${registry}" || true`);
  sh(`npm config set registry "${registry}" || true`);
}

function installNode(desiredMajor) {
  switch (osFamily) {
    case "debian":
      sh(
        `curl -fsSL https://deb.nodesource.com/setup_${desiredMajor}.x | bash -`,
      );
      sh("DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs");
      break;
    case "redhat":
      sh(
        `curl -fsSL https://rpm.nodesource.com/setup_${desiredMajor}.x | bash -`,
      );
      sh(`${pkgManager} install -y -q nodejs`);
      break;
    case "arch":
      sh("pacman -Sy --noconfirm --needed nodejs npm");
      break;
    case "alpine":
      sh("apk add --no-cache nodejs npm");
      break;
  }
}

function setupNode() {
  const desired = getLatestNodeLts();
  logInfo(`Latest Node LTS: ${desired}`);

  if (shOk("command -v node")) {
    const current = sh(
      "node -e 'console.log(process.versions.node.split(\".\")[0])'",
    );
    if (current === desired) {
      logInfo(`Node.js ${desired} already installed`);
    } else {
      logInfo(`Node mismatch: have ${current}, want ${desired} — upgrading`);
      installNode(desired);
    }
  } else {
    installNode(desired);
  }

  if (!shOk("command -v node")) {
    die("Node.js install failed");
  }
  logInfo(`Node.js ${sh("node -v")} ready`);

  selectNpmRegistry();

  if (!shOk("command -v pnpm")) {
    try {
      sh("npm install -g pnpm");
    } catch {
      die("pnpm install failed");
    }
  }
  logInfo(`pnpm ${sh("pnpm -v")} ready`);
}

// ---
// Docker
// ---

function setupDocker() {
  if (shOk("command -v docker")) {
    logInfo(`Docker already installed: ${sh("docker --version")}`);
    try {
      sh("systemctl is-active --quiet docker || systemctl enable --now docker");
    } catch {
      /* ok */
    }
    return;
  }

  logInfo("Installing Docker...");
  switch (osFamily) {
    case "debian":
    case "redhat":
      sh("curl -fsSL https://get.docker.com | sh");
      break;
    case "arch":
      sh("pacman -Sy --noconfirm --needed docker docker-compose");
      break;
    case "alpine":
      sh("apk add --no-cache docker docker-compose");
      try {
        sh("rc-update add docker boot");
      } catch {
        /* ok */
      }
      break;
  }

  if (shOk("command -v systemctl")) {
    try {
      sh("systemctl enable --now docker");
    } catch {
      /* ok */
    }
  }

  if (!shOk("command -v docker")) {
    die("Docker install failed");
  }
  logInfo(`Docker: ${sh("docker --version")}`);
}

// ---
// Platform detection (daemon binary)
// ---

let daemonPlatform = "";
let daemonArch = "";

function detectPlatform() {
  const kernel = sh("uname -s").toLowerCase();
  const arch = sh("uname -m");

  switch (kernel) {
    case "linux":
      daemonPlatform = "linux";
      break;
    case "darwin":
      daemonPlatform = "macos";
      break;
    default:
      die(`Unsupported platform: ${kernel}`);
  }

  switch (arch) {
    case "x86_64":
    case "amd64":
      daemonArch = "x64";
      break;
    case "aarch64":
    case "arm64":
      daemonArch = "arm64";
      break;
    default:
      die(`Unsupported architecture: ${arch}`);
  }
  logInfo(`Platform: ${daemonPlatform}-${daemonArch}`);
}

// ---
// Panel installation phases
// ---

function phasePanelClone(panelName, panelPort) {
  mkdirSync("/var/www", { recursive: true });

  if (existsSync("/var/www/panel")) {
    logInfo("Panel already exists — overwriting files, keeping .env and db");
    const tmpdir = mkdtempSync("/tmp/al-panel-");
    sh(`git clone --depth 1 "${PANEL_REPO}" "${tmpdir}"`);

    // Copy over, excluding .env, node_modules, storage
    try {
      sh(
        `rsync -a --exclude='.env' --exclude='node_modules' --exclude='storage' "${tmpdir}/" /var/www/panel/`,
      );
    } catch {
      sh(
        `find "${tmpdir}" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'node_modules' ! -name 'storage' -exec cp -r {} /var/www/panel/ \\;`,
      );
    }
    rmSync(tmpdir, { recursive: true, force: true });
  } else {
    sh(`git clone --depth 1 "${PANEL_REPO}" /var/www/panel`);
  }

  // Fix ownership
  try {
    sh("id www-data");
    sh("chown -R www-data:www-data /var/www/panel");
  } catch {
    /* no www-data */
  }
  sh("chmod -R 755 /var/www/panel");

  // Patch package.json for pnpm build
  try {
    const pkgPath = "/var/www/panel/package.json";
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.pnpm = pkg.pnpm || {};
    pkg.pnpm.onlyBuiltDependencies = [
      "@parcel/watcher",
      "@prisma/client",
      "@prisma/engines",
      "prisma",
    ];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch {
    /* non-critical */
  }

  // Write .env if missing
  if (!existsSync("/var/www/panel/.env")) {
    const secret = randomBytes(32).toString("hex");
    let serverIp = "localhost";
    try {
      serverIp = sh("hostname -I").split(" ")[0] || "localhost";
    } catch {
      /* ok */
    }
    writeFileSync(
      "/var/www/panel/.env",
      [
        `NAME=${panelName}`,
        "NODE_ENV=production",
        `URL=http://${serverIp}:${panelPort}`,
        `PORT=${panelPort}`,
        "DATABASE_URL=file:/var/www/panel/storage/dev.db",
        `SESSION_SECRET=${secret}`,
        "",
      ].join("\n"),
    );
  }
}

function phasePanelDeps() {
  sh(
    "cd /var/www/panel && NODE_ENV=development pnpm install --no-frozen-lockfile --network-concurrency 16",
  );
  try {
    sh("cd /var/www/panel && pnpm approve-builds --all");
  } catch {
    /* non-critical */
  }
  sh("cd /var/www/panel && pnpm add chalk form-data");
}

function phasePanelBuild() {
  sh("cd /var/www/panel && pnpm run migrate:deploy");
  sh("cd /var/www/panel && pnpm run build");
}

function phasePanelService() {
  const pnpmBin = sh("command -v pnpm");
  const nodeDir = dirname(sh("command -v node"));

  writeFileSync(
    "/etc/systemd/system/airlink-panel.service",
    `[Unit]
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
Environment=PATH=${nodeDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
`,
  );
  sh("systemctl daemon-reload");
  sh("systemctl enable --now airlink-panel");
}

// ---
// Daemon installation
// ---

function phaseDaemonDownload(panelAddr, daemonPort, daemonKey) {
  detectPlatform();

  logInfo("Fetching latest daemon release...");
  const releaseJson = sh(`curl -fsSL --max-time 30 "${DAEMON_RELEASE_API}"`);
  const release = JSON.parse(releaseJson);
  const tag = release.tag_name || "unknown";
  logInfo(`Latest daemon release: ${tag}`);

  const needle = `airlinkd-${daemonPlatform}-${daemonArch}-`;
  const asset = (release.assets || []).find(
    (a) => a.name.startsWith(needle) && a.name.endsWith(".zip"),
  );
  if (!asset) {
    die(
      `No daemon binary for ${daemonPlatform}-${daemonArch} in release ${tag}`,
    );
  }

  logInfo(`Downloading: ${asset.browser_download_url}`);
  const tmpdir = mkdtempSync("/tmp/al-daemon-");
  const zipfile = join(tmpdir, "airlinkd.zip");

  sh(
    `curl -fsSL --max-time 120 --progress-bar -o "${zipfile}" "${asset.browser_download_url}"`,
  );
  sh(`unzip -o -q "${zipfile}" -d "${tmpdir}"`);

  if (!existsSync(join(tmpdir, "airlinkd"))) {
    die("Binary 'airlinkd' not found inside zip");
  }

  mkdirSync("/etc/daemon", { recursive: true });
  cpSync(join(tmpdir, "airlinkd"), "/etc/daemon/airlinkd");
  chmodSync("/etc/daemon/airlinkd", 0o755);
  rmSync(tmpdir, { recursive: true, force: true });

  logInfo("airlinkd binary installed to /etc/daemon/airlinkd");

  if (!existsSync("/etc/daemon/.env")) {
    writeFileSync(
      "/etc/daemon/.env",
      [
        `remote=${panelAddr}`,
        `key=${daemonKey}`,
        `port=${daemonPort}`,
        "DEBUG=false",
        "version=1.0.0",
        "environment=production",
        "STATS_INTERVAL=10000",
        "",
      ].join("\n"),
    );
  }
}

function phaseDaemonService() {
  writeFileSync(
    "/etc/systemd/system/airlink-daemon.service",
    `[Unit]
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
`,
  );
  sh("systemctl daemon-reload");
  sh("systemctl enable --now airlink-daemon");
}

// ---
// Addon processing
// ---

function processAddons(addonChoices) {
  if (!addonChoices || addonChoices === "none") {
    return;
  }

  const toInstall = [];
  if (addonChoices === "all") {
    toInstall.push(...ADDONS);
  } else {
    const selected = addonChoices.split(",");
    for (const sel of selected) {
      const addon = ADDONS.find((a) => a.dir === sel.trim());
      if (addon) {
        toInstall.push(addon);
      }
    }
  }

  const addonsDir = "/var/www/panel/storage/addons";
  mkdirSync(addonsDir, { recursive: true });

  for (const addon of toInstall) {
    const target = join(addonsDir, addon.dir);
    if (existsSync(target)) {
      sh(`cd "${target}" && git pull origin "${addon.branch}"`);
    } else {
      sh(
        `git clone --depth 1 --branch "${addon.branch}" "${addon.repo}" "${target}"`,
      );
    }
    sh(`cd "${target}" && pnpm install --no-frozen-lockfile`);
    sh(`cd "${target}" && pnpm run build`);
    logOk(`${addon.name} addon done`);
  }

  // Rebuild tailwind
  sh(
    "cd /var/www/panel && npx tailwindcss -i ./public/styles/tw.css -o ./public/styles.css",
  );
}

// ---
// Removal functions
// ---

function removePanel() {
  try {
    sh("systemctl stop airlink-panel");
  } catch {
    /* ok */
  }
  try {
    sh("systemctl disable airlink-panel");
  } catch {
    /* ok */
  }
  try {
    sh("rm -f /etc/systemd/system/airlink-panel.service");
  } catch {
    /* ok */
  }
  rmSync("/var/www/panel", { recursive: true, force: true });
  sh("systemctl daemon-reload");
}

function removeDaemon() {
  try {
    sh("systemctl stop airlink-daemon");
  } catch {
    /* ok */
  }
  try {
    sh("systemctl disable airlink-daemon");
  } catch {
    /* ok */
  }
  try {
    sh("rm -f /etc/systemd/system/airlink-daemon.service");
  } catch {
    /* ok */
  }
  rmSync("/etc/daemon", { recursive: true, force: true });
  sh("systemctl daemon-reload");
}

function removeDeps() {
  switch (osFamily) {
    case "debian":
      sh(
        "apt-get remove -y nodejs npm docker.io docker-ce docker-ce-cli || true",
      );
      break;
    case "redhat":
      sh(`${pkgManager} remove -y nodejs npm docker-ce docker-ce-cli || true`);
      break;
    case "arch":
      sh("pacman -R --noconfirm nodejs npm docker || true");
      break;
    case "alpine":
      sh("apk del nodejs npm docker || true");
      break;
  }
}

function pingInstallCounter() {
  try {
    sh(
      'curl -sf "https://api.counterapi.dev/v2/airlinklabs/installed-air/up" -o /dev/null',
    );
  } catch {
    /* ok */
  }
}

// ---
// Non-interactive install
// ---

async function runNonInteractive(opts) {
  const mode = opts.mode || "both";
  const panelName = opts.name || "Airlink";
  const panelPort = opts.port || "3000";
  const panelAddr = opts.panelAddr || "127.0.0.1";
  const daemonPort = opts.daemonPort || "3002";
  const daemonKey = opts.daemonKey || "";
  const addonChoices = opts.addons || "none";

  // Validate
  if (mode !== "daemon" && !validPort(panelPort)) {
    die(`Invalid panel port: ${panelPort}`);
  }
  if (mode !== "panel" && !validPort(daemonPort)) {
    die(`Invalid daemon port: ${daemonPort}`);
  }
  if (!shOk("command -v systemctl")) {
    die("systemd required");
  }

  detectOs();

  const tasks = [];
  if (mode === "both") {
    tasks.push(
      ["Check dependencies", ensureDeps],
      ["Install Node.js", setupNode],
      ["Install Docker", setupDocker],
      ["Clone panel", () => phasePanelClone(panelName, panelPort)],
      ["Panel dependencies", phasePanelDeps],
      ["Build panel", phasePanelBuild],
      ["Start panel service", phasePanelService],
      [
        "Download daemon",
        () => phaseDaemonDownload(panelAddr, daemonPort, daemonKey),
      ],
      ["Start daemon service", phaseDaemonService],
    );
  } else if (mode === "panel") {
    tasks.push(
      ["Check dependencies", ensureDeps],
      ["Install Node.js", setupNode],
      ["Install Docker", setupDocker],
      ["Clone panel", () => phasePanelClone(panelName, panelPort)],
      ["Panel dependencies", phasePanelDeps],
      ["Build panel", phasePanelBuild],
      ["Start panel service", phasePanelService],
    );
  } else if (mode === "daemon") {
    tasks.push(
      ["Check dependencies", ensureDeps],
      ["Install Docker", setupDocker],
      [
        "Download daemon",
        () => phaseDaemonDownload(panelAddr, daemonPort, daemonKey),
      ],
      ["Start daemon service", phaseDaemonService],
    );
  }

  niStart(tasks.length);
  for (const [label, fn] of tasks) {
    await niRun(label, fn);
  }

  pingInstallCounter();

  let serverIp = "<server-ip>";
  try {
    serverIp = sh("hostname -I").split(" ")[0] || serverIp;
  } catch {
    /* ok */
  }

  console.log(`\n  ${C.green}${C.bold}Installation complete.${C.reset}\n`);
  if (mode !== "daemon") {
    console.log(
      `  ${C.gray}Panel :${C.reset}  http://${serverIp}:${panelPort}`,
    );
  }
  if (mode !== "panel") {
    console.log(`  ${C.gray}Daemon:${C.reset}  port ${daemonPort}`);
  }
  console.log(`  ${C.gray}Logs  :${C.reset}  ${LOG_PATH}`);
  console.log(`  ${C.gray}System:${C.reset}  journalctl -u airlink-panel -f\n`);
}

// ---
// Interactive TUI flow
// ---

async function runInteractive() {
  tuiInit();

  const menuItems = [
    "Install Panel + Daemon",
    "Install Panel only",
    "Install Daemon only",
    "Install Addons only",
    "Setup dependencies only",
    "Remove Panel",
    "Remove Daemon",
    "Remove everything",
    "View logs",
    "Exit",
  ];

  let panelName = "Airlink";
  let panelPort = "3000";
  let panelAddr = "127.0.0.1";
  let daemonPort = "3002";
  let daemonKey = "";
  let addonChoices;

  while (true) {
    const ok = await tuiMenu("Main Menu", menuItems);
    if (!ok) {
      break;
    }

    switch (tuiResult) {
      case 0: {
        // Install Panel + Daemon
        // Panel config
        await tuiTextInput("Panel name", "Airlink");
        panelName = tuiInput;
        let err = "";
        while (true) {
          await tuiTextInput("Panel port (1-65535)", "3000", err);
          if (validPort(tuiInput)) {
            panelPort = tuiInput;
            break;
          }
          err = "Invalid port — must be 1-65535";
        }

        // Daemon config
        await tuiTextInput("Panel address (IP or hostname)", "127.0.0.1");
        panelAddr = tuiInput;
        err = "";
        while (true) {
          await tuiTextInput("Daemon port (1-65535)", "3002", err);
          if (validPort(tuiInput)) {
            daemonPort = tuiInput;
            break;
          }
          err = "Invalid port — must be 1-65535";
        }
        await tuiTextInput("Daemon auth key (from panel > Nodes)", "");
        daemonKey = tuiInput;

        // Addons
        await tuiChecklist(
          "Optional Addons",
          ADDONS.map((a) => a.name),
        );
        if (!tuiMulti) {
          addonChoices = "none";
        } else {
          const chosen = tuiMulti
            .split(" ")
            .map((i) => ADDONS[parseInt(i)].dir);
          addonChoices = chosen.join(",");
        }

        // Install
        detectOs();
        tuiProgressInit([
          "Check dependencies",
          "Install Node.js",
          "Install Docker",
          "Clone panel",
          "Panel dependencies",
          "Build panel",
          "Start panel service",
          "Download daemon",
          "Start daemon service",
        ]);
        installing = true;
        await tuiProgressStep("Check dependencies", ensureDeps);
        await tuiProgressStep("Install Node.js", setupNode);
        await tuiProgressStep("Install Docker", setupDocker);
        await tuiProgressStep("Clone panel", () =>
          phasePanelClone(panelName, panelPort),
        );
        await tuiProgressStep("Panel dependencies", phasePanelDeps);
        await tuiProgressStep("Build panel", phasePanelBuild);
        await tuiProgressStep("Start panel service", phasePanelService);
        await tuiProgressStep("Download daemon", () =>
          phaseDaemonDownload(panelAddr, daemonPort, daemonKey),
        );
        await tuiProgressStep("Start daemon service", phaseDaemonService);
        tuiProgressFinish();
        installing = false;
        processAddons(addonChoices);
        pingInstallCounter();
        break;
      }

      case 1: {
        // Panel only
        await tuiTextInput("Panel name", "Airlink");
        panelName = tuiInput;
        let err = "";
        while (true) {
          await tuiTextInput("Panel port (1-65535)", "3000", err);
          if (validPort(tuiInput)) {
            panelPort = tuiInput;
            break;
          }
          err = "Invalid port — must be 1-65535";
        }

        await tuiChecklist(
          "Optional Addons",
          ADDONS.map((a) => a.name),
        );
        addonChoices = !tuiMulti
          ? "none"
          : tuiMulti
              .split(" ")
              .map((i) => ADDONS[parseInt(i)].dir)
              .join(",");

        detectOs();
        tuiProgressInit([
          "Check dependencies",
          "Install Node.js",
          "Install Docker",
          "Clone panel",
          "Panel dependencies",
          "Build panel",
          "Start panel service",
        ]);
        installing = true;
        await tuiProgressStep("Check dependencies", ensureDeps);
        await tuiProgressStep("Install Node.js", setupNode);
        await tuiProgressStep("Install Docker", setupDocker);
        await tuiProgressStep("Clone panel", () =>
          phasePanelClone(panelName, panelPort),
        );
        await tuiProgressStep("Panel dependencies", phasePanelDeps);
        await tuiProgressStep("Build panel", phasePanelBuild);
        await tuiProgressStep("Start panel service", phasePanelService);
        tuiProgressFinish();
        installing = false;
        processAddons(addonChoices);
        pingInstallCounter();
        break;
      }

      case 2: {
        // Daemon only
        await tuiTextInput("Panel address (IP or hostname)", "127.0.0.1");
        panelAddr = tuiInput;
        let err = "";
        while (true) {
          await tuiTextInput("Daemon port (1-65535)", "3002", err);
          if (validPort(tuiInput)) {
            daemonPort = tuiInput;
            break;
          }
          err = "Invalid port — must be 1-65535";
        }
        await tuiTextInput("Daemon auth key (from panel > Nodes)", "");
        daemonKey = tuiInput;

        detectOs();
        tuiProgressInit([
          "Check dependencies",
          "Install Docker",
          "Download daemon",
          "Start daemon service",
        ]);
        installing = true;
        await tuiProgressStep("Check dependencies", ensureDeps);
        await tuiProgressStep("Install Docker", setupDocker);
        await tuiProgressStep("Download daemon", () =>
          phaseDaemonDownload(panelAddr, daemonPort, daemonKey),
        );
        await tuiProgressStep("Start daemon service", phaseDaemonService);
        tuiProgressFinish();
        installing = false;
        pingInstallCounter();
        break;
      }

      case 3: {
        // Addons only
        await tuiChecklist(
          "Optional Addons",
          ADDONS.map((a) => a.name),
        );
        addonChoices = !tuiMulti
          ? "none"
          : tuiMulti
              .split(" ")
              .map((i) => ADDONS[parseInt(i)].dir)
              .join(",");
        process.stdout.write(C.showCur);
        processAddons(addonChoices);
        process.stdout.write(C.hideCur);
        break;
      }

      case 4: {
        // Setup dependencies only
        process.stdout.write(C.showCur);
        detectOs();
        ensureDeps();
        setupNode();
        setupDocker();
        process.stdout.write(C.hideCur);
        break;
      }

      case 5: {
        // Remove panel
        if (await tuiConfirm("Remove panel? This deletes /var/www/panel")) {
          removePanel();
        }
        break;
      }

      case 6: {
        // Remove daemon
        if (await tuiConfirm("Remove daemon? This deletes /etc/daemon")) {
          removeDaemon();
        }
        break;
      }

      case 7: {
        // Remove everything
        if (await tuiConfirm("Remove panel, daemon, and dependencies?")) {
          removePanel();
          removeDaemon();
          removeDeps();
        }
        break;
      }

      case 8: {
        // View logs
        tuiCleanup();
        if (existsSync(LOG_PATH)) {
          try {
            sh(`less "${LOG_PATH}"`);
          } catch {
            sh(`cat "${LOG_PATH}"`);
          }
        } else {
          console.log(`No log at ${LOG_PATH}`);
        }
        tuiInit();
        break;
      }

      case 9: // Exit
      case -1:
        break;
    }
  }

  tuiCleanup();
  console.log(`\n  Airlink Installer v${VERSION} — done\n`);
}

// ---
// Arg parsing
// ---

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { command: "" };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--panel-only") {
      opts.mode = "panel";
      continue;
    }
    if (a === "--daemon-only") {
      opts.mode = "daemon";
      continue;
    }
    if (a === "--name") {
      opts.name = args[++i] || "";
      continue;
    }
    if (a === "--port") {
      opts.port = args[++i] || "";
      continue;
    }
    if (a === "--panel-addr") {
      opts.panelAddr = args[++i] || "";
      continue;
    }
    if (a === "--daemon-port") {
      opts.daemonPort = args[++i] || "";
      continue;
    }
    if (a === "--daemon-key") {
      opts.daemonKey = args[++i] || "";
      continue;
    }
    if (a === "--addons") {
      opts.addons = args[++i] || "";
      continue;
    }
    if (a === "--help" || a === "-h") {
      opts.command = "help";
      continue;
    }
    if (!opts.command) {
      opts.command = a;
    }
  }

  return opts;
}

// ---
// Entry
// ---

const opts = parseArgs();

if (opts.command === "help") {
  console.log(`
  Airlink Installer v${VERSION}

  Usage:
    node public/scripts/installer.mjs                      Interactive TUI
    node public/scripts/installer.mjs install              Install both
    node public/scripts/installer.mjs install --panel-only Install panel only
    node public/scripts/installer.mjs install --daemon-only Install daemon only
    node public/scripts/installer.mjs remove               Remove everything
    node public/scripts/installer.mjs remove --panel-only  Remove panel only
    node public/scripts/installer.mjs remove --daemon-only Remove daemon only
    node public/scripts/installer.mjs logs                 View installer logs

  Flags:
    --name NAME          Panel display name (default: Airlink)
    --port PORT          Panel port (default: 3000)
    --panel-addr ADDR    Panel address for daemon (default: 127.0.0.1)
    --daemon-port PORT   Daemon port (default: 3002)
    --daemon-key KEY     Daemon auth key
    --addons LIST        Comma-separated addon dirs (or "all")
  `);
  process.exit(0);
}

if (process.getuid?.() !== 0) {
  console.error("\n  Run as root or with sudo.\n");
  process.exit(1);
}

try {
  writeFileSync(LOG_PATH, "");
} catch {
  /* ok */
}
logInfo(`=== Airlink Installer v${VERSION} started (pid ${process.pid}) ===`);

detectOs();

if (opts.command === "install") {
  runNonInteractive(opts);
} else if (opts.command === "remove") {
  const mode = opts.mode || "both";
  if (mode !== "daemon") {
    console.log("\n  Removing panel...");
    removePanel();
    console.log("  Panel removed.");
  }
  if (mode !== "panel") {
    console.log("\n  Removing daemon...");
    removeDaemon();
    console.log("  Daemon removed.");
  }
  if (mode === "both") {
    console.log("\n  Removing dependencies...");
    removeDeps();
    console.log("  Dependencies removed.");
  }
  console.log("\n  Done.\n");
} else if (opts.command === "logs") {
  if (existsSync(LOG_PATH)) {
    sh(`less "${LOG_PATH}"`);
  } else {
    console.log(`No log at ${LOG_PATH}`);
  }
} else {
  // No command = interactive TUI
  runInteractive();
}
