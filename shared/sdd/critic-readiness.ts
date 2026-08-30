// @file: Canonical critic history, cap, target-set and reviewed-state readiness.
// @consumers: check compatibility exports, sdd-check
// @tasks: N/A

import { createHash } from 'node:crypto';
import type { Finding } from './finding.ts';
import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';

/** @purpose One canonical critic round extracted outside fenced examples. */
type CriticRoundEvidence = {
  /** @purpose Canonical round number. */
  number: number;
  /** @purpose Canonical verdict lines in this round. */
  verdicts: string[];
  /** @purpose Canonical target-set lines in this round. */
  targetSets: string[];
  /** @purpose Canonical write-set lines in this round. */
  writeSets: string[];
  /** @purpose Canonical reviewed-state fingerprints in this round. */
  changedStates: string[];
  /** @purpose Session disposition: continued, or a fresh fallback with a reason. */
  dispatches: string[];
  /** @purpose Canonical operator-decision lines in this round. */
  operatorDecisions: string[];
  /** @purpose Canonical edit-summary lines in this round. */
  changes: string[];
};

/** @purpose Parsed critic history, including malformed Round-like headings that must fail closed. */
type CriticHistoryEvidence = {
  /** @purpose Whether the top-level Critic Rounds section exists outside a fence. */
  sectionFound: boolean;
  /** @purpose Number of canonical Critic Rounds sections outside fences. */
  sectionCount: number;
  /** @purpose Canonical rounds in document order. */
  rounds: CriticRoundEvidence[];
  /** @purpose Whether a Round-like heading failed the canonical shape. */
  malformedRoundHeading: boolean;
};

/** @purpose Extract every canonical critic round outside fenced examples. */
function parseCriticHistory(content: string): CriticHistoryEvidence {
  const lines = content.split('\n');
  let fence: MarkdownFence | null = null;
  let inCriticSection = false;
  let current: CriticRoundEvidence | null = null;
  let sectionFound = false;
  let sectionCount = 0;
  let malformedRoundHeading = false;
  const rounds: CriticRoundEvidence[] = [];

  for (const line of lines) {
    const nextFence = nextMarkdownFence(line, fence);
    if (nextFence !== fence) {
      fence = nextFence;
      continue;
    }
    if (fence !== null) continue;
    if (/^##[ \t]+Critic Rounds[ \t]*$/.test(line)) {
      inCriticSection = true;
      sectionFound = true;
      sectionCount++;
      current = null;
      continue;
    }
    if (inCriticSection && /^##[ \t]+(?!#)/.test(line)) {
      inCriticSection = false;
      current = null;
      continue;
    }
    if (!inCriticSection) continue;
    if (/^###[ \t]+Round\b/i.test(line)) {
      const heading = /^###[ \t]+Round[ \t]+([1-9]\d*)[ \t]+—[ \t]+\d{4}-\d{2}-\d{2}[ \t]*$/.exec(
        line
      );
      if (!heading) {
        malformedRoundHeading = true;
        current = null;
        continue;
      }
      current = {
        number: Number(heading[1]),
        verdicts: [],
        targetSets: [],
        writeSets: [],
        changedStates: [],
        dispatches: [],
        operatorDecisions: [],
        changes: [],
      };
      rounds.push(current);
      continue;
    }
    if (!current) continue;
    const verdict = /^[ \t]*-[ \t]*Verdict:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (verdict) current.verdicts.push(verdict[1] as string);
    const targetSet = /^[ \t]*-[ \t]*Target-set:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (targetSet) current.targetSets.push(targetSet[1] as string);
    const writeSet = /^[ \t]*-[ \t]*Write-set:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (writeSet) current.writeSets.push(writeSet[1] as string);
    const changedState = /^[ \t]*-[ \t]*Changed-state:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (changedState) current.changedStates.push(changedState[1] as string);
    const dispatch = /^[ \t]*-[ \t]*Dispatch:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (dispatch) current.dispatches.push(dispatch[1] as string);
    const operatorDecision = /^[ \t]*-[ \t]*Operator-decision:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (operatorDecision) current.operatorDecisions.push(operatorDecision[1] as string);
    const changes = /^[ \t]*-[ \t]*Changes:[ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (changes) current.changes.push(changes[1] as string);
  }
  return { sectionFound, sectionCount, rounds, malformedRoundHeading };
}

