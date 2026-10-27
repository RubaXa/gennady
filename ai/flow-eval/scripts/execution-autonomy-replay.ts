// @file: Deterministic, read-only projection of all sixteen frozen primary attempts; never reruns models or rewrites grades.
// @spec: AI-SKILLS
// @consumers: final execution-autonomy report, replay regression test and independent reviewer

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveRepoFile, readProvenRepoFile } from '../../../shared/common/repo-file-identity.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  buildExecutionAutonomyFixture,
  executionAutonomyCase,
  type ExecutionAutonomyCaseId,
} from '../execution-autonomy-cases.ts';
import {
  gradeExecutionAutonomyPath,
  sameExecutionMetaObligations,
  gradeExecutionOperatorCheckpoint,
} from '../execution-autonomy-evaluation.ts';
import { checkLocalWorkflowClosure } from '../quality-gate.ts';

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

/** @purpose Recompute only qualified pure measurement projections, preserving every primary byte and outcome.
 * @param root Repository containing all three immutable campaign archives.
 * @returns Deterministic hash-bound analysis; NOT a fresh Git/phase-receipt validation, semantic rerating or live replacement.
 */
export function replayExecutionAutonomy(root: string) {
  const bindings: Array<{ path: string; sha256: string }> = [];
  const readText = (path: string): string => {
    const proof = proveRepoFile(root, path);
    if (!proof.ok) throw new Error(`Unsafe/missing replay input: ${path}`);
    const bytes = readProvenRepoFile(proof.identity);
    if (!bytes.ok || Buffer.byteLength(bytes.content) > 16_000_000)
      throw new Error(`Unbounded/changed replay input: ${path}`);
    bindings.push({ path, sha256: sha(bytes.content) });
    return bytes.content;
  };
  const read = (path: string): any => JSON.parse(readText(path));
  const campaigns = [
    ['2026-10-26-execution-autonomy-live', 2, 0],
    ['2026-10-26-execution-autonomy-continued', 5, 2],
    ['2026-10-27-execution-autonomy-final', 9, 7],
  ] as const;
  const rows: any[] = [];
  const cleanupProofs: any[] = [];
  const monetaryCost = 'unknown: provider zero is not proof of free calls';
  const totals = {
    knownPrimaryUsage: 0,
    unknownPrimaryUsage: 0,
    nonCacheTokens: 0,
    cacheReadTokens: 0,
    observedToolCalls: 0,
    judgeTokens: 0,
    judgeCacheReadTokens: 0,
    reflectionTokens: 0,
    reflectionCacheReadTokens: 0,
  };
  for (const [campaign, count, offset] of campaigns) {
    const prefix = `ai/flow-eval/results/${campaign}`;
    const protocol = read(`${prefix}/protocol.json`);
    if (protocol.model !== 'llm-proxy/deepseek-v4-flash') throw new Error('Replay model drift');
    const cleanup = read(`${prefix}/cleanup.json`);
    const recovery = offset === 0 ? read(`${prefix}/cleanup-recovery.json`) : undefined;
    if (
      offset === 0
        ? recovery.rootRemoved !== true || recovery.privateConfigRemoved !== true
        : cleanup.safeCleanup !== true || cleanup.rootRemoved !== true
    )
      throw new Error('Owned cleanup/recovery is not proven');
    cleanupProofs.push({
      stage: campaign,
      primary: cleanup,
      ...(recovery ? { separateRecovery: recovery } : {}),
    });
    const names = readdirSync(join(root, prefix, 'records')).sort(
      (a, b) => Number.parseInt(a) - Number.parseInt(b)
    );
    if (
      JSON.stringify(names) !== JSON.stringify(Array.from({ length: count }, (_, i) => `${i}.json`))
    )
      throw new Error('Primary attempt accounting drift');
    for (let index = 0; index < count; index++) {
      const record = read(`${prefix}/records/${index}.json`);
      if (
        record.caseId !== protocol.schedule[index]?.caseId ||
        record.arm !== protocol.schedule[index]?.arm
      )
        throw new Error('Primary schedule identity drift');
      const scenario = `execution-autonomy-${record.caseId}-${record.arm}`;
      const matches = readdirSync(join(root, prefix, 'permanent')).filter((name) =>
        name.endsWith(`-${scenario}`)
      );
      if (matches.length !== 1)
        throw new Error(`Missing/ambiguous primary summary for ${scenario}`);
      const base = `${prefix}/permanent/${matches[0]}`;
      const summary = read(`${base}/summary.json`);
      const judgeText = existsSync(join(root, base, 'judge.md'))
        ? readText(`${base}/judge.md`)
        : '';
      if (summary.scenarioId !== scenario) throw new Error('Cross-scenario replay');
      const trajectory = read(`${base}/trajectory.json`);
      const execution = existsSync(join(root, base, 'execution.json'))
        ? read(`${base}/execution.json`)
        : undefined;
      const c = executionAutonomyCase(record.caseId as ExecutionAutonomyCaseId);
      const stand =
        offset === 0
          ? 'invalid-original-full-audit-fixture'
          : offset === 2
            ? 'shared-routing-confound; exact dispatch remained possible'
            : c.id === 'holdout8-authority'
              ? 'invalid-unowned-protected-authority-adapter'
              : 'routing-qualified';
      let path: any = {
        rule: 'EXECUTION-PATH',
        pass: false,
        detail: 'missing/incomplete primary capture; no upgrade',
      };
      let integrity: any = execution?.integrity;
      let checkpoint: any;
      let initialTicketBound = false;
      if (
        execution?.evidence?.complete === true &&
        execution.quiescence?.complete === true &&
        trajectory.coverage?.complete === true
      ) {
        path = gradeExecutionAutonomyPath(trajectory, execution);
        const initial = buildExecutionAutonomyFixture(c.id)[c.ticket]!;
        const expected = protocol.inputs
          .find((input: any) => input.caseId === c.id)
          ?.files.find((file: any) => file.path === c.ticket)?.sha256;
        initialTicketBound = sha(initial) === expected;
        const finalTicket =
          execution.evidence.files.find((file: any) => file.path === c.ticket)?.content ?? '';
        const before = extractSection(initial, 'META'),
          after = extractSection(finalTicket, 'META');
        if (
          initialTicketBound &&
          before.status === 'ok' &&
          after.status === 'ok' &&
          sameExecutionMetaObligations(before.content, after.content)
        ) {
          const issues = execution.integrity.issues.filter(
            (issue: string) => issue !== `approved obligation changed: ${c.ticket}#META`
          );
          integrity = {
            pass: issues.length === 0,
            issues,
            limitation:
              'Only the META lifecycle delta is corrected; every other observed issue remains. NOT a fresh receipt revalidation.',
          };
        }
        if (c.expectedTerminal !== 'complete') {
          const spec =
            execution.evidence.files.find((file: any) => file.path === c.module)?.content ?? '';
          const closure = checkLocalWorkflowClosure(c.ticket, finalTicket, spec);
          const detail = execution.terminal.detail;
          checkpoint = gradeExecutionOperatorCheckpoint({
            expected: c.expectedTerminal,
            taskNotClosed: /taskNotClosed=true/.test(detail),
            pending: execution.pendingDecisions.length,
            functional: execution.functional.pass,
            phasesVerified: /phasesVerified=true/.test(detail),
            phasesDone: /phasesDone=true/.test(detail),
            localClosure: closure.pass,
          });
          if (!integrity?.pass || !initialTicketBound)
            checkpoint = {
              ...checkpoint,
              pass: false,
              detail: checkpoint.detail + '; integrity/initial ticket identity not proven',
            };
        }
      }
      totals.observedToolCalls += summary.actions ?? 0;
      if (summary.usage) {
        totals.knownPrimaryUsage++;
        totals.nonCacheTokens += summary.usage.total;
        totals.cacheReadTokens += summary.usage.cacheRead;
      } else totals.unknownPrimaryUsage++;
      totals.judgeTokens += summary.judgeUsage?.usage?.total ?? 0;
      totals.judgeCacheReadTokens += summary.judgeUsage?.usage?.cacheRead ?? 0;
      let reflection: any;
      if (existsSync(join(root, base, 'reflection.json'))) {
        reflection = read(`${base}/reflection.json`);
        totals.reflectionTokens += reflection.usageDelta?.total ?? 0;
        totals.reflectionCacheReadTokens += reflection.usageDelta?.cacheRead ?? 0;
      }
      rows.push({
        originalIndex: index + offset,
        stage: campaign,
        caseId: c.id,
        arm: record.arm,
        stand,
        sourceHead: summary.sha,
        sourceDirty: summary.source?.dirty,
        runOutcome: summary.outcome,
        workerStatus: summary.status,
        raw: {
          functional: summary.executionAutonomy?.functional,
          integrity: summary.executionAutonomy?.integrity,
          terminal: summary.executionAutonomy?.terminal,
          path: summary.trajectory,
          aggregateVerdict: summary.verdict,
          semanticVerdict: summary.hasJudge
            ? (/VERDICT:\s*(\w+)/.exec(judgeText)?.[1] ?? 'unknown')
            : 'not-run',
          hasJudge: summary.hasJudge,
        },
        derived: {
          path,
          integrity,
          operatorCheckpoint: checkpoint,
          initialTicketBound,
          semanticVerdict: 'not-regraded',
          limitation:
            'Pure post-collection correction only; budgets/censorship/interruption, missing evidence and invalid fixtures remain. No worker completion or semantic-quality upgrade.',
        },
        measurements: {
          tools: summary.actions,
          usage: summary.usage ?? null,
          judgeUsage: summary.judgeUsage ?? null,
          reflectionUsage: reflection?.usageDelta ?? null,
        },
        primaryFiles: {
          summary: `${base}/summary.json`,
          trajectory: `${base}/trajectory.json`,
          ...(execution ? { execution: `${base}/execution.json` } : {}),
        },
      });
    }
  }
  if (rows.length !== 16) throw new Error('Original finite budget is not sixteen');
  for (const input of bindings) {
    const proof = proveRepoFile(root, input.path);
    if (!proof.ok) throw new Error('Replay input disappeared');
    const bytes = readProvenRepoFile(proof.identity);
    if (!bytes.ok || sha(bytes.content) !== input.sha256)
      throw new Error('Primary bytes changed during replay');
  }
  return {
    schema: 'gennady.execution-autonomy-offline-replay.4',
    primaryAttempts: 16,
    replacements: 0,
    modelCalls: 0,
    outcome: 'inconclusive; no demonstrated model-autonomy or efficiency improvement',
    monetaryCost,
    cleanupProofs,
    totals,
    limitations: [
      'Two primary usage totals are missing, so cumulative primary tokens/tools are observed lower bounds, not exact billing.',
      'No pooling of the three fixture/runtime stages. H8 owner defect invalidates its A/B pair.',
      'Corrected operator-checkpoint state is not semantic approval, completed-worker outcome or new/external authority.',
      'This is NOT a fresh Git/phase-receipt revalidation: observed live facts and pure receipt parsing are distinguished.',
    ],
    sourceHashes: [
      'ai/flow-eval/scripts/execution-autonomy-replay.ts',
      'ai/flow-eval/execution-autonomy-evaluation.ts',
      'ai/flow-eval/execution-autonomy-cases.ts',
      'ai/flow-eval/quality-gate.ts',
    ].map((path) => ({ path, sha256: sha(readFileSync(join(root, path))) })),
    bindings,
    rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '../../..');
  const output = process.argv[2];
  if (
    !output ||
    !resolve(root, output).startsWith(join(root, 'ai/flow-eval/results/')) ||
    existsSync(resolve(root, output))
  )
    throw new Error('Require new repository-owned replay output; never overwrite primary evidence');
  const report = replayExecutionAutonomy(root);
  writeFileSync(resolve(root, output), JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Offline replay: ${report.primaryAttempts} primary records, model0; original bytes unchanged`
  );
}
