// @file: Types, error codes, and snapshot formatting for the sdd-state command.
// @consumers: SddStateCommand
// @tasks: N/A

import type { ReadinessResult } from '../../../shared/sdd/readiness.ts';
import type { GraphEdge, Scope } from '../../../shared/sdd/portal.ts';
import { renderScopeGraph } from '../../../shared/sdd/portal.ts';
import type { RepoProbe } from '../../../shared/sdd/probe.ts';
import type { GateQueueDiagnostic } from '../../../shared/sdd/gate-queue.ts';

/** @purpose More than one positional argument was passed. */
export const ERR_CLI_SDD_STATE_BAD_INVOCATION = 'ERR_CLI_SDD_STATE_BAD_INVOCATION' as const;
/** @purpose The given project root is not an existing directory. */
export const ERR_CLI_SDD_STATE_BAD_ROOT = 'ERR_CLI_SDD_STATE_BAD_ROOT' as const;
/** @purpose ai/directives/sdd-v2/ is missing (or incomplete) at both checked locations. */
export const ERR_CLI_SDD_STATE_DIRECTIVES_MISSING = 'ERR_CLI_SDD_STATE_DIRECTIVES_MISSING' as const;
/** @purpose A complete ticket corpus could not be observed, so GATE_QUEUE cannot be trusted. */
export const ERR_CLI_SDD_STATE_TICKET_CORPUS = 'ERR_CLI_SDD_STATE_TICKET_CORPUS' as const;

/** @purpose The sdd-v2 directives subdirectory, checked at the project root and under node_modules/gennady/. */
export const SDD_V2_SUBDIR = 'ai/directives/sdd-v2';

/** @purpose Key directive files standing in for "the sdd-v2 directive set is installed" — every skill/directive routes through these. */
export const KEY_DIRECTIVE_FILES = [
  'router.directive.xml',
  'execute.directive.xml',
  'phase-execution-protocol.directive.xml',
  'preflight-protocol.directive.xml',
  'formats/requirement-entry-format.xml',
] as const;

/** @purpose Presence check of the key directive files at one candidate directory. */
export type DirectivesLocationStatus = {
  /** @purpose Whether the candidate directory itself exists. */
  dirExists: boolean;
  /** @purpose Key files from KEY_DIRECTIVE_FILES not found in this directory (all of them when dirExists is false). */
  missing: readonly string[];
};

/** @purpose SDD flow version detected from the on-disk layout. */
export type FlowVersion = 'v1' | 'v2';

/**
 * @purpose Deterministic snapshot of SDD project state for the router preflight.
 * @invariant `flowVersion=v1` drives the migration halt; `portalPresent=false` drives the project-setup branch; `scopes` is empty when the portal is absent.
 */
export type StateSnapshot = {
  /** @purpose Absolute path of the inspected project root. */
  root: string;
  /** @purpose Detected SDD flow version — `v1` makes the router halt for migration. */
  flowVersion: FlowVersion;
  /** @purpose Whether specs/README.md (the portal) exists. */
  portalPresent: boolean;
  /** @purpose Relative portal path reported in the snapshot. */
  portalPath: string;
  /** @purpose Scopes parsed from the portal table; empty when the portal is absent. */
  scopes: Scope[];
  /** @purpose Scope-Graph edges (solid + dotted) parsed from the portal Mermaid graph; empty when absent. */
  graphEdges: GraphEdge[];
  /** @purpose Exact-match readiness of the required npm scripts. */
  readiness: ReadinessResult;
  /** @purpose TODO infrastructure tickets that make missing readiness gates an expected queue state. */
  queuedGateTicketIds: string[];
  /** @purpose Fail-closed structural ownership diagnostics for missing readiness gates. */
  gateQueueDiagnostics: GateQueueDiagnostic[];
  /** @purpose Raw content of the session scratch (specs/.sdd-session.md), or null when no active session. */
  sessionContent: string | null;
  /** @purpose Code/infra heuristics — always gathered: one snapshot carries everything any router branch needs. */
  probe?: RepoProbe;
};

/**
 * @purpose Result of one sdd-state run — formatted snapshot (exit 0) or an actionable failure.
 * @invariant On failure `message` is never empty; `exitCode` is 2 (bad root), 3 (directives missing), or 4 (bad invocation).
 */
export type StateOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 3 | 4; message: string };

