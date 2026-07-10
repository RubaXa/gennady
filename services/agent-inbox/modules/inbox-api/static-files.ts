// @file: StaticFiles — serve SPA static assets from dist directory with SPA fallback to index.html.
// @consumers: HttpServer
// @tasks: TSK-106

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

/** @purpose MIME type map for common static file extensions. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * @purpose Serve static files from a dist directory with SPA fallback.
 * @invariant Non-API, non-existent paths → serve index.html (SPA fallback).
 * @invariant Index.html is assumed to exist at the root of the dist directory.
 */
export class StaticFiles {
  /** @purpose Path to the static files directory. */
  protected _distDir: string;
  /** @purpose Path to the index.html file. */
  protected _indexPath: string;

  /**
   * @purpose Create a static file server bound to a dist directory.
   * @param [distDir] Path to the directory containing static files (default: dist/inbox-serve).
   */
  constructor(distDir?: string) {
    this._distDir = resolve(distDir ?? join(process.cwd(), 'dist', 'inbox-serve'));
    this._indexPath = join(this._distDir, 'index.html');
  }

  /**
   * @purpose Serve a static file or fallback to index.html.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  serve(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const requested = url.pathname === '/' ? 'index.html' : url.pathname;
    const resolved = resolve(join(this._distDir, requested));

    if (!resolved.startsWith(this._distDir + '/') && resolved !== this._distDir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (existsSync(resolved) && statSync(resolved).isFile()) {
      this._serveFile(res, resolved);
    } else {
      this._serveFallback(res);
    }
  }

  /**
   * @purpose Stream a file to the response with correct Content-Type.
   * @param res Server response.
   * @param filePath Absolute path to the file.
   */
  protected _serveFile(res: ServerResponse, filePath: string): void {
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    try {
      const stats = statSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
      });
      const stream = createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    } catch {
      if (!res.headersSent) {
        this._serveFallback(res);
      }
    }
  }

  /**
   * @purpose Serve index.html as SPA fallback.
   * @param res Server response.
   */
  protected _serveFallback(res: ServerResponse): void {
    if (existsSync(this._indexPath)) {
      const stats = statSync(this._indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': stats.size,
      });
      const stream = createReadStream(this._indexPath);
      stream.pipe(res);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body>Agent Inbox Dashboard</body></html>');
    }
  }
}
