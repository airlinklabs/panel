/**
 * ui.mjs — Shared TUI primitives for Airlink scripts.
 *
 * Black-and-white terminal aesthetic: no color, just bold/dim/reverse for
 * hierarchy. Adaptive boxen-style boxes with centred titles. Interactive
 * widgets clear their box on completion and print a compact result line.
 *
 * Exports:
 *   Logger         — ok / warn / fail / info / dim / gap / section / banner
 *   box()          — draw a titled box with Unicode continuous lines
 *   doubleBox()    — double-line border variant for emphasis
 *   divider()      — horizontal rule with optional centred label
 *   prompt()       — single-line text input; box → result line on submit
 *   secret()       — masked password input; box → result line on submit
 *   confirm()      — yes/no dialog; box → result line on choice
 *   menu()         — arrow-key selection; box → result line on select
 *   spinner()      — run a promise with an inline spinner
 *   sudo()         — prompt for admin password with context
 */

import { createInterface } from 'node:readline';

// ── ANSI primitives ───────────────────────────────────────────────────────────

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const REV = `${ESC}[7m`;
const UL = `${ESC}[4m`;
const HIDE = `${ESC}[?25l`;
const SHOW = `${ESC}[?25h`;

const up = (n = 1) => `${ESC}[${n}A`;
const col = (n) => `${ESC}[${n}G`;
const clrln = () => `${ESC}[2K`;

const TTY = process.stdout.isTTY;

