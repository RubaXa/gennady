// @file: SddStateCommand — CLI entry for gennady sdd-state: deterministic project-state preflight for the router.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { checkReadiness } from '../../../shared/sdd/readiness.ts';
import { parseScopes, type Scope } from '../../../shared/sdd/portal.ts';
import { probeRepo } from '../../../shared/sdd/probe.ts';
import { detectFlowVersion } from '../../../shared/sdd/flow.ts';
import {
  badInvocation,
  badRoot,
  formatSnapshot,
  type FlowVersion,
  type StateOutcome,
  type StateSnapshot,
} from './sdd-state.types.ts';

/**
 * @purpose Detect whether the gennady CLI is installed for the project.
 * @param root Absolute project root.
 * @returns True when `<root>/node_modules/.bin/gennady` resolves to an existing entry.
 */
function detectGennady(root: string): boolean {
  try {
    statSync(join(root, 'node_modules', '.bin', 'gennady'));
    return true;
  } catch {
    return false;
  }
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

  const flowVersion: FlowVersion = detectFlowVersion(root);

  // #region START_PORTAL — portal absent is data (project-setup), not an error
  const portalPath = 'specs/README.md';
  let portalPresent = false;
  let scopes: Scope[] = [];
  try {
    const content = readFileSync(join(root, 'specs', 'README.md'), 'utf-8');
    portalPresent = true;
    scopes = parseScopes(content);
  } catch {
    portalPresent = false;
  }
  // #endregion END_PORTAL

  // #region START_READINESS — exact-match required scripts; missing/broken package.json reads as not-ready
  let scripts: Record<string, string> = {};
  let packageJsonPresent = false;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    packageJsonPresent = true;
    scripts = pkg.scripts ?? {};
  } catch {
    packageJsonPresent = false;
  }
  const readiness = checkReadiness({
    packageJsonPresent,
    scripts,
    gennadyAvailable: detectGennady(root),
  });
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
  // --probe: opt-in code/infra heuristics; default stays minimal-knowledge (no probe).
  const probe = args.probe === true ? probeRepo(root) : undefined;

  const snapshot: StateSnapshot = {
    root,
    flowVersion,
    portalPresent,
    portalPath,
    scopes,
    readiness,
    sessionContent,
    probe,
  };
  return { ok: true, text: formatSnapshot(snapshot) };
}

// Self-executing for CLI: gennady sdd-state [project-root]
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