/**
 * @purpose Resolve a scope's portal-relative spec link into a repo-root-relative path — every printed path must open as-is from the repo root.
 * @param rawPath The raw link target parsed from the portal Scopes table.
 * @param portalPath The portal's own repo-root-relative path (e.g. `specs/README.md`).
 * @returns The repo-root-relative spec path.
 */
function repoRelativeSpecPath(rawPath: string, portalPath: string): string {
  const slash = portalPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : portalPath.slice(0, slash);
  const stripped = rawPath.replace(/^\.\//, '');
  return dir ? `${dir}/${stripped}` : stripped;
}

/**
 * @purpose Render a StateSnapshot into the bracketed, machine-readable form the router consumes.
 * @param s The assembled snapshot.
 * @returns A multi-section string: header + `[READINESS]` + `[SCOPES]` + `[GRAPH]` (when a scope graph exists) + `[SESSION]` + `[SUMMARY]`.
 */
export function formatSnapshot(s: StateSnapshot): string {
  const lines: string[] = [
    '# sdd-state v1',
    `ROOT=${s.root}`,
    `FLOW_VERSION=${s.flowVersion}`,
    `PORTAL=${s.portalPresent ? 'present' : 'absent'}\t${s.portalPath}`,
    '',
    '[READINESS]',
    `package.json\t${s.readiness.packageJsonPresent ? '✔' : '✘'}`,
    '# required-script\tdeclared',
  ];
  for (const r of s.readiness.required) lines.push(`${r.name}\t${r.present ? '✔' : '✘'}`);
  lines.push(`lint→gennady\t${s.readiness.lintHasGennady ? '✔' : '✘'}`);
  lines.push(`check→read-only\t${s.readiness.checkReadOnly ? '✔' : '✘'}`);
  lines.push(`gennady-installed\t${s.readiness.gennadyAvailable ? '✔' : '✘'}`);
  lines.push(
    s.readiness.level === 'ready'
      ? 'READINESS=ready'
      : s.readiness.level === 'provisional'
        ? `READINESS=provisional (stubs: ${s.readiness.stubbed.join(', ')} — bootstrap/scaffold можно, impl/test-фазы заблокированы до реальных инструментов)`
        : `READINESS=not-ready (missing: ${s.readiness.missing.join(', ')})`
  );
  lines.push(
    `GATE_QUEUE=${s.queuedGateTicketIds.length > 0 ? s.queuedGateTicketIds.join(',') : 'none'}`
  );
  for (const diagnostic of s.gateQueueDiagnostics)
    lines.push(`GATE_QUEUE_DIAG=${diagnostic.message}`);

  lines.push('', '[SCOPES]', '# name\ttype\tstatus\tdescription\tspec');
  if (!s.portalPresent) {
    lines.push('# (portal absent — route to project-setup / root flow)');
  } else if (s.scopes.length === 0) {
    lines.push('# (portal present, no scopes listed yet)');
  } else {
    for (const sc of s.scopes) {
      const spec = sc.specPath ? repoRelativeSpecPath(sc.specPath, s.portalPath) : '-';
      lines.push(`${sc.name}\t${sc.type}\t${sc.status}\t${sc.description || '—'}\t${spec}`);
    }
  }

  // #region START_GRAPH — omitted entirely when there is no portal or no scope graph to show
  const graphLines = renderScopeGraph(s.scopes, s.graphEdges);
  if (graphLines.length > 0) {
    lines.push('', '[GRAPH]', ...graphLines);
  }
  // #endregion END_GRAPH

  lines.push('', '[SESSION]', '# specs/.sdd-session.md');
  lines.push(s.sessionContent ? s.sessionContent : '# (no active session)');

  if (s.probe) {
    lines.push('', '[PROBE]');
    lines.push(
      `CODE=${s.probe.codePresent ? 'present' : 'absent'}\t${s.probe.codeFileCount} file(s)`
    );
    if (s.probe.codeDirs.length > 0) lines.push(`code-dirs\t${s.probe.codeDirs.join(', ')}`);
    lines.push(`INFRA=${s.probe.infraPresent ? 'present' : 'absent'}`);
    if (s.probe.configFiles.length > 0) lines.push(`configs\t${s.probe.configFiles.join(', ')}`);
  }

  lines.push(
    '',
    '[SUMMARY]',
    `flow=${s.flowVersion}`,
    `portal=${s.portalPresent ? 'present' : 'absent'}`,
    `readiness=${s.readiness.level}`,
    `gate-queue=${s.queuedGateTicketIds.length > 0 ? s.queuedGateTicketIds.join(',') : 'none'}`,
    `scopes=${s.scopes.length}`,
    `session=${s.sessionContent ? 'present' : 'absent'}`
  );
  if (s.probe) {
    lines.push(
      `code=${s.probe.codePresent ? 'present' : 'absent'}`,
      `infra=${s.probe.infraPresent ? 'present' : 'absent'}`
    );
  }
  return lines.join('\n');
}

/**
 * @purpose Build the bad-invocation diagnostic.
 * @param got The arguments as received.
 * @returns Outcome with exit 4.
 */
export function badInvocation(got: string): StateOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_STATE_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-state] ${ERR_CLI_SDD_STATE_BAD_INVOCATION}`,
      '  usage: gennady sdd-state [project-root] [--probe]',
      `  problem: ${got || 'invalid arguments'}`,
    ].join('\n'),
  };
}

/**
 * @purpose Build the bad-root diagnostic.
 * @param root The path that is not a directory.
 * @returns Outcome with exit 2.
 */
export function badRoot(root: string): StateOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_STATE_BAD_ROOT,
    exitCode: 2,
    message: [
      `[sdd-state] ${ERR_CLI_SDD_STATE_BAD_ROOT}: ${root}`,
      '  Pass an existing project root, or run with no argument from inside the project.',
    ].join('\n'),
  };
}

/**
 * @purpose Refuse a state snapshot whose GATE_QUEUE would come from a partial ticket corpus.
 * @param root Selected project root whose corpus is incomplete.
 * @param detail Exact failed corpus observation.
 * @returns Exit-1 teaching outcome without partial state or queue data.
 */
export function ticketCorpusError(root: string, detail: string): StateOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_STATE_TICKET_CORPUS,
    exitCode: 1,
    message: [
      `[sdd-state] ${ERR_CLI_SDD_STATE_TICKET_CORPUS}`,
      `  root: ${root}`,
      `  problem: ${detail}`,
      '  fix the named ticket file/directory (or remove the unsafe symlink), then rerun sdd-state; no partial snapshot or GATE_QUEUE was emitted.',
    ].join('\n'),
  };
}

/**
 * @purpose Render one location's directive-presence status for the failure message.
 * @param status The location's DirectivesLocationStatus.
 * @returns `absent` when the directory itself is missing, else the specific missing key files.
 */
function describeDirectivesStatus(status: DirectivesLocationStatus): string {
  if (!status.dirExists) return 'absent';
  return `missing: ${status.missing.join(', ')}`;
}

/**
 * @purpose Build the directives-missing diagnostic — sdd-state's install-preflight gate, the one place allowed to know about install/sync.
 * @invariant The project-root copy must be complete because that is what skills execute; node_modules is diagnostic only.
 * @param packageInstalled Whether node_modules/gennady/ itself exists (the npm package is present).
 * @param rootStatus Directive-presence status at `<root>/ai/directives/sdd-v2/`.
 * @param nodeModulesStatus Directive-presence status under node_modules/gennady/.
 * @returns Outcome with exit 3 — never prints the snapshot.
 */
export function directivesMissing(
  packageInstalled: boolean,
  rootStatus: DirectivesLocationStatus,
  nodeModulesStatus: DirectivesLocationStatus
): StateOutcome {
  const next = packageInstalled
    ? 'npx gennady sync-skills'
    : 'npm i -D gennady && npx gennady sync-skills';
  const why = packageInstalled
    ? 'gennady is installed but its sdd-v2 directives were never synced into this project — skills read them from the project root, not from node_modules.'
    : 'gennady is not installed here — skills assume the directives are already in place, and sdd-state is the only command that checks for that.';
  return {
    ok: false,
    code: ERR_CLI_SDD_STATE_DIRECTIVES_MISSING,
    exitCode: 3,
    message: [
      `[sdd-state] ${ERR_CLI_SDD_STATE_DIRECTIVES_MISSING}`,
      `  ${SDD_V2_SUBDIR}/ (project root): ${describeDirectivesStatus(rootStatus)}`,
      `  node_modules/gennady/${SDD_V2_SUBDIR}/: ${describeDirectivesStatus(nodeModulesStatus)}`,
      `  next: ${next}`,
      `  why: ${why}`,
    ].join('\n'),
  };
}