function write(...parts) {
  if (TTY) {process.stdout.write(parts.join(''));}
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function termWidth() {
  return Math.max(process.stdout.columns || 80, 60);
}

// ── ASCII art (from src/handlers/logger.ts) ──────────────────────────────────

const ASCII_ART = [
  '  /$$$$$$ /$$         /$$/$$         /$$',
  ' /$$__  $|__/        | $|__/        | $$',
  '| $$   $$/$$ /$$$$$$| $$/$$/$$$$$$$| $$   /$$',
  '| $$$$$$$| $$/$$__  $| $| $| $$__  $| $$  /$$/',
  '| $$__  $| $| $$  __| $| $| $$   $| $$$$$$/',
  '| $$  | $| $| $$     | $| $| $$  | $| $$_  $$',
  '| $$  | $| $| $$     | $| $| $$  | $| $$ \\  $$',
  '|__/  |__|__|__/     |__|__|__/  |__|__/  __/',
];

// ── Box drawing (round borders like boxen) ───────────────────────────────────

/**
 * Build a titled box as an array of lines.
 * Uses round Unicode borders: ╭ ─ ╮ │ ╰ ─ ╯
 * Width is dynamic: grows to fit title OR body, whichever is wider.
 * Title is centred in the top border. Body lines are left-aligned
 * with 2-space indent, padded to fill the full box width.
 *
 * @param {string}   title       — centred in top border (or "")
 * @param {string[]} body        — content lines
 * @param {object}   [opts]
 * @param {number}   [opts.pad]  — left indent for the box (default 2)
 * @param {number}   [opts.minW] — minimum inner width (default 40)
 * @returns {string[]}
 */
export function box(title, body, opts = {}) {
  const indent = ' '.repeat(opts.pad ?? 2);
  const minW = opts.minW ?? 40;
  const maxW = termWidth() - (opts.pad ?? 2) - 2;

  const titleW = title ? title.length + 4 : 0;
  const bodyW = Math.max(...body.map((l) => stripAnsi(l).length), 0);
  const inner = Math.min(Math.max(bodyW, titleW, minW), maxW);

  // Top border with centred title
  let top;
  if (title) {
    const t = ` ${title} `;
    const dashes = inner - t.length;
    const left = Math.floor(dashes / 2);
    const right = dashes - left;
    top = `${indent}\u256d${'\u2500'.repeat(Math.max(left, 0))}${BOLD}${t}${RESET}${'\u2500'.repeat(Math.max(right, 0))}\u256e`;
  } else {
    top = `${indent}\u256d${'\u2500'.repeat(inner)}\u256e`;
  }

  // Body lines: left-aligned with 2-space indent, padded to fill inner width
  const mid = body.map((line) => {
    const vis = stripAnsi(line).length;
    const rightSpace = Math.max(inner - vis - 2, 0); // -2 for left indent
    return `${indent}\u2502  ${line}${' '.repeat(rightSpace)}\u2502`;
  });

  const bot = `${indent}\u2570${'\u2500'.repeat(inner)}\u256f`;

  return [top, ...mid, bot];
}

/**
 * Double-line border variant for emphasis / warnings.
 * Uses ╭ ─ ╮ │ ╰ ─ ╯ (round, same as box).
 * Dynamic width: grows to fit title OR body.
 */
export function doubleBox(title, body, opts = {}) {
  const indent = ' '.repeat(opts.pad ?? 2);
  const minW = opts.minW ?? 40;
  const maxW = termWidth() - (opts.pad ?? 2) - 2;

  const titleW = title ? title.length + 4 : 0;
  const bodyW = Math.max(...body.map((l) => stripAnsi(l).length), 0);
  const inner = Math.min(Math.max(bodyW, titleW, minW), maxW);

  let top;
  if (title) {
    const t = ` ${title} `;
    const dashes = inner - t.length;
    const left = Math.floor(dashes / 2);
    const right = dashes - left;
    top = `${indent}\u256d${'\u2500'.repeat(Math.max(left, 0))}${BOLD}${t}${RESET}${'\u2500'.repeat(Math.max(right, 0))}\u256e`;
  } else {
    top = `${indent}\u256d${'\u2500'.repeat(inner)}\u256e`;
  }

  const mid = body.map((line) => {
    const vis = stripAnsi(line).length;
    const rightSpace = Math.max(inner - vis - 2, 0);
    return `${indent}\u2502  ${line}${' '.repeat(rightSpace)}\u2502`;
  });

  const bot = `${indent}\u2570${'\u2500'.repeat(inner)}\u256f`;

  return [top, ...mid, bot];
}

/**
 * Horizontal rule with optional centred label.
 * ───── Label ─────
 */
export function divider(label = '', width) {
  const w = width ?? termWidth() - 4;
  if (!label) {return `${'  \u2500'.repeat(Math.ceil(w / 2))}`.slice(0, w + 2);}

  const pad = w - label.length - 4;
  const left = Math.floor(Math.max(pad, 0) / 2);
  const right = Math.max(pad, 0) - left;
  return `  ${'\u2500'.repeat(left + 1)} ${BOLD}${label}${RESET} ${'\u2500'.repeat(right + 1)}`;
}

// ── Logger ───────────────────────────────────────────────────────────────────

export const Logger = {
  ok: (msg) => console.log(`  ${BOLD}\u2713${RESET} ${msg}`),
  warn: (msg) => console.log(`  ${BOLD}!${RESET} ${DIM}${msg}${RESET}`),
  fail: (msg) => console.log(`  ${BOLD}\u2717${RESET} ${msg}`),
  info: (msg) => console.log(`  ${DIM}\u25b8${RESET} ${msg}`),
  dim: (msg) => console.log(`  ${DIM}${msg}${RESET}`),
  gap: () => console.log(),
  section(title) {
    console.log();
    console.log(`  ${BOLD}${UL}${title}${RESET}`);
  },
  banner(title, version, codename) {
    if (!TTY) {
      console.log(`${title} v${version}${codename ? ` — ${codename}` : ''}`);
      return;
    }
    const lines = [
      ...ASCII_ART,
      '',
      `  ${BOLD}${title}${RESET} ${DIM}v${version}${RESET}`,
    ];
    if (codename) {lines.push(`  ${DIM}${codename}${RESET}`);}
    lines.push(`  ${DIM}Airlinklabs · MIT License${RESET}`);
    box('', lines, { pad: 1, minW: 44 }).forEach((l) => console.log(l));
    console.log();
  },
};

// ── Inline spinner ────────────────────────────────────────────────────────────

const SPIN = ['\u2502', '\u2571', '\u2501', '\u2572'];

/**
 * Run `fn` while showing a spinner.
 * Resolves with the return value of fn.
 */
export async function spinner(label, fn) {
  if (!TTY) {
    Logger.info(label);
    return fn();
  }

  const prefix = `  ${DIM}\u25b8${RESET} ${label} `;
  process.stdout.write(prefix);
  write(HIDE);

  let i = 0;
  const iv = setInterval(() => {
    write(`${clrln()}${col(1)}${prefix}${DIM}${SPIN[i++ % 4]}${RESET}`);
  }, 80);

  try {
    const result = await fn();
    clearInterval(iv);
    write(`${clrln()}${col(1)}`);
    Logger.ok(label);
    return result;
  } catch (err) {
    clearInterval(iv);
    write(`${clrln()}${col(1)}`);
    Logger.fail(label);
    throw err;
  } finally {
    write(SHOW);
  }
}

// ── Raw key reader ────────────────────────────────────────────────────────────

function readRawKey() {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (chunk) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);

      if (chunk === '\x1b[A') {return resolve('UP');}
      if (chunk === '\x1b[B') {return resolve('DOWN');}
      if (chunk === '\x1b[C') {return resolve('RIGHT');}
      if (chunk === '\x1b[D') {return resolve('LEFT');}
      if (chunk === '\x03') {return resolve('CTRL_C');}
      if (chunk === '\x7f' || chunk === '\b') {return resolve('BACKSPACE');}
      if (chunk === '\r' || chunk === '\n') {return resolve('ENTER');}
      if (chunk === '\x1b') {return resolve('ESC');}
      if (chunk === ' ') {return resolve('SPACE');}
      resolve(chunk);
    };

    process.stdin.on('data', onData);
  });
}

