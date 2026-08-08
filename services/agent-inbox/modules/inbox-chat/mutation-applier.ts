// @file: MutationApplier — preview/apply/undo for structural review.json mutations: snapshot-before-CAS-write (D-94/D-99), undo from snapshot, both audited (CH-08/CH-10); provenance surfaced before Apply (CH-09/D-98).
// @consumers: ChatSession (chat-router wiring, TSK-129)
// @tasks: TSK-127, TSK-163

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '#logger';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { MutationProposal, ReviewSnapshot } from './types.ts';
import { composeChatError, type ChatErrorResponse } from './errors.ts';

/** @purpose Ops accepted by `MutationApplier` v1 (D-90) — closed set, mirrors `MutationProposal#op` at runtime (the type alone does not guard a JSON-schema-sourced proposal). */
const SUPPORTED_OPS = new Set<MutationProposal['op']>(['edit', 'remove', 'set-severity']);

/** @purpose Audit role token for chat-originated mutations — no role-graph node is active during a chat turn, so `AuditEntry#role` cannot be a role name. */
const CHAT_AUDIT_ROLE = 'chat';

/** @purpose One `review.json` finding as read/written by `MutationApplier` — `id` is the CAS/undo target key (TSK-127; absent on pre-TSK-127 files). */
type ReviewFinding = {
  id?: string;
  severity?: string;
  file?: string;
  line?: number;
  message?: string;
};

/** @purpose On-disk `review.json` document shape `MutationApplier` reads/writes — `revision` defaults to `0` when absent, matching `ContextAssembler#_readReviewRevision` (D-99). */
type ReviewDocument = {
  verdict?: string;
  findings?: ReviewFinding[];
  revision?: number;
};

/** @purpose Snapshot file payload — `ReviewSnapshot` metadata plus the full pre-mutation `review.json` document it protects (D-94); `undo()` restores `review` verbatim. */
type SnapshotFile = ReviewSnapshot & { review: ReviewDocument };

/** @purpose Outcome of `preview()` — rejects an op outside the v1 closed set; provenance (CH-09) is carried by `proposal.provenance`, surfaced unchanged. */
export type PreviewResult =
  | { ok: true; preview: MutationProposal }
  | { ok: false; error: 'UNSUPPORTED_OP' };

/** @purpose Outcome of `apply()` — CAS success returns the new snapshot id; a stale revision leaves `review.json` untouched (D-99). */
export type ApplyResult = { ok: true; snapshot: string } | ChatErrorResponse;

/** @purpose Outcome of `undo()` — success restores `review.json` from the snapshot; an unknown snapshot id is reported without touching disk. */
export type UndoResult = { ok: true } | { ok: false; error: 'SNAPSHOT_NOT_FOUND' };

/**
 * @purpose Preview → apply → undo lifecycle for structural `review.json` mutations — never applied
 * implicitly, only on explicit operator invocation (CH-11).
 * @invariant `apply()` never writes `review.json` without first persisting a `ReviewSnapshot` of the
 * pre-mutation document (D-94) — every applied mutation is reversible.
 * @invariant CAS: `apply()` compares the caller's `revision` against the on-disk `revision` before
 * writing; mismatch → `STALE_REVISION`, no write (D-99).
 */
export class MutationApplier {
  /** @purpose Gennady state root (NFC-05) */
  protected _stateDir: string;
  /** @purpose Shared state store — routes `chat_mutation`/`chat_mutation_undo` through the one audit log instance (avoids a second lock/rotation state) */
  protected _store: StateStore;

  /**
   * @purpose Create an applier bound to a state store's root directory and shared audit log.
   * @param deps State store providing `getStateDir()` and `appendAudit()`.
   */
  constructor(deps: { store: StateStore }) {
    this._stateDir = deps.store.getStateDir();
    this._store = deps.store;
  }

