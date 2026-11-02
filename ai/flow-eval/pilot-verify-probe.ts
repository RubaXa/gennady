// @file: Real-CLI pilot controls for literal route paths and phase-proof lifecycle freshness.
// @spec: AI-SKILLS
// @consumers: pilot Verify regression qualification and bounded follow-up campaign

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { BUILTIN_RULE_SOURCES } from '../../shared/rules/builtin-rule-sources.ts';
import { validateCurrentSddPhaseAttempt } from '../../shared/sdd/verify/sdd-attempt-journal.ts';
import { runCli, cleanTestChildEnv } from '../../cli/__tests__/tool-behavior/run-cli.ts';
import {
  buildExecutionAutonomyFixture,
  executionAutonomyCase,
  executionAutonomyReference,
} from './execution-autonomy-cases.ts';

/** @purpose Hash exact fixture bytes without including transient absolute paths in evidence. */
const digest = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

/** @purpose Create a single owned fixture, retain compact evidence and always remove its files.
 * @param operation Host-owned diagnostic, never a model-generated success.
 * @returns Diagnostic product plus confirmed removal of this fixture root.
 */
function fixture<T>(operation: (root: string, put: (path: string, text: string) => void) => T) {
  const root = mkdtempSync(join(tmpdir(), 'pilot-verify-'));
  let value: T;
  try {
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    value = operation(root, put);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return { ...value, rootRemoved: !existsSync(root), modelCalls: 0 as const };
}

/** @purpose Initialize only the synthetic fixture Git tree through ordinary commands.
 * @param root Owned fixture checkout.
 * @returns Nothing; command failures are not converted to successful qualification.
 */
function initialize(root: string): void {
  for (const args of [
    ['init', '-q'],
    ['add', '.'],
    ['commit', '-qm', 'Pilot fixture input'],
  ]) {
    execFileSync(
      'git',
      [
        '-C',
        root,
        '-c',
        'user.name=Pilot fixture',
        '-c',
        'user.email=pilot@example.invalid',
        ...args,
      ],
      {
        env: cleanTestChildEnv(process.env),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  }
}

/** @purpose Run the real full Verify twice, changing only an exact tracked route filename.
 */
export function capturePilotRouteProbe() {
  return fixture((root, put) => {
    put('package.json', '{"name":"pilot-route","private":true}\n');
    put(
      'gennady.yaml',
      [
        'verify:',
        '  presets:',
        '    node:',
        '      phases:',
        '        full: { include: [pilot] }',
        '      steps:',
        '        route-proof:',
        '          tags: [pilot]',
        '          needs: []',
        '          executor: local',
        '          effect: observe',
        '          command:',
        '            argv: [node, -e, "console.log(\'PILOT_ROUTE_GATE_RAN\')"]',
        '            cwd: .',
        '          timeout: 10s',
        '          onFailure: stop-phase',
        '',
      ].join('\n')
    );
    put('pages/slug.tsx', 'export const route = 1;\n');
    initialize(root);
    const ordinary = runCli(['verify', '--phase', 'full'], root);
    // Rename the same bytes and update the real Git inventory, without changing configuration.
    rmSync(join(root, 'pages/slug.tsx'));
    put('pages/[...slug].tsx', 'export const route = 1;\n');
    execFileSync('git', ['-C', root, 'add', '-A'], { env: cleanTestChildEnv(process.env) });
    const bracket = runCli(['verify', '--phase', 'full'], root);
    return { ordinary, bracket, fixtureKind: 'synthetic-exact-tracked-route' as const };
  });
}

/** @purpose Capture real two-phase completion, sync and group receipts without manual proof edits.
 * @param repository Source checkout supplying the existing canonical fixtures and shared dependencies.
 */
export function capturePilotFreshnessProbe(repository: string) {
  return fixture((root, put) => {
    const c = executionAutonomyCase('ex1-clean');
    const files = {
      ...buildExecutionAutonomyFixture('ex1-clean'),
      ...executionAutonomyReference('ex1-clean'),
    };
    files[c.module] = files[c.module]!.replace(
      '<!--/SECTION:FILE_STRUCTURE-->',
      '- `src/delay.test.ts`: approved scenario tests\n<!--/SECTION:FILE_STRUCTURE-->'
    );
    for (const [path, text] of Object.entries(files)) put(path, text);
    for (const path of BUILTIN_RULE_SOURCES)
      put(path, readFileSync(join(repository, path), 'utf8'));
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
    initialize(root);
    const commands: { args: string[]; exitCode: number; stdout: string; stderr: string }[] = [];
    const invoke = (...args: string[]) => {
      const outcome = runCli(args, root);
      commands.push({ args, ...outcome });
      return outcome;
    };
    const requireSuccess = (...args: string[]) => {
      const outcome = invoke(...args);
      if (outcome.exitCode !== 0)
        throw new Error(
          `Pilot fixture prerequisite refused ${args.join(' ')}: ${outcome.stdout}\n${outcome.stderr}`
        );
      return outcome;
    };
    const current = () =>
      ['P1', 'P2'].map((phase) => ({
        phase,
        ...validateCurrentSddPhaseAttempt(root, join(root, c.ticket), phase),
      }));
    const unchangedPaths = [
      c.source,
      'src/delay.test.ts',
      'gennady.yaml',
      'config/runtime.json',
      c.module,
      c.ticket,
    ];
    const snapshot = () =>
      Object.fromEntries(
        unchangedPaths.map((path) => [path, digest(readFileSync(join(root, path)))])
      );
    const initial = requireSuccess('sdd-check', '--all', '.', '--format', 'json');
    for (const phase of ['P1', 'P2']) {
      requireSuccess('sdd-verify', '--task', c.ticket, '--phase', phase);
      requireSuccess(
        'sdd-log',
        c.ticket,
        'complete',
        `artifacts: [${phase === 'P1' ? c.source : 'src/delay.test.ts'}]; decisions: []; open: []; deviations: []`,
        '--phase',
        phase
      );
    }
    requireSuccess('sdd-log', c.ticket, 'close');
    const beforeSync = current();
    const beforeSyncFiles = snapshot();
    const indexBefore = readFileSync(join(root, c.index), 'utf8');
    requireSuccess('sdd-sync', c.ticket);
    const afterSync = current();
    const afterSyncFiles = snapshot();
    const indexChanged = indexBefore !== readFileSync(join(root, c.index), 'utf8');
    const coherenceAfterSync = invoke('sdd-check', '--all', '.', '--format', 'json');
    // Separate causal controls: use real re-verification only to isolate each following write.
    // These extra commands are the current workaround, not the desired final trajectory.
    const reverify = () => {
      for (const phase of ['P1', 'P2'])
        requireSuccess('sdd-verify', '--task', c.ticket, '--phase', phase);
    };
    reverify();
    const beforeAudit = current();
    requireSuccess('sdd-log', c.ticket, 'audit-receipt', 'PASS');
    const afterAudit = current();
    reverify();
    const beforeReview = current();
    requireSuccess('sdd-log', c.ticket, 'review-receipt', 'PASS');
    const afterReview = current();
    const finalWithoutWorkaround = invoke('sdd-check', '--all', '.', '--format', 'json');
    reverify();
    const finalWithWorkaround = requireSuccess('sdd-check', '--all', '.', '--format', 'json');
    const controls = [
      [c.source, '\n// product change\n'],
      ['src/delay.test.ts', '\n// scenario change\n'],
      ['gennady.yaml', '\n# verification policy change\n'],
      ['config/runtime.json', '\n '],
      [c.module, '\nA changed product requirement.\n'],
      [c.index, '\nA changed decomposition decision.\n'],
      ['ai/directives/testing/node-test.xml', '\nA changed selected testing rule.\n'],
    ].map(([path, delta]) => {
      const original = readFileSync(join(root, path!), 'utf8');
      try {
        put(path!, original + delta);
        return { path: path!, current: current() };
      } finally {
        put(path!, original);
      }
    });
    return {
      initial,
      beforeSync,
      afterSync,
      indexChanged,
      beforeSyncFiles,
      afterSyncFiles,
      coherenceAfterSync,
      beforeAudit,
      afterAudit,
      beforeReview,
      afterReview,
      finalWithoutWorkaround,
      finalWithWorkaround,
      controls,
      restoredCurrent: current(),
      commands,
      semanticReview:
        'host-provided fixture verdicts; no independent model audit was performed' as const,
      limitations: [
        'source CLI, not a packed installation',
        'synthetic task, not the original Octavius diff',
      ],
    };
  });
}
