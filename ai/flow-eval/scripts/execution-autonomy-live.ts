// @file: Finite EA-3 controller: exact runtimes, no-model qualification, existing eval CLI, owned cleanup.
// @spec: AI-SKILLS
// @consumers: execution-autonomy campaign operator; no automatic repetitions or model fallback

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  EXECUTION_AUTONOMY_CASE_IDS,
  buildExecutionAutonomyFixture,
  executionAutonomyScenario,
} from '../execution-autonomy-cases.ts';
import { qualifyExecutionAutonomyCase } from '../execution-autonomy-controls.ts';
import { safeVerifyText } from '../../../shared/verify/reporting/report-safety.ts';
import { createExecutionShellCarrier } from './execution-autonomy-shell-carrier.ts';
import { readExecutionContinuation } from '../execution-campaign-continuation.ts';
import { readExecutionHoldContinuation } from '../execution-hold-continuation.ts';

const root = resolve(import.meta.dirname, '../../..');
const mode = process.argv[2];
if (!['--qualify-only', '--live'].includes(mode ?? ''))
  throw new Error('Require --qualify-only or --live and a new results path');
if (
  mode === '--live' &&
  existsSync(join(root, 'ai/flow-eval/results/2026-10-27-execution-autonomy-final'))
)
  throw new Error(
    'EA-3 finite live budget is already reserved/consumed; a new series needs a separately registered protocol'
  );
const predecessor = process.argv[4] === '--remaining-from' ? process.argv[5] : undefined;
const resumeHold = process.argv[4] === '--resume-routing-hold';
if (
  process.argv[4] &&
  (resumeHold
    ? process.argv.length !== 5
    : !predecessor || mode !== '--live' || process.argv.length !== 6)
)
  throw new Error('Require --remaining-from PRIOR or --resume-routing-hold; no arbitrary retries');
const out = resolve(root, process.argv[3] ?? 'ai/flow-eval/results/2026-10-26-execution-autonomy');
if (!relative(root, out).startsWith('ai/flow-eval/results/') || existsSync(out))
  throw new Error(
    'Require a NEW repository-owned results directory; recorded attempts are never overwritten'
  );
if (
  resumeHold &&
  mode === '--live' &&
  out !== join(root, 'ai/flow-eval/results/2026-10-27-execution-autonomy-final')
)
  throw new Error(
    'Routing hold has exactly one reserved live output; no alternate/replacement campaign'
  );
const originalSchedule = EXECUTION_AUTONOMY_CASE_IDS.flatMap((caseId, index) =>
  (index % 2 ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const)).map(
    (arm) => ({ caseId, arm })
  )
);
const held = resumeHold ? readExecutionHoldContinuation(root, originalSchedule) : undefined;
mkdirSync(dirname(out), { recursive: true });
mkdirSync(out); // Atomic dispatch reservation: a competing/repeated invocation cannot reuse this stage.
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const json = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};
const owned = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-execution-campaign-')));
const privateDir = join(owned, 'private');
mkdirSync(privateDir, { mode: 0o700 });
const records: unknown[] = [];
const controls: unknown[] = [];
let server: ReturnType<typeof spawn> | undefined;
let serverClosed: Promise<void> | undefined;
let failure = false;
let safeCleanup = true;
let shuttingDown = false;
let planned = mode === '--live' ? 16 : 0;
let stage = 'preregistration';
const stop = new AbortController();
const onSignal = () =>
  stop.abort(new Error('Campaign interrupted; no automatic replacement attempt'));
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);

function filesUnder(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(path, entry.name))
      : entry.isFile()
        ? [join(path, entry.name)]
        : []
  );
}

/** @purpose Freeze the actual distributed runtime rather than assuming dist belongs to HEAD. */
function runtimeIdentity(path: string) {
  const files = [
    'package.json',
    'package-lock.json',
    ...['dist', 'ai/directives', 'ai/skills'].flatMap((dir) =>
      filesUnder(join(path, dir)).map((file) => relative(path, file))
    ),
  ]
    .sort()
    .map((file) => ({ path: file, sha256: sha(readFileSync(join(path, file))) }));
  return {
    head: git(path, 'rev-parse', 'HEAD'),
    tree: git(path, 'rev-parse', 'HEAD^{tree}'),
    files,
    digest: sha(JSON.stringify(files)),
  };
}

