// @file: Queue-backed artifact mutation proposal and CAS/LIFO application flow.
// @consumers: MutateRouter, operator chat
// @tasks: TSK-163

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TaskQueuePort } from '../inbox-queue/task-queue.ts';
import type { Anchor } from './anchor.ts';

/** @purpose Mutation request accepted only after the producer session has generated content. */
export type ArtifactMutation = {
  /** @purpose Absolute artifact path to mutate. */
  path: string;
  /** @purpose Caller-observed CAS revision. */
  revision: number;
  /** @purpose Complete replacement artifact content. */
  content: string;
};
/** @purpose Visible successful mutation result. */
export type MutationReceipt = {
  /** @purpose Durable LIFO snapshot identifier. */
  snapshotId: string;
  /** @purpose Revision after the operation. */
  revision: number;
};

/**
 * @purpose Serialize artifact mutations through the queue and preserve LIFO snapshots per artifact.
 * @invariant A failed revision comparison never changes the artifact.
 */
export class MutationFlow {
  /** @purpose Queue that owns mutate_artifact work identity. */
  protected _queue: TaskQueuePort;
  /** @purpose State root that owns report/snapshots. */
  protected _stateDir: string;
  /** @purpose Latest mutation snapshots keyed by MR then artifact path. */
  protected _snapshots = new Map<
    string,
    Map<string, Array<{ id: string; content: string; revision: number }>>
  >();

  /**
   * @purpose Create queue-backed mutation flow.
   * @param deps Queue and state root.
   */
  constructor(deps: { queue: TaskQueuePort; stateDir: string }) {
    this._queue = deps.queue;
    this._stateDir = deps.stateDir;
  }

  /**
   * @purpose Enqueue a producer-routed mutation request rather than writing synchronously from chat.
   * @param mr MR owning the request.
   * @param anchor Artifact anchor.
   * @param intent Operator requested change.
   * @returns Queue task identity.
   */
  propose(mr: string, anchor: Anchor, intent: string): string {
    return this._queue.enqueue(mr, 'mutate_artifact', { anchor, intent, createdBy: 'operator' })
      .taskId;
  }

  /**
   * @purpose Apply content only if its caller revision equals the current durable artifact revision.
   * @param mr MR owning snapshots.
   * @param mutation CAS replacement.
   * @returns Visible receipt.
   */
  async apply(mr: string, mutation: ArtifactMutation): Promise<MutationReceipt> {
    const revisionPath = `${mutation.path}.revision`;
    const currentRevision = await this._retrieveRevision(revisionPath);
    if (currentRevision !== mutation.revision) {
      throw new Error(
        `[MutationFlow#apply] STALE_REVISION expected=${currentRevision} received=${mutation.revision}`
      );
    }
    const before = await readFile(mutation.path, 'utf8');
    const snapshotId = `snapshot-${Date.now()}-${this._snapshotStack(mr, mutation.path).length + 1}`;
    this._snapshotStack(mr, mutation.path).push({
      id: snapshotId,
      content: before,
      revision: currentRevision,
    });
    const snapshotPath = join(this._stateDir, 'report', 'snapshots', `${snapshotId}.json`);
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(
      snapshotPath,
      JSON.stringify({
        id: snapshotId,
        mr,
        path: mutation.path,
        content: before,
        revision: currentRevision,
      }),
      'utf8'
    );
    await this._atomicWrite(mutation.path, mutation.content);
    await this._atomicWrite(revisionPath, String(currentRevision + 1));
    return { snapshotId, revision: currentRevision + 1 };
  }

  /**
   * @purpose Restore the latest snapshot for one artifact, leaving other artifact stacks untouched.
   * @param mr MR owning snapshots.
   * @param [path] Artifact path, or latest available stack.
   * @returns Visible receipt.
   */
  async undo(mr: string, path?: string): Promise<MutationReceipt> {
    await this._loadSnapshots(mr);
    const paths = this._snapshots.get(mr);
    const resolvedPath = path ?? paths?.keys().next().value;
    if (!resolvedPath) throw new Error('[MutationFlow#undo] SNAPSHOT_NOT_FOUND');
    const stack = this._snapshotStack(mr, resolvedPath);
    const snapshot = stack.pop();
    if (!snapshot) throw new Error('[MutationFlow#undo] SNAPSHOT_NOT_FOUND');
    await this._atomicWrite(resolvedPath, snapshot.content);
    await this._atomicWrite(`${resolvedPath}.revision`, String(snapshot.revision));
    return { snapshotId: snapshot.id, revision: snapshot.revision };
  }

  /**
   * @purpose Retrieve the isolated LIFO stack for one MR artifact.
   * @param mr MR key.
   * @param path Artifact path.
   * @returns Mutable stack.
   */
  protected _snapshotStack(
    mr: string,
    path: string
  ): Array<{ id: string; content: string; revision: number }> {
    const paths = this._snapshots.get(mr) ?? new Map();
    const stack = paths.get(path) ?? [];
    paths.set(path, stack);
    this._snapshots.set(mr, paths);
    return stack;
  }

  /**
   * @purpose Rehydrate per-artifact LIFO stacks after a server restart from `report/snapshots`.
   * @param mr MR owning the snapshots.
   * @returns Completion after valid snapshots have been indexed in creation order.
   */
  protected async _loadSnapshots(mr: string): Promise<void> {
    if (this._snapshots.has(mr)) return;
    const snapshotsDir = join(this._stateDir, 'report', 'snapshots');
    const paths = new Map<string, Array<{ id: string; content: string; revision: number }>>();
    this._snapshots.set(mr, paths);
    try {
      const files = (await readdir(snapshotsDir)).filter((file) => file.endsWith('.json')).sort();
      for (const file of files) {
        const snapshot = JSON.parse(await readFile(join(snapshotsDir, file), 'utf8')) as {
          id?: string;
          mr?: string;
          path?: string;
          content?: string;
          revision?: number;
        };
        if (snapshot.mr !== mr || !snapshot.path || typeof snapshot.content !== 'string') continue;
        const stack = paths.get(snapshot.path) ?? [];
        stack.push({
          id: snapshot.id ?? file.replace(/\.json$/, ''),
          content: snapshot.content,
          revision: snapshot.revision ?? 0,
        });
        paths.set(snapshot.path, stack);
      }
    } catch {
      // The directory is absent before the first mutation; that is a valid empty stack.
    }
  }

  /**
   * @purpose Retrieve durable revision, treating an absent sidecar as zero.
   * @param path Sidecar path.
   * @returns Current revision.
   */
  protected async _retrieveRevision(path: string): Promise<number> {
    try {
      return Number(await readFile(path, 'utf8')) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * @purpose Replace one artifact atomically.
   * @param path Destination artifact.
   * @param content Complete replacement content.
   * @returns Completion after rename.
   */
  protected async _atomicWrite(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  }
}
