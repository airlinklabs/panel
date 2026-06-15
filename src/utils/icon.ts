/**
 * Server-side Lucide icon renderer for EJS views.
 *
 * Usage in EJS:
 *   <%- icon('server', { class: 'w-4 h-4' }) %>
 *   <%- icon('lock', { size: 14 }) %>
 *   <%- icon('cpu', { class: 'text-emerald-500 w-5 h-5' }) %>
 */

// lucide exports icons as arrays of [tag, attrs, children?] tuples
 
const lucideIcons = require('lucide') as Record<string, unknown>;

interface IconOptions {
  /** Extra CSS classes applied to the <svg> element */
  class?: string;
  /** Override width and height (px) — default 16 */
  size?: number;
  /** Override width only */
  width?: number;
  /** Override height only */
  height?: number;
  /** Override stroke-width — default 1.75 */
  strokeWidth?: number;
  /** aria-label for standalone decorative icons */
  label?: string;
  /** Additional inline style */
  style?: string;
}

type IconNode = [string, Record<string, string | number>, IconNode[]?];

function attrsToString(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(' ');
}

function renderNode([tag, attrs, children]: IconNode): string {
  const attrStr = attrsToString(attrs);
  if (!children || children.length === 0) {
    return `<${tag} ${attrStr}/>`;
  }
  const inner = children.map(renderNode).join('');
  return `<${tag} ${attrStr}>${inner}</${tag}>`;
}

// Map human-friendly dash-case names to PascalCase lucide export keys
function toPascalCase(name: string): string {
  return name
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

export function icon(name: string, opts: IconOptions = {}): string {
  const key = toPascalCase(name);
  const iconData = lucideIcons[key] as IconNode[] | undefined;

  if (!iconData || !Array.isArray(iconData)) {
    // Graceful degradation — render an empty placeholder span
    console.warn(`[icon] Unknown Lucide icon: "${name}" (looked up as "${key}")`);
    return `<span aria-hidden="true" style="display:inline-block;width:${opts.size ?? 16}px;height:${opts.size ?? 16}px;"></span>`;
  }

  const w = opts.width  ?? opts.size ?? 16;
  const h = opts.height ?? opts.size ?? 16;
  const sw = opts.strokeWidth ?? 1.75;

  const svgAttrs: Record<string, string | number> = {
    xmlns:              'http://www.w3.org/2000/svg',
    width:              w,
    height:             h,
    viewBox:            '0 0 24 24',
    fill:               'none',
    stroke:             'currentColor',
    'stroke-width':     sw,
    'stroke-linecap':   'round',
    'stroke-linejoin':  'round',
    'aria-hidden':      'true',
  };

  if (opts.class)  svgAttrs['class'] = opts.class;
  if (opts.style)  svgAttrs['style'] = opts.style;
  if (opts.label) {
    svgAttrs['role']       = 'img';
    svgAttrs['aria-label'] = opts.label;
    delete svgAttrs['aria-hidden'];
  }

  const innerSVG = iconData.map(renderNode).join('');
  const attrStr  = attrsToString(svgAttrs);
  return `<svg ${attrStr}>${innerSVG}</svg>`;
}

export default icon;
