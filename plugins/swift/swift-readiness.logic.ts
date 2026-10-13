// @file: Selected-command Swift prerequisite identities and guarded bounded version observations.
// @spec: CLI-VERIFY
// @consumers: Swift target config materialization and selected-slice readiness

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireWorkspaceGuard } from '../../shared/verify/execution/workspace-guard.ts';
import type { PlannedVerifyStep, Requirement } from '../../shared/verify/model/verify-step.type.ts';
import { safeVerifyText } from '../../shared/verify/reporting/report-safety.ts';

type SelectedTool = 'swift' | 'swiftformat' | 'swiftlint' | 'xcodebuild' | 'tuist';
type ToolCommand = { tool: SelectedTool; prefix: string[]; projectOperation: boolean };
type ToolProbe = { ready: boolean; message: string };
const PROBE_TIMEOUT_MS = 10_000;
const VERSION_FLOORS: Partial<Record<SelectedTool, string>> = {
  xcodebuild: '16.2',
  tuist: '4.202.0',
};
const XCODE_VALUE_OPTIONS = new Set([
  '-workspace',
  '-project',
  '-scheme',
  '-destination',
  '-testPlan',
  '-configuration',
  '-sdk',
  '-toolchain',
  '-derivedDataPath',
  '-resultBundlePath',
  '-parallel-testing-enabled',
  '-maximum-concurrent-test-simulator-destinations',
  '-enableCodeCoverage',
  '-xcconfig',
  '-archivePath',
  '-only-testing',
  '-skip-testing',
  '-destination-timeout',
  '-jobs',
]);

/** @purpose Distinguish actual actions from consumed option values using bounded known Xcode options. */
function xcodeOperands(argv: readonly string[], start: number): string[] {
  const operands: string[] = [];
  for (let index = start; index < argv.length; index++) {
    if (XCODE_VALUE_OPTIONS.has(argv[index]!)) index++;
    else operands.push(argv[index]!);
  }
  return operands;
}

/** @purpose Keep version/discovery modes identity-free unless an actual project action is present. */
function xcodeProjectOperation(argv: readonly string[], start: number): boolean {
  const operands = xcodeOperands(argv, start);
  const action = operands.some((value) =>
    [
      'build',
      'clean',
      'archive',
      'analyze',
      'install',
      'test',
      'test-without-building',
      'build-for-testing',
    ].includes(value)
  );
  return action || !operands.some((value) => ['-version', '-showsdks', '-list'].includes(value));
}

/** @purpose Recognize direct tools and xcrun operations, never infer a tool from phase/step names. */
export function selectedSwiftTool(argv: readonly string[]): ToolCommand | null {
  const executable = path.basename(argv[0] ?? '');
  const wrapped = executable === 'xcrun';
  let operationIndex = 1;
  if (wrapped)
    while ((argv[operationIndex] ?? '').startsWith('-')) {
      const option = argv[operationIndex]!;
      if (['--find', '-f'].includes(option)) return null;
      if (['--sdk', '-sdk', '--toolchain', '-toolchain'].includes(option)) {
        if (!argv[operationIndex + 1] || argv[operationIndex + 1]!.startsWith('-')) return null;
        operationIndex += 2;
      } else if (
        /^--(?:sdk|toolchain)=.+/.test(option) ||
        ['--verbose', '-v', '--log', '-l', '--no-cache', '-n'].includes(option)
      )
        operationIndex++;
      else return null;
    }
  const operation = wrapped ? (argv[operationIndex] ?? '') : executable;
  if (operation === 'xccov' && wrapped)
    return {
      tool: 'xcodebuild',
      prefix: [...argv.slice(0, operationIndex), 'xcodebuild'],
      projectOperation: false,
    };
  if (!['swift', 'swiftformat', 'swiftlint', 'xcodebuild', 'tuist'].includes(operation))
    return null;
  return {
    tool: operation as SelectedTool,
    prefix: argv.slice(0, wrapped ? operationIndex + 1 : 1),
    projectOperation:
      operation === 'xcodebuild' && xcodeProjectOperation(argv, wrapped ? operationIndex + 1 : 1),
  };
}

