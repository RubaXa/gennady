// @file: ActionPanel — final action bundle for an MR: reviewer (post/approve/redispatch/skip) or author (publish/react/copy task/update description/redispatch/skip).
// @consumers: MrDetailPage
// @tasks: TSK-107, TSK-146

import { useState } from 'react';
import { Check, ShieldCheck, RotateCcw, X, ThumbsUp, ClipboardCopy, Pencil } from 'lucide-react';
import { executeAction, recordFixTaskCopy } from '../services/api-client.ts';
import { cn } from '../lib/utils.ts';
import type { MrDetail, FixTaskCopyResult } from '../../inbox-api/types.ts';

/** @purpose One finding rendered as a checkable, inline-editable posting candidate. */
type FindingCandidate = MrDetail['findings'][number];

/**
 * @purpose Compose the full first-click micro-directive for the author's downstream agent, given MR identity and findings.
 * @invariant Downstream agent must re-verify each finding against current code — a finding can be wrong or stale.
 * @param mr MR identity (project/iid/title/webUrl) — lets the receiving agent orient without extra lookups.
 * @param findings Findings to include verbatim.
 * @returns Markdown text ready for clipboard.
 */
function composeFixTask(
  mr: { project: string; iid: number; title: string; webUrl: string },
  findings: FindingCandidate[]
): string {
  const items = findings.length
    ? findings.map((f) => `- [${f.severity}] ${f.file}:${f.line} — ${f.message}`).join('\n')
    : '(нет находок)';
  return `# Задание на исправление — MR "${mr.title}" (${mr.project}!${mr.iid})

Это результат автоматического код-ревью, не твоя собственная находка «с нуля». MR: ${mr.webUrl}
Ревью-агент прошёл по диффу и оставил замечания ниже. Он мог ошибиться или устареть (если код
менялся после ревью) — прежде чем править, открой каждый файл:строку и сверь замечание с текущим
кодом. Не применяй бездумно, реши по каждому пункту сам.

## Находки

${items}

## Что сделать
Согласен с замечанием → почини. Не согласен или оно больше не актуально → не молчи, скажи
оператору почему, коротко, по каждому такому пункту.
`;
}

/**
 * @purpose Compose a brief repeat-click message: history plus what changed since the last "Copy fix task" click.
 * @invariant NOT a full micro-directive (see composeFixTask) — added findings shown in full, resolved by location only, unchanged as a count only.
 * @param mr MR identity (project/iid/title) for the heading.
 * @param findings Current findings, used to recover full text for `delta.added` entries (the delta itself carries no message text).
 * @param delta Signature diff against the last "Copy fix task" click.
 * @param priorCopyCount Number of prior clicks — this click is number `priorCopyCount + 1`.
 * @param lastCopiedAt Timestamp of the previous click, verbatim.
 * @returns Markdown text ready for clipboard.
 */
function composeFixTaskDelta(
  mr: { project: string; iid: number; title: string },
  findings: FindingCandidate[],
  delta: NonNullable<FixTaskCopyResult['delta']>,
  priorCopyCount: number,
  lastCopiedAt: string
): string {
  const addedItems = delta.added.map((signature) => {
    const match = findings.find((f) => f.file === signature.file && f.line === signature.line);
    return `- ${signature.file}:${signature.line} — ${match?.message ?? '(текст недоступен)'}`;
  });
  const resolvedItems = delta.resolved.map((signature) => `- ${signature.file}:${signature.line}`);

  const noChange = delta.added.length === 0 && delta.resolved.length === 0;
  const body = noChange
    ? 'Ничего нового с прошлого раза.'
    : `## Новое

${addedItems.length ? addedItems.join('\n') : '(нет)'}

## Устранено

${resolvedItems.length ? resolvedItems.join('\n') : '(нет)'}`;

  return `# Копирование №${priorCopyCount + 1} — MR "${mr.title}" (${mr.project}!${mr.iid})

Предыдущее копирование: ${lastCopiedAt}

${body}

без изменений: ${delta.unchanged.length}
`;
}

/**
 * @purpose Final action bundle — candidates as checkboxes with inline editing, plus a role-dependent
 *   button row sending the operator's choice via POST /api/mr/:id/action.
 * @invariant Approve is enabled only when no finding has severity "error" (AI-13 gate).
 * @invariant `ActionChoice` is closed (post/approve/redispatch/skip) — author-only intents ride on
 *   `choice: 'post'` with a `payload.kind` discriminator; effect executor must grow matching handling.
 * @param props MR identifier and its fetched detail report.
 */
