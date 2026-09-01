// @file: Typed append-only execute-worker checkpoint lifecycle owned by sdd-session.
// @consumers: sdd-session checkpoint
// @tasks: N/A

import { appendToSection } from './sdd-session.types.ts';
import { proveRepoFile, readProvenRepoFile } from '../../../shared/common/repo-file-identity.ts';

const SCHEMA = 'sdd-worker-checkpoint/v1' as const;
/** @purpose Maximum CLI-owned autonomous technical replan attempts for one task phase. */
export const TECHNICAL_REPLAN_BUDGET = 2 as const;
const OUTCOMES = [
  'CONTINUE',
  'CONTEXT_ROTATION',
  'RECOVERABLE_TECHNICAL',
  'SPEC_GOAL_CONFLICT',
  'EXTERNAL_AUTHORITY_REQUIRED',
  'TECHNICAL_REPLAN_EXHAUSTED',
] as const;
const TOP_KEYS = [
  'schema',
  'seq',
  'task',
  'phase',
  'worker',
  'reason',
  'outcome',
  'attempt',
  'evidence',
  'technicalPlan',
  'durableRefs',
] as const;

type Outcome = (typeof OUTCOMES)[number];
type StringMap = Record<string, unknown>;
type Checkpoint = {
  schema: typeof SCHEMA;
  seq: number;
  task: string;
  phase: string;
  worker: { session: string; kind: string; observedContextChars: number };
  reason: string;
  outcome: Outcome;
  attempt: { current: number; budget: number };
  evidence: string[];
  technicalPlan: null | {
    summary: string;
    taskEdits: string[];
    dagEdits: string[];
    artifactEdits: string[];
  };
  durableRefs: {
    phase: string;
    task: string;
    decisions: string[];
    deviations: string[];
    handoff: string;
  };
};

function fail(detail: string) {
  return { ok: false as const, detail };
}

function object(value: unknown): StringMap | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as StringMap)
    : null;
}

