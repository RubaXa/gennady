// @file: Typed append-only scaffold feasibility lifecycle owned by sdd-session.
// @consumers: sdd-session feasibility
// @tasks: N/A

import { appendToSection } from './sdd-session.types.ts';

const SCHEMA = 'sdd-scaffold-feasibility/v1' as const;
const EVENT_KEYS = ['schema', 'cycle', 'seq', 'event', 'payload'] as const;
const EVENTS = [
  'opened',
  'worker-state',
  'sensor-result',
  'target-refreshed',
  'operator-disposition',
  'gate2-choice',
  'closed',
] as const;

type EventName = (typeof EVENTS)[number];
type TargetHashes = Record<string, string>;
type ParsedEvent = {
  schema: typeof SCHEMA;
  cycle: string;
  seq: number;
  event: EventName;
  payload: Record<string, unknown>;
};
type FoldState = {
  cycle: string;
  seq: number;
  targets: TargetHashes;
  workerAvailability: 'alive' | 'unsupported' | 'lost' | null;
  workerSession: string | null;
  fallbackUsed: boolean;
  resultCount: number;
  activeCap: number;
  lastVerdict: string | null;
  lastChanges: string[];
  pendingFork: string | null;
  capDisposed: boolean;
  gate2Chosen: boolean;
  restartRequested: boolean;
  closed: boolean;
};

function fail(detail: string) {
  return { ok: false as const, detail };
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function targetHashes(value: unknown): TargetHashes | null {
  const parsed = object(value);
  if (!parsed || Object.keys(parsed).length === 0) return null;
  for (const [path, hash] of Object.entries(parsed)) {
    if (!nonEmpty(path) || path.startsWith('/') || path.split('/').includes('..')) return null;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return null;
  }
  return parsed as TargetHashes;
}

function sameTargets(left: TargetHashes, right: TargetHashes): boolean {
  const entries = (value: TargetHashes) =>
    Object.entries(value).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function parseEvent(raw: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail('event is not valid JSON');
  }
  const event = object(value);
  if (!event || !exactKeys(event, EVENT_KEYS))
    return fail(`event keys must be exactly ${EVENT_KEYS.join(', ')}`);
  if (event.schema !== SCHEMA) return fail(`schema must be ${SCHEMA}`);
  if (!nonEmpty(event.cycle)) return fail('cycle must be a non-empty string');
  if (!Number.isSafeInteger(event.seq) || (event.seq as number) < 1)
    return fail('seq must be a positive integer');
  if (!EVENTS.includes(event.event as EventName)) return fail(`unknown event '${event.event}'`);
  const payload = object(event.payload);
  if (!payload) return fail('payload must be an object');
  return {
    ok: true as const,
    event: {
      schema: SCHEMA,
      cycle: event.cycle,
      seq: event.seq as number,
      event: event.event as EventName,
      payload,
    },
  };
}

function journalEvents(content: string) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'journal:');
  if (start === -1) return fail('session has no journal section');
  const events: ParsedEvent[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (/^(?:intent|scale|working set|glossary|journal|open):/.test(line.trim())) break;
    const bullet = /^\s*-\s*(.+)$/.exec(line)?.[1];
    if (!bullet?.startsWith('{')) continue;
    let decoded: unknown;
    try {
      decoded = JSON.parse(bullet);
    } catch {
      return fail(`journal JSON bullet at line ${index + 1} is invalid`);
    }
    if (object(decoded)?.schema !== SCHEMA) continue;
    const parsed = parseEvent(bullet);
    if (!parsed.ok) return fail(`journal event at line ${index + 1}: ${parsed.detail}`);
    events.push(parsed.event);
  }
  return { ok: true as const, events };
}

