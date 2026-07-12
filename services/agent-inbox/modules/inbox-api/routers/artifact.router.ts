// @file: ArtifactRouter — GET /api/mr/:id/artifacts, GET /api/mr/:id/artifact?path= for the artifact browser.
// @consumers: HttpServer
// @tasks: TSK-106

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardProviderPort } from '../board-provider.port.ts';
import { sendJson, sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/mr/:id/artifacts (list) requests. */
const ARTIFACTS_LIST_RE = /^\/api\/mr\/(.+)\/artifacts$/;
/** @purpose Regex pattern for matching GET /api/mr/:id/artifact (single content) requests. */
const ARTIFACT_CONTENT_RE = /^\/api\/mr\/(.+)\/artifact$/;

/**
 * @purpose Reject any `path` value that could escape the `reports/<mr>/` subtree.
 * @invariant Blocks `..` segments, absolute paths, and NUL bytes — the only realistic traversal vectors for a relative path param.
 * @param path Raw `path` query-param value.
 * @returns true if the path stays within the artifact subtree.
 */
function isSafeArtifactPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\0')) return false;
  return path.split('/').every((segment) => segment !== '..' && segment !== '.');
}

/**
 * @purpose Route handlers for the artifact browser: list artifacts, read one artifact's content.
 */
export class ArtifactRouter {
  /** @purpose Board provider implementation. */
  protected _provider: BoardProviderPort;

  /**
   * @purpose Create an ArtifactRouter bound to a board provider.
   * @param provider BoardProviderPort implementation (mock or real).
   */
  constructor(provider: BoardProviderPort) {
    this._provider = provider;
  }

  /**
   * @purpose Check if this request matches an artifact route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return ARTIFACTS_LIST_RE.test(url.pathname) || ARTIFACT_CONTENT_RE.test(url.pathname);
  }

  /**
   * @purpose Route the request to list or content handler based on path pattern.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (ARTIFACTS_LIST_RE.test(pathname)) {
        this._handleList(res, pathname);
      } else if (ARTIFACT_CONTENT_RE.test(pathname)) {
        this._handleContent(res, pathname, url.searchParams.get('path'));
      }
    } catch (cause) {
      sendError(res, cause);
    }
  }

  /**
   * @purpose Extract MR ID from the URL path using the given regex.
   * @param pathname URL pathname.
   * @param re Regex with one capture group.
   * @returns Decoded MR ID.
   */
  protected _extractMrId(pathname: string, re: RegExp): string {
    const match = pathname.match(re);
    return decodeURIComponent(match?.[1] ?? '');
  }

  /**
   * @purpose Handle GET /api/mr/:id/artifacts — list navigable artifacts for an MR.
   * @param res Server response.
   * @param pathname URL pathname.
   */
  protected _handleList(res: ServerResponse, pathname: string): void {
    const mrId = this._extractMrId(pathname, ARTIFACTS_LIST_RE);
    const artifacts = this._provider.listArtifacts(mrId);
    sendJson(res, 200, { ok: true, artifacts });
  }

  /**
   * @purpose Handle GET /api/mr/:id/artifact?path= — return one artifact's content.
   * @param res Server response.
   * @param pathname URL pathname.
   * @param rawPath Raw `path` query-param value, or null if absent.
   */
  protected _handleContent(res: ServerResponse, pathname: string, rawPath: string | null): void {
    const mrId = this._extractMrId(pathname, ARTIFACT_CONTENT_RE);

    // #region START_BLOCK_ARTIFACT_PATH_TRAVERSAL — invariant: path must resolve strictly inside reports/<mr>/
    if (!rawPath || !isSafeArtifactPath(rawPath)) {
      sendJson(res, 400, {
        ok: false,
        error: 'CONFIG',
        detail: 'Missing or unsafe path parameter',
      });
      return;
    }
    // #endregion END_BLOCK_ARTIFACT_PATH_TRAVERSAL

    const artifact = this._provider.readArtifact(mrId, rawPath);
    if (!artifact) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND', detail: `Artifact not found: ${rawPath}` });
      return;
    }

    sendJson(res, 200, { ok: true, ...artifact });
  }
}