  /**
   * @purpose Validate a proposed mutation before it can ever reach Apply — surfaces `before`/`after`
   * and, when present, the MR-text-grounded `provenance` tag unchanged (CH-09, D-98).
   * @param proposal Assistant-proposed mutation.
   * @returns The proposal unchanged when `op` is in the v1 closed set; `UNSUPPORTED_OP` otherwise.
   */
  preview(proposal: MutationProposal): PreviewResult {
    if (!SUPPORTED_OPS.has(proposal.op)) {
      logger.warn('[MutationApplier#preview] [idle → rejected] Unsupported op', {
        op: proposal.op,
        target: proposal.target,
      });
      return { ok: false, error: 'UNSUPPORTED_OP' };
    }
    return { ok: true, preview: proposal };
  }

  /**
   * @purpose Snapshot `review.json` (D-94), then compare-and-swap write the mutation by revision
   * (D-99): match → atomic write + `chat_mutation` audit event; mismatch → no write.
   * @invariant Snapshot is written BEFORE the mutation, unconditionally on the match path — undo
   * material exists for every applied mutation.
   * @pre `proposal.op` is in the v1 closed set (call `preview()` first — an unsupported op here is
   * a caller contract violation, see `@throws`).
   * @param proposal Assistant-proposed mutation to apply.
   * @param opts MR reference and the `review.json` revision the proposal was computed against.
   * @throws {Error} `proposal.op` is outside the v1 closed set (fail-fast, not a `STALE_REVISION` variant).
   * @returns `{ ok: true, snapshot }` with the new snapshot id, or `STALE_REVISION` when the caller's
   * revision no longer matches the on-disk document.
   * @sideEffect FS: writes a snapshot file under `reports/<mr>/snapshots/`, then atomically rewrites
   * `review.json`. Audit: appends one `chat_mutation` entry via the shared `StateStore`.
   */
  async apply(
    proposal: MutationProposal,
    opts: { mrRef: string; revision: number }
  ): Promise<ApplyResult> {
    if (!SUPPORTED_OPS.has(proposal.op)) {
      throw new Error(`[MutationApplier#apply] Unsupported op "${proposal.op}"`);
    }

    const dir = mrReportsDir(this._stateDir, opts.mrRef);
    const current = await this._readReviewDocument(dir);
    const currentRevision = current.revision ?? 0;

    // #region START_ENFORCE_CAS_REVISION — invariant: mismatch leaves review.json byte-for-byte untouched (D-99)
    if (currentRevision !== opts.revision) {
      logger.warn('[MutationApplier#apply] [comparing → stale]', {
        mrRef: opts.mrRef,
        expected: opts.revision,
        current: currentRevision,
      });
      return composeChatError(
        'STALE_REVISION',
        `review.json revision ${currentRevision} no longer matches ${opts.revision}`
      );
    }
    // #endregion END_ENFORCE_CAS_REVISION

    const snapshotId = await this._writeSnapshot(dir, opts.mrRef, current);

    const findings = current.findings ?? [];
    const mutated = this._applyMutationToFindings(findings, proposal);
    const nextDocument: ReviewDocument = {
      ...current,
      findings: mutated,
      revision: currentRevision + 1,
    };
    await this._writeReviewDocumentAtomic(dir, nextDocument);

    await this._store.appendAudit({
      ts: new Date().toISOString(),
      mr: opts.mrRef,
      role: CHAT_AUDIT_ROLE,
      event: 'chat_mutation',
      detail: JSON.stringify({
        op: proposal.op,
        target: proposal.target,
        before: proposal.before,
        after: proposal.after,
      }),
    });

    logger.debug('[MutationApplier#apply] [comparing → applied]', {
      mrRef: opts.mrRef,
      target: proposal.target,
      snapshot: snapshotId,
    });
    return { ok: true, snapshot: snapshotId };
  }

