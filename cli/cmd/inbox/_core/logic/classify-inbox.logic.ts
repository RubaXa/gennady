// @file: Pure classifier: mark each actionable MR new/updated/idle vs the registry.
// @consumers: inbox.cmd
// @tasks: N/A

import type { VcsActionableMr } from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';
import type { InboxRegistry } from './inbox-registry.logic.ts';

/** @purpose Change of an MR since the last tick. */
export type InboxDelta = 'new' | 'updated' | 'idle';

/** @purpose Classification result: per-MR deltas plus the registry to persist. */
export type ClassifyResult = {
  /** @purpose Delta per MR keyed by webUrl */
  deltas: Map<string, InboxDelta>;
  /** @purpose Registry updated with this tick's sightings */
  next: InboxRegistry;
};

/**
 * @purpose Compare the current actionable set against the registry: an MR is new
 *   when unseen, updated when its updatedAt advanced, idle otherwise. Past entries
 *   are kept (a returning MR reads as updated, not new).
 * @param items Current actionable MRs from the VCS client.
 * @param registry Previously persisted registry.
 * @param nowIso Current time as ISO string (injected for testability).
 * @returns Per-MR deltas and the next registry to save.
 * @consumer inbox.cmd
 */
export function classifyInbox(
  items: VcsActionableMr[],
  registry: InboxRegistry,
  nowIso: string
): ClassifyResult {
  const entries = { ...registry.entries };
  const deltas = new Map<string, InboxDelta>();

  for (const mr of items) {
    const prev = registry.entries[mr.webUrl];
    let delta: InboxDelta;
    if (!prev) {
      delta = 'new';
    } else if (Date.parse(mr.updatedAt) > Date.parse(prev.lastSeenUpdatedAt)) {
      delta = 'updated';
    } else {
      delta = 'idle';
    }
    deltas.set(mr.webUrl, delta);

    entries[mr.webUrl] = {
      project: mr.project,
      iid: mr.iid,
      role: mr.role,
      // Stage is owned by the discussion-scan step; carry the cached value here
      // so idle MRs keep their last computed stage.
      stage: prev?.stage ?? 'idle',
      lastSeenUpdatedAt: mr.updatedAt,
      firstSeenAt: prev?.firstSeenAt ?? nowIso,
      lastClassifiedAt: nowIso,
    };
  }

  return { deltas, next: { version: 1, entries } };
}
