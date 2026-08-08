// @file: FeedProjection — projects EventJournal entries → FeedWidget[] with cursor-based pagination.
//   Updates lastReadAt on the registry when feed is consumed (read-cursor, D-317).
// @consumers: feed.router.ts, inbox-dashboard
// @tasks: TSK-162

import { logger } from '#logger';
import type { EventJournal, JournalEntry } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { FeedWidget, FeedWidgetType, FeedProjectionResult } from '../dto/feed-widget.type.ts';
import type { OperatorTurn } from '../../inbox-chat/operator-session.ts';

/** @purpose Map durable journal events onto the seven public widget views of spec §4. */
const KIND_TO_WIDGET_TYPE: Partial<Record<string, FeedWidgetType>> = {
  gitlab_event: 'gitlab',
  widget_bump: 'findings',
  task_created: 'progress',
  task_status: 'progress',
  decision: 'action',
  artifact_produced: 'artifact',
  proposal: 'plan',
  chat_turn: 'threads',
  mutation: 'action',
  system: 'gitlab',
};

/**
 * @purpose Projects EventJournal entries into feed widgets with cursor pagination (D-306).
 * @invariant Reads only EventJournal — never touches executor/queue in-memory state.
 * @invariant lastReadAt is updated on the MR's registry entry when feed is consumed.
 * @invariant System-kind events are included as FeedWidget with type='system'.
 */
export class FeedProjection {
  /** @purpose Event journal — source of truth for feed entries */
  protected _journal: EventJournal;
  /** @purpose Registry access for per-MR lastReadAt updates */
  protected _registry: InboxRegistryAccess;

  /**
   * @purpose Create a FeedProjection backed by a journal and registry.
   * @param journal Event journal for feed entry queries.
   * @param registry Registry access for read-cursor updates.
   */
  constructor(journal: EventJournal, registry: InboxRegistryAccess) {
    this._journal = journal;
    this._registry = registry;
  }

  /**
   * @purpose Project feed entries since cursor — returns widgets and advances read-cursor.
   * @param cursor Seq to start from (0 = beginning); entries with seq > cursor are returned.
   * @param [mrKey] Optional MR filter — restricts widgets to one MR; absent = all MRs.
   * @returns FeedProjectionResult with widget slice and next cursor.
   * @sideEffect Updates lastReadAt on the MR's registry entry when feed is consumed.
   */
  project(cursor: number, mrKey?: string): FeedProjectionResult {
    logger.debug('[FeedProjection#project] [idle → projecting]', {
      cursor,
      mrKey: mrKey ?? 'all',
    });

    // #region START_QUERY_JOURNAL — read entries since cursor, optionally filter by MR
    const { entries, nextCursor } = this._journal.since(cursor);
    const filtered = mrKey
      ? entries.filter((e) => e.mr === mrKey)
      : entries.filter((e) => e.mr !== 'system');
    // #endregion END_QUERY_JOURNAL

    // map journal entries to feed widgets — pure transformation, no I/O
    const widgets: FeedWidget[] = filtered.map((entry) => this._toWidget(entry));

    // #region START_UPDATE_READ_CURSOR — advance lastReadAt for the consuming MR
    if (mrKey && widgets.length > 0) {
      const maxTs = widgets.reduce(
        (max, widget) => (widget.lastActivity > max ? widget.lastActivity : max),
        widgets[0].lastActivity
      );
      try {
        this._registry.load();
        const webUrl = this._resolveWebUrl(mrKey);
        if (webUrl) {
          this._registry.recordLastRead(webUrl, maxTs);
          this._registry.save();
          logger.debug('[FeedProjection#project] [read-cursor → advanced]', {
            mrKey,
            lastReadAt: maxTs,
          });
        }
      } catch (cause) {
        logger.warn('[FeedProjection#project] [read-cursor → failed]', {
          mrKey,
          error: String(cause),
        });
      }
    }
    // #endregion END_UPDATE_READ_CURSOR

    logger.debug('[FeedProjection#project] [projecting → projected]', {
      widgetCount: widgets.length,
      nextCursor,
    });

    return { widgets, nextCursor };
  }

  /**
   * @purpose Project durable operator conversation independently of the feed cursor.
   * @param mrKey Canonical MR reference.
   * @returns Ordered journal-backed chat turns for a dashboard reload/restart.
   */
  transcript(mrKey: string): OperatorTurn[] {
    return this._journal
      .read()
      .filter((entry) => entry.mr === mrKey && entry.kind === 'chat_turn')
      .map((entry) => entry.payload as OperatorTurn)
      .filter(
        (turn): turn is OperatorTurn =>
          typeof turn?.turnId === 'string' &&
          (turn.role === 'operator' || turn.role === 'assistant') &&
          typeof turn.text === 'string'
      );
  }

