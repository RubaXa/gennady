// @file: DashboardV2Api — canonical v2 HTTP surface used by the React dashboard.
// @consumers: DashboardV2Store, workspace/MrWorkspace, workspace/ReviewPackageWidget, handoff/ReviewHandoffControl
// @tasks: TSK-164, TSK-182

import type { BoardV2, BootV2, MrStateV2, FeedWidget, ReviewPackage } from './v2-types.ts';

type Envelope<T> = T & { ok?: boolean; error?: { code: string; message: string } };

/**
 * @purpose Fetch and normalize one v2 API response, preserving server error messages for visible UI states.
 * @param path API-relative request path.
 * @param [init] Optional fetch request initialization.
 * @returns Parsed successful response payload.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body as T;
}

/** @purpose Canonical browser client for the inbox v2 REST surface. */
export const dashboardV2Api = {
  boot: () => request<BootV2>('/api/boot'),
  board: () => request<BoardV2>('/api/board'),
  state: (ref: string) => request<MrStateV2>(`/api/state?mr=${encodeURIComponent(ref)}`),
  feed: (ref: string, cursor = 0) =>
    request<{ widgets: FeedWidget[]; nextCursor: number }>(
      `/api/mr/${encodeURIComponent(ref)}/feed?cursor=${cursor}`
    ),
  task: (ref: string, type: string, params: Record<string, unknown>) =>
    request<{ taskId: string }>(`/api/mr/${encodeURIComponent(ref)}/task`, {
      method: 'POST',
      body: JSON.stringify({ type, params }),
    }),
  decision: (ref: string, proposalId: string, verdict: 'accept' | 'edit' | 'reject') =>
    request<{ taskId?: string }>(`/api/mr/${encodeURIComponent(ref)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ proposalId, verdict }),
    }),
  undo: (ref: string, snapshotId: string) =>
    request<void>(`/api/mr/${encodeURIComponent(ref)}/chat/undo`, {
      method: 'POST',
      body: JSON.stringify({ snapshotId }),
    }),
  chat: (
    ref: string,
    text: string,
    anchor?: { widgetId?: string; artifactPath?: string; elementId?: string; quote?: string }
  ) =>
    request<void>(`/api/mr/${encodeURIComponent(ref)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ text, ...(anchor ? { anchor } : {}) }),
    }),
  package: (ref: string) => request<ReviewPackage>(`/api/mr/${encodeURIComponent(ref)}/package`),
  applyPackage: (ref: string, packageId: string, selectedActionIds: string[]) =>
    request<{ outcomes: Record<string, 'success' | 'error'> }>(
      `/api/mr/${encodeURIComponent(ref)}/package/apply`,
      { method: 'POST', body: JSON.stringify({ packageId, selectedActionIds }) }
    ),
  handoff: (ref: string, mode: 'full' | 'delta') =>
    request<{ text: string }>(`/api/mr/${encodeURIComponent(ref)}/handoff?mode=${mode}`),
  completeMr: (ref: string) =>
    request<void>(`/api/mr/${encodeURIComponent(ref)}/complete`, { method: 'POST' }),
  updateDescription: (ref: string) =>
    request<void>(`/api/mr/${encodeURIComponent(ref)}/description/update`, { method: 'POST' }),
};
