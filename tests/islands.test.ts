import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const consoleViewPath = path.resolve(
  __dirname,
  '../views/user/server/console.ejs',
);
const consoleIslandPath = path.resolve(
  __dirname,
  '../public/javascript/islands/server-console.js',
);

describe('server console island wiring', () => {
  const view = fs.readFileSync(consoleViewPath, 'utf8');
  const island = fs.readFileSync(consoleIslandPath, 'utf8');

  it('loads xterm styling as a stylesheet instead of an invalid JavaScript module', () => {
    expect(view).toContain('assetUrl(\'/vendor/@xterm/xterm/css/xterm.css\')');
    expect(island).not.toContain('import \'/vendor/@xterm/xterm/css/xterm.css\'');
  });

  it('surfaces a mount failure instead of leaving a dead console page', () => {
    expect(view).toContain('Failed to initialize the server console.');
    expect(view).toContain('Console unavailable');
  });

  it('owns the copy-server-address button inside the console island', () => {
    expect(island).toContain('root.querySelector(\'#copy-ip-btn\')');
    expect(island).toContain('root.querySelector(\'#mobile-copy-ip-btn\')');
    expect(view).not.toContain('onclick="copyServerIP()"');
    expect(view).not.toContain('onclick="copyMobileServerIP()"');
  });

  it('uses the terminal theme hook expected by shared theme controls', () => {
    expect(island).toContain('window.setTerminalTheme = setTerminalTheme');
  });

  it('loads UMD vendor libraries as classic scripts, not bare ESM imports', () => {
    expect(island).toContain('\'/vendor/@xterm/xterm/lib/xterm.js\'');
    expect(island).toContain('\'/vendor/chart.js/dist/chart.umd.min.js\'');
    expect(island).not.toContain('import(\'@xterm/xterm\')');
    expect(island).not.toContain('import(\'chart.js\')');
  });
});