/** @purpose Run one existing CLI process without swallowing its lifecycle/partial evidence on a red outcome. */
async function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'ai/flow-eval/cli.ts', ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  const abort = () => child.kill('SIGTERM');
  stop.signal.addEventListener('abort', abort, { once: true });
  try {
    return await new Promise<number>((done, reject) => {
      child.once('error', reject);
      child.once('close', (code) => done(code ?? 1));
    });
  } finally {
    stop.signal.removeEventListener('abort', abort);
  }
}

try {
  const commits = held?.commits ?? {
    baseline: git(root, 'rev-parse', '7958ecb0^{commit}'),
    candidate: git(root, 'rev-parse', 'HEAD'),
  };
  const runtimes = { baseline: join(owned, 'baseline'), candidate: join(owned, 'candidate') };
  const harnessFiles = filesUnder(join(root, 'ai/flow-eval'))
    .filter(
      (path) => path.endsWith('.ts') && !path.includes('/results/') && !path.includes('/.results/')
    )
    .sort();
  const harness = harnessFiles.map((path) => ({
    path: relative(root, path),
    sha256: sha(readFileSync(path)),
  }));
  for (const file of harness) {
    const target = join(out, 'harness', file.path + '.txt');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(root, file.path)));
  }
  const continuation =
    held ??
    (predecessor
      ? readExecutionContinuation(root, resolve(root, predecessor), originalSchedule, commits)
      : undefined);
  const schedule = continuation?.remaining ?? originalSchedule;
  planned = mode === '--live' ? schedule.length : 0;
  const protocol = {
    schema: held
      ? 'gennady.execution-autonomy-campaign.2'
      : 'gennady.execution-autonomy-campaign.1',
    mode,
    commits,
    toolchain: {
      node: process.version,
      nodeExecutable: process.execPath,
      opencodeVersion: execFileSync('opencode', ['--version'], { encoding: 'utf8' }).trim(),
    },
    harness,
    harnessDigest: sha(JSON.stringify(harness)),
    harnessTrackedDirty: git(root, 'status', '--porcelain') !== '',
    model: 'llm-proxy/deepseek-v4-flash',
    planned,
    originalBudget: 16,
    ...(continuation
      ? { continuation: continuation.provenance, previouslySpent: continuation.spent }
      : {}),
    ...(held
      ? {
          baselineBackport: {
            sha256: sha(held.baselinePatch),
            source: 'EA-2c map/help ONLY; derived baseline, not original clean 7958',
          },
          expectedRuntimeDigests: held.expectedRuntimeDigests,
          priorAttemptsPoolable: false,
          maximumNewComparablePairs: 4,
        }
      : {}),
    fixtureQualification:
      'explicit full pipeline plus real contract and closed-world inventory controls before any receipt',
    schedule,
    inputs: EXECUTION_AUTONOMY_CASE_IDS.map((caseId) => ({
      caseId,
      files: Object.entries(buildExecutionAutonomyFixture(caseId))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, content]) => ({ path, sha256: sha(content) })),
    })),
    budgetMs: 480000,
    repetitions: 1,
    replacements: 0,
    concurrency: 1,
    limitation:
      'One sample per case/arm; SDK quiescence is not a sandbox security boundary or proof against arbitrary detached processes. No statistical non-inferiority or universal speed claim. EX4 stops at pending operator decision, not task DONE. Restart and dependency-edge recovery have deterministic controls, not live intervention claims. EX3/EX4 canonical-command path grades measure protocol capability plus observed use, NOT arm-neutral model autonomy: baseline lacks new replan/decision APIs. Terminal grades also depend on runtime support. Never infer worse model judgment solely from a missing new command or old Handoff parser; report functional behavior, semantic decisions, protocol conformance and completion separately.',
  };
  if (held && JSON.stringify(protocol.toolchain) !== JSON.stringify(held.expectedToolchain))
    throw new Error('Runtime toolchain changed after the reviewed hold; no model dispatch');
  json(join(out, 'protocol.json'), protocol);
  for (const arm of ['baseline', 'candidate'] as const) {
    stage = `build:${arm}`;
    stop.signal.throwIfAborted();
    console.log(`[EA-3] build ${arm} ${commits[arm]}`);
    execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', root, runtimes[arm]], {
      stdio: 'pipe',
    });
    git(runtimes[arm], 'checkout', '--quiet', '--detach', commits[arm]);
    if (held && arm === 'baseline') {
      execFileSync('git', ['apply', '--check', '-'], {
        cwd: runtimes[arm],
        input: held.baselinePatch,
      });
      execFileSync('git', ['apply', '-'], { cwd: runtimes[arm], input: held.baselinePatch });
      const actual = execFileSync('git', ['diff', '--binary', 'HEAD'], {
        cwd: runtimes[arm],
        encoding: 'utf8',
      });
      if (sha(actual) !== sha(held.baselinePatch)) throw new Error('Baseline backport drift');
    }
    symlinkSync(
      realpathSync(join(root, 'node_modules')),
      join(runtimes[arm], 'node_modules'),
      'dir'
    );
    const build = execFileSync('npm', ['run', 'build', '--', '--configLoader', 'runner'], {
      cwd: runtimes[arm],
      encoding: 'utf8',
      maxBuffer: 20_000_000,
    });
    const identity = runtimeIdentity(runtimes[arm]);
    if (held && identity.digest !== held.expectedRuntimeDigests[arm])
      throw new Error('Built runtime differs from shared-routing qualification; no model dispatch');
    json(join(out, `runtime-${arm}.json`), {
      ...identity,
      buildOutputSha256: sha(build),
      trackedClean: git(runtimes[arm], 'status', '--porcelain', '--untracked-files=no') === '',
      ...(held && arm === 'baseline'
        ? {
            sourcePatch: held.baselinePatch,
            sourcePatchSha256: sha(held.baselinePatch),
            derivedBaseline: true,
          }
        : {}),
    });
    for (const caseId of EXECUTION_AUTONOMY_CASE_IDS) {
      stage = `qualification:${arm}:${caseId}`;
      stop.signal.throwIfAborted();
      const control = await qualifyExecutionAutonomyCase(runtimes[arm], caseId);
      controls.push({ arm, ...control });
      json(join(out, 'qualification.json'), {
        modelCalls: 0,
        controls,
        complete: controls.length === 16,
      });
      console.log(`[EA-3] ${arm} ${caseId} normal/broken/tamper/cleanup PASS`);
    }
  }
  if (mode === '--live') {
    stage = 'approved-proxy-and-private-server';
    const sandboxRoot = join(owned, 'sandboxes');
    mkdirSync(sandboxRoot);
    const carrier = createExecutionShellCarrier({
      directory: join(privateDir, 'shell'),
      hostHome: homedir(),
      allowedReadRoots: [
        dirname(dirname(process.execPath)),
        realpathSync(join(root, 'node_modules')),
      ],
      privateRoots: [privateDir, root, runtimes.baseline, runtimes.candidate],
      workspaceRoot: sandboxRoot,
      path: `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    });
    for (const name of ['LLM_PROXY_BASE_URL', 'LLM_PROXY_API_KEY'])
      if (!process.env[name])
        throw new Error('Approved proxy environment is missing; no model fallback');
    const configured = JSON.parse(
      readFileSync(join(homedir(), '.config/opencode/opencode.json'), 'utf8')
    );
    const provider = configured.provider?.['llm-proxy'];
    if (!provider?.options?.apiKey || !provider.models?.['deepseek-v4-flash'])
      throw new Error('Approved Flash configuration missing');
    const endpoint = new URL(provider.options.baseURL);
    if (
      endpoint.origin !== 'https://ai-proxy.vk.team' ||
      endpoint.pathname.replace(/\/$/, '') !== '/v1'
    )
      throw new Error('Proxy route outside operator authorization');
    const config = {
      model: protocol.model,
      small_model: protocol.model,
      enabled_providers: ['llm-proxy'],
      share: 'disabled',
      instructions: [],
      plugin: [pathToFileURL(carrier.plugin).href],
      shell: carrier.shell,
      mcp: {},
      compaction: { auto: false, prune: false },
      permission: {
        '*': 'allow',
        external_directory: 'deny',
        question: 'deny',
        webfetch: 'deny',
        websearch: 'deny',
        codesearch: 'deny',
      },
      provider: {
        'llm-proxy': {
          ...provider,
          models: { 'deepseek-v4-flash': provider.models['deepseek-v4-flash'] },
        },
      },
    };
    writeFileSync(join(privateDir, 'opencode.json'), JSON.stringify(config), { mode: 0o600 });
    const net = await import('node:net');
    const reservation = net.createServer();
    await new Promise<void>((done, reject) =>
      reservation.once('error', reject).listen(0, '127.0.0.1', done)
    );
    const port = (reservation.address() as import('node:net').AddressInfo).port;
    await new Promise<void>((done) => reservation.close(() => done()));
    if (port < 4097) throw new Error('Unsafe private port');
    const baseUrl = `http://127.0.0.1:${port}`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OPENCODE_CONFIG: join(privateDir, 'opencode.json'),
      OPENCODE_DISABLE_SHARE: 'true',
      SHELL: carrier.shell,
    };
    for (const key of ['CONFIG', 'DATA', 'CACHE', 'STATE'])
      env[`XDG_${key}_HOME`] = join(privateDir, key.toLowerCase());
    server = spawn(
      'opencode',
      ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--log-level', 'WARN'],
      { cwd: owned, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    serverClosed = new Promise((done) => server!.once('close', () => done()));
    server.once('close', () => {
      if (!shuttingDown)
        stop.abort(new Error('Owned OpenCode exited; stop dispatch without replacement'));
    });
    server.stdout?.resume();
    server.stderr?.resume();
    server.once('error', () => stop.abort(new Error('Private OpenCode failed; no model fallback')));
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      stop.signal.throwIfAborted();
      if (server.exitCode !== null || server.signalCode !== null)
        throw new Error('Private OpenCode exited before readiness');
      ready = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1000) })
        .then((r) => r.ok)
        .catch(() => false);
      if (!ready) await delay(500);
    }
    if (!ready) throw new Error('Private server unavailable; no model calls attempted');
    for (const [index, entry] of schedule.entries()) {
      stage = `live:${index + 1}:${entry.arm}:${entry.caseId}`;
      stop.signal.throwIfAborted();
      if (harness.some((file) => sha(readFileSync(join(root, file.path))) !== file.sha256))
        throw new Error('Harness drift after preregistration; stop, do not recolor/repeat');
      const scenario = executionAutonomyScenario(entry.caseId, entry.arm);
      const scenarioFile = join(out, 'scenarios', `${index}.json`);
      json(scenarioFile, [scenario]);
      const recordFile = join(out, 'records', `${index}.json`);
      const originalIndex = index + (continuation?.spent ?? 0);
      json(recordFile, {
        ...entry,
        originalIndex,
        status: 'started',
        startedAt: new Date().toISOString(),
      });
      console.log(
        `[EA-3] live ${originalIndex + 1}/16 (${index + 1}/${planned} this stage) ${entry.arm} ${entry.caseId}`
      );
      safeCleanup = false; // Only a returned CLI plus a clean ownership scan can release this boundary.
      const exitCode = await runCli(
        [
          '--scenario-file',
          scenarioFile,
          '--directory',
          sandboxRoot,
          '--gennady-root',
          runtimes[entry.arm],
          '--base-url',
          baseUrl,
          '--model',
          protocol.model,
          '--judge-model',
          protocol.model,
          '--concurrency',
          '1',
          '--observe-every-ms',
          '15000',
          '--stuck-after',
          '8',
          '--max-observations',
          '40',
          '--max-wall-clock-ms',
          '480000',
          '--results-dir',
          join(out, 'permanent'),
          '--artifacts-dir',
          join(out, 'transient'),
        ],
        env
      );
      const pending = readdirSync(sandboxRoot).filter((name) => name.startsWith('sdd-flow-eval-'));
      safeCleanup = pending.length === 0;
      const record = {
        ...entry,
        originalIndex,
        exitCode,
        status: pending.length ? 'cleanup-unproven' : 'recorded',
        completedAt: new Date().toISOString(),
        remainingSandboxes: pending,
      };
      json(recordFile, record);
      records.push(record);
      json(join(out, 'progress.json'), {
        planned,
        recorded: records.length,
        originalBudget: 16,
        previouslySpent: continuation?.spent ?? 0,
        totalSpent: (continuation?.spent ?? 0) + records.length,
        records,
      });
      if (pending.length) {
        safeCleanup = false;
        throw new Error('Writer cleanup unproven; campaign stopped, recovery paths retained');
      }
      const summaries = filesUnder(join(out, 'permanent')).filter(
        (path) => path.endsWith('/summary.json') && path.includes(scenario.id)
      );
      if (summaries.length !== 1)
        throw new Error('Missing/ambiguous primary evidence; no automatic replacement');
      const summary = JSON.parse(readFileSync(summaries[0]!, 'utf8'));
      const detail = summary.executionFailure?.detail ?? '';
      if (
        summary.verdict === 'worker-error' &&
        (/(?:proxy|provider|rate.?limit|unauthori[sz]ed|\b(?:401|403|429|503)\b|ECONN|fetch failed)/i.test(
          detail
        ) ||
          summary.usage?.messages === 0)
      )
        throw new Error(
          `Model/proxy unavailable in recorded attempt: ${detail || 'no observed model messages'}; stop after one failure, never switch provider or replace this attempt`
        );
    }
  }
} catch (cause) {
  failure = true;
  const detail = safeVerifyText(
    cause instanceof Error ? cause.message : 'unknown campaign error',
    root
  ).slice(0, 8000);
  json(join(out, 'failure.json'), { stage, detail, replacements: 0, fallback: false });
  console.error(`[EA-3] stopped at ${stage}: ${detail}; no fallback, replacement or PASS inferred`);
} finally {
  shuttingDown = true;
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already exited */
    }
    await Promise.race([serverClosed, delay(3000)]);
    try {
      process.kill(-server.pid, 0);
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* group gone */
    }
    await Promise.race([serverClosed, delay(3000)]);
    try {
      process.kill(-server.pid, 0);
      safeCleanup = false;
    } catch {
      /* owned group is gone */
    }
  }
  const sandboxRoot = join(owned, 'sandboxes');
  try {
    if (
      existsSync(sandboxRoot) &&
      (readdirSync(sandboxRoot).some((name) => name.startsWith('sdd-flow-eval-')) ||
        filesUnder(sandboxRoot).some((path) => path.includes('/leases/') && path.endsWith('.json')))
    )
      safeCleanup = false;
  } catch {
    safeCleanup = false;
  }
  json(join(out, 'cleanup.json'), {
    safeCleanup,
    ownedRoot: safeCleanup ? '<removed>' : owned,
    modelCallsPlanned: planned,
    recorded: records.length,
  });
  if (safeCleanup) rmSync(owned, { recursive: true, force: true });
  else
    console.error(`[EA-3] recovery retained at ${owned}; do not delete while writers are unproven`);
  json(join(out, 'cleanup.json'), {
    safeCleanup,
    ownedRoot: safeCleanup ? '<removed>' : owned,
    rootRemoved: !existsSync(owned),
    planned,
    recorded: records.length,
  });
}
if (failure || !safeCleanup) process.exitCode = 1;
