// @file: HTTP helpers — sendJson, sendDomainError, sendError, parseBody shared between HttpServer and routers.
// @consumers: HttpServer, BoardRouter, MrRouter, AuditRouter
// @tasks: TSK-106, TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';

/** @purpose Closed set of domain error codes per spec §4 — maps to 4xx HTTP responses. */
export type ApiErrorCode = 'not_found' | 'invalid_input' | 'conflict' | 'degraded' | 'forbidden';

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
 * @purpose Send a domain error response — structured envelope per spec §4: {error:{code,message,anchor?}}.
 *   Domain errors → 4xx status; code from the closed ApiErrorCode set.
 * @param res Server response object.
 * @param statusCode HTTP status code (4xx for domain errors).
 * @param code Machine-readable error code from the closed ApiErrorCode set.
 * @param message Human-readable error message.
 * @param [anchor] Optional anchor for UI to navigate to the failing field/section.
 */
export function sendDomainError(
  res: ServerResponse,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  anchor?: string
): void {
  const body: { error: { code: string; message: string; anchor?: string } } = {
    error: { code, message },
  };
  if (anchor) body.error.anchor = anchor;
  sendJson(res, statusCode, body);
}

/**
 * @purpose Send a generic error response (500) for unexpected/internal errors.
 *   Uses the structured {error:{code,message}} envelope with code='degraded'.
 * @param res Server response object.
 * @param _cause The error that triggered this response — preserved for logging, not sent to client.
 */
export function sendError(res: ServerResponse, _cause: unknown): void {
  sendJson(res, 500, { error: { code: 'degraded', message: 'Internal server error' } });
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
