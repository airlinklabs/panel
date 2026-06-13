import { Request, Response, NextFunction } from 'express';
import path from 'path';
import * as ejs from 'ejs';
import logger from './logger';

interface SPAPageData {
  content: string;
  title: string;
  scripts?: string[];
  styles?: string[];
  meta?: Record<string, string>;
}

export class SPAHandler {
  private static instance: SPAHandler;
  private pageCache = new Map<string, SPAPageData>();
  private cacheEnabled = false; // disabled — data-keyed cache causes memory leak

  static getInstance(): SPAHandler {
    if (!SPAHandler.instance) {
      SPAHandler.instance = new SPAHandler();
    }
    return SPAHandler.instance;
  }

  async renderPageContent(viewPath: string, data: any): Promise<SPAPageData> {
    const cacheKey = `${viewPath}_${JSON.stringify(data)}`;
    
    if (this.cacheEnabled && this.pageCache.has(cacheKey)) {
      return this.pageCache.get(cacheKey)!;
    }

    try {
      const content = await this.renderView(viewPath, data);
      const pageData: SPAPageData = {
        content,
        title: this.extractTitle(data),
        scripts: this.extractScripts(content),
        styles: this.extractStyles(content),
        meta: this.extractMeta(data)
      };

      if (this.cacheEnabled) {
        this.pageCache.set(cacheKey, pageData);
      }

      return pageData;
    } catch (error) {
      throw new Error(`Failed to render page content: ${error}`);
    }
  }

  private async renderView(viewPath: string, data: any): Promise<string> {
    return new Promise((resolve, reject) => {
      ejs.renderFile(viewPath, data, (err: any, html: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.extractContentOnly(html));
        }
      });
    });
  }

  private extractContentOnly(html: string): string {
    const contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (contentMatch) {
      return contentMatch[1];
    }

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      let content = bodyMatch[1];
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      content = content.replace(/<link[^>]*>/gi, '');
      content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      return content;
    }

    return html;
  }

  private extractTitle(data: any): string {
    if (data.title) {
      return `${data.settings?.title || 'AirLink'} - ${data.title}`;
    }
    return data.settings?.title || 'AirLink';
  }

  private extractScripts(content: string): string[] {
    const scripts: string[] = [];
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = scriptRegex.exec(content)) !== null) {
      scripts.push(match[1]);
    }

    return scripts;
  }

  private extractStyles(content: string): string[] {
    const styles: string[] = [];
    const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      styles.push(match[1]);
    }

    return styles;
  }

  private extractMeta(data: any): Record<string, string> {
    const meta: Record<string, string> = {};
    
    if (data.description) {
      meta.description = data.description;
    }
    
    if (data.keywords) {
      meta.keywords = data.keywords;
    }

    return meta;
  }

  clearCache(): void {
    this.pageCache.clear();
  }

  getCacheSize(): number {
    return this.pageCache.size;
  }
}

export function spaMiddleware(req: Request, res: Response, next: NextFunction) {
  const isAjaxRequest = req.headers['x-requested-with'] === 'XMLHttpRequest';
  const isApiRequest = req.path.startsWith('/api/page-content');
  
  if (isAjaxRequest || isApiRequest) {
    res.locals.isSPA = true;
  }
  
  next();
}

export function handleSPAPageRequest(
  originalRender: (view: string, options?: any, callback?: (err: any, html?: string) => void) => void,
) {
  return function(
    this: Response,
    view: string,
    options?: any,
    callback?: (err: any, html?: string) => void,
  ) {
    if (this.locals.isSPA) {
      const spaHandler = SPAHandler.getInstance();

      const viewPath = path.resolve(process.cwd(), 'views', view + '.ejs');

      spaHandler
        .renderPageContent(viewPath, { ...this.locals, ...options })
        .then((pageData) => {
          this.json(pageData);
        })
        .catch((error) => {
          logger.error('SPA render error:', error);
          this.status(500).json({ error: 'Failed to render page content' });
        });
    } else {
      return originalRender.call(this, view, options, callback);
    }
  };
}

