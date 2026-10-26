// @file: No-model OpenCode shell isolation research using only owned fake credentials and SDK shell calls.
// @spec: AI-SKILLS
// @consumers: execution-autonomy campaign preflight research; never reads operator configuration

import assert from 'node:assert/strict';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createExecutionShellCarrier } from './execution-autonomy-shell-carrier.ts';
import { provisionScenarioDirectories } from '../provision.ts';
import { executionAutonomyCase, executionAutonomyScenario } from '../execution-autonomy-cases.ts';

if (!process.argv[2]) throw new Error('Require a NEW sanitized public JSON report path');
const reportPath = resolve(process.argv[2]);
if (existsSync(reportPath)) throw new Error('Canary reports are never silently replaced');
mkdirSync(dirname(reportPath), { recursive: true });
const sourceRoot = resolve(import.meta.dirname, '../../..');
const owned = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-shell-canary-')));
const privateDir = join(owned, 'private');
let workspace = join(owned, 'workspace');
const workerHome = join(owned, 'worker-home');
const workerTmp = join(owned, 'worker-tmp');
for (const path of [privateDir, workspace, workerHome, workerTmp]) mkdirSync(path, { mode: 0o700 });
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const path = `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
const marker = join(privateDir, 'hook-mode');
const configPath = join(privateDir, 'opencode.json');
const pluginPath = join(privateDir, 'env-plugin.mjs');
const fakeUserData = join(owned, 'fake-user-data');
const fakeSharedDependencies = join(owned, 'fake-shared-dependencies');
mkdirSync(fakeUserData);
mkdirSync(fakeSharedDependencies);
writeFileSync(join(fakeUserData, 'canary.txt'), 'fake-user-data-canary\n');
const carrier = createExecutionShellCarrier({
  directory: join(privateDir, 'carrier'),
  hostHome: homedir(),
  allowedReadRoots: [
    realpathSync(join(sourceRoot, 'node_modules')),
    dirname(dirname(realpathSync(process.execPath))),
  ],
  privateRoots: [privateDir, fakeUserData],
  workspaceRoot: workspace,
  path,
});
const results: Record<string, unknown> = {
  modelCalls: 0,
  canaryOnly: true,
  node: process.version,
  hostHomePolicy: 'deny read/write; exact toolchain/package roots read-only',
};
let child: ReturnType<typeof spawn> | undefined;
let closed: Promise<void> | undefined;
let safeCleanup = true;
let privatePort = 0;

writeFileSync(
  pluginPath,
  `
