// @file: REL-18 release-evidence collector. Runs the required release gates against one clean,
//   immutable HEAD, keeps raw output outside the repository while commands execute, verifies that
//   the worktree stayed clean, then materializes the versioned evidence pack in one final step.
// @spec: AI-SKILLS
// @consumers: package.json "release:evidence-pack"; release operator

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  migrationScopeIdentityFinding,
  releaseEvidenceCommandPlan,
  renderReleaseEvidenceReadme,
  validateReleaseEvidenceResult,
  type ReleaseEvidenceCommand,
  type ReleaseEvidenceManifest,
  type ReleaseEvidenceResult,
} from './release-evidence-contract.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = 'ai/flow-eval/.baseline/rc-evidence-pack';
const LOG_MAX_BYTES = 64 * 1024 * 1024;

function commandText(command: Pick<ReleaseEvidenceCommand, 'command' | 'args'>): string {
  return [command.command, ...command.args].join(' ');
}

function validateCleanStatus(status: string, stage: 'до' | 'после'): string | null {
  return status.trim().length === 0
    ? null
    : `Рабочее дерево не чистое ${stage} REL-18 прогонов:\n${status.trimEnd()}`;
}

function runText(command: string, args: readonly string[], root: string): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: LOG_MAX_BYTES,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} завершилась с exit=${result.status ?? 'null'}:\n${result.stderr}`
    );
  }
  return result.stdout.trim();
}

function gitStatus(root: string): string {
  return runText('git', ['status', '--porcelain=v1', '--untracked-files=all'], root);
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function discoverMigrationScopes(root: string): string[] {
  const migrationRoot = join(root, 'migration');
  return readdirSync(migrationRoot)
    .filter((entry) => statSync(join(migrationRoot, entry)).isDirectory())
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function writeCommandLog(
  logPath: string,
  spec: ReleaseEvidenceCommand,
  stdout: string,
  stderr: string
): void {
  const text = [
    `$ ${commandText(spec)}`,
    '',
    '--- stdout ---',
    stdout,
    '',
    '--- stderr ---',
    stderr,
    '',
  ].join('\n');
  writeFileSync(logPath, text, 'utf8');
}

function main(): void {
  const root = PROJECT_ROOT;
  if (process.argv.length > 2) {
    console.error('[release-evidence-pack] usage: npm run release:evidence-pack');
    process.exit(4);
  }
  const out = resolve(root, DEFAULT_OUT);
  if (existsSync(out)) {
    console.error(`[release-evidence-pack] отказ: output уже существует: ${out}`);
    process.exit(1);
  }

  const before = gitStatus(root);
  const dirtyBefore = validateCleanStatus(before, 'до');
  if (dirtyBefore) {
    console.error(`[release-evidence-pack] отказ: ${dirtyBefore}`);
    process.exit(1);
  }

  const scopes = discoverMigrationScopes(root);
  if (scopes.length === 0) {
    console.error('[release-evidence-pack] отказ: migration scopes не найдены');
    process.exit(1);
  }
  const sourceCommit = runText('git', ['rev-parse', 'HEAD'], root);
  const committedScopes = runText(
    'git',
    ['ls-tree', '-d', '--name-only', `${sourceCommit}:migration`],
    root
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const scopeFinding = migrationScopeIdentityFinding(scopes, committedScopes);
  if (scopeFinding) {
    console.error(`[release-evidence-pack] отказ: ${scopeFinding}`);
    process.exit(1);
  }
  const npmVersion = runText('npm', ['--version'], root);

  const scratch = mkdtempSync(join(tmpdir(), 'gennady-rel18-'));
  const logs = join(scratch, 'logs');
  mkdirSync(logs);
  const results: ReleaseEvidenceResult[] = [];
  const failures: string[] = [];

  try {
    for (const spec of releaseEvidenceCommandPlan(scopes)) {
      console.log(`[release-evidence-pack] ${spec.id}: ${commandText(spec)}`);
      const executed = spawnSync(spec.command, spec.args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' },
        maxBuffer: LOG_MAX_BYTES,
      });
      const stdout = executed.stdout ?? '';
      const stderr = executed.stderr ?? '';
      const logFile = `${spec.id}.log`;
      const logPath = join(logs, logFile);
      writeCommandLog(logPath, spec, stdout, stderr);
      results.push({
        id: spec.id,
        command: commandText(spec),
        exitCode: executed.status,
        signal: executed.signal,
        logFile: `logs/${logFile}`,
        sha256: sha256File(logPath),
      });
      const failure = validateReleaseEvidenceResult(spec, executed.status, stdout + stderr);
      if (failure) failures.push(failure);
    }

    const after = gitStatus(root);
    const dirtyAfter = validateCleanStatus(after, 'после');
    if (dirtyAfter) failures.push(dirtyAfter);
    const headAfter = runText('git', ['rev-parse', 'HEAD'], root);
    if (headAfter !== sourceCommit) {
      failures.push(`HEAD изменился во время прогонов: ${sourceCommit} → ${headAfter}`);
    }
    if (failures.length > 0) {
      console.error(`[release-evidence-pack] FAIL; raw logs сохранены для диагностики: ${scratch}`);
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    const manifest: ReleaseEvidenceManifest = {
      schema: 'gennady.rc-evidence-pack.v1',
      sourceCommit,
      generatedAt: new Date().toISOString(),
      cleanBefore: true,
      cleanAfter: true,
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        nodeExecutable: process.execPath,
        npm: npmVersion,
        packageLockSha256: sha256File(join(root, 'package-lock.json')),
      },
      commands: results,
      migration: { scopes, rounds: 2, allNoOp: true },
    };
    writeFileSync(join(scratch, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    writeFileSync(join(scratch, 'README.md'), renderReleaseEvidenceReadme(manifest), 'utf8');
    mkdirSync(out, { recursive: true });
    cpSync(logs, join(out, 'logs'), { recursive: true });
    cpSync(join(scratch, 'manifest.json'), join(out, 'manifest.json'));
    cpSync(join(scratch, 'README.md'), join(out, 'README.md'));
    console.log(`[release-evidence-pack] PASS: ${out}`);
    console.log(`  source commit: ${sourceCommit}`);
    console.log(
      `  commands: ${results.length}; migration: ${scopes.length} scope × 2 no-op rounds`
    );
  } finally {
    if (process.exitCode !== 1) rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && basename(process.argv[1]) === basename(import.meta.filename)) main();
