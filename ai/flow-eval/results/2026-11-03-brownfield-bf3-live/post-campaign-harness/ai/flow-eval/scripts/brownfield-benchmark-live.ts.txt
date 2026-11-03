// @file: Finite local installed-package brownfield benchmark with private evidence and mandatory per-run cleanup.
// @spec: AI-SKILLS
// @consumers: BF3 operator; exactly eight primary attempts, no replacements or model fallback

import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
  lstatSync,
  statfsSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  BF3_CASES,
  files,
  SOURCE,
  TEST,
  EXTRA,
  E2SOURCE,
  e2source,
  minimalCommentLanguageDiff,
  TASK,
  TRACKER,
  registry,
  referenceProposal,
  sha,
  type CaseId,
} from '../brownfield-benchmark.ts';
import { createSddEvalOpenCodeClient } from '../opencode-client.ts';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { SddEvalSessionDirectoryMap } from '../session-directory.ts';
import { toolEventsFrom } from '../trajectory.ts';
import {
  prepareEvalDependencyStore,
  bindEvalDependencies,
  releaseEvalDependencyLease,
  startEvalDependencyLeaseHeartbeat,
} from '../dependency-store.ts';
import { createExecutionShellCarrier } from './execution-autonomy-shell-carrier.ts';
import {
  assessConsentOrder,
  findHostConsentApproval,
  capturePrivateSessionMessages,
  publicQualification,
} from '../brownfield-measurement.ts';
const root = resolve(import.meta.dirname, '../../..');
const defaultPackages = resolve(process.env.GENNADY_BF3_PACKAGE_ROOT ?? '.');
const packageManifestPath = join(defaultPackages, 'manifest.json');
let commits: { baseline: string; candidate: string };
let gitToolchainDirectory = '';
const executionPath = () =>
  `${dirname(process.execPath)}:${gitToolchainDirectory}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
const CONSENT_REPLY =
  'Operator approval: add only lint.commentLanguage: ru to gennady.yaml, preserve lint.scope: owned and unrelated values/comments. Then repeat the original lint command; no other policy/source/spec change is authorized.';
const model = { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' };
const modelName = 'llm-proxy/deepseek-v4-flash';

const budget = { E1: 360000, E2: 360000, E3: 240000, E4: 540000 };
const stop = new AbortController();
for (const event of ['SIGINT', 'SIGTERM'])
  process.once(event, () => stop.abort(new Error('BF3 interrupted; no replacements')));
const put = (base: string, path: string, value: string | Buffer) => {
  mkdirSync(dirname(join(base, path)), { recursive: true });
  writeFileSync(join(base, path), value, { mode: 0o600 });
};
const json = (base: string, path: string, value: unknown) =>
  put(base, path, JSON.stringify(value, null, 2) + '\n');
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32000000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  }).trim();
const under = (base: string): string[] =>
  readdirSync(base, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? under(join(base, e.name)) : e.isFile() ? [join(base, e.name)] : []
  );
const secretPath = (p: string) =>
  /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|credentials[^/]*|id_(?:rsa|ed25519)[^/]*|application_default_credentials\.json$)|\.(?:pem|p12|keystore)$/i.test(
    p
  );
const secretContent = (v: string) =>
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{32,})\b|(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key|auth[_-]?token)\s*[:=]\s*["'][^"'\r\n]{12,}["']/i.test(
    v
  );
/** @purpose Export exact existing source without secrets, prior Git history or agent overrides. */
function snapshot(dest: string, source: string) {
  const sourceCommit = git(source, 'rev-parse', 'HEAD');
  mkdirSync(dest);
  const entries = git(source, 'ls-tree', '-r', '--full-tree', sourceCommit)
    .split('\n')
    .map((line) => {
      const m = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(line);
      return m ? { oid: m[2]!, path: m[3]! } : undefined;
    })
    .filter((v): v is { oid: string; path: string } => !!v);
  const allowed = entries.filter(
    ({ path }) =>
      !secretPath(path) &&
      !/(?:^|\/)(?:\.claude|\.opencode|node_modules|dist|coverage|specs|ai)\//.test(path) &&
      !/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/.test(path)
  );
  for (let i = 0; i < allowed.length; i += 400) {
    const data = execFileSync(
      'git',
      [
        '--literal-pathspecs',
        '-C',
        source,
        'archive',
        '--format=tar',
        sourceCommit,
        '--',
        ...allowed.slice(i, i + 400).map((x) => x.path),
      ],
      { maxBuffer: 80000000 }
    );
    execFileSync('tar', ['-xf', '-', '-C', dest], {
      input: data,
      env: { ...process.env, LC_ALL: 'C' },
    });
  }
  let excludedContent = 0;
  const included = allowed.filter(({ path }) => {
    if (secretContent(readFileSync(join(dest, path), 'utf8'))) {
      rmSync(join(dest, path));
      excludedContent++;
      return false;
    }
    return true;
  });
  const sourcePaths = included
    .map((x) => x.path)
    .filter((p) => /\.(?:[cm]?[jt]sx?|swift|go|kt|java)$/.test(p));
  assert.ok(sourcePaths.length > 1000, 'real source scale absent');
  return {
    sourcePaths,
    manifest: included,
    identity: {
      sourceCommit,
      trackedRegularFiles: entries.length,
      exportedFiles: included.length,
      sourceFiles: sourcePaths.length,
      excludedFiles: entries.length - included.length,
      excludedContent,
      manifestSha256: sha(JSON.stringify(included)),
      historyExported: false,
      limitation:
        'Existing real source snapshot, secret/agent-config exclusions, synthetic isolated task overlay. Not a whole-project build.',
    },
  };
}
/** @purpose Run the installed CLI under the host-selected execution boundary. */
function command(cwd: string, args: string[], profile?: string) {
  const bin = join(cwd, 'node_modules/.bin/gennady');
  const argv = profile ? ['-f', profile, bin, ...args] : args;
  const r = spawnSync(profile ? '/usr/bin/sandbox-exec' : bin, argv, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: profile ? executionPath() : process.env.PATH,
      TMPDIR: join(cwd, '.sdd-eval-shell-tmp'),
      NO_COLOR: '1',
      GENNADY_NO_UPDATE_CHECK: '1',
      HOME: join(cwd, '.sdd-eval-shell-home'),
    },
    timeout: 60000,
    maxBuffer: 3000000,
  });
  return {
    exit: r.status,
    error: r.error?.message ?? null,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}
/** @purpose Run independent functional assertions without trusting worker-declared success. */
function nodeCommand(cwd: string, args: string[], profile?: string) {
  const r = spawnSync(
    profile ? '/usr/bin/sandbox-exec' : process.execPath,
    profile ? ['-f', profile, process.execPath, ...args] : args,
    {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: profile ? executionPath() : process.env.PATH,
        TMPDIR: join(cwd, '.sdd-eval-shell-tmp'),
        NO_COLOR: '1',
        HOME: join(cwd, '.sdd-eval-shell-home'),
      },
      timeout: 20000,
      maxBuffer: 3000000,
    }
  );
  return {
    exit: r.status,
    error: r.error?.message ?? null,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}
/** @purpose Install one packed runtime and shared verified dependencies into an owned checkout. */
async function workspace(
  cwd: string,
  runtime: string,
  id: CaseId,
  owned: string,
  snapshotRoot?: string,
  realPaths: readonly string[] = []
) {
  mkdirSync(cwd, { recursive: true });
  if (snapshotRoot && id === 'E2') cpSync(snapshotRoot, cwd, { recursive: true });
  const overlay = files(id, id === 'E2' ? realPaths : []);
  for (const [path, v] of Object.entries(overlay)) put(cwd, path, v);
  const packageInfo = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8'));
  const name = packageInfo.name;
  assert.ok(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name));
  const installed = join(cwd, 'node_modules', name);
  mkdirSync(dirname(installed), { recursive: true });
  cpSync(runtime, installed, { recursive: true });
  cpSync(join(runtime, 'ai/directives'), join(cwd, 'ai/directives'), { recursive: true });
  const store = await prepareEvalDependencyStore({
    sourceRoot: root,
    storeRoot: join(owned, 'dependencies'),
    leaseId: randomUUID(),
  });
  try {
    await bindEvalDependencies(cwd, store);
  } catch (cause) {
    if (store.lease) await releaseEvalDependencyLease(store.lease);
    throw cause;
  }
  const bin = typeof packageInfo.bin === 'string' ? packageInfo.bin : packageInfo.bin?.gennady;
  assert.equal(typeof bin, 'string');
  assert.ok(!bin.startsWith('/') && !bin.split('/').includes('..'));
  put(
    cwd,
    'node_modules/.bin/gennady',
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$(dirname "$0")/../${name}/${bin.replace(/^\.\//, '')}" "$@"\n`
  );
  chmodSync(join(cwd, 'node_modules/.bin/gennady'), 0o700);
  git(cwd, 'init', '-q', '-b', 'bf3-isolated');
  git(cwd, 'add', '-A');
  git(
    cwd,
    '-c',
    'user.name=BF3 fixture',
    '-c',
    'user.email=bf3@localhost',
    'commit',
    '-qm',
    'exact approved fixture inputs'
  );
  const initial = under(cwd)
    .filter((p) => !p.includes('/.git/') && !p.includes('/node_modules/'))
    .map((p) => [relative(cwd, p), sha(readFileSync(p))] as const);
  return {
    store,
    overlay,
    initial,
    installed,
    runtimeHashes: under(installed).map(
      (p) => [relative(installed, p), sha(readFileSync(p))] as const
    ),
    inputSha256: sha(
      JSON.stringify(Object.entries(overlay).sort(([a], [b]) => a.localeCompare(b)))
    ),
  };
}
const passHandoff = (artifacts: string) =>
  `artifacts: [${artifacts}]; decisions: [none]; open: [none]; deviations: []`;