function exactKeys(value: StringMap, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function stringArray(value: unknown, nonEmptyArray = false): value is string[] {
  return (
    Array.isArray(value) &&
    (!nonEmptyArray || value.length > 0) &&
    value.every((item) => nonEmpty(item))
  );
}

function safeInteger(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function repoRef(value: unknown): value is string {
  if (!nonEmpty(value) || value.startsWith('/')) return false;
  const [path, anchor] = value.split('#');
  return Boolean(path && anchor && !path.split('/').includes('..'));
}

function repoRefs(value: unknown, nonEmptyArray = false): value is string[] {
  return stringArray(value, nonEmptyArray) && value.every(repoRef);
}

function durableRefError(root: string, ref: string, label: string): string | null {
  const [path, anchor] = ref.split('#');
  const proven = proveRepoFile(root, path!);
  if (!proven.ok) return `${label}: durable ref file does not exist or is unsafe: ${path}`;
  const read = readProvenRepoFile(proven.identity);
  if (!read.ok) return `${label}: durable ref file is unreadable: ${path}`;
  if (anchor && !read.content.includes(anchor))
    return `${label}: durable ref anchor does not exist: ${ref}`;
  return null;
}

function durableRefsError(root: string, checkpoint: Checkpoint): string | null {
  const refs = [
    ['durableRefs.task', checkpoint.durableRefs.task],
    ['durableRefs.phase', checkpoint.durableRefs.phase],
    ['durableRefs.handoff', checkpoint.durableRefs.handoff],
    ...checkpoint.durableRefs.decisions.map((ref) => ['durableRefs.decisions', ref]),
    ...checkpoint.durableRefs.deviations.map((ref) => ['durableRefs.deviations', ref]),
    ...checkpoint.evidence.map((ref) => ['evidence', ref]),
  ];
  for (const [label, ref] of refs) {
    const detail = durableRefError(root, ref!, label!);
    if (detail) return detail;
  }
  return null;
}

function parseCheckpoint(raw: string) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return fail('checkpoint is not valid JSON');
  }
  const value = object(decoded);
  if (!value || !exactKeys(value, TOP_KEYS))
    return fail(`checkpoint keys must be exactly ${TOP_KEYS.join(', ')}`);
  if (value.schema !== SCHEMA) return fail(`schema must be ${SCHEMA}`);
  if (!safeInteger(value.seq, 1)) return fail('seq must be a positive integer');
  if (!nonEmpty(value.task)) return fail('task must be non-empty');
  if (!nonEmpty(value.phase) || !/^P[1-9]\d*$/.test(value.phase))
    return fail('phase must be a canonical P<number> id');
  if (!nonEmpty(value.reason)) return fail('reason must be non-empty evidence, not generic FAIL');
  if (!OUTCOMES.includes(value.outcome as Outcome))
    return fail(`outcome must be ${OUTCOMES.join(' | ')}; generic BLOCKED/FAIL is not typed`);

  const worker = object(value.worker);
  if (!worker || !exactKeys(worker, ['session', 'kind', 'observedContextChars']))
    return fail('worker keys must be session, kind, observedContextChars');
  if (!nonEmpty(worker.session) || !nonEmpty(worker.kind))
    return fail('worker session and kind must be non-empty');
  if (!safeInteger(worker.observedContextChars, 0))
    return fail('worker observedContextChars must be a non-negative integer');

  const attempt = object(value.attempt);
  if (!attempt || !exactKeys(attempt, ['current', 'budget']))
    return fail('attempt keys must be current, budget');
  if (!safeInteger(attempt.current, 0) || !safeInteger(attempt.budget, 1))
    return fail('attempt current must be non-negative and budget must be positive');
  if (attempt.budget !== TECHNICAL_REPLAN_BUDGET)
    return fail(`attempt budget must be CLI-owned value ${TECHNICAL_REPLAN_BUDGET}`);
  if (attempt.current > attempt.budget) return fail('attempt current cannot exceed budget');
  if (!repoRefs(value.evidence, true))
    return fail('evidence must be non-empty repo-relative anchored refs');

  const refs = object(value.durableRefs);
  if (!refs || !exactKeys(refs, ['phase', 'task', 'decisions', 'deviations', 'handoff']))
    return fail('durableRefs keys must be phase, task, decisions, deviations, handoff');
  if (
    !repoRef(refs.phase) ||
    !nonEmpty(refs.task) ||
    refs.task.startsWith('/') ||
    refs.task.split('/').includes('..') ||
    !repoRefs(refs.decisions) ||
    !repoRefs(refs.deviations) ||
    !repoRef(refs.handoff)
  )
    return fail('durableRefs must be repo-relative task/phase/decision/deviation/handoff refs');
  if (refs.phase !== `${refs.task}#PHASE_${value.phase}`)
    return fail(`durableRefs.phase must be ${refs.task}#PHASE_${value.phase}`);

  let plan: Checkpoint['technicalPlan'] = null;
  if (value.technicalPlan !== null) {
    const rawPlan = object(value.technicalPlan);
    if (
      !rawPlan ||
      !exactKeys(rawPlan, ['summary', 'taskEdits', 'dagEdits', 'artifactEdits']) ||
      !nonEmpty(rawPlan.summary) ||
      !stringArray(rawPlan.taskEdits) ||
      !stringArray(rawPlan.dagEdits) ||
      !stringArray(rawPlan.artifactEdits)
    )
      return fail('technicalPlan must contain summary and string taskEdits/dagEdits/artifactEdits');
    if ([...rawPlan.taskEdits, ...rawPlan.dagEdits, ...rawPlan.artifactEdits].length === 0)
      return fail('technicalPlan must name at least one bounded technical edit');
    plan = rawPlan as Checkpoint['technicalPlan'];
  }

  const outcome = value.outcome as Outcome;
  if (outcome === 'RECOVERABLE_TECHNICAL') {
    if (!plan) return fail('RECOVERABLE_TECHNICAL requires a bounded technicalPlan');
    if (attempt.current !== 1) return fail('first RECOVERABLE_TECHNICAL attempt must be 1');
    if (!repoRefs(refs.deviations, true))
      return fail('RECOVERABLE_TECHNICAL requires a durable deviation reference');
  } else if (plan !== null) {
    return fail('technicalPlan is allowed only for RECOVERABLE_TECHNICAL');
  }
  if (outcome === 'TECHNICAL_REPLAN_EXHAUSTED' && attempt.current !== attempt.budget)
    return fail('TECHNICAL_REPLAN_EXHAUSTED requires current=budget');

  return {
    ok: true as const,
    checkpoint: {
      schema: SCHEMA,
      seq: value.seq,
      task: value.task,
      phase: value.phase,
      worker: worker as Checkpoint['worker'],
      reason: value.reason,
      outcome,
      attempt: attempt as Checkpoint['attempt'],
      evidence: value.evidence as string[],
      technicalPlan: plan,
      durableRefs: refs as Checkpoint['durableRefs'],
    } satisfies Checkpoint,
  };
}