export function ActionPanel(props: { mrId: string; report: MrDetail }) {
  const { mrId, report } = props;
  const isAuthor = report.mr.role === 'author';
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [redispatchOpen, setRedispatchOpen] = useState(false);
  const [redispatchFocus, setRedispatchFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBlockingFinding = report.findings.some((f) => f.severity === 'error');

  /**
   * @purpose Toggle a candidate's checked state.
   * @param idx Finding index within report.findings.
   */
  const toggleCandidate = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  /**
   * @purpose Selected findings with any inline edits applied, in original order.
   */
  const selectedCandidates = (): FindingCandidate[] =>
    report.findings
      .map((f, idx) => ({ f, idx }))
      .filter(({ idx }) => selected.has(idx))
      .map(({ f, idx }) => ({ ...f, message: edits[idx] ?? f.message }));

  /**
   * @purpose Dispatch an operator action; surfaces a local error banner on failure.
   * @param choice Operator's choice (closed ActionChoice set).
   * @param payload Optional action payload.
   */
  const dispatch = async (choice: string, payload?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await executeAction(mrId, 'review-decision', choice, payload);
    } catch (_cause) {
      setError('Не удалось выполнить действие');
    } finally {
      setBusy(false);
    }
  };

  const postSelected = () =>
    void dispatch('post', { kind: 'candidates', candidates: selectedCandidates() });
  const approve = () => void dispatch('approve');
  const submitRedispatch = () => {
    void dispatch('redispatch', { focus: redispatchFocus });
    setRedispatchOpen(false);
    setRedispatchFocus('');
  };
  const skip = () => void dispatch('skip');
  const publishDrafts = () => void dispatch('post', { kind: 'publish-drafts' });
  const react = () => void dispatch('post', { kind: 'reaction', reaction: 'thumbsup' });
  const updateDescription = () => void dispatch('post', { kind: 'update-description' });
  const copyFixTask = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await recordFixTaskCopy(mrId);
      // Server guarantees delta/lastCopiedAt non-null when isFirst is false (D-126, FixTaskCopyResult contract).
      const text = result.isFirst
        ? composeFixTask(report.mr, report.findings)
        : composeFixTaskDelta(
            report.mr,
            report.findings,
            result.delta!,
            result.priorCopyCount,
            result.lastCopiedAt!
          );
      await navigator.clipboard.writeText(text);
    } catch (_cause) {
      setError('Не удалось скопировать задание');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-80 shrink-0 rounded-md border border-border bg-card p-3 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Кандидаты ({report.findings.length})
      </h3>

      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-64">
        {report.findings.map((finding, idx) => (
          <div key={idx} className="rounded-md border border-border/80 bg-secondary/30 p-2">
            <label className="flex items-start gap-2 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(idx)}
                onChange={() => toggleCandidate(idx)}
                className="mt-0.5"
              />
              <span className="font-mono text-muted-foreground shrink-0">
                {finding.file}:{finding.line}
              </span>
            </label>
            {editingIdx === idx ? (
              <textarea
                value={edits[idx] ?? finding.message}
                onChange={(e) => setEdits((prev) => ({ ...prev, [idx]: e.target.value }))}
                onBlur={() => setEditingIdx(null)}
                autoFocus
                rows={2}
                className="mt-1 w-full rounded border border-border bg-background p-1.5 text-[12px]"
              />
            ) : (
              <button
                onClick={() => setEditingIdx(idx)}
                className="mt-1 flex w-full items-start gap-1 text-left text-[12px] text-foreground/90 hover:text-foreground"
                title="Inline-правка"
              >
                <Pencil className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                {edits[idx] ?? finding.message}
              </button>
            )}
          </div>
        ))}
        {report.findings.length === 0 && (
          <p className="text-[12px] text-muted-foreground">Находок нет.</p>
        )}
      </div>

      {redispatchOpen && (
        <div className="rounded-md border border-border bg-secondary/30 p-2">
          <textarea
            value={redispatchFocus}
            onChange={(e) => setRedispatchFocus(e.target.value)}
            placeholder="Фокус следующего раунда..."
            rows={2}
            autoFocus
            className="w-full rounded border border-border bg-background p-1.5 text-[12px]"
          />
          <button
            onClick={submitRedispatch}
            disabled={busy}
            className="mt-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
          >
            Отправить
          </button>
        </div>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        {isAuthor ? (
          <>
            <ActionButton
              icon={Check}
              label="Опубликовать черновики"
              onClick={publishDrafts}
              disabled={busy}
              primary
            />
            <ActionButton icon={ThumbsUp} label="👍" onClick={react} disabled={busy} />
            <ActionButton
              icon={ClipboardCopy}
              label="Копировать задание"
              onClick={copyFixTask}
              disabled={busy}
            />
            <ActionButton
              icon={Pencil}
              label="Обновить описание"
              onClick={updateDescription}
              disabled={busy}
            />
            <ActionButton
              icon={RotateCcw}
              label="Дослать"
              onClick={() => setRedispatchOpen((v) => !v)}
              disabled={busy}
            />
            <ActionButton icon={X} label="Skip" onClick={skip} disabled={busy} />
          </>
        ) : (
          <>
            <ActionButton
              icon={Check}
              label="Постить выбранное"
              onClick={postSelected}
              disabled={busy || selected.size === 0}
              primary
            />
            <ActionButton
              icon={ShieldCheck}
              label="Approve (гейт)"
              onClick={approve}
              disabled={busy || hasBlockingFinding}
              title={
                hasBlockingFinding
                  ? 'Заблокировано: есть находки severity=error (AI-13)'
                  : undefined
              }
            />
            <ActionButton
              icon={RotateCcw}
              label="Дослать"
              onClick={() => setRedispatchOpen((v) => !v)}
              disabled={busy}
            />
            <ActionButton icon={X} label="Skip" onClick={skip} disabled={busy} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * @purpose Small pill button used in the action row — primary variant is solid, others outlined.
 * @param props Icon, label, click handler, disabled/primary flags, optional title (gate tooltip).
 */
function ActionButton(props: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  const { icon: Icon, label, onClick, disabled, primary, title } = props;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        primary
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : 'border border-border text-foreground hover:bg-accent'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