  /**
   * @purpose Restore `review.json` from a snapshot, then audit the undo as its own entry (CH-10) —
   * distinct from the original `chat_mutation` entry.
   * @param opts MR reference and the snapshot id returned by a prior `apply()`.
   * @returns `{ ok: true }` once `review.json` matches the snapshot, or `SNAPSHOT_NOT_FOUND` when
   * the id does not resolve (no disk write in that case).
   * @sideEffect FS: atomically rewrites `review.json` from the snapshot file. Audit: appends one
   * `chat_mutation_undo` entry via the shared `StateStore`.
   */
  async undo(opts: { mrRef: string; snapshotId: string }): Promise<UndoResult> {
    const dir = mrReportsDir(this._stateDir, opts.mrRef);
    const snapshotPath = join(dir, 'snapshots', `${opts.snapshotId}.json`);

    if (!existsSync(snapshotPath)) {
      logger.warn('[MutationApplier#undo] [idle → not_found]', {
        mrRef: opts.mrRef,
        snapshotId: opts.snapshotId,
      });
      return { ok: false, error: 'SNAPSHOT_NOT_FOUND' };
    }

    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8')) as SnapshotFile;
    await this._writeReviewDocumentAtomic(dir, snapshot.review);

    await this._store.appendAudit({
      ts: new Date().toISOString(),
      mr: opts.mrRef,
      role: CHAT_AUDIT_ROLE,
      event: 'chat_mutation_undo',
      detail: JSON.stringify({ snapshotId: opts.snapshotId }),
    });

    logger.debug('[MutationApplier#undo] [idle → restored]', {
      mrRef: opts.mrRef,
      snapshotId: opts.snapshotId,
    });
    return { ok: true };
  }

  /**
   * @param dir Report directory (`reports/<mr>/`).
   * @returns Parsed `review.json`, or `{}` when absent/unreadable/malformed — CAS then compares against `revision` `0`.
   * @sideEffect Filesystem read.
   */
  protected async _readReviewDocument(dir: string): Promise<ReviewDocument> {
    const filePath = join(dir, 'review.json');
    if (!existsSync(filePath)) return {};
    try {
      return JSON.parse(await readFile(filePath, 'utf-8')) as ReviewDocument;
    } catch (cause) {
      logger.warn('[MutationApplier#_readReviewDocument] [reading → malformed]', {
        filePath,
        cause,
      });
      return {};
    }
  }

  /**
   * @param dir Report directory (`reports/<mr>/`).
   * @param mrRef MR reference the snapshot belongs to.
   * @param document Pre-mutation `review.json` document to protect.
   * @returns Newly created snapshot's id.
   * @sideEffect FS: creates `reports/<mr>/snapshots/` and writes `<id>.json` — happens BEFORE the mutating write (D-94).
   */
  protected async _writeSnapshot(
    dir: string,
    mrRef: string,
    document: ReviewDocument
  ): Promise<string> {
    const snapshotsDir = join(dir, 'snapshots');
    await mkdir(snapshotsDir, { recursive: true });

    const id = randomUUID();
    const snapshot: SnapshotFile = {
      id,
      mrRef,
      ts: new Date().toISOString(),
      revision: document.revision ?? 0,
      path: join(snapshotsDir, `${id}.json`),
      review: document,
    };
    await writeFile(snapshot.path, JSON.stringify(snapshot, null, 2), 'utf-8');
    return id;
  }

  /**
   * @param dir Report directory (`reports/<mr>/`).
   * @param document Full `review.json` document to persist.
   * @returns Promise that resolves once `review.json` has been atomically replaced.
   * @sideEffect FS: writes a `.tmp` sibling then renames over `review.json` (`saveRegistry` pattern) — no reader ever observes a half-written file.
   */
  protected async _writeReviewDocumentAtomic(dir: string, document: ReviewDocument): Promise<void> {
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, 'review.json');
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(document, null, 2), 'utf-8');
    await rename(tmpPath, filePath);
  }

  /**
   * @param findings Current findings array (read from disk, not mutated in place).
   * @param proposal Mutation to apply — `op` already verified against the v1 closed set.
   * @returns New findings array with the targeted finding edited, severity-changed, or removed.
   */
  protected _applyMutationToFindings(
    findings: ReviewFinding[],
    proposal: MutationProposal
  ): ReviewFinding[] {
    // #region START_DISPATCH_BY_OP — invariant: target not found is a silent no-op; CAS on revision is the only conflict guard this method relies on
    if (proposal.op === 'remove') {
      return findings.filter((f) => f.id !== proposal.target);
    }
    return findings.map((f) => {
      if (f.id !== proposal.target) return f;
      if (proposal.op === 'set-severity') {
        return { ...f, severity: proposal.after as string };
      }
      return { ...f, ...(proposal.after as Record<string, unknown>) };
    });
    // #endregion END_DISPATCH_BY_OP
  }
}
