// @file: Types, error codes, and snapshot formatting for the sdd-state command.
// @consumers: SddStateCommand
// @tasks: N/A

import type { ReadinessResult } from '../../../shared/sdd/readiness.ts';
import type { Scope } from '../../../shared/sdd/portal.ts';
import type { RepoProbe } from '../../../shared/sdd/probe.ts';

/** @purpose More than one positional argument was passed. */
export const ERR_CLI_SDD_STATE_BAD_INVOCATION = 'ERR_CLI_SDD_STATE_BAD_INVOCATION' as const;
/** @purpose The given project root is not an existing directory. */
export const ERR_CLI_SDD_STATE_BAD_ROOT = 'ERR_CLI_SDD_STATE_BAD_ROOT' as const;

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
  /** @purpose Exact-match readiness of the required npm scripts. */
  readiness: ReadinessResult;
  /** @purpose Raw content of the session scratch (specs/.sdd-session.md), or null when no active session. */
  sessionContent: string | null;
  /** @purpose Code/infra heuristics — always gathered: one snapshot carries everything any router branch needs. */
  probe?: RepoProbe;
};

/**
 * @purpose Result of one sdd-state run — formatted snapshot (exit 0) or an actionable failure.
 * @invariant On failure `message` is never empty; `exitCode` is 2 (bad root) or 4 (bad invocation).
 */
export type StateOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 2 | 4; message: string };

/**
 * @purpose Render a StateSnapshot into the bracketed, machine-readable form the router consumes.
 * @param s The assembled snapshot.
 * @returns A multi-section string: header + `[READINESS]` + `[SCOPES]` + `[SESSION]` + `[SUMMARY]`.
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
  lines.push(`gennady-installed\t${s.readiness.gennadyAvailable ? '✔' : '✘'}`);
  lines.push(
    s.readiness.ready
      ? 'READINESS=ready'
      : `READINESS=not-ready (missing: ${s.readiness.missing.join(', ')})`
  );

  lines.push('', '[SCOPES]', '# name\ttype\tstatus\tdescription\tspec');
  if (!s.portalPresent) {
    lines.push('# (portal absent — route to project-setup / root flow)');
  } else if (s.scopes.length === 0) {
    lines.push('# (portal present, no scopes listed yet)');
  } else {
    for (const sc of s.scopes) {
      lines.push(
        `${sc.name}\t${sc.type}\t${sc.status}\t${sc.description || '—'}\t${sc.specPath ?? '-'}`
      );
    }
  }

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
    `readiness=${s.readiness.ready ? 'ready' : 'not-ready'}`,
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
      '  expected: gennady sdd-state [project-root]   (zero or one positional argument)',
      `  got:      ${got || '(extra arguments)'}`,
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