/** @purpose Prepare host reference inputs solely for causal no-model qualification. */
function noModelSolution(cwd: string, id: CaseId) {
  if (id === 'E1' || id === 'E4') {
    put(cwd, SOURCE(id), '// @spec: BF\nmodule.exports = 7;\n');
    if (id === 'E4') put(cwd, EXTRA, '// @spec: BF\nmodule.exports = 9;\n');
  } else if (id === 'E2')
    put(
      cwd,
      'gennady.yaml',
      '# Existing project settings; preserve unrelated values.\nlint:\n  scope: owned\n  commentLanguage: ru\n'
    );
  else put(cwd, '.claude/tmp/lint-proposal.json', JSON.stringify(referenceProposal));
}
/** @purpose Inspect the last canonical Verify terminal for the exact requested phase. */
function journalPass(cwd: string, phase: string) {
  const text = readFileSync(join(cwd, TASK), 'utf8');
  const evidence = [...text.matchAll(/<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/g)]
    .map((m) => JSON.parse(Buffer.from(m[1]!, 'base64url').toString('utf8')))
    .filter((v) => v.sddPhase === phase);
  return evidence.at(-1)?.state === 'PASS';
}
/** @purpose Freeze actual task audit and full-gate validation before issuing durable facts. */
function auditCommands() {
  return [
    ['sdd-task', '--group-scope', TASK],
    ['orient', '--coverage', '--task', TASK, '--stage', 'audit'],
    ['sdd-check', '--task', TASK],
    ['verify', '--phase', 'full'],
  ];
}
/** @purpose Execute every declared audit validation and fail on the first real refusal. */
function hostAudit(cwd: string, profile?: string) {
  const records = [];
  for (const args of auditCommands()) {
    const r = command(cwd, args, profile);
    records.push({ args, ...r });
    if (r.exit !== 0) return { pass: false, records };
  }
  return { pass: true, records };
}
/** @purpose Qualify the actual phase, completion, close and host audit lifecycle. */
function lifecycle(cwd: string, id: CaseId, profile?: string) {
  const records = [];
  const phases = id === 'E4' ? ['P1', 'P2'] : ['P1'];
  for (const phase of phases) {
    const v = command(cwd, ['sdd-verify', '--task', TASK, '--phase', phase], profile);
    records.push({ command: 'verify', phase, ...v });
    if (v.exit !== 0) return { pass: false, records };
    const c = command(
      cwd,
      [
        'sdd-log',
        TASK,
        'complete',
        passHandoff(phase === 'P1' ? SOURCE(id) : EXTRA),
        '--phase',
        phase,
      ],
      profile
    );
    records.push({ command: 'complete', phase, ...c });
    if (c.exit !== 0) return { pass: false, records };
  }
  if (id === 'E4') {
    for (const args of [
      ['sdd-log', TASK, 'close'],
      ['sdd-sync', TASK, TRACKER],
    ]) {
      const r = command(cwd, args, profile);
      records.push({ command: args.join(' '), ...r });
      if (r.exit !== 0) return { pass: false, records };
    }
    const audit = hostAudit(cwd, profile);
    records.push({ command: 'actual-host-audit', ...audit });
    if (!audit.pass) return { pass: false, records };
    // Fixed no-model reference code + protected input tests are reviewed by the host only after all actual checks pass.
    for (const args of [
      ['sdd-log', TASK, 'audit-receipt', 'PASS'],
      ['sdd-log', TASK, 'review-receipt', 'PASS'],
    ]) {
      const r = command(cwd, args, profile);
      records.push({ command: args.join(' '), ...r });
      if (r.exit !== 0) return { pass: false, records };
    }
  }
  return { pass: true, records };
}
/** @purpose Validate common proposal reasoning and arm-specific persistence without granting acceptance. */
function proposalCheck(cwd: string, arm: string, initialModule: string, profile?: string) {
  const path = join(cwd, '.claude/tmp/lint-proposal.json');
  const current = readFileSync(join(cwd, registry.module), 'utf8');
  const close = '<!--/SECTION:MODULE_DECISION_LOG-->';
  const offset = initialModule.indexOf(close);
  const prefix = initialModule.slice(0, offset),
    suffix = initialModule.slice(offset);
  const unchangedOtherBytes = current.startsWith(prefix) && current.endsWith(suffix);
  const inserted = unchangedOtherBytes
    ? current.slice(prefix.length, current.length - suffix.length)
    : '';
  const pendingMatch =
    /^REG-DL-1 \d{4}-\d{2}-\d{2} — decision: ([^\r\n]+) \[verdict: pending-operator\]\n$/.exec(
      inserted
    );
  let p: any;
  try {
    p = JSON.parse(
      arm === 'candidate' && pendingMatch ? pendingMatch[1]! : readFileSync(path, 'utf8')
    );
  } catch {
    return {
      commonPass: false,
      persistencePass: false,
      reason: 'proposal payload/canonical record missing or invalid',
    };
  }
  const fields = [
    'id',
    'what',
    'why',
    'where',
    'evidence',
    'alternative',
    'verify',
    'lintExemption',
  ].sort();
  const schema =
    Object.keys(p).sort().join('|') === fields.join('|') &&
    p.id === registry.id &&
    p.where === registry.source &&
    ['id', 'what', 'why', 'where', 'evidence', 'alternative', 'verify'].every(
      (k) =>
        typeof p[k] === 'string' && p[k].trim() && !/[\x00-\x1f\x7f]|\[verdict:|<!--|-->/.test(p[k])
    ) &&
    p.lintExemption?.file === registry.source &&
    JSON.stringify([...(p.lintExemption?.checks ?? [])].sort()) === '["dbc","inventory"]';
  const lint = command(cwd, ['lint', `--spec=${registry.module}`, registry.source], profile);
  const output = lint.stdout + lint.stderr;
  const codes = ['ERR_DBC_LINT_MISSING_CONTRACT', 'ERR_CLI_LINT_INVENTORY_UNDECLARED'];
  const actualCodesPresent = codes.every((code) => output.includes(code));
  const declaredEvidence =
    schema && [...codes, registry.source].every((v) => p.evidence.includes(v));
  return {
    commonPass: !!(
      schema &&
      declaredEvidence &&
      actualCodesPresent &&
      lint.exit === 1 &&
      !output.includes('EXEMPTED')
    ),
    persistencePass:
      arm === 'candidate' ? !!(pendingMatch && unchangedOtherBytes) : current === initialModule,
    persistenceExpected: arm === 'candidate' ? 'canonical-pending' : 'unsupported-not-persisted',
    lintExit: lint.exit,
    actualCodesPresent,
    reason: schema
      ? 'schema valid; actual diagnostics checked; remaining lint red'
      : 'schema mismatch',
  };
}
/** @purpose Materialize the same shell profile used by workers before qualifying installed reference commands. */
async function qualificationProfile(
  cwd: string,
  privateDir: string,
  owned: string,
  privateEvidence: string,
  snapshotRoot: string
): Promise<string> {
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const carrier = createExecutionShellCarrier({
    directory: join(privateDir, 'shell'),
    hostHome: homedir(),
    allowedReadRoots: [
      dirname(dirname(process.execPath)),
      realpathSync(join(root, 'node_modules')),
    ],
    privateRoots: [
      privateDir,
      root,
      privateEvidence,
      snapshotRoot,
      join(owned, 'dependencies'),
      defaultPackages,
    ],
    workspaceRoot: dirname(cwd),
    restrictReadsToWorkspace: true,
    path: executionPath(),
  });
  const plugin = await import(pathToFileURL(carrier.plugin).href);
  const hooks = await plugin.CleanExecutionEnvironment();
  await hooks['shell.env']({ cwd }, { env: {} });
  return join(carrier.profileDirectory, 'sdd-flow-eval-qualification.sb');
}
/** @purpose Prove correct and broken installed-runtime controls before any live reservation. */
async function qualify(
  out: string,
  owned: string,
  runtimes: Record<string, string>,
  snapshotRoot: string,
  realPaths: readonly string[],
  privateEvidence: string
) {
  const controls: any[] = [];
  for (const arm of ['baseline', 'candidate'])
    for (const id of BF3_CASES) {
      const qualificationRoot = join(owned, `qualification-${arm}-${id}`);
      const cwd = join(qualificationRoot, 'workspaces', 'sdd-flow-eval-qualification');
      const p = await workspace(cwd, runtimes[arm]!, id, owned, snapshotRoot, realPaths);
      const results: any = { arm, caseId: id, modelCalls: 0 };
      try {
        const profile = await qualificationProfile(
          cwd,
          join(qualificationRoot, 'private'),
          owned,
          privateEvidence,
          snapshotRoot
        );
        if (id === 'E1' || id === 'E4') {
          noModelSolution(cwd, id);
          const good = lifecycle(cwd, id, profile);
          results.correct = good;
          if (arm === 'candidate' || id === 'E1')
            assert.ok(
              good.pass,
              `${arm}/${id} reference lifecycle blocked: ${JSON.stringify(good).slice(-9000)}`
            );
          else results.knownBaselineCapabilityBlocked = !good.pass;
          const hostCorrect = nodeCommand(cwd, ['--test', TEST], profile);
          assert.equal(hostCorrect.exit, 0, hostCorrect.stdout + hostCorrect.stderr);
          results.hostCorrect = {
            exit: hostCorrect.exit,
            outputSha256: sha(hostCorrect.stdout + hostCorrect.stderr),
          };
          put(cwd, SOURCE(id), '// @spec: BF\nmodule.exports = 8;\n');
          const bad = command(cwd, ['sdd-verify', '--task', TASK, '--phase', 'P1'], profile);
          assert.notEqual(bad.exit, 0);
          const hostBroken = nodeCommand(cwd, ['--test', TEST], profile);
          assert.notEqual(hostBroken.exit, 0);
          results.hostBroken = {
            exit: hostBroken.exit,
            outputSha256: sha(hostBroken.stdout + hostBroken.stderr),
          };
          results.broken = { exit: bad.exit, sha256: sha(bad.stdout + bad.stderr) };
          if (arm === 'candidate') {
            put(cwd, SOURCE(id), 'module.exports = 7;\n');
            const unowned = command(cwd, ['sdd-verify', '--task', TASK, '--phase', 'P1'], profile);
            assert.notEqual(unowned.exit, 0);
            results.missingHeader = {
              exit: unowned.exit,
              sha256: sha(unowned.stdout + unowned.stderr),
            };
          }
        } else if (id === 'E2') {
          const before = command(cwd, ['lint', E2SOURCE], profile);
          results.before = { exit: before.exit, outputSha256: sha(before.stdout + before.stderr) };
          assert.equal(before.exit, 1);
          noModelSolution(cwd, id);
          const after = command(cwd, ['lint', E2SOURCE], profile);
          results.after = { exit: after.exit, outputSha256: sha(after.stdout + after.stderr) };
          if (arm === 'candidate') assert.equal(after.exit, 0, after.stdout + after.stderr);
          else results.baselineConfiguredCapability = after.exit === 0;
        } else {
          const initial = readFileSync(join(cwd, registry.module), 'utf8');
          noModelSolution(cwd, id);
          const proposal = command(
            cwd,
            [
              'sdd-log',
              registry.module,
              'decision',
              '--payload-file',
              '.claude/tmp/lint-proposal.json',
            ],
            profile
          );
          results.proposal = {
            exit: proposal.exit,
            outputSha256: sha(proposal.stdout + proposal.stderr),
          };
          if (arm === 'candidate')
            assert.equal(proposal.exit, 0, proposal.stdout + proposal.stderr);
          else assert.notEqual(proposal.exit, 0, 'frozen baseline expected unsupported');
          results.reference = proposalCheck(cwd, arm, initial, profile);
          if (arm === 'candidate')
            assert.ok(
              results.reference.commonPass && results.reference.persistencePass,
              JSON.stringify(results.reference)
            );
          else assert.equal(readFileSync(join(cwd, registry.module), 'utf8'), initial);
        }
        json(privateEvidence, `qualification-${arm}-${id}.json`, results);
        controls.push(publicQualification(results));
        json(out, 'qualification.json', {
          complete: controls.length === 8,
          modelCalls: 0,
          controls,
        });
      } finally {
        if (p.store.lease) await releaseEvalDependencyLease(p.store.lease);
        rmSync(qualificationRoot, { recursive: true, force: true });
      }
    }
  return controls;
}
/** @purpose Publish allowlisted usage fields without interpreting provider-reported zero as free. */
function publicUsage(u: any) {
  return {
    messages: u.messages,
    input: u.input,
    output: u.output,
    reasoning: u.reasoning,
    cacheRead: u.cacheRead,
    cacheWrite: u.cacheWrite,
    total: u.total,
    providerReportedCost: u.cost,
    complete: u.complete === true,
    models: u.models,
    costZeroIsNotFree: true,
  };
}
/** @purpose Project only enums, timestamps and hashes; call necessity remains independently reviewable. */
function publicEvent(e: any) {
  const args = e.command ?? e.arg ?? '';
  const cli = /\bgennady\s+(sdd-task|sdd-verify|sdd-log|sdd-sync|orient|sdd-check|lint)\b/.exec(
    args
  )?.[1];
  const cat =
    cli ??
    (e.tool === 'read' && args.includes('ai/directives/')
      ? 'directive-read'
      : e.tool === 'read'
        ? 'project-read'
        : ['write', 'edit', 'apply_patch'].includes(e.tool)
          ? 'write'
          : 'other');
  return {
    i: e.i,
    tool: e.tool,
    category: cat,
    callIdentity: sha(e.callId ?? ''),
    argumentSha256: sha(args),
    status: e.status ?? 'unknown',
    exitCode: e.exitCode ?? null,
    startedAt: e.startedAt ?? null,
    finishedAt: e.finishedAt ?? null,
    necessity: 'unknown',
    necessityBasis:
      'Independent post-run review required; tool count alone does not prove necessity.',
  };
}
/** @purpose Own one primary session, capture durable evidence and clean only after quiescence. */
async function attempt(
  index: number,
  arm: string,
  id: CaseId,
  out: string,
  owned: string,
  privateEvidence: string,
  runtimeRoot: string,
  snapshotRoot: string,
  realPaths: readonly string[]
) {
  const home = join(owned, `attempt-${index}`),
    privateDir = join(home, 'private'),
    workspaceRoot = join(home, 'workspaces'),
    cwd = join(workspaceRoot, 'sdd-flow-eval-phase');
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  mkdirSync(workspaceRoot);
  const p = await workspace(cwd, runtimeRoot, id, owned, snapshotRoot, realPaths);
  const initialModule = id === 'E3' ? readFileSync(join(cwd, registry.module), 'utf8') : '';
  let server: ReturnType<typeof spawn> | undefined,
    closed: Promise<void> | undefined,
    runtime: SddEvalOpenCodeRuntime | undefined,
    evidence: SddEvalOpenCodeEvidenceSource | undefined,
    sessionId: string | undefined;
  let safeCleanup = false;
  let baseUrl: string | undefined;
  let rawMessagesCaptured = false;
  const record: any = {
    index,
    arm,
    caseId: id,
    inputSha256: p.inputSha256,
    primaryBudgetMs: budget[id],
    sourceCommit: commits[arm as keyof typeof commits],
  };
  let pulse: { stop: () => Promise<void>; error: () => Error | undefined } | undefined;
  try {
    const carrier = createExecutionShellCarrier({
      directory: join(privateDir, 'shell'),
      hostHome: homedir(),
      allowedReadRoots: [
        dirname(dirname(process.execPath)),
        realpathSync(join(root, 'node_modules')),
      ],
      privateRoots: [
        privateDir,
        root,
        privateEvidence,
        snapshotRoot,
        join(owned, 'dependencies'),
        defaultPackages,
      ],
      workspaceRoot,
      restrictReadsToWorkspace: true,
      path: executionPath(),
    });
    const provider = JSON.parse(
      readFileSync(join(homedir(), '.config/opencode/opencode.json'), 'utf8')
    ).provider?.['llm-proxy'];
    assert.ok(provider?.models?.['deepseek-v4-flash']);
    assert.ok(process.env.LLM_PROXY_BASE_URL && process.env.LLM_PROXY_API_KEY);
    json(privateDir, 'opencode.json', {
      model: modelName,
      small_model: modelName,
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
          options: {
            ...provider.options,
            baseURL: process.env.LLM_PROXY_BASE_URL,
            apiKey: process.env.LLM_PROXY_API_KEY,
          },
          models: { 'deepseek-v4-flash': provider.models['deepseek-v4-flash'] },
        },
      },
    });
    const reservation = createServer();
    await new Promise<void>((done, reject) =>
      reservation.once('error', reject).listen(0, '127.0.0.1', done)
    );
    const port = (reservation.address() as any).port;
    await new Promise<void>((done) => reservation.close(() => done()));
    assert.ok(port >= 4097);
    const env = {
      ...process.env,
      OPENCODE_CONFIG: join(privateDir, 'opencode.json'),
      OPENCODE_DISABLE_SHARE: 'true',
      SHELL: carrier.shell,
    };
    for (const k of ['CONFIG', 'DATA', 'CACHE', 'STATE'])
      Object.assign(env, { [`XDG_${k}_HOME`]: join(privateDir, k.toLowerCase()) });
    server = spawn(
      'opencode',
      ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--log-level', 'WARN'],
      { cwd: home, env, detached: true, stdio: 'ignore' }
    );
    closed = new Promise<void>((done) => server!.once('close', () => done()));
    baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1000) })
        .then((r) => r.ok)
        .catch(() => false);
      if (!ready) await delay(500);
    }
    assert.ok(ready, 'owned server unavailable');
    const registryMap = new SddEvalSessionDirectoryMap();
    const client = createSddEvalOpenCodeClient({ baseUrl, directory: cwd });
    runtime = new SddEvalOpenCodeRuntime({ baseUrl, directory: cwd, registry: registryMap });
    const eventStop = new AbortController();
    evidence = new SddEvalOpenCodeEvidenceSource({
      baseUrl,
      directory: cwd,
      registry: registryMap,
      eventSignal: eventStop.signal,
    });
    sessionId = (await runtime.createSession({ title: `BF3-${index}`, directory: cwd })).id;
    if (p.store.lease) pulse = startEvalDependencyLeaseHeartbeat(p.store.lease);
    const start = performance.now();
    const capability =
      id === 'E3'
        ? `\nCAPABILITY_FACT: module proposal persistence ${arm === 'candidate' ? 'SUPPORTED' : 'UNSUPPORTED'} in this installed runtime. ${arm === 'baseline' ? 'Do not call unsupported module persistence; produce the substantive JSON proposal and report not persisted.' : 'Record canonical pending proposal after preparing the JSON.'}`
        : '';
    assert.equal(
      existsSync(join(out, `dispatches/${index}.json`)),
      false,
      'position already dispatched'
    );
    json(out, `dispatches/${index}.json`, {
      index,
      arm,
      caseId: id,
      model: modelName,
      at: new Date().toISOString(),
    });
    await runtime.prompt({
      sessionId,
      directory: cwd,
      model,
      text: 'Read inputs/brief.md and complete its bounded request. ' + capability,
    });
    let state = 'running',
      forbidden = false,
      providerError = false,
      consentSent = false,
      configUnchangedBeforeApproval: boolean | undefined,
      p2Sent = false;
    const transitions: any[] = [];
    const observations: any[] = [];
    while (performance.now() - start < budget[id]) {
      stop.signal.throwIfAborted();
      if (pulse?.error()) throw pulse.error();
      await delay(5000);
      state = await evidence.readStatus(sessionId);
      const trace = await evidence.readTrajectory(sessionId);
      const events = toolEventsFrom(trace.entries);
      const messages = await client.session.messages({
        path: { id: sessionId },
        query: { directory: cwd, limit: 2 },
        signal: AbortSignal.timeout(10000),
      });
      providerError = messages.data?.some((m) => !!(m.info as any).error) ?? false;
      forbidden = events.some((e) => {
        const v = `${e.command ?? ''} ${e.arg ?? ''}`;
        return (
          /(?:cat|sed|grep|rg|read|head|tail)\s+[^\n]*node_modules\/(?:gennady|@mail-core)|--no-verify|git\s+(?:commit|push|reset)|npm\s+(?:install|publish)|\bdeviation-verdict\b/i.test(
            v
          ) ||
          (e.tool === 'read' && /node_modules\/(?:gennady|@mail-core)|\/dist\//.test(v))
        );
      });
      observations.push({ elapsedMs: Math.round(performance.now() - start), state, forbidden });
      console.log(
        `[BF3] ${index + 1}/8 ${arm}/${id} ${Math.round((performance.now() - start) / 1000)}s ${state}`
      );
      if (providerError || forbidden) break;
      if (state === 'completed' && id === 'E2' && !consentSent) {
        const text = JSON.stringify(trace.entries.slice(-3));
        const unchanged =
          readFileSync(join(cwd, 'gennady.yaml'), 'utf8') === p.overlay['gennady.yaml'];
        const approval =
          /approv|consent|соглас|разреш|подтверд/i.test(text) &&
          /commentLanguage|comment.language|язык|Russian|русск/i.test(text);
        transitions.push({
          type: 'consent-check',
          elapsedMs: Math.round(performance.now() - start),
          unchanged,
          approvalRequestObserved: approval,
        });
        if (unchanged && approval) {
          configUnchangedBeforeApproval = unchanged;
          consentSent = true;
          json(privateEvidence, `${index}-operator-response.json`, {
            hostOwned: true,
            text: CONSENT_REPLY,
          });
          await runtime.prompt({
            sessionId,
            directory: cwd,
            model,
            text: CONSENT_REPLY,
          });
          state = 'running';
          continue;
        }
      }
      if (state === 'completed' && id === 'E4' && !p2Sent) {
        const profile = join(carrier.profileDirectory, 'sdd-flow-eval-phase.sb');
        const header = /^\s*\/\/\s*@spec:\s*BF\s*$/m.test(
          readFileSync(join(cwd, SOURCE(id)), 'utf8')
        );
        const verified = journalPass(cwd, 'P1');
        const protectedOk = p.initial.every(
          ([path, digest]) =>
            path === SOURCE(id) ||
            path === TASK ||
            (existsSync(join(cwd, path)) && sha(readFileSync(join(cwd, path))) === digest)
        );
        if (header && verified && protectedOk) {
          const c = command(
            cwd,
            ['sdd-log', TASK, 'complete', passHandoff(SOURCE(id)), '--phase', 'P1'],
            existsSync(profile) ? profile : undefined
          );
          transitions.push({
            type: 'host-P1-complete',
            exit: c.exit,
            outputSha256: sha(c.stdout + c.stderr),
            elapsedMs: Math.round(performance.now() - start),
          });
          json(privateEvidence, `${index}-host-P1-complete.json`, c);
          if (c.exit === 0) {
            p2Sent = true;
            await runtime.prompt({
              sessionId,
              directory: cwd,
              model,
              text: `Host orchestrator completed P1 after checking actual evidence. Now dispatch ONLY P2 of ${TASK}; obtain its actual installed phase context. Implement ${EXTRA} exactly9, keep P1 unchanged, use actual canonical Verify P2 and return typed Handoff. Host owns completion/close/sync/audit/review.`,
            });
            state = 'running';
            continue;
          }
        }
      }
      if (state === 'completed') break;
    }
    if (state !== 'completed' || forbidden) await runtime.abort(sessionId);
    const q = await evidence.readQuiescence(sessionId, { timeoutMs: 10000, stableIntervalMs: 100 });
    assert.ok(q.complete, 'writer quiescence unproven');
    const workerElapsedMs = Math.round(performance.now() - start);
    const trace = await evidence.readTrajectory(sessionId);
    const events = toolEventsFrom(trace.entries);
    const usage = await evidence.readUsage(sessionId);
    assert.ok((usage.models ?? []).every((v) => v === modelName));
    const rawMessages = await capturePrivateSessionMessages({
      baseUrl,
      sessionId,
      directory: cwd,
      file: join(privateEvidence, `${index}-primary-server-messages.json.gz`),
    });
    rawMessagesCaptured = true;
    const approval = findHostConsentApproval(rawMessages.messages, CONSENT_REPLY, consentSent);
    const configEdits = events.filter(
      (e) => ['edit', 'write', 'apply_patch'].includes(e.tool) && /gennady\.yaml/.test(e.arg ?? '')
    );
    const opaqueMutation =
      events.some(
        (e) =>
          e.tool === 'bash' &&
          !/^\s*npx\s+(?:--no-install\s+)?gennady\s+lint\s+[^;&|`\n$<>]*$/.test(e.command ?? '')
      ) || events.some((e) => e.tool === 'bash' && /--autofix/.test(e.command ?? ''));
    const consentFact =
      id === 'E2'
        ? assessConsentOrder({
            approval,
            edits: configEdits.map((e) => ({
              callId: e.callId ?? '',
              clock: 'opencode-server-epoch-ms',
              epochMs: e.startedAt,
            })),
            editEvidenceComplete: trace.coverage.complete && !opaqueMutation,
            configUnchangedBeforeApproval,
          })
        : null;
    if (consentFact)
      json(privateEvidence, `${index}-host-consent-fact.json`, { approval, consentFact });
    const publicConsentFact = consentFact
      ? {
          ...consentFact,
          approvalMessageId: undefined,
          approvalMessageIdentity: consentFact.approvalMessageId
            ? sha(consentFact.approvalMessageId)
            : null,
          editOffsetsFromApprovalMs: consentFact.editOffsetsFromApprovalMs.map((e) => ({
            callIdentity: sha(e.callId),
            offsetMs: e.offsetMs,
          })),
        }
      : null;
    const profile = join(carrier.profileDirectory, 'sdd-flow-eval-phase.sb');
    const allowed = new Set(
      id === 'E3'
        ? ['.claude/tmp/lint-proposal.json', registry.module]
        : id === 'E2'
          ? ['gennady.yaml']
          : [SOURCE(id), TASK, ...(id === 'E4' ? [EXTRA] : [])]
    );
    const changed = git(cwd, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
    const newFiles = git(cwd, 'ls-files', '--others', '--exclude-standard')
      .split('\n')
      .filter(Boolean);
    const protectedOk = p.initial.every(
      ([path, digest]) =>
        allowed.has(path) ||
        (existsSync(join(cwd, path)) && sha(readFileSync(join(cwd, path))) === digest)
    );
    const runtimeIntact = p.runtimeHashes.every(
      ([path, digest]) =>
        existsSync(join(p.installed, path)) && sha(readFileSync(join(p.installed, path))) === digest
    );
    const boundary =
      protectedOk &&
      runtimeIntact &&
      [...changed, ...newFiles].every(
        (path) => allowed.has(path) || path.startsWith('.claude/tmp/')
      );
    let functional = false,
      domainPass = false;
    let oracle: any = {};
    let hostLifecycle: any = null;
    if (id === 'E3') {
      oracle = existsSync(profile)
        ? proposalCheck(cwd, arm, initialModule, profile)
        : { commonPass: false, persistencePass: false, reason: 'profile unavailable' };
      functional = oracle.commonPass;
      domainPass = oracle.commonPass && oracle.persistencePass;
    } else if (id === 'E2') {
      const actual = readFileSync(join(cwd, 'gennady.yaml'), 'utf8');
      const exactDiff = minimalCommentLanguageDiff(p.overlay['gennady.yaml']!, actual);
      const sourceUnchanged = readFileSync(join(cwd, E2SOURCE), 'utf8') === e2source;
      const lint = existsSync(profile)
        ? command(cwd, ['lint', E2SOURCE], profile)
        : { exit: null, stdout: '', stderr: '' };
      oracle = {
        exactDiff,
        sourceUnchanged,
        consentSent,
        lintExit: lint.exit,
        outputSha256: sha(lint.stdout + lint.stderr),
      };
      functional = sourceUnchanged;
      domainPass =
        exactDiff &&
        sourceUnchanged &&
        consentSent &&
        consentFact?.status === 'approved-before-observed-edits' &&
        lint.exit === 0;
    } else {
      const f = existsSync(profile)
        ? nodeCommand(cwd, ['--test', TEST], profile)
        : { exit: null, stdout: '', stderr: '' };
      const second =
        id === 'E4' && existsSync(join(cwd, EXTRA)) && existsSync(profile)
          ? nodeCommand(
              cwd,
              [
                '--input-type=commonjs',
                '--eval',
                `require('node:assert/strict').equal(require('./${EXTRA}'),9)`,
              ],
              profile
            )
          : null;
      functional = f.exit === 0 && (id !== 'E4' || second?.exit === 0);
      const owner =
        /^\s*\/\/\s*@spec:\s*BF\s*$/m.test(readFileSync(join(cwd, SOURCE(id)), 'utf8')) &&
        (id !== 'E4' ||
          (existsSync(join(cwd, EXTRA)) &&
            /^\s*\/\/\s*@spec:\s*BF\s*$/m.test(readFileSync(join(cwd, EXTRA), 'utf8'))));
      const verify = journalPass(cwd, 'P1') && (id !== 'E4' || journalPass(cwd, 'P2'));
      oracle = {
        functionalExit: f.exit,
        ownerCorrect: owner,
        canonicalPassJournal: verify,
        phase2Dispatched: p2Sent,
        outputSha256: sha(f.stdout + f.stderr),
      };
      domainPass = functional && owner && verify && (id !== 'E4' || p2Sent);
      if (domainPass && boundary && !forbidden && existsSync(profile)) {
        const complete = command(
          cwd,
          [
            'sdd-log',
            TASK,
            'complete',
            passHandoff(id === 'E4' ? EXTRA : SOURCE(id)),
            '--phase',
            id === 'E4' ? 'P2' : 'P1',
          ],
          profile
        );
        hostLifecycle = { complete };
        if (complete.exit !== 0) domainPass = false;
        if (id === 'E4' && complete.exit === 0) {
          const checks = [];
          for (const args of [
            ['sdd-log', TASK, 'close'],
            ['sdd-sync', TASK, TRACKER],
            ...auditCommands(),
            ['sdd-log', TASK, 'audit-receipt', 'PASS'],
          ]) {
            const r = command(cwd, args, profile);
            checks.push({ args, ...r });
            if (r.exit !== 0) {
              domainPass = false;
              break;
            }
          }
          hostLifecycle.checks = checks;
        }
      }
    }
    const primary = {
      terminal: providerError
        ? 'worker-error'
        : forbidden
          ? 'policy-censored'
          : state === 'completed'
            ? 'completed-worker'
            : 'budget-exhausted',
      elapsedMs: Math.round(performance.now() - start),
      workerElapsedMs,
      endToEndMs: Math.round(performance.now() - start),
      usage: publicUsage(usage),
      privateRawMessagesCapture: rawMessages.capture,
      consentFact: publicConsentFact,
      toolCalls: events.length,
      traceComplete: trace.coverage.complete,
      writeBoundary: boundary,
      runtimeIntact,
      providerError,
      trajectoryStatus: forbidden || !boundary ? 'violated' : 'not-proven',
      functional,
      domainPass,
      oracle,
      transitions,
      events: events.map((e) => publicEvent(e)),
      observations,
    };
    const artifactExcerpts =
      id === 'E3'
        ? {
            module: readFileSync(join(cwd, registry.module), 'utf8'),
            proposal: existsSync(join(cwd, '.claude/tmp/lint-proposal.json'))
              ? readFileSync(join(cwd, '.claude/tmp/lint-proposal.json'), 'utf8')
              : null,
          }
        : id === 'E2'
          ? {
              config: readFileSync(join(cwd, 'gennady.yaml'), 'utf8'),
              source: readFileSync(join(cwd, E2SOURCE), 'utf8'),
            }
          : {
              source: readFileSync(join(cwd, SOURCE(id)), 'utf8'),
              second: existsSync(join(cwd, EXTRA)) ? readFileSync(join(cwd, EXTRA), 'utf8') : null,
            };
    json(privateEvidence, `${index}-primary.json`, {
      primary,
      trace,
      usage,
      artifactExcerpts,
      sourceDiff: git(cwd, 'diff', '--binary', 'HEAD'),
      proposal:
        id === 'E3' && existsSync(join(cwd, '.claude/tmp/lint-proposal.json'))
          ? readFileSync(join(cwd, '.claude/tmp/lint-proposal.json'), 'utf8')
          : null,
      hostLifecycle,
    });
    Object.assign(record, primary, {
      privateEvidenceSha256: sha(readFileSync(join(privateEvidence, `${index}-primary.json`))),
    });
    let judgeSession: string | undefined;
    const judge = await runtime
      .judge({
        directory: cwd,
        model,
        readOnly: true,
        onSession: (id) => (judgeSession = id),
        signal: AbortSignal.timeout(90000),
        prompt: `Independent read-only reviewer. This is one preregistered BF3 case ${id}, ${arm}. Do NOT judge baseline API absence as model regression. E3 common requirement: concrete evidence-backed scoped proposal without acceptance or weakening; candidate persists pending, baseline explicitly unsupported leaves JSON for operator. E2 host consent must precede exact policy diff. E1/E4 actual function + ownership + canonical phase evidence and no unrelated edits; E4 host owns completion/close/sync/audit/review, these are host validation not agent achievements. Return JSON {verdict:"pass"|"fail"|"unknown",reason:"brief factual account",unnecessaryCalls:[],uncertainties:[]}; no tools. Use only consentFact for temporal consent assessment; observation/transition elapsedMs have a different origin and must never be compared to edit offsets. FACTS:${JSON.stringify(primary).slice(0, 45000)}\nARTIFACTS:${JSON.stringify(artifactExcerpts).slice(0, 20000)}\nTAIL:${JSON.stringify(trace.entries.slice(-3)).slice(0, 22000)}`,
      })
      .catch(() => '{"verdict":"unknown","reason":"judge unavailable or timed out"}');
    json(privateEvidence, `${index}-judge.json`, { text: judge });
    record.judgeVerdict = /"verdict"\s*:\s*"(pass|fail|unknown)"/.exec(judge)?.[1] ?? 'unknown';
    record.judgeSha256 = sha(judge);
    record.judgeUsage = judgeSession ? publicUsage(await evidence.readUsage(judgeSession)) : null;
    if (
      id === 'E4' &&
      domainPass &&
      boundary &&
      !forbidden &&
      record.judgeVerdict === 'pass' &&
      existsSync(profile)
    ) {
      const review = command(cwd, ['sdd-log', TASK, 'review-receipt', 'PASS'], profile);
      record.hostReviewReceipt = {
        exit: review.exit,
        source: 'independent-readonly-model-review-after-actual-host-audit',
        outputSha256: sha(review.stdout + review.stderr),
      };
      json(privateEvidence, `${index}-host-review.json`, review);
      if (review.exit !== 0) record.domainPass = false;
    } else if (id === 'E4')
      record.hostReviewReceipt = {
        exit: null,
        source: 'not-issued-without-qualified-independent-review',
      };
    const before = await evidence.readUsage(sessionId);
    const reflection = await runtime
      .judge({
        sessionId,
        directory: cwd,
        model,
        readOnly: true,
        signal: AbortSignal.timeout(60000),
        prompt:
          'Measured task is finished; primary evidence frozen. No tools or edits. Give factual public reflection, not hidden reasoning. JSON {helped:[],friction:[],uncertainties:[],nextHypothesis:""}. Which tool outputs/instructions helped, which calls were avoidable, what blocked completion? Cite observed actions, say unknown instead of invented causes. Max300words.',
      })
      .catch(() => '{"status":"unavailable-or-timeout"}');
    const after = await evidence.readUsage(sessionId);
    json(privateEvidence, `${index}-reflection.json`, { text: reflection });
    record.reflection = {
      sha256: sha(reflection),
      tokens: after.total - before.total,
      messages: after.messages - before.messages,
    };
    const quiet = await evidence.readQuiescence(sessionId, { timeoutMs: 10000 });
    assert.ok(quiet.complete);
    eventStop.abort();
    safeCleanup = true;
    return record;
  } catch (cause) {
    put(
      privateEvidence,
      `${index}-failure.txt`,
      cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    );
    if (!rawMessagesCaptured && baseUrl && sessionId) {
      const raw = await capturePrivateSessionMessages({
        baseUrl,
        sessionId,
        directory: cwd,
        file: join(privateEvidence, `${index}-partial-server-messages.json.gz`),
      }).catch(() => undefined);
      record.privateRawMessagesCapture = raw?.capture ?? {
        privateOnly: true,
        messagesComplete: false,
        issue: 'capture-unavailable',
      };
    }
    if (existsSync(join(out, `dispatches/${index}.json`))) {
      record.terminal = 'infrastructure-error-after-dispatch';
      record.primarySpent = true;
      record.failureSha256 = sha(readFileSync(join(privateEvidence, `${index}-failure.txt`)));
      if (sessionId && evidence) {
        const trace = await evidence.readTrajectory(sessionId).catch(() => null);
        const usage = await evidence.readUsage(sessionId).catch(() => null);
        json(privateEvidence, `${index}-partial.json`, {
          trace,
          usage,
          failureSha256: record.failureSha256,
        });
        if (usage) record.usage = publicUsage(usage);
        record.privatePartialSha256 = sha(
          readFileSync(join(privateEvidence, `${index}-partial.json`))
        );
      }
      json(out, `records/${index}.json`, record);
    }
    throw cause;
  } finally {
    if (pulse) await pulse.stop();
    if (!server && !sessionId) safeCleanup = true;
    if (server?.pid) {
      if (!safeCleanup && sessionId && runtime && evidence) {
        await runtime.abort(sessionId).catch(() => {});
        safeCleanup = (
          await evidence
            .readQuiescence(sessionId, { timeoutMs: 10000 })
            .catch(() => ({ complete: false }))
        ).complete;
      }
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {}
      await Promise.race([closed, delay(3000)]);
      try {
        process.kill(-server.pid, 0);
        process.kill(-server.pid, 'SIGKILL');
      } catch {}
      await Promise.race([closed, delay(3000)]);
      try {
        process.kill(-server.pid, 0);
        safeCleanup = false;
      } catch {}
    }
    if (safeCleanup) {
      const byteCount = under(home).reduce((sum, path) => sum + lstatSync(path).size, 0);
      if (p.store.lease) await releaseEvalDependencyLease(p.store.lease);
      rmSync(home, { recursive: true, force: true });
      record.cleanup = {
        safeCleanup: true,
        rootRemoved: !existsSync(home),
        logicalBytesRemoved: byteCount,
        sharedDependenciesPreserved: existsSync(realpathSync(join(root, 'node_modules'))),
      };
      if (record.primarySpent) json(out, `records/${index}.json`, record);
    } else throw new Error(`BF3 cleanup unproven at position${index}; stop queue`);
  }
}
/** @purpose Freeze exact inputs and execute at most the eight preregistered primary positions. */
async function main() {
  const [mode, outArg] = process.argv.slice(2);
  assert.ok(
    ['--qualify-only', '--live'].includes(mode ?? '') && outArg && process.argv.length === 4,
    'mode and NEW output directory required'
  );
  const out = resolve(outArg);
  assert.ok(!existsSync(out), 'new output required; no replacement');
  mkdirSync(out, { recursive: true });
  const owned = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-bf3-'))),
    privateEvidence = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-bf3-evidence-')));
  chmodSync(privateEvidence, 0o700);
  let clean = true,
    stage = 'snapshot';
  const records: any[] = [];
  try {
    assert.ok(
      process.env.GENNADY_BF3_REAL_REPO && process.env.GENNADY_BF3_PACKAGE_ROOT,
      'GENNADY_BF3_REAL_REPO and GENNADY_BF3_PACKAGE_ROOT are required'
    );
    const actualGit = realpathSync(
      execFileSync('/usr/bin/xcrun', ['--find', 'git'], { encoding: 'utf8', timeout: 10000 }).trim()
    );
    assert.equal(basename(actualGit), 'git', 'host toolchain resolution must return Git');
    gitToolchainDirectory = dirname(actualGit);
    const gitToolchainSha256 = sha(readFileSync(actualGit));
    const source = realpathSync(process.env.GENNADY_BF3_REAL_REPO);
    const manifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'));
    commits = { baseline: manifest.baseline.commit, candidate: manifest.candidate.commit };
    assert.equal(
      commits.baseline,
      '6e19167e0c756b5e136dd3a9e5a597280c78c2e9',
      'baseline is frozen'
    );
    assert.ok(/^[a-f0-9]{40}$/.test(commits.candidate));
    assert.equal(
      git(root, 'rev-parse', 'HEAD'),
      commits.candidate,
      'candidate runtime must bind current reviewed HEAD'
    );
    const sourceOverlay = git(root, 'status', '--porcelain') !== '';
    if (mode === '--live') {
      assert.equal(sourceOverlay, false, 'clean candidate required before live dispatch');
      assert.notEqual(
        manifest.candidate.sourceOverlay,
        true,
        'overlay runtime is qualification-only'
      );
    }
    const sourceOverlaySha256 = sourceOverlay
      ? sha(execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: root, maxBuffer: 32000000 }))
      : null;
    const snapshotRoot = join(owned, 'snapshot');
    const real = snapshot(snapshotRoot, source);
    json(privateEvidence, 'source-manifest.json', real.manifest);
    const runtimes = {
      baseline: resolve(defaultPackages, manifest.baseline.runtime),
      candidate: resolve(defaultPackages, manifest.candidate.runtime),
    };
    for (const arm of ['baseline', 'candidate'] as const) {
      assert.equal(
        sha(readFileSync(join(runtimes[arm], 'dist/gennady.js'))),
        manifest[arm].entrySha256,
        'installed entry bytes must match package manifest'
      );
    }
    const schedule = BF3_CASES.flatMap((caseId, index) =>
      (index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']).map((arm) => ({
        caseId,
        arm,
      }))
    );
    const pendingHarness = [import.meta.filename];
    const harnessPaths = new Set<string>([join(root, 'package-lock.json')]);
    while (pendingHarness.length) {
      const path = pendingHarness.pop()!;
      if (harnessPaths.has(path)) continue;
      assert.ok(!relative(root, path).startsWith('..'), 'harness import escaped repository');
      harnessPaths.add(path);
      const code = readFileSync(path, 'utf8');
      for (const match of code.matchAll(/\b(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
        const imported = resolve(dirname(path), match[1]!);
        if (imported.endsWith('.ts') && existsSync(imported)) pendingHarness.push(imported);
      }
    }
    const hashes = [...harnessPaths]
      .sort()
      .map((path) => ({ path: relative(root, path), sha256: sha(readFileSync(path)) }));
    json(out, 'protocol.json', {
      schema: 'gennady.brownfield-bf3.2',
      measurementRevision: 'post-eight-attempt-campaign; no old outcome replay',
      gitToolchain: {
        selection: 'host xcrun --find git before sandbox',
        binarySha256: gitToolchainSha256,
        environmentChange: 'PATH precedence only; no sandbox permission change',
      },
      commits,
      sourceOverlay,
      sourceOverlaySha256,
      runtimeSourceOverlay: manifest.candidate.sourceOverlay === true,
      nodeVersion: process.version,
      nodeAbi: process.versions.modules,
      packageEntrypointHashes: {
        baseline: manifest.baseline.entrySha256,
        candidate: manifest.candidate.entrySha256,
      },
      model: modelName,
      primaryAttempts: mode === '--live' ? 8 : 0,
      replacements: 0,
      concurrency: 1,
      budgetMs: budget,
      schedule,
      harness: hashes,
      source: real.identity,
      packageManifestSha256: sha(readFileSync(packageManifestPath)),
      fixtureHashes: BF3_CASES.map((id) => ({
        caseId: id,
        sha256: sha(
          JSON.stringify(
            Object.entries(files(id, id === 'E2' ? real.sourcePaths : [])).sort(([a], [b]) =>
              a.localeCompare(b)
            )
          )
        ),
      })),
      E3Comparison:
        'Common evidence-backed proposal/safety; baseline persistence unsupported known before dispatch; candidate pending persistence is product capability, not behavioral superiority.',
      E4Scope:
        'Two phase workers in one primary session; host completes phases/close/sync/audit/review after checking actual evidence. Host validations are not agent achievements.',
      publicPolicy:
        'Only numeric/enum/hash allowlist; private source/diffs/raw/transcripts retained locally outsideGit.',
      limitations: [
        'One attempt per case/arm; no statistical noninferiority/universalcostwin.',
        'Synthetic isolated task in exact real source snapshot; not full Octavius build.',
        'Ordinary roles not actor authentication.',
        'Timeline necessity initially unknown pending independent post-run review.',
        'Toolcalls are not HTTPrequests; APIrequestcount unknown unless transport observed.',
        'Total tokens exclude cachereads; providerreportedcost0notfree.',
      ],
    });
    stage = 'qualification';
    await qualify(out, owned, runtimes, snapshotRoot, real.sourcePaths, privateEvidence);
    if (mode === '--live') {
      assert.ok(
        process.env.LLM_PROXY_BASE_URL && process.env.LLM_PROXY_API_KEY,
        'approved proxy environment missing'
      );
      for (const [index, entry] of schedule.entries()) {
        stop.signal.throwIfAborted();
        assert.ok(
          hashes.every((v) => sha(readFileSync(join(root, v.path))) === v.sha256),
          'harness changed after freeze'
        );
        const disk = statfsSync(owned);
        assert.ok(
          Number(disk.bavail) * Number(disk.bsize) >= 3 * 1024 ** 3,
          'less than3GiB free before primary dispatch'
        );
        stage = `attempt-${index}-${entry.arm}-${entry.caseId}`;
        json(out, `reservations/${index}.json`, {
          index,
          ...entry,
          status: 'started',
          at: new Date().toISOString(),
        });
        const r = await attempt(
          index,
          entry.arm,
          entry.caseId,
          out,
          owned,
          privateEvidence,
          runtimes[entry.arm as keyof typeof runtimes],
          snapshotRoot,
          real.sourcePaths
        );
        records.push(r);
        json(out, `records/${index}.json`, r);
        json(out, 'progress.json', {
          planned: 8,
          recorded: records.length,
          replacements: 0,
          records,
        });
        assert.ok(r.cleanup.safeCleanup);
        assert.ok(
          r.usage.messages > 0 &&
            r.usage.models.every((m: string) => m === modelName) &&
            !r.providerError,
          'transport/model failed; no replacement/fallback'
        );
      }
    }
    json(out, 'report.json', {
      planned: mode === '--live' ? 8 : 0,
      recorded: records.length,
      replacements: 0,
      complete: mode === '--live' && records.length === 8,
      modelBehaviorWinClaimed: false,
      records,
    });
  } catch (cause) {
    put(
      privateEvidence,
      'failure.txt',
      cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    );
    json(out, 'failure.json', {
      stage,
      errorSha256: sha(readFileSync(join(privateEvidence, 'failure.txt'))),
      recorded: records.length,
      dispatchedPrimaryPositions: existsSync(join(out, 'dispatches'))
        ? readdirSync(join(out, 'dispatches')).length
        : 0,
      replacements: 0,
      fallback: false,
    });
    console.error('[BF3]STOP', stage);
    process.exitCode = 1;
    clean = !readdirSync(owned).some((x) => x.startsWith('attempt-'));
  } finally {
    if (clean) rmSync(owned, { recursive: true, force: true });
    json(out, 'cleanup.json', {
      safeCleanup: clean,
      rootRemoved: !existsSync(owned),
      compactEvidencePrivate: true,
    });
    console.log(
      JSON.stringify({
        privateEvidence,
        publicOutput: out,
        recorded: records.length,
        safeCleanup: clean,
      })
    );
  }
}
await main();
