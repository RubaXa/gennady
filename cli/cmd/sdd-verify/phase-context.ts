// @file: Resolve a phase verification context from one structurally parsed SDD ticket.
// @consumers: sdd-verify/index.ts, tests
// @tasks: N/A

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';
import { resolveOwningSpec } from '../../../shared/sdd/audit-group.ts';
import {
  phaseOwnsMissingReadinessGate,
  queuedInfraGateTicketIds,
} from '../../../shared/sdd/gate-queue.ts';
import { parseScopes } from '../../../shared/sdd/portal.ts';
import { checkReadiness, gatherReadinessInput } from '../../../shared/sdd/readiness.ts';
import { ticketRef } from '../../../shared/sdd/check.ts';
import { matchingTestPhaseIds, parseTestCoverage } from '../../../shared/sdd/bdd-coverage.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  parseMetaInfo,
  parsePhaseDetail,
  parsePhasesOverview,
  parseTicketCoveragePolicy,
  parseVerificationTable,
} from '../../../shared/sdd/ticket.ts';
import { collectTicketCorpus } from '../../../shared/sdd/ticket-resolve.ts';
import {
  phaseProfileForKind,
  phaseVerificationArtifactPaths,
  resolvePhaseVerificationPlan,
  type PhaseVerificationPlan,
} from '../../../shared/sdd/phase-verification-plan.ts';
import type { Profile } from './sdd-verify.types.ts';

/** @purpose Mechanically derived phase profile, exact repair targets, and optional owning spec. */
export type PhaseVerifyContext = {
  /** @purpose Profile derived from phase kind or the mechanical infra-queue exemption. */
  profile: Exclude<Profile, 'full'>;
  /** @purpose Stable reason for the selected profile, persisted with CLI evidence. */
  profileBasis: 'phase-kind' | 'infra-queue-exemption';
  /** @purpose Existing regular project files listed by the phase's Target Files field. */
  targets: string[];
  /** @purpose Tracked repo-local tombstones listed by the phase's Deleted Files field. */
  deletedFiles: string[];
  /** @purpose Owning spec derived from the v2 ticket filename, when that spec exists. */
  specPath?: string;
  /** @purpose Repo-relative canonical ticket path bound into the receipt. */
  taskPath: string;
  /** @purpose Exact parsed phase id bound into the receipt. */
  phaseId: string;
  /** @purpose Applicable ticket-owned Verification commands in execution order. */
  verification: { command: string; role: string }[];
  /** @purpose Canonical coverage producer phase for schema-aware required coverage. */
  coverageOwner?: string;
  /** @purpose Whether this test phase owns the producer; independent from its test profile. */
  producesCoverage: boolean;
  /** @purpose Canonical gate states shared byte-for-byte with sdd-task and feasibility. */
  gatePlan?: PhaseVerificationPlan;
};

/** @purpose Valid phase context, or a ready-to-print teaching failure. */
export type PhaseContextResult =
  | { ok: true; context: PhaseVerifyContext }
  | { ok: false; message: string };

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function canonicallyInside(root: string, path: string): boolean {
  try {
    return inside(realpathSync(root), realpathSync(path));
  } catch {
    return false;
  }
}

function failure(detail: string): PhaseContextResult {
  return {
    ok: false,
    message: `[sdd-verify] ERR_CLI_SDD_VERIFY_PHASE_CONTEXT: ${detail}\n  Fix the ticket phase, then rerun: npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>`,
  };
}

function ruleAliases(rule: string): string[] {
  const name = basename(rule).replace(/\.xml$/i, '');
  return [rule, name];
}

/**
 * @purpose Resolve and validate the exact phase-owned repair and verification boundary.
 * @param taskArg Project-relative v2 ticket path.
 * @param phaseId Exact phase identifier from Phases Overview.
 * @param [root] Project root used for containment and readiness.
 * @returns Derived context or a teaching failure.
 */