// ── Readline-based single-line prompt (non-TTY fallback) ──────────────────────

function readLine(promptText) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

// ── Box-framed text input ─────────────────────────────────────────────────────

/**
 * Show a centred input box. On submit, clears the box and prints a result line.
 *
 * @param {object} opts
 * @param {string} opts.label     — prompt label
 * @param {string} [opts.default] — pre-filled value
 * @param {string} [opts.hint]    — hint text
 * @returns {Promise<string>}
 */
export async function prompt({ label, default: def = '', hint = '' }) {
  if (!TTY) {
    const ans = await readLine(`  ${label}${def ? ` [${def}]` : ''}: `);
    return ans.trim() || def;
  }

  let value = def;

  const drawPromptBox = () =>
    box(
      label,
      [
        '',
        `  ${DIM}Type text, press Enter to confirm${RESET}`,
        '',
        `  ${BOLD}\u25b8${RESET} ${value || DIM}${def && !value ? def : ''}${RESET}`,
        '',
        ...(hint ? [`  ${DIM}${hint}${RESET}`] : []),
      ],
      { pad: 4 },
    );

  const lines = drawPromptBox();
  const lineCount = lines.length + 1;
  lines.forEach((l) => process.stdout.write(`${l}\n`));

  write(HIDE);

  const redraw = () => {
    write(`${up(lineCount - 1)}\r`);
    const updated = drawPromptBox();
    updated.forEach((l) => {
      write(`${clrln()}${l}\n`);
    });
  };

   
  while (true) {
    const key = await readRawKey();
    if (key === 'CTRL_C') {
      write(SHOW);
      process.exit(0);
    }
    if (key === 'ENTER') {
      break;
    }
    if (key === 'ESC') {
      value = def;
    } else if (key === 'BACKSPACE') {
      value = value.slice(0, -1);
    } else if (key.length === 1 && key >= ' ') {
      value += key;
    }
    redraw();
  }

  write(SHOW);
  const final = value || def;
  // Clear box, print compact result
  write(`${up(lineCount)}\r`);
  for (let i = 0; i < lineCount; i++) {write(`${clrln()}\n`);}
  write(`${up(lineCount)}`);
  Logger.ok(`${label}  ${DIM}${final}${RESET}`);
  return final;
}

// ── Box-framed password input ─────────────────────────────────────────────────

/**
 * Show a centred password box. On submit, clears the box and prints a result line.
 *
 * @param {object} opts
 * @param {string} opts.label   — prompt label
 * @param {string} [opts.hint]  — hint text
 * @returns {Promise<string>}
 */