import {readFileSync} from 'node:fs';
export const CanaryEnv = async () => ({
  'shell.env': async (_input, output) => {
    const mode=readFileSync(${JSON.stringify(marker)},'utf8');
    if(mode==='delete') delete output.env.CANARY_SECRET;
    if(mode==='undefined') output.env.CANARY_SECRET=undefined;
    if(mode==='scrub') for(const key of Object.keys(process.env)) output.env[key]=undefined;
  }
});
`
);

async function stopServer(): Promise<void> {
  if (!child?.pid) return;
  const pid = child.pid;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    /* already stopped */
  }
  await Promise.race([closed, delay(1500)]);
  try {
    process.kill(-pid, 0);
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* group gone */
  }
  await Promise.race([closed, delay(1500)]);
  try {
    process.kill(-pid, 0);
    safeCleanup = false;
  } catch {
    /* confirmed group gone */
  }
  child = undefined;
}

async function startServer(isolate: boolean) {
  const reservation = createServer();
  await new Promise<void>((done, reject) =>
    reservation.once('error', reject).listen(0, '127.0.0.1', done)
  );
  const address = reservation.address();
  assert.ok(address && typeof address === 'object' && address.port >= 4097);
  const port = address.port;
  privatePort = port;
  await new Promise<void>((done) => reservation.close(() => done()));
  writeFileSync(
    configPath,
    JSON.stringify({
      model: 'canary/never-called',
      small_model: 'canary/never-called',
      share: 'disabled',
      plugin: [new URL(`file://${isolate ? carrier.plugin : pluginPath}`).href],
      shell: isolate ? carrier.shell : '/bin/bash',
      permission: { '*': 'allow', external_directory: 'deny', question: 'deny' },
      provider: {
        canary: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:1/v1',
            apiKey: 'canary-provider-not-a-real-secret',
          },
          models: { 'never-called': { name: 'No-model canary' } },
        },
      },
    }),
    { mode: 0o600 }
  );
  const env: NodeJS.ProcessEnv = {
    PATH: path,
    HOME: join(owned, 'server-home'),
    TMPDIR: workerTmp,
    XDG_CONFIG_HOME: join(owned, 'xdg-config'),
    XDG_DATA_HOME: join(owned, 'xdg-data'),
    XDG_CACHE_HOME: join(owned, 'xdg-cache'),
    XDG_STATE_HOME: join(owned, 'xdg-state'),
    OPENCODE_CONFIG: configPath,
    OPENCODE_DISABLE_SHARE: 'true',
    OPENCODE_DISABLE_MODELS_FETCH: 'true',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
    OPENCODE_DISABLE_AUTOUPDATE: 'true',
    OPENCODE_SKIP_DEPENDENCIES: 'true',
    CANARY_SECRET: 'canary-environment-not-a-real-secret',
    SHELL: isolate ? carrier.shell : '/bin/bash',
  };
  child = spawn(
    '/opt/homebrew/bin/opencode',
    ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--log-level', 'ERROR'],
    { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const current = child;
  let logs = '';
  current.stdout?.on('data', (data) => {
    logs = (logs + String(data)).slice(-3000);
  });
  current.stderr?.on('data', (data) => {
    logs = (logs + String(data)).slice(-3000);
  });
  closed = new Promise((done) => current.once('close', () => done()));
  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (current.exitCode !== null || current.signalCode !== null)
      throw new Error(`Canary server exited: ${logs}`);
    ready = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(500) })
      .then((r) => r.ok)
      .catch(() => false);
    if (ready) break;
    await delay(100);
  }
  assert.equal(ready, true, `Canary server health unavailable: ${logs}`);
  const client = createOpencodeClient({ baseUrl, directory: workspace });
  const session = await client.session.create({
    body: { title: 'Owned no-model shell canary' },
    query: { directory: workspace },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(session.data?.id, JSON.stringify(session.error));
  const sessionId = session.data.id;
  return async (command: string) => {
    const response = await client.session.shell({
      path: { id: sessionId },
      query: { directory: workspace },
      body: { agent: 'build', model: { providerID: 'canary', modelID: 'never-called' }, command },
      signal: AbortSignal.timeout(10_000),
    });
    assert.ok(response.data, JSON.stringify(response.error));
    return response.data.parts
      .filter((part) => part.type === 'tool')
      .map((part) =>
        part.state.status === 'completed' ? part.state.output : JSON.stringify(part.state)
      )
      .join('\n')
      .trim();
  };
}

try {
  const [scenario] = await provisionScenarioDirectories(
    [executionAutonomyScenario('ex1-clean', 'candidate')],
    { rootDirectory: workspace, gennadyRoot: sourceRoot }
  );
  assert.ok(scenario);
  workspace = scenario.directory;
  symlinkSync(join(fakeUserData, 'canary.txt'), join(workspace, 'escape-canary'));
  symlinkSync(fakeSharedDependencies, join(workspace, 'shared-dependency-canary'));
  writeFileSync(marker, 'delete');
  const plain = await startServer(false);
  const probeEnv = `${quote(process.execPath)} -e 'console.log(JSON.stringify({secretPresent:Object.hasOwn(process.env,"CANARY_SECRET"),configPresent:Object.hasOwn(process.env,"OPENCODE_CONFIG")}))'`;
  results.deleteHook = await plain(probeEnv);
  writeFileSync(marker, 'undefined');
  results.undefinedHook = await plain(probeEnv);
  await stopServer();
  assert.equal(safeCleanup, true);
  writeFileSync(marker, 'scrub');
  const isolated = await startServer(true);
  results.wrappedEnv = await isolated(probeEnv);
  results.privateRead = await isolated(
    `/bin/cat ${quote(configPath)} >/dev/null 2>&1 && printf CONFIG_READ_ALLOWED || printf CONFIG_READ_DENIED`
  );
  results.processArgs = await isolated(
    `/bin/ps eww -p ${child!.pid} >/dev/null 2>&1 && printf PROCESS_ARGS_ALLOWED || printf PROCESS_ARGS_DENIED`
  );
  results.basic = await isolated('printf WORKSPACE_SHELL_OK');
  results.symlinkRead = await isolated(
    `/bin/cat escape-canary >/dev/null 2>&1 && printf ESCAPE_ALLOWED || printf ESCAPE_DENIED`
  );
  results.workspaceWrite = await isolated(
    `printf 'owned-canary' > owned-canary.txt && test -s owned-canary.txt && printf WORKSPACE_WRITE_OK`
  );
  results.npm = await isolated('npm --version');
  const typecheckOutput = await isolated('npm run type-check 2>&1 && printf TYPECHECK_OK');
  results.typecheck = typecheckOutput.endsWith('TYPECHECK_OK')
    ? 'TYPECHECK_OK'
    : typecheckOutput.slice(-1500);
  const c = executionAutonomyCase('ex1-clean');
  results.outsideWrite = await isolated(
    `printf blocked > ${quote(join(owned, 'outside-write'))} 2>/dev/null && printf OUTSIDE_WRITE_ALLOWED || printf OUTSIDE_WRITE_DENIED`
  );
  results.dependencyWrite = await isolated(
    'printf blocked > shared-dependency-canary/denied-write 2>/dev/null && printf DEPENDENCY_WRITE_ALLOWED || printf DEPENDENCY_WRITE_DENIED'
  );
  // Remove only the two host-created adversarial links before the valid CLI control: its existing
  // corpus guard correctly refuses arbitrary unsafe links anywhere in the checkout.
  rmSync(join(workspace, 'escape-canary'));
  rmSync(join(workspace, 'shared-dependency-canary'));
  const cliOutput = await isolated(
    `./node_modules/.bin/gennady sdd-task ${quote(c.ticket)} --phase P1 2>&1 && printf INSTALLED_CLI_OK`
  );
  results.installedCli = cliOutput.endsWith('INSTALLED_CLI_OK')
    ? 'INSTALLED_CLI_OK'
    : cliOutput.slice(-1500);
  results.network = await isolated(
    `${quote(process.execPath)} -e 'const n=require("node:net"); const s=n.connect({host:"127.0.0.1",port:${privatePort}},()=>{console.log("NETWORK_ALLOWED");s.end()});s.on("error",e=>console.log(e.code==="EPERM"?"NETWORK_DENIED":"NETWORK_OTHER_ERROR"));s.setTimeout(1000,()=>{console.log("NETWORK_TIMEOUT");s.destroy()})'`
  );
  assert.deepEqual(JSON.parse(String(results.deleteHook)), {
    secretPresent: true,
    configPresent: true,
  });
  assert.deepEqual(JSON.parse(String(results.wrappedEnv)), {
    secretPresent: false,
    configPresent: false,
  });
  assert.equal(results.privateRead, 'CONFIG_READ_DENIED');
  assert.equal(results.processArgs, 'PROCESS_ARGS_DENIED');
  assert.equal(results.basic, 'WORKSPACE_SHELL_OK');
  assert.equal(results.symlinkRead, 'ESCAPE_DENIED');
  assert.equal(results.workspaceWrite, 'WORKSPACE_WRITE_OK');
  assert.match(String(results.npm), /^\d+\.\d+\.\d+$/);
  assert.match(String(results.typecheck), /TYPECHECK_OK$/);
  assert.match(String(results.installedCli), /INSTALLED_CLI_OK$/);
  assert.match(String(results.outsideWrite), /OUTSIDE_WRITE_DENIED$/);
  assert.match(String(results.dependencyWrite), /DEPENDENCY_WRITE_DENIED$/);
  assert.equal(results.network, 'NETWORK_DENIED');
  results.outsideWrite = 'OUTSIDE_WRITE_DENIED';
  results.dependencyWrite = 'DEPENDENCY_WRITE_DENIED';
} finally {
  // Persist observations before deleting the owned sandbox; no raw shell logs or real secrets.
  writeFileSync(reportPath, JSON.stringify({ ...results, cleanup: 'pending' }, null, 2) + '\n');
  await stopServer();
  if (safeCleanup) rmSync(owned, { recursive: true, force: true });
  results.safeCleanup = safeCleanup && !existsSync(owned);
  if (!results.safeCleanup) {
    process.exitCode = 1;
    results.recovery = owned;
  }
  writeFileSync(reportPath, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
}
