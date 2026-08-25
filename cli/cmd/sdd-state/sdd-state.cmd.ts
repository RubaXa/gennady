// @file: SddStateCommand — CLI entry for gennady sdd-state: deterministic project-state preflight for the router.
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { checkReadiness, gatherReadinessInput } from '../../../shared/sdd/readiness.ts';
import {
  parseScopes,
  parseScopeGraphEdges,
  type GraphEdge,
  type Scope,
} from '../../../shared/sdd/portal.ts';
import { probeRepo } from '../../../shared/sdd/probe.ts';
import { detectFlowVersion } from '../../../shared/sdd/flow.ts';
import { countModuleSpecs } from '../../../shared/sdd/module-specs.ts';
import { sumRollupProgress } from '../../../shared/sdd/tracker.ts';
import { renderLadder } from '../../../shared/sdd/ladder.ts';
import { collectTicketRefs } from '../../../shared/sdd/ticket-resolve.ts';
import { queuedInfraGateTicketIds } from '../../../shared/sdd/gate-queue.ts';
import {
  badInvocation,
  badRoot,
  directivesMissing,
  formatSnapshot,
  KEY_DIRECTIVE_FILES,
  SDD_V2_SUBDIR,
  type DirectivesLocationStatus,
  type FlowVersion,
  type StateOutcome,
  type StateSnapshot,
} from './sdd-state.types.ts';

/**
 * @purpose Check one candidate directory for the sdd-v2 directive install — key files present.
 * @param dir Absolute candidate directory (e.g. `<root>/ai/directives/sdd-v2`).
 * @returns Whether the directory exists and which key files (if any) it is missing.
 */
function checkDirectivesLocation(dir: string): DirectivesLocationStatus {
  const dirExists = existsSync(dir);
  if (!dirExists) return { dirExists: false, missing: KEY_DIRECTIVE_FILES };
  return { dirExists: true, missing: KEY_DIRECTIVE_FILES.filter((f) => !existsSync(join(dir, f))) };
}

/**
 * @purpose Version of the running gennady package — walk up from this module to the nearest package.json named "gennady".
 * @returns The version string, or `0.0.0` when the manifest cannot be found or parsed.
 */
function ownVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try {
      const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === 'gennady' && pkg.version) return pkg.version;
    } catch {
      /* keep climbing */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

/**
 * @purpose Parse the project name from the portal's first `# ` heading.
 * @param portalContent Full markdown of specs/README.md.
 * @returns The heading text, or null when the portal has no top-level heading.
 */
function parseProjectName(portalContent: string): string | null {
  const m = portalContent.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() || null;
}

/**
 * @purpose Execute gennady sdd-state — report flow version, readiness, portal scopes, and the session set.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns StateOutcome — the formatted snapshot on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<StateOutcome> {
  const args = parseArgs(rawArgs, { probe: ['probe'] });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-state'
  );

  if (positional.length > 1) return badInvocation(positional.join(' '));

  const root = resolve(positional[0] ?? '.');
  try {
    if (!statSync(root).isDirectory()) return badRoot(root);
  } catch {
    return badRoot(root);
  }

  // #region START_DIRECTIVES_GATE — invariant: sdd-state is the ONLY command that checks the install is
  // intact. The project-root copy is the one skills actually read, so a complete package under
  // node_modules must never mask a stale or absent materialized flow. Install, then `sync-skills`.
  const nodeModulesPkgDir = join(root, 'node_modules', 'gennady');
  const rootDirectivesStatus = checkDirectivesLocation(join(root, SDD_V2_SUBDIR));
  if (rootDirectivesStatus.missing.length > 0) {
    const nodeModulesDirectivesStatus = checkDirectivesLocation(
      join(nodeModulesPkgDir, SDD_V2_SUBDIR)
    );
    return directivesMissing(
      existsSync(nodeModulesPkgDir),
      rootDirectivesStatus,
      nodeModulesDirectivesStatus
    );
  }
  // #endregion END_DIRECTIVES_GATE

  const flowVersion: FlowVersion = detectFlowVersion(root);

  // #region START_PORTAL — portal absent is data (project-setup), not an error
  const portalPath = 'specs/README.md';
  let portalPresent = false;
  let scopes: Scope[] = [];
  let graphEdges: GraphEdge[] = [];
  let projectName: string | null = null;
  try {
    const content = readFileSync(join(root, 'specs', 'README.md'), 'utf-8');
    portalPresent = true;
    scopes = parseScopes(content);
    graphEdges = parseScopeGraphEdges(content);
    projectName = parseProjectName(content);
  } catch {
    portalPresent = false;
  }
  // #endregion END_PORTAL

  // #region START_READINESS — exact-match required scripts; missing/broken package.json reads as not-ready
  const readinessInput = gatherReadinessInput(root);
  const { packageJsonPresent } = readinessInput;
  const readiness = checkReadiness(readinessInput);
  // #endregion END_READINESS

  // #region START_SESSION — the session scratch is optional flow-state; absent is normal
  let sessionContent: string | null = null;
  try {
    sessionContent = readFileSync(join(root, 'specs', '.sdd-session.md'), 'utf-8').trim() || null;
  } catch {
    sessionContent = null;
  }
  // #endregion END_SESSION

  logger.debug(
    `[SddStateCommand#run] flow=${flowVersion} portal=${portalPresent} ready=${readiness.ready} scopes=${scopes.length}`
  );
  // Probe is always on: one sdd-state call must carry everything any router branch may need —
  // an extra CLI round-trip costs the agent a full model turn, the directory walk costs milliseconds.
  // `--probe` is still accepted as a no-op for older synced directives.
  const probe = probeRepo(root);

  const snapshot: StateSnapshot = {
    root,
    flowVersion,
    portalPresent,
    portalPath,
    scopes,
    graphEdges,
    readiness,
    queuedGateTicketIds: queuedInfraGateTicketIds(collectTicketRefs(root), scopes, readiness)
      .ticketIds,
    sessionContent,
    probe,
  };

  // #region START_LADDER — the readiness-ladder card the router shows verbatim; appended, never replaces [SUMMARY]
  const moduleSpecCount = countModuleSpecs(join(root, 'specs'));

  let tasksTotal: number | null = null;
  let tasksDone: number | null = null;
  try {
    const rollup = sumRollupProgress(readFileSync(join(root, 'specs', '3-tasks.md'), 'utf-8'));
    if (rollup) {
      tasksTotal = rollup.totalTasks;
      tasksDone = rollup.totalDone;
    }
  } catch {
    tasksTotal = null;
    tasksDone = null;
  }

  // Reuse checkReadiness's own presence verdict (accepts both `type-check`/`typecheck` spellings)
  // instead of a second, narrower exact-name read here — one source of truth for "is it declared".
  const requiredPresence = new Map(readiness.required.map((r) => [r.name, r.present]));
  const ladder = renderLadder({
    version: ownVersion(),
    projectName,
    portalPresent,
    scopesTotal: scopes.length,
    scopesApproved: scopes.filter((s) => s.status === 'done').length,
    moduleSpecCount,
    packageJsonPresent,
    gates: {
      typecheck: requiredPresence.get('type-check') ?? false,
      test: requiredPresence.get('test') ?? false,
      lint: requiredPresence.get('lint') ?? false,
    },
    tasksTotal,
    tasksDone,
  });
  // #endregion END_LADDER

  return { ok: true, text: `${formatSnapshot(snapshot)}\n\n${ladder}` };
}

// Self-executing for CLI: gennady sdd-state [project-root]
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
