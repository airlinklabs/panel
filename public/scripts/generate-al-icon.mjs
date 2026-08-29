#!/usr/bin/env node

/**
 * generate-al-icon.mjs - builds public/js/shared/al-icon.js.
 *
 * Reads icon data from the installed `lucide` npm package and emits a compact
 * client-side SVG renderer.  The output is a self-contained IIFE that exposes
 * `window.alIcon(name, className, opts)`.
 *
 * Usage:
 *   node public/scripts/generate-al-icon.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as lucide from "lucide";

// ---
// Paths
// ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, "../js/shared/al-icon.js");

// ---
// Terminal helpers
// ---

const TTY = process.stdout.isTTY;
const C = {
  reset: TTY ? "\x1b[0m" : "",
  bold: TTY ? "\x1b[1m" : "",
  green: TTY ? "\x1b[32m" : "",
  yellow: TTY ? "\x1b[33m" : "",
};

const ok = (msg) => console.log(`  ${C.green}+${C.reset} ${msg}`);
const warn = (msg) =>
  console.log(`  ${C.yellow}!${C.reset} ${C.yellow}${msg}${C.reset}`);
const gap = () => console.log();

function section(title) {
  gap();
  console.log(`${C.bold}${C.green}  ${title}${C.reset}`);
}

function banner() {
  gap();
  console.log(`${C.bold}  generate-al-icon${C.reset}`);
  gap();
}

// ---
// Icons - keep this list tight; each entry costs bytes on the client.
// ---

const ICONS = [
  "server",
  "user",
  "network",
  "search",
  "search-x",
  "clock",
  "arrow-up-right",
  "sparkles",
  "x",
  "trash-2",
  "check",
  "circle-check",
  "loader-circle",
  "triangle-alert",
  "shield-check",
  "scan-search",
  "refresh-cw",
  "plus",
  "copy",
  "info",
  "circle-x",
  "circle-help",
  "ellipsis",
  "wifi-off",
  "chevron-left",
  "chevron-right",
  "sun",
  "moon",
  "settings",
  "message-square",
  "plug",
  "save",
  "file-text",
  "globe",
  "external-link",
  "more-horizontal",
  "log-out",
  "log-in",
  "users",
  "layout-grid",
  "map-pin",
  "activity",
  "box",
  "puzzle",
  "key",
  "folder",
  "calendar",
  "play",
  "database",
  "layers",
  "square-terminal",
  "chart-column",
  "square-arrow-up-right",
  "archive",
  "badge-check",
  "hard-drive",
  "sparkle",
  "zap",
  "pencil",
  "download",
];

// ---
// Build registry
// ---

function pascal(name) {
  return name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

const registry = {};
for (const name of ICONS) {
  const data = lucide[pascal(name)];
  if (!data || !Array.isArray(data)) {
    warn(`SKIP unknown lucide icon: ${name}`);
    continue;
  }
  registry[name] = data;
}

// ---
// Emit IIFE
// ---

function emit() {
  banner();
  section("Icons");

  const bannerComment = `/* GENERATED FILE — do not edit by hand.
   Regenerate with: node public/scripts/generate-al-icon.mjs
   Source: lucide v${lucide.version || "1"} module node arrays. */

(function () {
  'use strict';

  var ICONS = ${JSON.stringify(registry)};

  function attrsToString(attrs) {
    var out = '';
    for (var k in attrs) out += ' ' + k + '="' + String(attrs[k]) + '"';
    return out;
  }

  function renderNode(node) {
    var tag = node[0];
    var attrs = node[1];
    var children = node[2];
    var open = '<' + tag + attrsToString(attrs) + '>';
    var inner = '';
    if (children) {
      for (var i = 0; i < children.length; i++) inner += renderNode(children[i]);
    }
    return open + inner + '</' + tag + '>';
  }

  function alIcon(name, className, opts) {
    var data = ICONS[name];
    if (!data) {
      console.warn('[al-icon] Unknown icon: ' + name);
      return '<span aria-hidden="true" style="display:inline-block;width:16px;height:16px;"></span>';
    }
    opts = opts || {};
    var sw = opts.strokeWidth != null ? opts.strokeWidth : 1.5;
    var attrs = {
      xmlns: 'http://www.w3.org/2000/svg',
      width: opts.width || 16,
      height: opts.height || 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': sw,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    };
    if (className) attrs.class = className;
    if (opts.style) attrs.style = opts.style;
    if (opts.id) attrs.id = opts.id;
    if (opts.label) {
      attrs.role = 'img';
      attrs['aria-label'] = opts.label;
      delete attrs['aria-hidden'];
    }
    var inner = '';
    for (var i = 0; i < data.length; i++) inner += renderNode(data[i]);
    return '<svg' + attrsToString(attrs) + '>' + inner + '</svg>';
  }

  if (typeof window !== 'undefined') window.alIcon = alIcon;
  if (typeof module !== 'undefined' && module.exports) module.exports = alIcon;
})();
`;

  fs.writeFileSync(outFile, bannerComment, "utf8");
  ok(`${Object.keys(registry).length} icons → ${outFile}`);
  gap();
}

emit();