function apply(state: FoldState | null, event: ParsedEvent) {
  if (event.event === 'opened') {
    if (state && !state.closed && !state.restartRequested)
      return fail('opened requires no active cycle or an accepted RESTART disposition');
    if (state && event.cycle === state.cycle) return fail('opened must start a new cycle id');
    if (event.seq !== 1) return fail('opened must have seq=1');
    if (!exactKeys(event.payload, ['targets', 'fallbackUsed', 'resultCount', 'activeCap']))
      return fail('opened payload keys must be targets, fallbackUsed, resultCount, activeCap');
    const targets = targetHashes(event.payload.targets);
    if (!targets) return fail('opened targets must be non-empty repo-relative path → SHA-256');
    if (
      event.payload.fallbackUsed !== false ||
      event.payload.resultCount !== 0 ||
      event.payload.activeCap !== 5
    )
      return fail('opened must start with fallbackUsed=false, resultCount=0, activeCap=5');
    return {
      ok: true as const,
      state: {
        cycle: event.cycle,
        seq: 1,
        targets,
        workerAvailability: null,
        workerSession: null,
        fallbackUsed: false,
        resultCount: 0,
        activeCap: 5,
        lastVerdict: null,
        lastChanges: [],
        pendingFork: null,
        capDisposed: false,
        gate2Chosen: false,
        restartRequested: false,
        closed: false,
      } satisfies FoldState,
    };
  }
  if (!state) return fail(`${event.event} requires an opened cycle`);
  if (state.closed) return fail(`${event.event} cannot follow closed`);
  if (event.cycle !== state.cycle)
    return fail(`cycle '${event.cycle}' does not match '${state.cycle}'`);
  if (event.seq !== state.seq + 1) return fail(`seq must be ${state.seq + 1}`);
  const next: FoldState = { ...state, seq: event.seq };

  if (event.event === 'worker-state') {
    if (!exactKeys(event.payload, ['availability', 'workerSession', 'fallbackUsed']))
      return fail('worker-state payload keys must be availability, workerSession, fallbackUsed');
    const availability = event.payload.availability;
    if (!['alive', 'unsupported', 'lost'].includes(String(availability)))
      return fail('worker-state availability must be alive, unsupported, or lost');
    const worker = event.payload.workerSession;
    if (availability === 'alive' && !nonEmpty(worker))
      return fail('alive worker-state requires a non-empty workerSession');
    if (availability !== 'alive' && worker !== null && !nonEmpty(worker))
      return fail('non-alive worker-state requires the retained workerSession or null');
    if (state.workerSession !== null && availability !== 'alive' && worker !== state.workerSession)
      return fail('lost/unsupported worker-state must retain the known workerSession');
    if (typeof event.payload.fallbackUsed !== 'boolean')
      return fail('worker-state fallbackUsed must be boolean');
    if (state.fallbackUsed && event.payload.fallbackUsed !== true)
      return fail('fallbackUsed cannot return to false');
    const startsFallback = !state.fallbackUsed && event.payload.fallbackUsed === true;
    if (state.workerSession !== null && nonEmpty(worker) && worker !== state.workerSession) {
      if (!startsFallback || availability !== 'alive')
        return fail('a worker id may change only once when the first fallback becomes alive');
    }
    if (state.fallbackUsed && state.workerSession !== null && worker !== state.workerSession)
      return fail('a second fallback worker is not allowed');
    next.workerAvailability = availability as FoldState['workerAvailability'];
    next.workerSession = nonEmpty(worker) ? worker : state.workerSession;
    next.fallbackUsed = event.payload.fallbackUsed;
    return { ok: true as const, state: next };
  }

  if (event.event === 'sensor-result') {
    const hasFork = Object.hasOwn(event.payload, 'fork');
    const expectedKeys = hasFork
      ? ['resultCount', 'verdict', 'changes', 'targets', 'fork']
      : ['resultCount', 'verdict', 'changes', 'targets'];
    if (!exactKeys(event.payload, expectedKeys))
      return fail(
        'sensor-result payload keys must be resultCount, verdict, changes, targets[, fork]'
      );
    if (state.workerAvailability !== 'alive' || !nonEmpty(state.workerSession))
      return fail('sensor-result requires a retained alive workerSession');
    if (event.payload.resultCount !== state.resultCount + 1)
      return fail(`sensor-result resultCount must be ${state.resultCount + 1}`);
    if (!nonEmpty(event.payload.verdict)) return fail('sensor-result verdict must be non-empty');
    if (!stringArray(event.payload.changes))
      return fail('sensor-result changes must be a string array');
    const targets = targetHashes(event.payload.targets);
    if (!targets || !sameTargets(targets, state.targets))
      return fail('sensor-result targets must exactly match the latest target set');
    if (state.resultCount > 0 && state.lastChanges.length > 0 && state.seq > 0) {
      const priorResolvedByRefresh = state.lastVerdict === null;
      if (!priorResolvedByRefresh)
        return fail('record target-refreshed before the next sensor-result');
    }
    if (state.resultCount >= state.activeCap && !state.capDisposed)
      return fail('active cap requires operator-disposition before another sensor-result');
    if (event.payload.verdict === 'NEW_FORK') {
      if (!hasFork || !nonEmpty(event.payload.fork) || event.payload.changes.length !== 0)
        return fail('NEW_FORK requires one non-empty fork delta and no Changes');
    } else if (hasFork) {
      return fail('fork is legal only for verdict NEW_FORK');
    }
    next.resultCount = event.payload.resultCount as number;
    next.lastVerdict = event.payload.verdict;
    next.lastChanges = [...(event.payload.changes as string[])];
    next.pendingFork = event.payload.verdict === 'NEW_FORK' ? (event.payload.fork as string) : null;
    next.capDisposed = false;
    return { ok: true as const, state: next };
  }

  if (event.event === 'target-refreshed') {
    if (!exactKeys(event.payload, ['targets', 'changedTickets']))
      return fail('target-refreshed payload keys must be targets, changedTickets');
    if (state.lastVerdict === null || state.lastChanges.length === 0)
      return fail('target-refreshed requires the immediately recorded CHANGES sensor-result');
    if (state.resultCount >= state.activeCap && !state.capDisposed)
      return fail('active cap requires operator-disposition before target refresh');
    const targets = targetHashes(event.payload.targets);
    if (!targets) return fail('target-refreshed targets must be non-empty path → SHA-256');
    if (!stringArray(event.payload.changedTickets) || event.payload.changedTickets.length === 0)
      return fail('target-refreshed changedTickets must be a non-empty string array');
    next.targets = targets;
    next.lastVerdict = null;
    next.lastChanges = [];
    next.pendingFork = null;
    return { ok: true as const, state: next };
  }

  if (event.event === 'operator-disposition') {
    if (!exactKeys(event.payload, ['resultCount', 'disposition']))
      return fail('operator-disposition payload keys must be resultCount, disposition');
    if (state.resultCount < state.activeCap)
      return fail('operator-disposition is legal only at the active cap');
    if (event.payload.resultCount !== state.resultCount)
      return fail(`operator-disposition resultCount must be ${state.resultCount}`);
    if (!nonEmpty(event.payload.disposition)) return fail('operator disposition must be non-empty');
    const disposition = event.payload.disposition;
    if (disposition === 'CLEAN') {
      if (state.lastChanges.length > 0) return fail('CLEAN cannot accept a result with Changes');
      next.capDisposed = true;
      return { ok: true as const, state: next };
    }
    const continued = /^CONTINUE THROUGH ROUND ([1-9][0-9]*)$/.exec(disposition);
    if (continued) {
      const cap = Number(continued[1]);
      if (cap <= state.resultCount) return fail('continued cap must exceed current resultCount');
      next.activeCap = cap;
      next.capDisposed = true;
      return { ok: true as const, state: next };
    }
    if (/^RESTART: \S.+$/.test(disposition)) {
      next.capDisposed = true;
      next.restartRequested = true;
      next.closed = true;
      return { ok: true as const, state: next };
    }
    return fail('disposition must be CLEAN, CONTINUE THROUGH ROUND N, or RESTART: reason');
  }

  if (event.event === 'gate2-choice') {
    if (
      !exactKeys(event.payload, ['choices', 'changedTickets']) ||
      !stringArray(event.payload.choices) ||
      !stringArray(event.payload.changedTickets)
    )
      return fail('gate2-choice choices and changedTickets must be string arrays');
    if (!['CLEAN', 'NEW_FORK'].includes(state.lastVerdict ?? '') || state.lastChanges.length > 0)
      return fail('gate2-choice requires the latest recorded no-change CLEAN or NEW_FORK');
    if (state.resultCount >= state.activeCap && !state.capDisposed)
      return fail('active cap requires operator CLEAN before gate2-choice');
    if (
      state.lastVerdict === 'NEW_FORK' &&
      (event.payload.choices.length === 0 || event.payload.changedTickets.length === 0)
    )
      return fail('NEW_FORK gate2-choice must record a choice and its changed tickets');
    next.gate2Chosen = true;
    if (event.payload.changedTickets.length > 0) {
      next.lastVerdict = 'GATE2_CHANGES';
      next.lastChanges = [...(event.payload.changedTickets as string[])];
    }
    next.pendingFork = null;
    return { ok: true as const, state: next };
  }

  if (!exactKeys(event.payload, [])) return fail('closed payload must be empty');
  if (!state.gate2Chosen) return fail('closed requires gate2-choice');
  if (state.lastChanges.length > 0 || state.lastVerdict !== 'CLEAN')
    return fail('closed requires a no-change CLEAN over the latest target set');
  next.closed = true;
  return { ok: true as const, state: next };
}

