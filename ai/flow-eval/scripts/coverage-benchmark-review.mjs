// @file: Read-only SC4 postflight projection; private inputs are hash-bound and never copied into public output.
// @spec: AI-SKILLS
// @consumers: local SC4 reviewer; run with node --import tsx and explicit public/private directories

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { toolEventsFrom, invokesCommand } from '../trajectory.ts';
import { parseSourceOwnershipHeader } from '../../../shared/sdd/source-ownership-header.ts';

const [publicDirectory, privateDirectory] = process.argv.slice(2);
if (!publicDirectory || !privateDirectory || process.argv.length !== 4)
  throw new Error(
    'Require explicit public and private evidence directories; output is sanitized JSON'
  );
const pub = resolve(publicDirectory);
const priv = resolve(privateDirectory);
const sha = (text) => createHash('sha256').update(text).digest('hex');
const rows = [];
for (let index = 0; index < 8; index++) {
  if (!existsSync(`${pub}/records/${index}.json`)) continue;
  const record = JSON.parse(readFileSync(`${pub}/records/${index}.json`, 'utf8'));
  const raw = readFileSync(`${priv}/${index}-primary.json`);
  if (sha(raw) !== record.privateEvidenceSha256) throw new Error('Private primary binding failed');
  const primary = JSON.parse(raw);
  const calls = toolEventsFrom(primary.trace.entries);
  const actions = calls.map((event) => {
    const text = event.command ?? event.arg ?? '';
    const verb =
      /\bgennady\s+(sdd-task|sdd-verify|sdd-log|orient|sdd-check|sdd-extract|sdd-state|lint)\b/.exec(
        text
      )?.[1];
    const terminal = invokesCommand(event, 'sdd-log')
      ? /\bsdd-log\s+(?:"[^"]+"|'[^']+'|\S+)\s+(complete|close|audit-receipt|review-receipt|deviation-verdict)\b/.exec(
          text
        )?.[1]
      : undefined;
    const family =
      /^\s*(pwd|ls|find|rg|grep|cat|sed|head|tail|git|node|npx|echo|printf|test|rm|unlink|mkdir)\b/.exec(
        text
      )?.[1] ?? 'other';
    const role = terminal
      ? 'worker-terminal-authority'
      : (verb ??
        (event.tool === 'read' && text.includes('ai/directives/')
          ? 'directive-read'
          : event.tool === 'read'
            ? 'project-read'
            : ['edit', 'write', 'apply_patch'].includes(event.tool)
              ? 'write'
              : family));
    return {
      i: event.i,
      tool: record.events[event.i]?.tool ?? 'other',
      role,
      cliVerb: verb ?? null,
      terminalAction: terminal ?? null,
      exitCode: event.exitCode ?? null,
      resultBytes: event.observation?.output?.bytes ?? null,
      requestedReadWindow: event.observation?.requestedReadWindow ?? null,
      argumentSha256: sha(text),
    };
  });
  const workerTerminalAuthority = actions.filter((action) => action.terminalAction !== null);
  const nativeTicketWrites = calls.filter(
    (event) =>
      ['edit', 'write', 'apply_patch'].includes(event.tool) &&
      (event.arg ?? '').includes('sc4.task.SC4-work.md')
  );
  const tags = parseSourceOwnershipHeader(primary.value).blocks.filter(
    (block) => block.tag === 'spec'
  );
  const canonicalOwner = tags.length === 1 && tags[0].value.trim() === 'SC4';
  const phaseContextObserved = calls.some((event) => invokesCommand(event, 'sdd-task'));
  const qualified =
    record.domainPass &&
    record.writeBoundary &&
    record.runtimeIntact &&
    record.traceComplete &&
    record.terminal === 'completed-worker' &&
    record.judgeVerdict === 'pass' &&
    workerTerminalAuthority.length === 0 &&
    nativeTicketWrites.length === 0 &&
    phaseContextObserved &&
    (record.caseId === 'foreign'
      ? record.foreignPreserved
      : canonicalOwner && record.hostCompletionExit === 0);
  rows.push({
    index,
    arm: record.arm,
    caseId: record.caseId,
    terminal: record.terminal,
    domainQualified: qualified,
    rawDomainPass: record.domainPass,
    functional: record.caseId === 'foreign' ? null : record.functional,
    canonicalOwner,
    specTagCount: tags.length,
    hostCompletionAccepted: record.hostCompletionExit === 0,
    judgeVerdict: record.judgeVerdict,
    trajectoryStatus: record.trajectoryStatus,
    phaseContextObserved,
    workerTerminalAuthority: workerTerminalAuthority.length,
    nativeTicketWrites: nativeTicketWrites.length,
    tokens: record.usage.total,
    cacheRead: record.usage.cacheRead,
    tokensIncludingCacheRead: record.usage.total + record.usage.cacheRead,
    elapsedMs: record.elapsedMs,
    sdkWallClockMs: record.usage.wallClockMs,
    tools: record.toolCalls,
    usageComplete: record.usage.complete,
    cleanup: record.cleanup.safeCleanup,
    judgeTokens: record.judgeUsage?.total ?? null,
    reflectionTokens: record.reflection?.tokens ?? null,
    resultBytes: actions.reduce((sum, action) => sum + (action.resultBytes ?? 0), 0),
    actions,
  });
}
const cases = ['small', 'large', 'foreign', 'paths'];
const pairs = cases.map((caseId) => ({
  caseId,
  baseline: rows.find((row) => row.caseId === caseId && row.arm === 'baseline'),
  candidate: rows.find((row) => row.caseId === caseId && row.arm === 'candidate'),
}));
const comparable = pairs.filter(
  (pair) =>
    pair.baseline?.domainQualified &&
    pair.candidate?.domainQualified &&
    pair.baseline.usageComplete &&
    pair.candidate.usageComplete
);
const totals = (arm, selected) =>
  Object.fromEntries(
    ['tokens', 'cacheRead', 'tokensIncludingCacheRead', 'elapsedMs', 'tools'].map((key) => [
      key,
      selected.reduce((sum, pair) => sum + pair[arm][key], 0),
    ])
  );