/**
 * @purpose Whether an artifact declares a real (outside-fence) Critic Rounds section.
 * @param content Full artifact markdown.
 * @returns True when exactly the parser-visible section marker exists; multiplicity is validated by readiness.
 */
export function hasCriticRoundsSection(content: string): boolean {
  return parseCriticHistory(content).sectionFound;
}

/**
 * @purpose Canonical portable target-set serialization persisted in the bundle's one primary artifact.
 * @param paths Repo-relative bundle paths in any order, possibly duplicated.
 * @returns Deduplicated, sorted paths joined by the canonical separator.
 */
export function formatCriticTargetSet(paths: string[]): string {
  return Array.from(new Set(paths)).sort().join(' | ');
}

/**
 * @purpose Remove the top-level Critic Rounds scratch so its own evidence does not change the reviewed-state hash.
 * @param content Full primary artifact markdown.
 * @returns Artifact bytes with only the parser-visible critic scratch removed.
 */
function withoutCriticRounds(content: string): string {
  const lines = content.split('\n');
  let fence: MarkdownFence | null = null;
  let dropping = false;
  const kept: string[] = [];
  for (const line of lines) {
    const nextFence = nextMarkdownFence(line, fence);
    if (nextFence !== fence) {
      fence = nextFence;
      if (!dropping) kept.push(line);
      continue;
    }
    if (fence !== null) {
      if (!dropping) kept.push(line);
      continue;
    }
    if (/^##[ \t]+Critic Rounds[ \t]*$/.test(line)) {
      dropping = true;
      continue;
    }
    if (dropping && /^##[ \t]+(?!#)/.test(line)) dropping = false;
    if (!dropping) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * @purpose Hash the exact integrated artifact bytes while excluding only the primary's critic scratch.
 * @param members Canonically addressed target-set members and the one primary marker.
 * @returns Stable SHA-256 evidence string for the exact integrated state.
 */
export function formatCriticChangedState(
  members: { path: string; content: string; primary: boolean }[]
): string {
  const hash = createHash('sha256');
  for (const member of [...members].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(member.path);
    hash.update('\0');
    hash.update(member.primary ? withoutCriticRounds(member.content) : member.content);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

/** @purpose Parse a canonical sorted target-set line; null means malformed/duplicated/unsorted proof. */
function parseCriticTargetSetLine(value: string): string[] | null {
  const paths = value.split(' | ');
  if (paths.length === 0 || paths.some((path) => path.length === 0 || path.includes('|')))
    return null;
  return formatCriticTargetSet(paths) === value ? paths : null;
}

/**
 * @purpose Return the last round's canonical target-set for bundle aggregation.
 * @param content Full primary-artifact markdown.
 * @returns Canonical sorted paths, or null when section/round/target-set evidence is malformed.
 */
export function latestCriticTargetSet(content: string): string[] | null {
  const history = parseCriticHistory(content);
  const last = history.rounds.at(-1);
  if (
    history.sectionCount !== 1 ||
    history.malformedRoundHeading ||
    !last ||
    last.targetSets.length !== 1
  )
    return null;
  return parseCriticTargetSetLine(last.targetSets[0] as string);
}

/**
 * @purpose Return the latest round's canonical write-set for pre-dispatch/readiness checks.
 * @param content Full primary-artifact markdown.
 * @returns Canonical sorted paths, or null when the latest evidence is malformed.
 */
export function latestCriticWriteSet(content: string): string[] | null {
  const history = parseCriticHistory(content);
  const last = history.rounds.at(-1);
  if (
    history.sectionCount !== 1 ||
    history.malformedRoundHeading ||
    !last ||
    last.writeSets.length !== 1
  )
    return null;
  return parseCriticTargetSetLine(last.writeSets[0] as string);
}

/**
 * @purpose Require one canonical completed latest round and, for bundles, proof of the exact ordered target-set.
 * @param file Spec file path.
 * @param content Full review-state spec markdown.
 * @param expectedTargetSet Sorted repo-relative review-bundle paths, or null when only syntax is checked.
 * @param [expectedChangedState] Current integrated-state SHA, or null when only round syntax is checked.
 * @param [expectedWriteSet] Sorted repo-relative writable members, or null when only history syntax is checked.
 * @returns One readiness finding when proof is absent, ambiguous, stale, or for another target-set.
 */
export function checkCriticReadinessForTargetSet(
  file: string,
  content: string,
  expectedTargetSet: string[] | null,
  expectedChangedState: string | null = null,
  expectedWriteSet: string[] | null = null
): Finding[] {
  const history = parseCriticHistory(content);
  if (!history.sectionFound) {
    return [
      {
        severity: 'error',
        code: 'SDD_CRITIC_NOT_RUN',
        file,
        message:
          'Review-state spec has no `## Critic Rounds` evidence. Run the integrated critic before publish or compression.',
      },
    ];
  }

  if (history.sectionCount !== 1 || history.malformedRoundHeading || history.rounds.length === 0) {
    return [
      {
        severity: 'error',
        code: 'SDD_CRITIC_ROUND_FORMAT_INVALID',
        file,
        message:
          'Critic evidence must contain exactly one `## Critic Rounds` section and canonical headings `### Round <N> — YYYY-MM-DD`; malformed or duplicated evidence fails closed.',
      },
    ];
  }

  for (let i = 0; i < history.rounds.length; i++) {
    const round = history.rounds[i] as CriticRoundEvidence;
    if (round.number !== i + 1) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_ROUND_SEQUENCE_INVALID',
          file,
          message: `Critic rounds must be sequential from 1; found Round ${round.number} at position ${i + 1}.`,
        },
      ];
    }
    if (round.verdicts.length !== 1) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_VERDICT_MISSING',
          file,
          message: `Round ${round.number} must contain exactly one canonical \`- Verdict: CLEAN|NEEDS_WORK|CRITICAL\` line.`,
        },
      ];
    }
    const verdict = round.verdicts[0] as string;
    if (!/^(CLEAN|NEEDS_WORK|CRITICAL)$/.test(verdict)) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_VERDICT_MISSING',
          file,
          message: `Round ${round.number} critic verdict is non-canonical: ${verdict}. Expected literal CLEAN|NEEDS_WORK|CRITICAL.`,
        },
      ];
    }
    if (
      round.targetSets.length !== 1 ||
      parseCriticTargetSetLine(round.targetSets[0] as string) === null
    ) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_TARGET_SET_MISSING',
          file,
          message: `Round ${round.number} must contain exactly one canonical \`- Target-set: path | path\` proof line.`,
        },
      ];
    }
    const parsedTargetSet = parseCriticTargetSetLine(round.targetSets[0] as string) as string[];
    const parsedWriteSet =
      round.writeSets.length === 1 ? parseCriticTargetSetLine(round.writeSets[0] as string) : null;
    if (
      parsedWriteSet === null ||
      parsedWriteSet.length === 0 ||
      parsedWriteSet.some((path) => !parsedTargetSet.includes(path))
    ) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_WRITE_SET_INVALID',
          file,
          message: `Round ${round.number} must contain one non-empty canonical \`- Write-set: path | path\` whose members are a subset of Target-set.`,
        },
      ];
    }
    if (
      round.changedStates.length !== 1 ||
      !/^sha256:[0-9a-f]{64}$/.test(round.changedStates[0] as string)
    ) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_CHANGED_STATE_MISSING',
          file,
          message: `Round ${round.number} must contain exactly one canonical \`- Changed-state: sha256:<64 lowercase hex>\` proof line.`,
        },
      ];
    }
    if (round.dispatches.length !== 1) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_DISPATCH_MISSING',
          file,
          message: `Round ${round.number} must record one \`- Dispatch:\` line: continued, initial, or fresh fallback with reason.`,
        },
      ];
    }
    const dispatch = round.dispatches[0] as string;
    const validDispatch =
      (round.number === 1 &&
        /^fresh — (?:initial target-set|(?:target-set|write-set) changed: \S.*)$/.test(dispatch)) ||
      (round.number > 1 &&
        (dispatch === 'continued' ||
          /^fresh — (?:continuation unavailable|session lost|session failed): \S.*$/.test(
            dispatch
          )));
    if (!validDispatch) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_DISPATCH_INVALID',
          file,
          message: `Round ${round.number} has invalid dispatch evidence \`${dispatch}\`; continuation is the default and every fresh fallback needs a canonical reason.`,
        },
      ];
    }
    if (round.operatorDecisions.length > 1) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_OPERATOR_DECISION_INVALID',
          file,
          message: `Round ${round.number} has more than one operator decision.`,
        },
      ];
    }
    if (round.changes.length !== 1 || round.changes[0]?.trim().length === 0) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_CHANGES_MISSING',
          file,
          message: `Round ${round.number} must contain exactly one \`- Changes: none|<summary>\` line.`,
        },
      ];
    }
    const roundEdited = round.changes[0] !== 'none';
    const decision = round.operatorDecisions[0];
    let activeCap = 5;
    for (let priorIndex = 0; priorIndex < i; priorIndex++) {
      const priorDecision = history.rounds[priorIndex]?.operatorDecisions[0];
      const extension = /^CONTINUE THROUGH ROUND ([1-9]\d*)$/.exec(priorDecision ?? '');
      if (extension) activeCap = Number(extension[1]);
    }
    if (decision !== undefined) {
      const extension = /^CONTINUE THROUGH ROUND ([1-9]\d*)$/.exec(decision);
      const allowed =
        round.number === activeCap &&
        ((decision === 'CLEAN' && !roundEdited) ||
          /^RESTART: \S.*$/.test(decision) ||
          (extension !== null && Number(extension[1]) > activeCap));
      if (!allowed) {
        return [
          {
            severity: 'error',
            code: 'SDD_CRITIC_OPERATOR_DECISION_INVALID',
            file,
            message: `Round ${round.number} has invalid operator decision \`${decision}\`; at active cap ${activeCap}, CLEAN is allowed only when Changes=none, otherwise use CONTINUE THROUGH ROUND <higher cap> or RESTART: <reason>.`,
          },
        ];
      }
    }
    if (round.number > activeCap) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_ROUND_UNAUTHORIZED',
          file,
          message: `Round ${round.number} exceeds the active operator-approved cap ${activeCap}.`,
        },
      ];
    }
    if (i > 0) {
      const prior = history.rounds[i - 1] as CriticRoundEvidence;
      const priorVerdict = prior.verdicts[0];
      const priorDecision = prior.operatorDecisions[0] ?? '';
      const operatorContinued = /^CONTINUE THROUGH ROUND [1-9]\d*$/.test(priorDecision);
      const priorEdited = prior.changes[0] !== 'none';
      if (
        (!priorEdited && !operatorContinued) ||
        priorDecision === 'CLEAN' ||
        /^RESTART:/.test(priorDecision)
      ) {
        const completion =
          priorDecision === 'CLEAN'
            ? 'operator CLEAN'
            : priorVerdict === 'CLEAN' && !priorEdited
              ? 'sensor CLEAN'
              : !priorEdited
                ? `${priorVerdict} with Changes=none (terminal not-ready)`
                : `operator ${priorDecision}`;
        return [
          {
            severity: 'error',
            code: 'SDD_CRITIC_ROUND_AFTER_COMPLETION',
            file,
            message: `Round ${round.number} appears after Round ${round.number - 1} already completed the critic history with ${completion}.`,
          },
        ];
      }
      if (priorEdited && round.changedStates[0] === prior.changedStates[0]) {
        return [
          {
            severity: 'error',
            code: 'SDD_CRITIC_CHANGED_STATE_NOT_ADVANCED',
            file,
            message: `Round ${round.number} follows edits recorded in Round ${round.number - 1}, but its pre-dispatch Changed-state did not change. Recompute review-state from the current artifact bytes before dispatch.`,
          },
        ];
      }
    }
    if (i > 0 && round.targetSets[0] !== history.rounds[0]?.targetSets[0]) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_TARGET_SET_CHANGED_IN_CYCLE',
          file,
          message: `Round ${round.number} changed the target-set inside one critic cycle; restart at Round 1 with a fresh dispatch reason.`,
        },
      ];
    }
    if (i > 0 && round.writeSets[0] !== history.rounds[0]?.writeSets[0]) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_WRITE_SET_CHANGED_IN_CYCLE',
          file,
          message: `Round ${round.number} changed the write-set inside one critic cycle; promote/demote members only by restarting at Round 1.`,
        },
      ];
    }
    if (round.number === activeCap) {
      if (decision === undefined) {
        return [
          {
            severity: 'error',
            code: 'SDD_CRITIC_OPERATOR_DECISION_INVALID',
            file,
            message: `Round ${round.number} reached the active cap ${activeCap}; an operator decision is mandatory regardless of sensor verdict.`,
          },
        ];
      }
    }
  }

  const round = history.rounds.at(-1) as CriticRoundEvidence;
  const last = round.verdicts[0] as string;
  const lastEdited = round.changes[0] !== 'none';
  const finalDecision = round.operatorDecisions[0] ?? '';
  const operatorClean = finalDecision === 'CLEAN';
  if (/^RESTART: /.test(finalDecision)) {
    return [
      {
        severity: 'error',
        code: 'SDD_CRITIC_RESTART_REQUIRED',
        file,
        message:
          'The operator ended this critic cycle with RESTART; recompute the target-set and begin a fresh Round 1 instead of continuing or accepting this history.',
      },
    ];
  }
  let finalCap = 5;
  for (const prior of history.rounds.slice(0, -1)) {
    const extension = /^CONTINUE THROUGH ROUND ([1-9]\d*)$/.exec(prior.operatorDecisions[0] ?? '');
    if (extension) finalCap = Number(extension[1]);
  }
  const sensorCleanBeforeCap = last === 'CLEAN' && !lastEdited && round.number < finalCap;
  if (!sensorCleanBeforeCap && !operatorClean) {
    return [
      {
        severity: 'error',
        code: 'SDD_CRITIC_NOT_CLEAN',
        file,
        message: lastEdited
          ? `Round ${round.number} changed reviewed artifacts; another sensor round over a newly computed Changed-state is mandatory before readiness.`
          : `Last critic verdict is ${last} with Changes=none; the cycle is terminal not-ready before the cap, or requires an explicit operator disposition at the active cap.`,
      },
    ];
  }

  if (expectedTargetSet !== null) {
    const expected = formatCriticTargetSet(expectedTargetSet);
    if (round.targetSets[0] !== expected) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_TARGET_SET_MISMATCH',
          file,
          message: `Latest critic target-set is \`${round.targetSets[0]}\`; expected \`${expected}\` for this complete review bundle.`,
        },
      ];
    }
  }
  if (expectedWriteSet !== null) {
    const expected = formatCriticTargetSet(expectedWriteSet);
    if (round.writeSets[0] !== expected) {
      return [
        {
          severity: 'error',
          code: 'SDD_CRITIC_WRITE_SET_MISMATCH',
          file,
          message: `Latest critic write-set is \`${round.writeSets[0]}\`; current structural write-set is \`${expected}\`. Restart the critic cycle before editing a promoted member.`,
        },
      ];
    }
  }
  if (expectedChangedState !== null && round.changedStates[0] !== expectedChangedState) {
    return [
      {
        severity: 'error',
        code: 'SDD_CRITIC_CHANGED_STATE_MISMATCH',
        file,
        message: `Latest critic changed-state is \`${round.changedStates[0]}\`; current integrated state is \`${expectedChangedState}\`. Re-dispatch critic before readiness.`,
      },
    ];
  }
  return [];
}