function nextInstruction(state: FoldState, event: EventName): string {
  let next = 'RECORD_WORKER_STATE';
  if (event === 'worker-state')
    next = state.workerAvailability === 'alive' ? 'DISPATCH_CRITIC' : 'RESTORE_OR_FALLBACK_WORKER';
  if (event === 'sensor-result') {
    if (state.resultCount >= state.activeCap) next = 'ASK_OPERATOR_CAP';
    else if (state.lastChanges.length > 0) next = 'APPLY_CHANGES_THEN_REFRESH_TARGETS';
    else if (state.lastVerdict === 'CLEAN') next = state.gate2Chosen ? 'FINALIZE' : 'PRESENT_GATE2';
    else if (state.lastVerdict === 'NEW_FORK') next = 'PRESENT_GATE2';
    else next = 'RESOLVE_RESULT';
  }
  if (event === 'target-refreshed') next = 'REDISPATCH_CRITIC';
  if (event === 'operator-disposition') {
    if (state.restartRequested) next = 'OPEN_RESTART_CYCLE';
    else if (state.lastChanges.length > 0) next = 'APPLY_CHANGES_THEN_REFRESH_TARGETS';
    else if (state.lastVerdict === 'CLEAN' || state.lastVerdict === 'NEW_FORK')
      next = 'PRESENT_GATE2';
    else next = 'RESOLVE_RESULT';
  }
  if (event === 'gate2-choice')
    next = state.lastChanges.length > 0 ? 'REFRESH_TARGETS' : 'FINALIZE';
  if (event === 'closed') next = 'CLOSE_SESSION';
  return `NEXT=${next} cycle=${state.cycle} resultCount=${state.resultCount} activeCap=${state.activeCap} workerSession=${state.workerSession ?? 'none'}`;
}

/**
 * @purpose Validate, fold, and append one typed scaffold feasibility event atomically.
 * @param sessionContent Exact current session bytes.
 * @param payload Exact one-line JSON event from the bounded scratch payload.
 */
export function applyFeasibilityEvent(sessionContent: string, payload: string) {
  if (payload.includes('\n') || payload.includes('\r')) return fail('event must be one JSON line');
  const existing = journalEvents(sessionContent);
  if (!existing.ok) return existing;
  let state: FoldState | null = null;
  for (const stored of existing.events) {
    const folded = apply(state, stored);
    if (!folded.ok) return fail(`stored seq ${stored.seq}: ${folded.detail}`);
    state = folded.state;
  }
  const parsed = parseEvent(payload);
  if (!parsed.ok) return parsed;
  const folded = apply(state, parsed.event);
  if (!folded.ok) return folded;
  const updated = appendToSection(sessionContent, 'journal', payload);
  if (updated === null) return fail('session has no journal section');
  return {
    ok: true as const,
    content: updated,
    next: nextInstruction(folded.state, parsed.event.event),
  };
}
