// @file: Black-box CLI proof for target verify planning, execution, repair and reporting.
// @spec: CLI
// @consumers: CI

import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { cleanTestChildEnv, type CliResult } from './run-cli.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = path.join(REPO_ROOT, 'cli', 'gennady.ts');
const TSX_LOADER = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

function git(root: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-C', root, '-c', 'user.email=verify@test', '-c', 'user.name=verify', ...args],
    { stdio: 'ignore' }
  );
}

function createProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-live-cli-'));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, '.home'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.home\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'verify-cli-fixture',
      private: true,
      scripts: {
        'type-check': 'node -e ""',
        'lint:fix': `node ${GENNADY_ENTRY} lint --autofix`,
        lint: `node ${GENNADY_ENTRY} lint`,
        'format:fix': 'prettier --write',
        format: 'prettier --check src.ts',
      },
    })
  );
  fs.writeFileSync(
    path.join(root, 'src.ts'),
    [
      '// @file: Unformatted black-box Verify target.',
      '// @consumers: N/A',
      '',
      '/** @purpose Prove public repair execution. */',
      'export const blackBox={ready:true}',
      '',
    ].join('\n')
  );
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.gitignore', 'package.json', 'src.ts');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  return fs.realpathSync(root);
}

function runVerifyCli(args: readonly string[], root: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, GENNADY_ENTRY, ...args], {
      cwd: root,
      env: { ...cleanTestChildEnv(process.env), HOME: path.join(root, '.home') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.once('error', (error) => (stderr += error.message));
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.once('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

function runVerifyCliAndSignal(
  args: readonly string[],
  root: string,
  signal: 'SIGINT' | 'SIGTERM',
  readyPath: string
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, GENNADY_ENTRY, ...args], {
      cwd: root,
      env: { ...cleanTestChildEnv(process.env), HOME: path.join(root, '.home') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.once('error', (error) => (stderr += error.message));
    const poll = setInterval(() => {
      if (!fs.existsSync(readyPath)) return;
      clearInterval(poll);
      child.kill(signal);
    }, 10);
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.once('close', (exitCode) => {
      clearInterval(poll);
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

describe('gennady verify target CLI', () => {
  it('--plan --json emits stable non-evidence target plan and never mutates', async () => {
    const root = createProject();
    try {
      const before = fs.readFileSync(path.join(root, 'src.ts'), 'utf8');
      const first = await runVerifyCli(['verify', '--plan', '--json', '--phase=code'], root);
      const second = await runVerifyCli(['verify', '--plan', '--json', '--phase=code'], root);
      assert.strictEqual(first.exitCode, 0, first.stderr);
      assert.strictEqual(second.exitCode, 0, second.stderr);
      assert.strictEqual(first.stdout, second.stdout);
      const document = JSON.parse(first.stdout);
      assert.strictEqual(document.schemaVersion, 1);
      assert.strictEqual(document.kind, 'plan');
      assert.strictEqual(document.evidence, false);
      assert.strictEqual(document.context.request.root, '.');
      assert.deepStrictEqual(document.results, []);
      assert.strictEqual(fs.readFileSync(path.join(root, 'src.ts'), 'utf8'), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('executes a real local Node slice, repairs exact source and prints an actionable report', async () => {
    const root = createProject();
    try {
      const result = await runVerifyCli(['verify', '--phase=code'], root);
      assert.strictEqual(result.exitCode, 0, `${result.stderr}\n${result.stdout}`);
      assert.match(result.stdout, /VERIFY phase=code/);
      assert.match(result.stdout, /PASS node:format-fix/);
      assert.match(result.stdout, /MODIFIED src\.ts by=node:format-fix allowed=true/);
      assert.match(result.stdout, /VERDICT PASS/);
      assert.match(
        fs.readFileSync(path.join(root, 'src.ts'), 'utf8'),
        /blackBox = \{ ready: true \}/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a bare invocation with exit 4 and teaching usage', async () => {
    const root = createProject();
    try {
      const result = await runVerifyCli(['verify'], root);
      assert.strictEqual(result.exitCode, 4);
      assert.strictEqual(result.stdout, '');
      assert.match(result.stderr, /ERR_CLI_VERIFY_BAD_INVOCATION/);
      assert.match(result.stderr, /--phase=<phase>/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an invalid stack config before planning or execution', async () => {
    const root = createProject();
    try {
      fs.writeFileSync(path.join(root, 'gennady.yaml'), 'stack:\n  use: [not-a-real-plugin]\n');
      const result = await runVerifyCli(['verify', '--plan', '--json', '--phase=code'], root);
      assert.strictEqual(result.exitCode, 4);
      assert.strictEqual(result.stdout, '');
      assert.match(result.stderr, /not-a-real-plugin|unknown/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles a real SIGTERM through the process adapter and releases the workspace guard', async () => {
    const root = createProject();
    try {
      const document = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      document.scripts['type-check'] =
        "node -e \"require('node:fs').writeFileSync('verify-started','yes');setInterval(()=>{},1000)\"";
      const dirtyPackage = JSON.stringify(document);
      fs.writeFileSync(path.join(root, 'package.json'), dirtyPackage);
      const before = fs.readFileSync(path.join(root, 'src.ts'), 'utf8');
      const result = await runVerifyCliAndSignal(
        ['verify', '--phase=code', '--json'],
        root,
        'SIGTERM',
        path.join(root, 'verify-started')
      );
      assert.strictEqual(result.exitCode, 143, `${result.stderr}\n${result.stdout}`);
      const report = JSON.parse(result.stdout);
      assert.strictEqual(report.verdict, 'violation');
      assert.strictEqual(report.results[0].status, 'cancelled');
      assert.strictEqual(fs.readFileSync(path.join(root, 'src.ts'), 'utf8'), before);
      assert.strictEqual(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), dirtyPackage);
      assert.strictEqual(fs.existsSync(path.join(root, 'verify-started')), false);
      assert.strictEqual(
        fs.existsSync(path.join(root, '.git', 'gennady-workspace-guard.lock')),
        false
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
