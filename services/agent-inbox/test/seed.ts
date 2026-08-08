// @file: seed — deterministic agent-inbox state fixtures backed by the production journal shapes.
// @consumers: agent-inbox integration and dashboard component tests
// @tasks: TSK-166

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventJournal, type JournalEntry } from '../modules/inbox-core/event-journal.ts';
import type { SyncSnapshot } from '../modules/inbox-vcs/sync.ts';

/** @purpose Event input that seedMr persists with a deterministic sequence number. */
export type SeedEvent = Omit<JournalEntry, 'seq' | 'mr'> & { mr?: string };

/** @purpose Input for materializing one MR's persisted state without a VCS call. */
export type SeedMrInput = {
  /** @purpose Root directory that acts as the isolated stateDir. */
  stateDir: string;
  /** @purpose MR composite key, e.g. group/project!42. */
  ref: string;
  /** @purpose Journal events to append for this MR in supplied order. */
  events: SeedEvent[];
  /** @purpose Latest sync snapshot consumed by board projections. */
  sync: SyncSnapshot;
};

/** @purpose Paths and values persisted by seedMr for a test to pass into a runtime composition. */
export type SeedMrResult = {
  /** @purpose Isolated root directory consumed by a runtime composition. */
  stateDir: string;
  /** @purpose JSONL event journal path written for the seeded MR. */
  eventsPath: string;
  /** @purpose Persisted sync snapshot path read by the board projection. */
  snapshotsPath: string;
  /** @purpose Production journal instance containing the supplied event history. */
  journal: EventJournal;
  /** @purpose Persisted sync snapshots available for runtime injection. */
  snapshots: SyncSnapshot[];
};

/**
 * @purpose Load snapshots persisted by seedMr for injection into an unmodified HTTP runtime.
 * @param stateDir Isolated state directory previously materialized by seedMr.
 * @returns Persisted sync snapshots, or an empty set when none were seeded.
 */
export function loadSeededSnapshots(stateDir: string): SyncSnapshot[] {
  const snapshotsPath = join(stateDir, 'agent-inbox', 'sync-snapshots.json');
  if (!existsSync(snapshotsPath)) return [];
  return JSON.parse(readFileSync(snapshotsPath, 'utf8')) as SyncSnapshot[];
}

/**
 * @purpose Persist one MR's event history and latest sync snapshot in an isolated state directory.
 * @invariant Events use the real EventJournal writer, preserving its sequence and JSONL semantics.
 * @param input Desired MR state.
 * @returns Runtime-ready journal and snapshot paths/values.
 * @sideEffect Creates `<stateDir>/agent-inbox/events.jsonl` and `sync-snapshots.json`.
 */
export async function seedMr(input: SeedMrInput): Promise<SeedMrResult> {
  const inboxDir = join(input.stateDir, 'agent-inbox');
  const eventsPath = join(inboxDir, 'events.jsonl');
  const snapshotsPath = join(inboxDir, 'sync-snapshots.json');
  mkdirSync(inboxDir, { recursive: true });

  const journal = new EventJournal(eventsPath);
  for (const event of input.events) {
    await journal.append({
      ...event,
      mr: event.mr ?? input.ref,
      ts: event.ts ?? '2026-08-07T00:00:00.000Z',
    });
  }

  const snapshots = [input.sync];
  writeFileSync(snapshotsPath, JSON.stringify(snapshots, null, 2) + '\n');
  return { stateDir: input.stateDir, eventsPath, snapshotsPath, journal, snapshots };
}
