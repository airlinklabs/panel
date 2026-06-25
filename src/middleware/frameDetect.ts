import { Request, Response, NextFunction } from 'express';

/**
 * Detects frame navigation requests and intercepts res.send to return
 * only the #page-content fragment instead of the full HTML page.
 *
 * Client sends X-Frame-Request: page-content header.
 * Server responds with just the fragment + X-Frame-Response header.
 */
export function frameDetect(req: Request, res: Response, next: NextFunction): void {
  const frameTarget = req.headers['x-frame-request'] as string | undefined;

  if (frameTarget !== 'page-content') {
    return next();
  }

  res.locals.isFrameRequest = true;

  const originalSend = res.send.bind(res);

  (res as any).send = function (body: any) {
    if (typeof body !== 'string') {
      return originalSend(body);
    }

    const fragment = extractFrame(body);

    if (!fragment) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return originalSend(body);
    }

    const titleMatch = body.match(/<title>([^<]*)<\/title>/i);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Response', 'page-content');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Frame-Request');
    if (titleMatch) {
      res.setHeader('X-Frame-Title', titleMatch[1]);
    }
    return originalSend(fragment);
  };

  next();
}

/**
 * Extracts the #page-content element AND any page-specific scripts that follow it
 * (before the footer include) from a full HTML string.
 * Uses a state-machine parser that handles nested divs correctly.
 */
function extractFrame(html: string): string | null {
  const openTagRe = /<(div|main|section)\s[^>]*id\s*=\s*["']page-content["'][^>]*>/i;
  const match = openTagRe.exec(html);

  if (!match) return null;

  const tagName = match[1].toLowerCase();
  const openTag = match[0];
  const openStart = match.index;
  const innerStart = openStart + openTag.length;

  // Walk forward tracking nesting depth for this tag
  let depth = 1;
  let cursor = innerStart;
  const closeTag = `</${tagName}>`;
  const openPat = new RegExp(`<${tagName}[\\s>]`, 'gi');
  const closePat = new RegExp(`<\\/${tagName}>`, 'gi');

  openPat.lastIndex = innerStart;
  closePat.lastIndex = innerStart;

  let frameHtml = null;

  while (depth > 0 && cursor < html.length) {
    openPat.lastIndex = cursor;
    closePat.lastIndex = cursor;

    const nextOpen = openPat.exec(html);
    const nextClose = closePat.exec(html);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        // Found the closing tag — extract inner content
        const innerHtml = html.slice(innerStart, nextClose.index);
        const afterClose = nextClose.index + closeTag.length;
        frameHtml = openTag + innerHtml + closeTag;

        // Also grab page-specific scripts that follow #page-content
        // (they sit between </main>/*</section> and the footer include)
        const afterFrame = html.slice(afterClose).trim();
        const footerIdx = findFooterInclude(afterFrame);
        const scriptsSection = footerIdx >= 0
          ? afterFrame.slice(0, footerIdx)
          : afterFrame;

        // Only include if it contains script tags (skip empty/whitespace)
        if (scriptsSection.trim()) {
          frameHtml += '\n' + scriptsSection.trim();
        }

        return frameHtml;
      }
      cursor = nextClose.index + closeTag.length;
    }
  }

  return null;
}

/**
 * Finds the index where a footer EJS include starts.
 * Matches patterns like: <%- include('../../components/footer') %>
 */
function findFooterInclude(html: string): number {
  // Match the footer include pattern (relative path to components/footer)
  const footerRe = /<%-[\s]*include\(['"][^'"]*\/components\/footer['"][\s]*\)/i;
  const match = footerRe.exec(html);
  return match ? match.index : -1;
}