function checkpoints(content: string) {
  const lines = content.split('\n');
  const journal = lines.findIndex((line) => line.trim() === 'journal:');
  if (journal === -1) return fail('session has no journal section');
  const values: Checkpoint[] = [];
  for (let index = journal + 1; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (/^(?:intent|scale|working set|glossary|journal|open):/.test(line.trim())) break;
    const bullet = /^\s*-\s*(.+)$/.exec(line)?.[1];
    if (!bullet?.includes(SCHEMA)) continue;
    const parsed = parseCheckpoint(bullet);
    if (!parsed.ok) return fail(`journal checkpoint at line ${index + 1}: ${parsed.detail}`);
    values.push(parsed.checkpoint);
  }
  return { ok: true as const, values };
}

function subset(previous: string[], next: string[]): boolean {
  return previous.every((value) => next.includes(value));
}

function latestTechnicalCheckpoint(
  values: Checkpoint[],
  task: string,
  phase: string
): Checkpoint | undefined {
  for (let index = values.length - 1; index >= 0; index--) {
    const candidate = values[index]!;
    if (
      candidate.task === task &&
      candidate.phase === phase &&
      (candidate.outcome === 'RECOVERABLE_TECHNICAL' ||
        candidate.outcome === 'TECHNICAL_REPLAN_EXHAUSTED')
    )
      return candidate;
  }
  return undefined;
}

function nextInstruction(checkpoint: Checkpoint): string {
  const next =
    checkpoint.outcome === 'CONTINUE'
      ? 'CONTINUE_EXECUTE'
      : checkpoint.outcome === 'CONTEXT_ROTATION'
        ? 'ROTATE_EXECUTE_WORKER'
        : checkpoint.outcome === 'RECOVERABLE_TECHNICAL'
          ? 'AUTO_REPLAN_AND_CONTINUE'
          : checkpoint.outcome === 'SPEC_GOAL_CONFLICT'
            ? 'ASK_OPERATOR_SPEC_GOAL_CONFLICT'
            : checkpoint.outcome === 'EXTERNAL_AUTHORITY_REQUIRED'
              ? 'ASK_OPERATOR_EXTERNAL_AUTHORITY_REQUIRED'
              : 'ASK_OPERATOR_TECHNICAL_REPLAN_EXHAUSTED';
  const refs = [
    checkpoint.durableRefs.phase,
    ...checkpoint.durableRefs.decisions,
    ...checkpoint.durableRefs.deviations,
    checkpoint.durableRefs.handoff,
  ];
  return `NEXT=${next} task=${checkpoint.task} phase=${checkpoint.phase} attempt=${checkpoint.attempt.current}/${checkpoint.attempt.budget} refs=${refs.join(',')}`;
}

/**
 * @purpose Validate and atomically append one execute-worker checkpoint.
 * @param content Current durable session bytes.
 * @param raw Exact one-line checkpoint JSON.
 * @param root Project root used to prove durable references.
 */