  /**
   * @purpose Convert one JournalEntry into a FeedWidget — pure mapping, no I/O.
   * @param entry Journal entry from the event journal.
   * @returns Canonical widget with required shared fields and kind-specific payload.
   */
  protected _toWidget(entry: JournalEntry): FeedWidget {
    const type: FeedWidgetType = KIND_TO_WIDGET_TYPE[entry.kind] ?? 'gitlab';
    const payload = entry.payload ?? {};
    const base = {
      widgetId: `${entry.mr}:${entry.seq}`,
      lastActivity: entry.ts,
      resolved: payload.state === 'resolved' || payload.status === 'done',
      unread: true,
      anchors: this._anchors(payload, `${entry.mr}:${entry.seq}`),
    };

    switch (type) {
      case 'findings':
        return { ...base, type, payload: { items: this._findings(payload.items) } };
      case 'threads':
        return { ...base, type, payload: { items: this._threads(payload.items) } };
      case 'artifact':
        return {
          ...base,
          type,
          payload: {
            path: this._string(payload.path, 'report/unknown'),
            title: this._string(payload.title, 'Artifact'),
            attachments: this._array(payload.attachments),
          },
        };
      case 'plan':
        return {
          ...base,
          type,
          payload: {
            stage: this._string(payload.stage, entry.kind),
            tracksDone: this._number(payload.tracksDone),
            tracksTotal: this._number(payload.tracksTotal),
            queuePosition: this._number(payload.queuePosition),
          },
        };
      case 'progress':
        return { ...base, type, payload: { events: [{ kind: entry.kind, ...payload }] } };
      case 'action':
        return {
          ...base,
          type,
          payload: {
            effect: this._string(payload.effect, entry.kind),
            result: payload.result ?? payload,
          },
        };
      case 'gitlab':
        return {
          ...base,
          type,
          payload: {
            event: this._string(payload.event, entry.kind),
            data: payload.data ?? payload,
            ...(typeof payload.taskId === 'string' ? { taskId: payload.taskId } : {}),
          },
        };
    }
  }

  /**
   * @purpose Normalize optional serialised anchors without exposing malformed data as canonical DTOs.
   * @param payload Journal payload that may contain serialized anchors.
   * @param widgetId Canonical owner assigned to all valid anchors.
   * @returns Validated anchors owned by widgetId.
   */
  protected _anchors(payload: Record<string, unknown>, widgetId: string): FeedWidget['anchors'] {
    if (!Array.isArray(payload.anchors)) return [];
    return payload.anchors
      .filter(
        (anchor): anchor is FeedWidget['anchors'][number] =>
          typeof anchor === 'object' &&
          anchor !== null &&
          typeof (anchor as { widgetId?: unknown }).widgetId === 'string'
      )
      .map((anchor) => ({
        widgetId,
        ...(anchor as Omit<FeedWidget['anchors'][number], 'widgetId'>),
      }));
  }

  /**
   * @purpose Normalize an untrusted payload field to an array.
   * @param value Candidate field.
   * @returns Array or empty fallback.
   */
  protected _array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  /**
   * @purpose Normalize untrusted finding entries to the exact public FindingsWidget payload.
   * @param value Candidate serialized findings list from the durable journal.
   * @returns Valid canonical finding items; malformed non-record items are omitted.
   */
  protected _findings(
    value: unknown
  ): Extract<FeedWidget, { type: 'findings' }>['payload']['items'] {
    return this._array(value).flatMap((item, index) => {
      if (!this._isRecord(item)) return [];
      return [
        {
          id: this._string(item.id, `finding-${index}`),
          severity: this._string(item.severity, 'unknown'),
          file: this._string(item.file, ''),
          line: this._number(item.line),
          summary: this._string(item.summary, ''),
          state: this._string(item.state, 'open'),
        },
      ];
    });
  }

  /**
   * @purpose Normalize untrusted discussion entries to the exact public ThreadsWidget payload.
   * @param value Candidate serialized discussion list from the durable journal.
   * @returns Valid canonical thread items; malformed non-record items are omitted.
   */
  protected _threads(value: unknown): Extract<FeedWidget, { type: 'threads' }>['payload']['items'] {
    return this._array(value).flatMap((item, index) => {
      if (!this._isRecord(item)) return [];
      return [
        {
          threadId: this._string(item.threadId, `thread-${index}`),
          author: this._string(item.author, ''),
          quote: this._string(item.quote, ''),
          factcheck: this._string(item.factcheck, ''),
          reactions: this._array(item.reactions),
        },
      ];
    });
  }

  /**
   * @purpose Narrow a journal value to a plain record before reading named fields.
   * @param value Candidate journal value.
   * @returns True only for non-null, non-array object records.
   */
  protected _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  /**
   * @purpose Normalize an untrusted payload field to a string.
   * @param value Candidate field.
   * @param fallback Value when absent.
   * @returns Safe string.
   */
  protected _string(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
  }
  /**
   * @purpose Normalize an untrusted payload field to a finite number.
   * @param value Candidate field.
   * @returns Number or zero fallback.
   */
  protected _number(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  /**
   * @purpose Resolve the webUrl key from a project!iid composite key using the registry.
   * @param mrKey MR composite key (project!iid).
   * @returns Matching webUrl from the registry; null when no match.
   */
  protected _resolveWebUrl(mrKey: string): string | null {
    const registry = this._registry.load();
    for (const [webUrl, entry] of Object.entries(registry.entries)) {
      if (`${entry.project}!${entry.iid}` === mrKey) {
        return webUrl;
      }
    }
    return null;
  }
}