export async function secret({ label, hint = '' }) {
  if (!TTY) {
    const rl = createInterface({ input: process.stdin, output: null });
    process.stdout.write(`  ${label}: `);
    return new Promise((resolve) => {
      rl.question('', (ans) => {
        rl.close();
        process.stdout.write('\n');
        resolve(ans);
      });
    });
  }

  let value = '';
  const mask = (v) => '*'.repeat(v.length);

  const drawSecretBox = () =>
    box(
      label,
      [
        '',
        `  ${DIM}Type password, press Enter to confirm${RESET}`,
        '',
        `  ${BOLD}\u25b8${RESET} ${mask(value) || DIM}${'(empty)'}${RESET}`,
        '',
        ...(hint ? [`  ${DIM}${hint}${RESET}`] : []),
      ],
      { pad: 4 },
    );

  const lines = drawSecretBox();
  const lineCount = lines.length + 1;
  lines.forEach((l) => process.stdout.write(`${l}\n`));

  write(HIDE);

  const redraw = () => {
    write(`${up(lineCount - 1)}\r`);
    const updated = drawSecretBox();
    updated.forEach((l) => {
      write(`${clrln()}${l}\n`);
    });
  };

   
  while (true) {
    const key = await readRawKey();
    if (key === 'CTRL_C') {
      write(SHOW);
      process.exit(0);
    }
    if (key === 'ENTER') {
      break;
    }
    if (key === 'ESC') {
      value = '';
    } else if (key === 'BACKSPACE') {
      value = value.slice(0, -1);
    } else if (key.length === 1 && key >= ' ') {
      value += key;
    }
    redraw();
  }

  write(SHOW);
  // Clear box, print compact result
  write(`${up(lineCount)}\r`);
  for (let i = 0; i < lineCount; i++) {write(`${clrln()}\n`);}
  write(`${up(lineCount)}`);
  Logger.ok(`${label}  ${DIM}${mask(value)}${RESET}`);
  return value;
}

// ── Yes/No confirm dialog ─────────────────────────────────────────────────────

/**
 * Show a centred yes/no confirm box. On choice, clears the box and prints result.
 *
 * @param {string}  question
 * @param {boolean} [defaultYes=false]
 * @returns {Promise<boolean>}
 */
export async function confirm(question, defaultYes = false) {
  if (!TTY) {
    const ans = await readLine(
      `  ${question} [${defaultYes ? 'Y/n' : 'y/N'}]: `,
    );
    const lower = ans.trim().toLowerCase();
    if (!lower) {return defaultYes;}
    return lower === 'y' || lower === 'yes';
  }

  let selected = defaultYes ? 0 : 1;

  const drawConfirmBox = () => {
    const yesLabel = selected === 0 ? `${REV}  Yes  ${RESET}` : '  Yes  ';
    const noLabel = selected === 1 ? `${REV}  No   ${RESET}` : '  No   ';
    return box(
      'Confirm',
      [
        '',
        `  ${question}`,
        '',
        `       ${yesLabel}     ${noLabel}`,
        '',
        `  ${DIM}\u2190 \u2192 to choose   Enter to confirm${RESET}`,
      ],
      { pad: 4 },
    );
  };

  const lines = drawConfirmBox();
  const lineCount = lines.length + 1;
  lines.forEach((l) => process.stdout.write(`${l}\n`));

  write(HIDE);

  const redraw = () => {
    write(`${up(lineCount - 1)}\r`);
    const updated = drawConfirmBox();
    updated.forEach((l) => {
      write(`${clrln()}${l}\n`);
    });
  };

  let chosen = false;
  let result;

   
  while (true) {
    const key = await readRawKey();
    if (key === 'CTRL_C') {
      write(SHOW);
      process.exit(0);
    }
    if (key === 'LEFT' || key === 'h') {
      selected = 0;
      redraw();
    }
    if (key === 'RIGHT' || key === 'l') {
      selected = 1;
      redraw();
    }
    if (key === 'y' || key === 'Y') {
      result = true;
      chosen = true;
      break;
    }
    if (key === 'n' || key === 'N') {
      result = false;
      chosen = true;
      break;
    }
    if (key === 'ESC') {
      result = false;
      chosen = true;
      break;
    }
    if (key === 'ENTER') {
      result = selected === 0;
      chosen = true;
      break;
    }
  }

  write(SHOW);
  // Clear box, print compact result
  write(`${up(lineCount)}\r`);
  for (let i = 0; i < lineCount; i++) {write(`${clrln()}\n`);}
  write(`${up(lineCount)}`);
  const word = result ? 'Yes' : 'No';
  Logger.ok(`${question}  ${BOLD}${word}${RESET}`);
  return result;
}