export function applyWorkerCheckpoint(content: string, raw: string, root: string) {
  if (!/^intent:\s*execute\s*$/m.test(content))
    return fail('checkpoint requires an open session with intent: execute');
  const parsed = parseCheckpoint(raw);
  if (!parsed.ok) return parsed;
  const refFailure = durableRefsError(root, parsed.checkpoint);
  if (refFailure) return fail(refFailure);
  const stored = checkpoints(content);
  if (!stored.ok) return stored;
  const prior = stored.values.at(-1);
  const expectedSeq = (prior?.seq ?? 0) + 1;
  if (parsed.checkpoint.seq !== expectedSeq) return fail(`seq must be ${expectedSeq}`);
  if (
    prior &&
    (prior.task !== parsed.checkpoint.task || prior.phase !== parsed.checkpoint.phase) &&
    prior.outcome !== 'CONTINUE'
  )
    return fail('task/phase may advance only after a CONTINUE checkpoint');
  const samePhase =
    prior?.task === parsed.checkpoint.task && prior?.phase === parsed.checkpoint.phase;
  const priorTechnical = latestTechnicalCheckpoint(
    stored.values,
    parsed.checkpoint.task,
    parsed.checkpoint.phase
  );
  if (!prior || !samePhase) {
    if (
      parsed.checkpoint.outcome === 'RECOVERABLE_TECHNICAL' &&
      parsed.checkpoint.attempt.current !== 1
    )
      return fail('first RECOVERABLE_TECHNICAL attempt must be 1');
    if (parsed.checkpoint.outcome === 'TECHNICAL_REPLAN_EXHAUSTED')
      return fail('TECHNICAL_REPLAN_EXHAUSTED requires prior RECOVERABLE_TECHNICAL');
    if (
      parsed.checkpoint.attempt.current !== 0 &&
      parsed.checkpoint.outcome !== 'RECOVERABLE_TECHNICAL'
    )
      return fail('a new task/phase starts with attempt current=0');
  }
  if (prior && prior.task === parsed.checkpoint.task && prior.phase === parsed.checkpoint.phase) {
    if (prior.attempt.budget !== parsed.checkpoint.attempt.budget)
      return fail('attempt budget cannot change on resume');
    if (parsed.checkpoint.outcome === 'CONTEXT_ROTATION') {
      if (parsed.checkpoint.attempt.current !== prior.attempt.current)
        return fail('CONTEXT_ROTATION must retain the exact attempt current');
    } else if (parsed.checkpoint.outcome === 'RECOVERABLE_TECHNICAL') {
      if (parsed.checkpoint.attempt.current !== (priorTechnical?.attempt.current ?? 0) + 1)
        return fail('RECOVERABLE_TECHNICAL attempt must advance exactly by one');
    } else if (parsed.checkpoint.outcome === 'TECHNICAL_REPLAN_EXHAUSTED') {
      if (
        priorTechnical?.outcome !== 'RECOVERABLE_TECHNICAL' ||
        priorTechnical.attempt.current !== TECHNICAL_REPLAN_BUDGET - 1 ||
        parsed.checkpoint.attempt.current !== TECHNICAL_REPLAN_BUDGET
      )
        return fail('TECHNICAL_REPLAN_EXHAUSTED requires prior RECOVERABLE_TECHNICAL at budget-1');
    } else if (parsed.checkpoint.attempt.current !== prior.attempt.current) {
      return fail('CONTINUE must retain the exact attempt current');
    }
    if (!subset(prior.durableRefs.decisions, parsed.checkpoint.durableRefs.decisions))
      return fail('resume must retain prior decision refs');
    if (!subset(prior.durableRefs.deviations, parsed.checkpoint.durableRefs.deviations))
      return fail('resume must retain prior deviation refs');
  }
  const serialized = JSON.stringify(parsed.checkpoint);
  const updated = appendToSection(content, 'journal', serialized);
  if (updated === null) return fail('session has no journal section');
  return {
    ok: true as const,
    content: updated,
    next: nextInstruction(parsed.checkpoint),
  };
}
