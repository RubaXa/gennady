// @file: ApiClient — HTTP client for inbox-api REST endpoints consumed by the dashboard.
// @consumers: BoardStore
// @tasks: TSK-107, TSK-146

import type {
  BoardData,
  MrDetail,
  ApiResponse,
  ArtifactRef,
  ArtifactContent,
  FixTaskCopyResult,
} from '../../inbox-api/types.ts';
import { log } from './debug-log.ts';

/** @purpose Base URL for inbox-api. Empty = same-origin: SPA and API share one HttpServer, so
 *   relative paths hit whatever port `inbox serve` runs on. */
const BASE_URL = '';

/**
 * @purpose Thin fetch wrapper with JSON parsing and error handling.
 * @param path URL path relative to BASE_URL.
 * @param options fetch options.
 * @returns Parsed JSON response.
 * @throws {Error} On network failure or non-ok response.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const anchor = `api#${(options?.method ?? 'GET').toLowerCase()}`;
  log(anchor, 'start', path);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
  } catch (cause) {
    log(anchor, 'network-error', path, String(cause));
    throw cause;
  }

  if (!res.ok) {
    log(anchor, 'http-error', res.status, path);
    throw new Error(`[ApiClient#request] HTTP ${res.status} ${res.statusText} for ${path}`);
  }

  log(anchor, 'ok', res.status, path);
  return res.json() as Promise<T>;
}

/**
 * @purpose Fetch the full board state from GET /api/board.
 * @returns Board data with roles and unassigned MRs.
 * @sideEffect Network: GET /api/board
 */
export async function getBoard(): Promise<BoardData> {
  const data = await request<ApiResponse<BoardData>>('/api/board');
  // Strip the ApiResponse envelope — the board router returns { ok: true, roles, unassigned }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- D-007: strip ApiResponse ok envelope from board data
  const { ok: _, ...board } = data as ApiResponse<BoardData> & BoardData;
  return board as unknown as BoardData;
}

/**
 * @purpose Fetch detailed MR report from GET /api/mr/:id/report.
 * @param mrId MR identifier (e.g. "group/project!510").
 * @returns Detailed MR report.
 * @sideEffect Network: GET /api/mr/:id/report
 */
export async function getReport(mrId: string): Promise<MrDetail> {
  const data = await request<ApiResponse<MrDetail>>(`/api/mr/${encodeURIComponent(mrId)}/report`);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- D-007: strip ApiResponse ok envelope from report
  const { ok: _, ...report } = data as ApiResponse<MrDetail> & MrDetail;
  return report as unknown as MrDetail;
}

/**
 * @purpose Assign an MR to a role via POST /api/mr/:id/assign.
 * @param mrId MR identifier.
 * @param role Target role name.
 * @param [rights] Optional access rights.
 * @returns Promise that resolves when the assignment is sent.
 * @sideEffect Network: POST /api/mr/:id/assign
 */
export async function assignMr(
  mrId: string,
  role: string,
  rights?: Record<string, unknown>
): Promise<void> {
  await request(`/api/mr/${encodeURIComponent(mrId)}/assign`, {
    method: 'POST',
    body: JSON.stringify({ role, rights }),
  });
}

/**
 * @purpose Execute an operator action via POST /api/mr/:id/action.
 * @param mrId MR identifier.
 * @param questionId Question being answered.
 * @param choice Operator's choice.
 * @param [payload] Optional payload.
 * @returns Promise that resolves when the action is executed.
 * @sideEffect Network: POST /api/mr/:id/action
 */
export async function executeAction(
  mrId: string,
  questionId: string,
  choice: string,
  payload?: unknown
): Promise<void> {
  await request(`/api/mr/${encodeURIComponent(mrId)}/action`, {
    method: 'POST',
    body: JSON.stringify({ questionId, choice, payload }),
  });
}

/**
 * @purpose List navigable artifacts for an MR via GET /api/mr/:id/artifacts.
 * @param mrId MR identifier (e.g. "group/project!510").
 * @returns Artifact references (REPORT/PLAN/tracks/HISTORY/coverage/tool-log).
 * @sideEffect Network: GET /api/mr/:id/artifacts
 */
export async function listArtifacts(mrId: string): Promise<ArtifactRef[]> {
  const data = await request<ApiResponse<{ artifacts: ArtifactRef[] }>>(
    `/api/mr/${encodeURIComponent(mrId)}/artifacts`
  );
  return data.artifacts;
}

/**
 * @purpose Read one artifact's content via GET /api/mr/:id/artifact?path=.
 * @param mrId MR identifier.
 * @param path Artifact path relative to `reports/<mr>/`, verbatim from the ArtifactRef.
 * @throws {Error} On HTTP failure (missing/unsafe path, or artifact not found).
 * @returns Artifact content and its render-hint kind.
 * @sideEffect Network: GET /api/mr/:id/artifact?path=
 */
export async function readArtifact(mrId: string, path: string): Promise<ArtifactContent> {
  const data = await request<ApiResponse<ArtifactContent>>(
    `/api/mr/${encodeURIComponent(mrId)}/artifact?path=${encodeURIComponent(path)}`
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- D-007: strip ApiResponse ok envelope from artifact content
  const { ok: _, ...content } = data;
  return content as ArtifactContent;
}

/**
 * @purpose Record one "Copy fix task" click via POST /api/mr/:id/copy-fix-task (SV-14).
 * @param mrId MR identifier (e.g. "group/project!510").
 * @throws {Error} HTTP 404 when the MR is not found (via {@link request}'s non-ok handling).
 * @returns First-click flag, prior copy count, last-copy timestamp, and findings delta since the last click.
 * @sideEffect Network: POST /api/mr/:id/copy-fix-task
 */
export async function recordFixTaskCopy(mrId: string): Promise<FixTaskCopyResult> {
  const data = await request<ApiResponse<FixTaskCopyResult>>(
    `/api/mr/${encodeURIComponent(mrId)}/copy-fix-task`,
    { method: 'POST' }
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- D-007: strip ApiResponse ok envelope from copy-fix-task result
  const { ok: _, ...result } = data as ApiResponse<FixTaskCopyResult> & FixTaskCopyResult;
  return result as unknown as FixTaskCopyResult;
}