/** @purpose Give selected tools actionable pinned install/version hints without global Apple prerequisites. */
export function swiftToolFix(tool: SelectedTool): string {
  return tool === 'xcodebuild'
    ? 'install/select Xcode >=16.2 with xcode-select or DEVELOPER_DIR; retry xcodebuild -version'
    : tool === 'tuist'
      ? 'install the project-pinned Tuist >=4.202.0; retry tuist version'
      : `install/select the project-pinned ${tool} version on PATH; retry ${tool} --version`;
}

/** @purpose Bind actual command capabilities into composed requirements so the executor cannot bypass them. */
export function swiftCommandRequirements(stepId: string, argv: readonly string[]): Requirement[] {
  const selected = selectedSwiftTool(argv);
  if (selected === null) return [];
  const requirements: Requirement[] = [
    {
      id: `swift:tool:${selected.tool}:${stepId}`,
      kind: 'command',
      description: `${selected.tool} identifies a usable selected tool version`,
      required: true,
      fix: swiftToolFix(selected.tool),
    },
  ];
  if (selected.projectOperation)
    requirements.push({
      id: `swift:xcode-identity:${stepId}`,
      kind: 'config',
      description:
        'selected Xcode operation has exactly one workspace/project, scheme and destination; test-bearing actions also need testPlan',
      required: true,
      fix: 'configure exactly one existing workspace/project plus scheme and destination; add -testPlan for selected test-bearing Xcode actions',
    });
  return requirements;
}

/** @purpose Only actual Xcode test actions, never option values/phase names, require a test plan. */
export function xcodeTestBearing(step: Pick<PlannedVerifyStep, 'command' | 'testStats'>): boolean {
  const argv = step.command?.argv ?? [];
  const selected = selectedSwiftTool(argv);
  if (!selected?.projectOperation) return false;
  return xcodeOperands(argv, selected.prefix.length).some((value) =>
    ['test', 'test-without-building', 'build-for-testing'].includes(value)
  );
}

function versionOf(tool: SelectedTool, stdout: string): string | null {
  const expression =
    tool === 'xcodebuild'
      ? /^Xcode\s+(\d+\.\d+(?:\.\d+)?)\s*$/m
      : tool === 'swift'
        ? /\bSwift version\s+(\d+\.\d+(?:\.\d+)?)/
        : /^\s*(?:Tuist version\s+)?(\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?(?:\+[\w.-]+)?)\s*$/m;
  return expression.exec(stdout)?.[1] ?? null;
}

