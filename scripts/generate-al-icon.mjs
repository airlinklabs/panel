// Generates public/js/shared/al-icon.js — a compact client-side lucide icon registry.
// Usage: node scripts/generate-al-icon.js
// Data comes from the installed `lucide` module (v1 node-array format), so client
// and server icons stay pixel-identical to the server-side icon() helper.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lucide from 'lucide';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, '../public/js/shared/al-icon.js');

// Icons needed by static client-side JS (search.js, dashboard.js, create-server.js,
// loading-popup.js, admin-*.js). Keep this list tight — each entry costs bytes.
const ICONS = [
  'server', 'user', 'network', 'search', 'search-x', 'clock', 'arrow-up-right',
  'sparkles', 'x', 'trash-2', 'check', 'circle-check', 'loader-circle',
  'triangle-alert', 'shield-check', 'scan-search', 'refresh-cw', 'plus', 'copy',
  'info', 'circle-x', 'circle-help', 'ellipsis', 'wifi-off', 'chevron-left',
  'chevron-right', 'sun', 'moon', 'settings', 'message-square', 'plug', 'save',
  'file-text', 'globe', 'external-link', 'more-horizontal', 'log-out', 'log-in',
  'users', 'layout-grid', 'map-pin', 'activity', 'box', 'puzzle', 'key',
  'folder', 'calendar', 'play', 'database', 'layers', 'square-terminal',
  'chart-column', 'square-arrow-up-right', 'archive', 'badge-check',
  'hard-drive', 'sparkle',
];

function pascal(name) {
  return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

const registry = {};
for (const name of ICONS) {
  const data = lucide[pascal(name)];
  if (!data || !Array.isArray(data)) {
    console.warn(`SKIP unknown lucide icon: ${name}`);
    continue;
  }
  registry[name] = data;
}

const banner = `/* GENERATED FILE — do not edit by hand.
   Regenerate with: node scripts/generate-al-icon.js
   Source: lucide v${lucide.version || '1'} module node arrays. */

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

  // alIcon('trash-2', 'w-4 h-4') -> SVG string, stroke-based, currentColor
  function alIcon(name, className, opts) {
    var data = ICONS[name];
    if (!data) {
      console.warn('[al-icon] Unknown icon: ' + name);
      return '<span aria-hidden="true" style="display:inline-block;width:16px;height:16px;"></span>';
    }
    opts = opts || {};
    var sw = opts.strokeWidth != null ? opts.strokeWidth : 1.75;
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

fs.writeFileSync(outFile, banner, 'utf8');
console.log(`Wrote ${outFile} (${Object.keys(registry).length} icons)`);
