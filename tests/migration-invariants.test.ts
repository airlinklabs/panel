import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');

function walkEjs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkEjs(full));
    } else if (entry.name.endsWith('.ejs')) {
      results.push(full);
    }
  }
  return results;
}

function relToViews(full: string): string {
  return path.relative(VIEWS, full);
}

describe('Migration invariant: CSP nonce on inline scripts', () => {
  const files = walkEjs(VIEWS);

  const skipNonce = new Set([
    'components/header.ejs',
    'components/footer.ejs',
    'components/toast.ejs',
    'components/sidebar.ejs',
    'components/bottomNav.ejs',
    'components/modal.ejs',
    'components/template.ejs',
    'components/serverFeatures.ejs',
    'components/csrf.ejs',
    'components/loadingPopup.ejs',
    'components/imageViewer.ejs',
    'components/sftp.ejs',
    'components/portsAllocator.ejs',
    'components/auth-header.ejs',
    'components/auth-styles.ejs',
    'components/installHeader.ejs',
    'components/serverHeader.ejs',
    'components/serverMeta.ejs',
    'components/serverTemplate.ejs',
    'errors/error.ejs',
  ]);

  for (const file of files) {
    const rel = relToViews(file);
    if (skipNonce.has(rel)) continue;

    it(`${rel}: inline <script> tags must carry nonce`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const scriptRegex = /<script(?![^>]*\bnonce\b)[^>]*>/gi;
      const matches = content.match(scriptRegex);
      if (matches) {
        // Filter out:
        // - <script src=...> external scripts (they don't need nonce in CSP)
        // - <script type="application/json"> data blocks (non-executable)
        // Only flag inline executable <script> without nonce.
        const inlineNoNonce = matches.filter(
          (m) =>
            !m.includes(' src=') &&
            !m.includes('nonce=') &&
            !m.includes('type="application/json"') &&
            !m.includes("type='application/json'")
        );
        expect(
          inlineNoNonce,
          `${rel} has inline <script> without nonce: ${inlineNoNonce.join(', ')}`
        ).toHaveLength(0);
      }
    });
  }
});

describe('Migration invariant: fragment views must not include document shell', () => {
  const fragmentDir = path.join(VIEWS, 'fragments');
  if (!fs.existsSync(fragmentDir)) {
    it.skip('fragments directory does not exist yet', () => {});
    return;
  }

  const fragments = walkEjs(fragmentDir);
  if (fragments.length === 0) {
    it.skip('no fragment views exist yet', () => {});
    return;
  }

  for (const file of fragments) {
    const rel = relToViews(file);
    it(`${rel}: must not contain <html, <head, or <body> tags`, () => {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/<html[\s>]/i);
      expect(content).not.toMatch(/<head[\s>]/i);
      expect(content).not.toMatch(/<body[\s>]/i);
    });

    it(`${rel}: must not include header or footer`, () => {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/include\(.*header\.ejs/i);
      expect(content).not.toMatch(/include\(.*footer\.ejs/i);
      expect(content).not.toMatch(/include\(.*template\.ejs/i);
    });
  }
});

describe('Migration invariant: shared shell included once', () => {
  const pageFiles = walkEjs(VIEWS).filter((f) => {
    const rel = relToViews(f);
    return (
      !rel.startsWith('components/') &&
      !rel.startsWith('errors/') &&
      !rel.startsWith('api/') &&
      !rel.startsWith('fragments/')
    );
  });

  for (const file of pageFiles) {
    const rel = relToViews(file);
    it(`${rel}: header.ejs included at most once`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const includes = content.match(/include\(.*header\.ejs/gi) || [];
      expect(includes.length).toBeLessThanOrEqual(1);
    });
  }
});

describe('Migration invariant: no raw unescaped user data in views', () => {
  const files = walkEjs(VIEWS);

  for (const file of files) {
    const rel = relToViews(file);
    it(`${rel}: no <%- %> with req.body, req.query, or req.params`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const rawEscapes = content.match(/<%-[^%]*req\.(body|query|params)/gi) || [];
      expect(
        rawEscapes,
        `${rel} uses <%- with request data: ${rawEscapes.join(', ')}`
      ).toHaveLength(0);
    });
  }
});

describe('Migration invariant: header.ejs loads required lifecycle scripts', () => {
  const header = fs.readFileSync(
    path.join(VIEWS, 'components/header.ejs'),
    'utf8'
  );

  it('loads turbo.js', () => {
    expect(header).toContain('turbo.js');
  });

  it('loads stimulus.js', () => {
    expect(header).toContain('stimulus.js');
  });

  it('loads query-core.js', () => {
    expect(header).toContain('query-core.js');
  });

  it('loads turbo-shell.js', () => {
    expect(header).toContain('turbo-shell.js');
  });

  it('loads csrf.js', () => {
    expect(header).toContain('csrf.js');
  });

  it('loads al-icon.js', () => {
    expect(header).toContain('al-icon.js');
  });
});