function meetsFloor(version: string, floor: string | undefined): boolean {
  if (floor === undefined) return true;
  const [core, prerelease] = version.split('+')[0]!.split('-');
  const actual = core!.split('.').map(Number);
  const required = floor.split('.').map(Number);
  for (let index = 0; index < Math.max(actual.length, required.length); index++) {
    const delta = (actual[index] ?? 0) - (required[index] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return prerelease === undefined;
}

/** @purpose Kill the owned version process group, including timeout/background descendants, before release. */
function terminateProbeTree(pid: number): boolean {
  if (pid <= 0) return true;
  if (process.platform === 'win32') {
    const killed = spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    // An already completed tree can be absent; Windows native execution is not asserted by these fixtures.
    return killed.error === undefined && killed.status === 0;
  }
  try {
    process.kill(-pid, 'SIGKILL');
    const deadline = Date.now() + 1000;
    const pause = new Int32Array(new SharedArrayBuffer(4));
    while (Date.now() < deadline) {
      try {
        process.kill(-pid, 0);
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ESRCH';
      }
      Atomics.wait(pause, 0, 0, 10);
    }
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/**
 * @purpose Observe only selected local version commands inside the existing dirty-safe transaction.
 * @param root Actual repository whose bytes/index/refs must remain unchanged.
 * @param steps Selected non-waived Swift nodes; remote/generic commands are never probed.
 * @returns Per-step prerequisite observations, not gate-run or native Swift evidence.
 */
export function probeSelectedSwiftTools(
  root: string,
  steps: readonly PlannedVerifyStep[]
): ReadonlyMap<string, ToolProbe> {
  const candidates = steps.flatMap((step) => {
    const tool =
      step.executor === 'local' && step.command ? selectedSwiftTool(step.command.argv) : null;
    return tool === null ? [] : [{ step, tool }];
  });
  const observations = new Map<string, ToolProbe>();
  if (candidates.length === 0) return observations;
  const acquired = acquireWorkspaceGuard(root, { signalHandlers: false });
  if (acquired.kind === 'error') {
    for (const { step } of candidates)
      observations.set(step.id, {
        ready: false,
        message: `selected version probe could not acquire repository protection (${acquired.error.code}); retry in an initialized Git repository without a competing guard`,
      });
    return observations;
  }
  const guard = acquired.guard;
  const cache = new Map<string, ToolProbe>();
  let retainCheckpoint = false;
  try {
    for (const { step, tool } of candidates) {
      const command = step.command!;
      const argv = [
        ...tool.prefix,
        tool.tool === 'xcodebuild' ? '-version' : tool.tool === 'tuist' ? 'version' : '--version',
      ];
      const key = JSON.stringify({
        argv,
        cwd: command.cwd,
        env: Object.entries(command.env ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      });
      const cached = cache.get(key);
      if (cached) {
        observations.set(step.id, cached);
        continue;
      }
      let observation: ToolProbe = {
        ready: false,
        message: `${tool.tool} selected version probe is missing, broken or timed out; ${swiftToolFix(tool.tool)}`,
      };
      const relative = path.relative(root, command.cwd);
      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative) ||
        fs.realpathSync(command.cwd) !== command.cwd
      ) {
        observations.set(step.id, {
          ready: false,
          message:
            'selected version probe cwd is unsafe; use a real directory contained by the repository',
        });
        continue;
      }
      const probeStep: PlannedVerifyStep = {
        ...step,
        effect: 'observe',
        writes: undefined,
        command: { ...command, argv, timeoutMs: PROBE_TIMEOUT_MS },
        timeoutMs: PROBE_TIMEOUT_MS,
      };
      const begun = guard.beginStep(probeStep);
      if (begun.kind === 'error') {
        observations.set(step.id, {
          ready: false,
          message: `selected version probe was blocked (${begun.error.code})`,
        });
        continue;
      }
      const spawnOptions = {
        cwd: command.cwd,
        env: { ...process.env, ...command.env },
        encoding: 'utf8' as const,
        stdio: ['ignore' as const, 'pipe' as const, 'pipe' as const],
        timeout: PROBE_TIMEOUT_MS,
        killSignal: 'SIGKILL' as const,
        maxBuffer: 64 * 1024,
        detached: process.platform !== 'win32',
        windowsHide: true,
      };
      const result = spawnSync(argv[0]!, argv.slice(1), spawnOptions);
      const treeStopped = terminateProbeTree(result.pid);
      if (!treeStopped) {
        retainCheckpoint = true;
        for (const { step: affected } of candidates)
          observations.set(affected.id, {
            ready: false,
            message:
              'version process tree cleanup could not be proven; workspace checkpoint retained for inspection',
          });
        break;
      }
      const finished = guard.finishStep(step.id, {
        succeeded: result.status === 0 && result.error === undefined && treeStopped,
      });
      if (finished.kind === 'error' || finished.kind === 'violation') {
        for (const { step: affected } of candidates)
          observations.set(affected.id, {
            ready: false,
            message: `selected version probe violated workspace protection (${finished.error.code}); retry only after inspecting repository state`,
          });
        break;
      }
      if (result.status === 0 && result.error === undefined && treeStopped) {
        const version = versionOf(tool.tool, result.stdout);
        const floor = VERSION_FLOORS[tool.tool];
        observation =
          version !== null && meetsFloor(version, floor)
            ? { ready: true, message: `${tool.tool} selected version ${version}: ready` }
            : {
                ready: false,
                message: `${tool.tool} version is invalid or below ${floor ?? 'the project-pinned version'}; ${swiftToolFix(tool.tool)}`,
              };
      }
      observation = {
        ...observation,
        message: safeVerifyText(observation.message, root, command.env),
      };
      cache.set(key, observation);
      observations.set(step.id, observation);
    }
  } catch {
    for (const { step } of candidates)
      observations.set(step.id, {
        ready: false,
        message: 'selected version probe failed safely; inspect selected tool/cwd and retry',
      });
  } finally {
    const released = retainCheckpoint ? ({ kind: 'retained' } as const) : guard.release();
    if (released.kind === 'error')
      for (const { step } of candidates)
        observations.set(step.id, {
          ready: false,
          message: `version probe guard retained checkpoint (${released.error.code}); inspect repository state before retry`,
        });
  }
  return observations;
}
