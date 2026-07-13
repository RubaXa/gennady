// @file: ActionPanel — final action bundle for an MR: reviewer (post/approve/redispatch/skip) or author (publish/react/copy task/update description/redispatch/skip).
// @consumers: MrDetailPage
// @tasks: TSK-107

import { useState } from 'react';
import { Check, ShieldCheck, RotateCcw, X, ThumbsUp, ClipboardCopy, Pencil } from 'lucide-react';
import { executeAction } from '../services/api-client.ts';
import { cn } from '../lib/utils.ts';
import type { MrDetail } from '../../inbox-api/types.ts';

/** @purpose One finding rendered as a checkable, inline-editable posting candidate. */
type FindingCandidate = MrDetail['findings'][number];

/**
 * @purpose Build the FIX_TASK.md-style copyable text block for an author from selected findings.
 * @invariant No dedicated FIX_TASK.md generator exists yet — best-effort client-side rendering of the
 *   file:line / message shape.
 * @param findings Findings to include verbatim.
 * @returns Markdown text ready for clipboard.
 */
function composeFixTask(findings: FindingCandidate[]): string {
  const items = findings
    .map((f) => `- [${f.severity}] ${f.file}:${f.line} — ${f.message}`)
    .join('\n');
  return `# FIX_TASK\n\n${items || '(нет находок)'}\n`;
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
  const copyFixTask = () => void navigator.clipboard.writeText(composeFixTask(report.findings));

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
