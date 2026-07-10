// @file: HTTP helpers — sendJson, sendError, parseBody shared between HttpServer and routers.
// @consumers: HttpServer, BoardRouter, MrRouter, AuditRouter
// @tasks: TSK-106

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * @purpose Send a JSON response with the given status code.
 * @param res Server response object.
 * @param statusCode HTTP status code.
 * @param data Payload to serialize as JSON.
 */
export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @purpose Send a generic error response (500) for unexpected errors.
 * @param res Server response object.
 * @param _cause The error that triggered this response.
 */
export function sendError(res: ServerResponse, _cause: unknown): void {
  sendJson(res, 500, { ok: false, error: 'NETWORK', detail: 'Internal server error' });
}

/**
 * @purpose Parse JSON request body from an incoming request.
 * @param req Incoming HTTP request.
 * @returns Parsed body as T, or null if parsing fails.
 */
export function parseBody<T = unknown>(req: IncomingMessage): Promise<T | null> {
  const MAX_BODY = 1_048_576;
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * @purpose Add CORS headers to a response — allows localhost origins for dev.
 * @param res Server response object.
 * @param [origin] Request origin header value.
 */
export function setCorsHeaders(res: ServerResponse, origin?: string): void {
  const allowedOrigin = origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * @purpose Handle CORS preflight (OPTIONS) request.
 * @param req Incoming HTTP request.
 * @param res Server response object.
 * @returns true if this was a preflight and it was handled.
 */
export function handlePreflight(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'OPTIONS') return false;

  setCorsHeaders(res, req.headers.origin);
  res.writeHead(204);
  res.end();
  return true;
}