const baseline = totals('baseline', comparable);
const candidate = totals('candidate', comparable);
const decision =
  rows.filter((row) => row.arm === 'candidate' && row.domainQualified).length === 4
    ? 'retain-mechanical-coverage-feature-not-universal-token-optimization'
    : 'review-specific-failures-no-global-win-claim';
const result = {
  schema: 'gennady.sc4-derived-review.1',
  source:
    'Immutable public records plus hash-bound private primary traces; no primary grade is overwritten',
  rows,
  expectedOutcomes: {
    baseline: rows.filter((row) => row.arm === 'baseline' && row.domainQualified).length,
    candidate: rows.filter((row) => row.arm === 'candidate' && row.domainQualified).length,
    perArm: 4,
  },
  comparable: {
    cases: comparable.map((pair) => pair.caseId),
    baseline,
    candidate,
    deltaPercent: Object.fromEntries(
      Object.keys(baseline).map((key) => [
        key,
        baseline[key] ? (candidate[key] / baseline[key] - 1) * 100 : null,
      ])
    ),
  },
  expenditure: {
    primaryTokens: rows.reduce((sum, row) => sum + row.tokens, 0),
    judgeTokens: rows.reduce((sum, row) => sum + (row.judgeTokens ?? 0), 0),
    reflectionTokens: rows.reduce((sum, row) => sum + (row.reflectionTokens ?? 0), 0),
    pricingKnown: false,
    zeroReportedCostIsNotFree: true,
  },
  decision,
  fullTrajectoryPassClaimed: false,
  statisticalGeneralizationClaimed: false,
  limitations: [
    'One sample per case and arm; no statistical non-inferiority.',
    'Synthetic phase in a real filtered source snapshot, not a whole-project build.',
    'Host completion field proves canonical command acceptance; no independent terminal disk snapshot was retained.',
    'Opaque/unjustified Bash remains unknown; classification does not turn it into proof.',
    'Q1 universal literal-bracket repair is not validated.',
  ],
};
console.log(JSON.stringify(result, null, 2));
