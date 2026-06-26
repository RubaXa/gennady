// @file: Pure policy: filter, group, and sort actionable MRs into an inbox view.
// @consumers: inbox.cmd
// @tasks: N/A

import type {
  VcsActionableMr,
  VcsActionableRole,
  VcsActionableEvent,
} from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';
import type { InboxDelta } from './classify-inbox.logic.ts';
import type { MrStage } from './classify-mr-stage.logic.ts';

/** @purpose Toggles controlling inbox filtering; all default to the noise-suppressing side. */
export type InboxOptions = {
  /** @purpose Show drafts | @invariant Default false */
  drafts: boolean;
  /** @purpose Show stale items | @invariant Default false */
  includeStale: boolean;
  /** @purpose Days without an update after which an item is stale | @invariant Default 14 */
  staleDays: number;
  /** @purpose Show CI/state events for all roles, not only author | @invariant Default false */
  ciAll: boolean;
  /** @purpose Disable suppression of stale/drafts/events (role filter still applies) | @invariant Default false */
  all: boolean;
};

/** @purpose A visible inbox row with derived presentation fields. */
export type InboxItem = {
  /** @purpose Merge request internal ID */
  iid: string;
  /** @purpose Project full path */
  project: string;
  /** @purpose Web URL of the merge request */
  webUrl: string;
  /** @purpose Merge request title */
  title: string;
  /** @purpose Resolved role (group this row belongs to) */
  role: VcsActionableRole;
  /** @purpose Whether I was directly addressed (affects sort) */
  directlyAddressed: boolean;
  /** @purpose Whether the MR is a draft */
  draft: boolean;
  /** @purpose Events to display for this row after policy (CI/mergeable) */
  shownEvents: VcsActionableEvent[];
  /** @purpose Humanized age since last update, e.g. 3h, 2d */
  ageLabel: string;
  /** @purpose Change since the last tick: new, updated, or idle */
  delta: InboxDelta;
  /** @purpose Actionable stage from discussion scan (idle when not scanned) */
  stage: MrStage;
};

/** @purpose Grouped, filtered inbox plus counts of what was hidden and why. */
export type InboxView = {
  /** @purpose Non-empty role groups in display order */
  groups: { role: VcsActionableRole; items: InboxItem[] }[];
  /** @purpose Number of visible rows across all groups */
  total: number;
  /** @purpose Counts of rows suppressed by policy, by reason (closed = merged/closed/locked) */
  hidden: { stale: number; drafts: number; noise: number; closed: number };
  /** @purpose Counts of visible rows that are new / updated since last tick */
  delta: { new: number; updated: number };
};

const GROUP_ORDER: VcsActionableRole[] = ['reviewer', 'author', 'mentioned'];

function hasBlockingEvent(events: VcsActionableEvent[]): boolean {
  return events.includes('ci_failed') || events.includes('unmergeable');
}

function humanizeAge(updatedAt: string, nowMs: number): string {
  const then = Date.parse(updatedAt);
  if (Number.isNaN(then)) return '';
  const min = Math.max(0, (nowMs - then) / 60000);
  if (min < 60) return `${Math.round(min)}m`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * @purpose Apply inbox policy: drop role-less noise, hide stale/drafts, decorate
 *   with displayable events, then group by role and sort within each group.
 * @param items Raw normalized actionable MRs from the VCS client.
 * @param options Filtering toggles.
 * @param nowIso Current time as ISO string (injected for testability).
 * @param [deltas] Per-MR change since the last tick, keyed by webUrl (defaults to empty).
 * @param [stages] Per-MR actionable stage, keyed by webUrl (defaults to empty).
 * @returns Grouped inbox view with hidden-counts.
 * @consumer inbox.cmd
 */
export function buildInboxView(
  items: VcsActionableMr[],
  options: InboxOptions,
  nowIso: string,
  deltas: Map<string, InboxDelta> = new Map(),
  stages: Map<string, MrStage> = new Map()
): InboxView {
  const nowMs = Date.parse(nowIso);
  const staleMs = options.staleDays * 24 * 60 * 60 * 1000;
  const hidden = { stale: 0, drafts: 0, noise: 0, closed: 0 };
  const buckets: Record<VcsActionableRole, InboxItem[]> = {
    reviewer: [],
    author: [],
    mentioned: [],
  };

  for (const mr of items) {
    // Hard rule: only open MRs are actionable. A merged/closed/locked MR reaches
    // here only via a stale pending todo GitLab never cleared — there is nothing
    // to act on, so drop it even under --all.
    if (mr.state !== 'opened') {
      hidden.closed++;
      continue;
    }

    // Hard rule: an MR without a role is just a state event pointing at someone
    // else's work — never an inbox entry, even under --all.
    if (!mr.role) {
      hidden.noise++;
      continue;
    }

    const age = nowMs - Date.parse(mr.updatedAt);
    const stale = age > staleMs;
    const blocking = hasBlockingEvent(mr.events);
    // Keep an author's draft only while it is fresh and actually blocked — never
    // resurface ancient WIP just because CI failed long ago.
    const keepDraft = options.drafts || options.all || (mr.role === 'author' && blocking && !stale);
    if (mr.draft && !keepDraft) {
      hidden.drafts++;
      continue;
    }

    if (stale && !options.includeStale && !options.all) {
      hidden.stale++;
      continue;
    }

    const showEvents = mr.role === 'author' || options.ciAll || options.all;
    const shownEvents = showEvents
      ? mr.events.filter((e) => e === 'ci_failed' || e === 'unmergeable')
      : [];

    buckets[mr.role].push({
      iid: mr.iid,
      project: mr.project,
      webUrl: mr.webUrl,
      title: mr.title,
      role: mr.role,
      directlyAddressed: mr.directlyAddressed,
      draft: mr.draft,
      shownEvents,
      ageLabel: humanizeAge(mr.updatedAt, nowMs),
      delta: deltas.get(mr.webUrl) ?? 'idle',
      stage: stages.get(mr.webUrl) ?? 'idle',
    });
  }

  // Sort by recency; look up the original updatedAt by webUrl.
  const updatedAt = new Map(items.map((m) => [m.webUrl, m.updatedAt]));
  const cmpUpdated = (a: InboxItem, b: InboxItem) =>
    Date.parse(updatedAt.get(b.webUrl) ?? '') - Date.parse(updatedAt.get(a.webUrl) ?? '');
  // Urgency of the stage: "answer me" first, then "review me", then waiting/idle.
  const stageRank: Record<MrStage, number> = {
    reply_needed: 3,
    review_needed: 2,
    awaiting_reply: 1,
    idle: 0,
  };
  const cmpStage = (a: InboxItem, b: InboxItem) => stageRank[b.stage] - stageRank[a.stage];

  buckets.reviewer.sort((a, b) => cmpStage(a, b) || cmpUpdated(a, b));
  buckets.author.sort((a, b) => {
    const ab = Number(b.shownEvents.length > 0) - Number(a.shownEvents.length > 0);
    return cmpStage(a, b) || ab || cmpUpdated(a, b);
  });
  buckets.mentioned.sort((a, b) => {
    const da = Number(b.directlyAddressed) - Number(a.directlyAddressed);
    return cmpStage(a, b) || da || cmpUpdated(a, b);
  });

  const groups = GROUP_ORDER.filter((role) => buckets[role].length > 0).map((role) => ({
    role,
    items: buckets[role],
  }));
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const visible = groups.flatMap((g) => g.items);
  const delta = {
    new: visible.filter((i) => i.delta === 'new').length,
    updated: visible.filter((i) => i.delta === 'updated').length,
  };

  return { groups, total, hidden, delta };
}