export function resolvePhaseContext(
  taskArg: string,
  phaseId: string,
  root = resolve('.')
): PhaseContextResult {
  const projectRoot = resolve(root);
  const taskPath = resolve(projectRoot, taskArg);
  if (!inside(projectRoot, taskPath)) return failure(`ticket escapes the project: ${taskArg}`);
  let content: string;
  try {
    if (!statSync(taskPath).isFile()) return failure(`ticket is not a file: ${taskArg}`);
    if (!canonicallyInside(projectRoot, taskPath))
      return failure(`ticket symlink resolves outside the project: ${taskArg}`);
    if (lstatSync(taskPath).isSymbolicLink())
      return failure(
        `ticket must be a regular non-symlink path because its receipt is atomically replaced: ${taskArg}`
      );
    const expectedCanonical = resolve(realpathSync(projectRoot), relative(projectRoot, taskPath));
    if (realpathSync(taskPath) !== expectedCanonical)
      return failure(
        `ticket path contains an in-project symlink alias and cannot safely own an atomic receipt: ${taskArg}`
      );
    content = readFileSync(taskPath, 'utf-8');
  } catch {
    return failure(`ticket is missing or unreadable: ${taskArg}`);
  }
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok')
    return failure(`ticket has no readable PHASES_OVERVIEW: ${taskArg}`);
  const phases = parsePhasesOverview(overview.content);
  const phase = phases.find((candidate) => candidate.id === phaseId);
  if (!phase) return failure(`phase '${phaseId}' is absent from ${taskArg}`);
  let profile = phaseProfileForKind(phase.kind);
  let profileBasis: PhaseVerifyContext['profileBasis'] = 'phase-kind';
  if (!profile) return failure(`phase '${phaseId}' has unsupported kind '${phase.kind}'`);
  const verification = extractSection(content, 'VERIFICATION');
  const verificationTable =
    verification.status === 'ok'
      ? parseVerificationTable(verification.content)
      : parseVerificationTable('');
  if (!verificationTable.ok)
    return failure(`ticket Verification table is invalid: ${verificationTable.issues.join('; ')}`);
  const coveragePolicy =
    verification.status === 'ok'
      ? parseTicketCoveragePolicy(verification.content)
      : { status: 'legacy' as const };
  if (coveragePolicy.status === 'invalid')
    return failure(`ticket coverage policy is invalid: ${coveragePolicy.issues.join('; ')}`);
  if (coveragePolicy.status === 'required') {
    const ownerRows = phases.filter((candidate) => candidate.id === coveragePolicy.ownerPhase);
    if (ownerRows.length !== 1 || ownerRows[0]?.kind.trim().toLowerCase() !== 'test')
      return failure(
        `Coverage Owner Phase ${coveragePolicy.ownerPhase} must resolve to exactly one test phase`
      );
    const ownerSection = extractSection(content, `PHASE_${coveragePolicy.ownerPhase}`);
    if (ownerSection.status !== 'ok')
      return failure(
        `Coverage Owner Phase ${coveragePolicy.ownerPhase} has no readable PHASE_${coveragePolicy.ownerPhase} section`
      );
    const ownerAliases = new Set(parsePhaseDetail(ownerSection.content).rules.flatMap(ruleAliases));
    const coverageRow = verificationTable.gates.find((gate) => gate.role === 'coverage');
    if (!coverageRow?.requiredBy.some((required) => ownerAliases.has(required)))
      return failure(
        `the Role=coverage reader must be Required by a rule declared by owner phase ${coveragePolicy.ownerPhase}`
      );
  }
  // Kind owns the profile. The shared phase plan independently selects the sole coverage producer.
  const section = extractSection(content, `PHASE_${phaseId}`);
  if (section.status !== 'ok')
    return failure(`phase '${phaseId}' has no readable PHASE_${phaseId} section`);
  const phaseDetail = parsePhaseDetail(section.content);
  const rawTargets = phaseDetail.targetFiles;
  const rawDeleted = phaseDetail.deletedFiles;
  const aliases = new Set(phaseDetail.rules.flatMap(ruleAliases));
  const coverageSection = extractSection(content, 'TEST_COVERAGE');
  const coverageEntries =
    coverageSection.status === 'ok' ? parseTestCoverage(coverageSection.content) : [];
  const testPhases = phases
    .filter((candidate) => candidate.kind.trim().toLowerCase() === 'test')
    .map((candidate) => {
      const candidateSection = extractSection(content, `PHASE_${candidate.id}`);
      return {
        phaseId: candidate.id,
        targets:
          candidateSection.status === 'ok'
            ? parsePhaseDetail(candidateSection.content).targetFiles
            : [],
      };
    });
  const verificationRows = verificationTable.gates;
  for (const gate of verificationRows.filter((candidate) => candidate.role === 'probe')) {
    const mappings = coverageEntries.filter(
      (entry) => entry.deferred === null && entry.probeCommand === gate.command
    );
    const owners = [
      ...new Set(mappings.flatMap((entry) => matchingTestPhaseIds(entry.testFile, testPhases))),
    ];
    if (owners.length === 0)
      return failure(
        `Role=probe command '${gate.command}' has no Test Scenario Coverage row owned by a test phase; map it to one future CREATE test file first`
      );
    if (owners.length > 1)
      return failure(
        `Role=probe command '${gate.command}' is ambiguously owned by test phases ${owners.join(', ')}`
      );
  }
  const applicable = verificationRows.filter((gate) => {
    if (gate.command === '—') return false;
    if (gate.role === 'coverage') {
      return coveragePolicy.status === 'required' && coveragePolicy.ownerPhase === phaseId;
    }
    if (gate.role === 'probe') {
      return coverageEntries.some(
        (entry) =>
          entry.deferred === null &&
          entry.probeCommand === gate.command &&
          matchingTestPhaseIds(entry.testFile, testPhases).includes(phaseId)
      );
    }
    return gate.requiredBy.some((required) => aliases.has(required));
  });
  if (applicable.some((gate) => /\bsdd-verify\b/.test(gate.command)))
    return failure(`Verification repeats sdd-verify; §5 may contain only extra commands`);
  const seenCommands = new Set<string>();
  for (const gate of applicable) {
    if (seenCommands.has(gate.command))
      return failure(`Verification command is duplicated for phase '${phaseId}': ${gate.command}`);
    seenCommands.add(gate.command);
  }
  if (rawTargets.length === 0 && rawDeleted.length === 0)
    return failure(`phase '${phaseId}' has neither Target Files nor Deleted Files`);
  const targets: string[] = [];
  for (const target of rawTargets) {
    const inspected = inspectRepoPath(projectRoot, target, 'file');
    if (!inspected.ok) {
      const missing = inspected.detail === 'path is missing';
      return failure(
        `Target File ${inspected.detail}: ${target}${missing ? ' (declare an intended removal under Deleted Files instead)' : ''}`
      );
    }
    targets.push(inspected.relative);
  }
  const deletedFiles: string[] = [];
  for (const deleted of rawDeleted) {
    const inspected = inspectRepoPath(projectRoot, deleted, 'missing');
    if (!inspected.ok) return failure(`Deleted File ${inspected.detail}: ${deleted}`);
    const tracked = spawnSync('git', ['ls-files', '--', inspected.relative], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    if (tracked.status !== 0 || !(tracked.stdout ?? '').trim())
      return failure(`Deleted File has no tracked VCS baseline: ${deleted}`);
    deletedFiles.push(inspected.relative);
  }
  // A queued infra builder cannot require the gates it creates. Every non-ready code/test phase
  // must prove that exact exception; unreadable ownership context never falls back to normal work.
  let readiness;
  try {
    readiness = checkReadiness(gatherReadinessInput(projectRoot));
  } catch (error) {
    return failure(
      `project readiness cannot be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!readiness.executionReady && profile !== 'setup') {
    const meta = extractSection(content, 'META');
    const taskId = meta.status === 'ok' ? parseMetaInfo(meta.content).taskId : null;
    if (!taskId)
      return failure(
        `project is not execution-ready and the ticket has no readable Task-ID for an exact GATE_QUEUE exemption`
      );
    try {
      const portal = readFileSync(join(projectRoot, 'specs', 'README.md'), 'utf-8');
      const corpus = collectTicketCorpus(projectRoot);
      if (!corpus.ok)
        return failure(
          `project is not execution-ready and its ticket corpus cannot prove GATE_QUEUE ownership: ${corpus.detail}`
        );
      const queue = queuedInfraGateTicketIds(
        corpus.refs,
        parseScopes(portal),
        readiness,
        projectRoot
      );
      if (phaseOwnsMissingReadinessGate(queue, taskId, phaseId)) {
        profile = 'setup';
        profileBasis = 'infra-queue-exemption';
      } else {
        const detail = queue.diagnostics.map((item) => item.message).join('; ');
        return failure(
          `phase '${phaseId}' does not structurally own a missing readiness gate${detail ? `: ${detail}` : ''}`
        );
      }
    } catch (error) {
      return failure(
        `project is not execution-ready and its portal/GATE_QUEUE cannot be resolved: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const spec = resolveOwningSpec(taskPath);
  if (!spec.ok && profile !== 'setup') {
    const detail =
      spec.reason === 'not-v2-ticket-name'
        ? `ticket name cannot resolve an owning spec: ${taskArg}`
        : `owning spec is missing: ${relative(projectRoot, spec.specPath)}`;
    return failure(`${detail}; code/test repair refuses to omit --spec`);
  }
  const corpus = collectTicketCorpus(projectRoot);
  if (!corpus.ok)
    return failure(`ticket corpus cannot resolve phase gate states: ${corpus.detail}`);
  const planRefs = corpus.refs.some((ref) => resolve(ref.file) === resolve(taskPath))
    ? corpus.refs
    : [...corpus.refs, { ...ticketRef(taskPath, content), content }];
  let scripts: Record<string, string> = {};
  try {
    scripts =
      (
        JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as {
          scripts?: Record<string, string>;
        }
      ).scripts ?? {};
  } catch {
    scripts = {};
  }
  const gatePlan = resolvePhaseVerificationPlan({
    refs: planRefs,
    ticketFile: taskPath,
    phaseId,
    scripts,
    availableArtifacts: new Set(
      phaseVerificationArtifactPaths().filter((path) => existsSync(join(projectRoot, path)))
    ),
    mode: 'runtime',
    profileOverride: profile,
  });
  if (!gatePlan) return failure(`phase '${phaseId}' gate plan cannot be resolved`);
  return {
    ok: true,
    context: {
      profile,
      profileBasis,
      targets,
      deletedFiles,
      taskPath: relative(projectRoot, taskPath),
      phaseId,
      verification: applicable.map((gate) => ({
        command: gate.command,
        role: gate.role ?? 'extra',
      })),
      ...(coveragePolicy.status === 'required' ? { coverageOwner: coveragePolicy.ownerPhase } : {}),
      producesCoverage: gatePlan.producesCoverage,
      gatePlan,
      ...(spec.ok ? { specPath: relative(projectRoot, spec.specPath) } : {}),
    },
  };
}