// ── Arrow-key menu ────────────────────────────────────────────────────────────

/**
 * Show a centred arrow-key menu. On select, clears the box and prints result.
 *
 * @param {string}   title   — box title
 * @param {string[]} items   — menu options
 * @returns {Promise<number>} — index of selected item, or -1 on ESC/q
 */
export async function menu(title, items) {
  if (!TTY) {
    items.forEach((item, i) => console.log(`  [${i}] ${item}`));
    const ans = await readLine('  Select [0]: ');
    const n = parseInt(ans.trim(), 10);
    return Number.isFinite(n) && n >= 0 && n < items.length ? n : 0;
  }

  let selected = 0;

  const drawMenuBox = () =>
    box(
      title,
      [
        `${DIM}\u2191\u2193 navigate   Enter select   q quit${RESET}`,
        '',
        ...items.map((item, i) => {
          return i === selected
            ? `${REV} \u25b8 ${item} ${RESET}`
            : `   ${item} `;
        }),
      ],
      { pad: 2 },
    );

  const lines = drawMenuBox();
  const lineCount = lines.length + 1;
  lines.forEach((l) => process.stdout.write(`${l}\n`));

  write(HIDE);

  const redraw = () => {
    write(`${up(lineCount - 1)}\r`);
    const updated = drawMenuBox();
    updated.forEach((l) => {
      write(`${clrln()}${l}\n`);
    });
  };

   
  while (true) {
    const key = await readRawKey();
    if (key === 'CTRL_C') {
      write(SHOW);
      process.exit(0);
    }
    if (key === 'q' || key === 'Q' || key === 'ESC') {
      write(SHOW);
      console.log();
      return -1;
    }
    if (key === 'UP' || key === 'k') {
      if (selected > 0) {
        selected--;
        redraw();
      }
    }
    if (key === 'DOWN' || key === 'j') {
      if (selected < items.length - 1) {
        selected++;
        redraw();
      }
    }
    if (key === 'ENTER') {
      write(SHOW);
      // Clear box, print compact result
      write(`${up(lineCount)}\r`);
      for (let i = 0; i < lineCount; i++) {write(`${clrln()}\n`);}
      write(`${up(lineCount)}`);
      Logger.ok(`${title}  ${BOLD}${items[selected]}${RESET}`);
      return selected;
    }
    const n = parseInt(key, 10);
    if (!isNaN(n) && n >= 0 && n < items.length) {
      selected = n;
      redraw();
    }
  }
}

// ── Admin / sudo password prompt ──────────────────────────────────────────────

/**
 * Prompt for an admin (sudo) password with context.
 * Shows an info box, then a password box. Both clear on completion.
 *
 * @param {string} reason — short explanation of why sudo is needed
 * @returns {Promise<string>}
 */
export async function sudo(reason) {
  if (!TTY) {
    Logger.info(reason);
    return secret({ label: 'Sudo password' });
  }

  // Brief info box, clears after a moment
  const infoLines = box(
    'Admin Access Required',
    [
      '',
      `  ${reason}`,
      '',
      `  ${DIM}Password is used only for this operation via sudo.${RESET}`,
    ],
    { pad: 4 },
  );

  const lineCount = infoLines.length + 1;
  infoLines.forEach((l) => process.stdout.write(`${l}\n`));

  // Brief pause then clear the info box
  await new Promise((r) => setTimeout(r, 800));
  write(`${up(lineCount)}\r`);
  for (let i = 0; i < lineCount; i++) {write(`${clrln()}\n`);}
  write(`${up(lineCount)}`);

  return secret({ label: 'Sudo password', hint: 'Press Enter when done' });
}
