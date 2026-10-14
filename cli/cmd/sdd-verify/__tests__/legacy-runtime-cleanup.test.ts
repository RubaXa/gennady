// @file: Structural proof that the public SDD facade cannot reach the removed independent runner.
// @spec: CLI-SDD-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { parseSddVerifyInvocation } from '../sdd-verify-invocation.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const REMOVED_RUNNER_FILES = [
  'cli/cmd/sdd-verify/full-profile-plan.ts',
  'cli/cmd/sdd-verify/legacy-receipt-persistence.ts',
  'cli/cmd/sdd-verify/phase-run.ts',
  'cli/cmd/sdd-verify/repair-adapters.ts',
  'cli/cmd/sdd-verify/sdd-verify.cmd.ts',
  'cli/cmd/sdd-verify/sdd-verify.types.ts',
  'cli/cmd/sdd-verify/workspace-mutation.ts',
  'shared/sdd/verify/sdd-receipt-sink.ts',
  'shared/sdd/verify/sdd-verify-context.ts',
] as const;

function modulePath(owner: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(owner), specifier);
  if (extname(candidate) === '.ts' && existsSync(candidate)) return candidate;
  if (existsSync(`${candidate}.ts`)) return `${candidate}.ts`;
  if (existsSync(resolve(candidate, 'index.ts'))) return resolve(candidate, 'index.ts');
  return null;
}

function productionImportGraph(entry: string): Set<string> {
  const pending = [resolve(ROOT, entry)];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const owner = pending.pop()!;
    if (visited.has(owner)) continue;
    visited.add(owner);
    const source = readFileSync(owner, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"\n]+)\1/g)) {
      const dependency = modulePath(owner, match[2]!);
      if (dependency !== null && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}

function sourceFilesUnder(directory: string): string[] {
  const pending = [resolve(ROOT, directory)];
  const files: string[] = [];
  while (pending.length > 0) {
    const owner = pending.pop()!;
    for (const entry of readdirSync(owner, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      const path = resolve(owner, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `unexpected symlink in source tree: ${path}`);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
      else assert.fail(`unsupported source entry: ${path}`);
    }
  }
  return files.sort();
}

describe('UV-24 independent runner cleanup', () => {
  it('keeps the facade on the universal planner/runner and current attempt journal only', () => {
    const graph = productionImportGraph('cli/cmd/sdd-verify/index.ts');
    const paths = new Set([...graph].map((file) => relative(ROOT, file).split('\\').join('/')));

    assert.ok(paths.has('cli/cmd/verify/verify.cmd.ts'));
    assert.ok(paths.has('shared/verify/execution/repair-loop.ts'));
    assert.ok(paths.has('shared/sdd/verify/sdd-attempt-journal.ts'));
    for (const file of graph) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /legacyOverlay|options\.sdd|legacy-receipt-persistence/);
    }
    for (const removed of REMOVED_RUNNER_FILES) {
      assert.equal(existsSync(resolve(ROOT, removed)), false, removed);
      assert.equal(paths.has(removed), false, removed);
    }
  });

  it('rejects every removed public runner flag, including the compatibility overlay', () => {
    for (const args of [
      ['--profile', 'full'],
      ['--only', 'lint'],
      ['--skip', 'format'],
      ['--legacy-overlay', 'operator:old-proof'],
    ]) {
      const parsed = parseSddVerifyInvocation(['node', 'gennady', 'sdd-verify', ...args]);
      assert.equal(parsed.ok, false, args.join(' '));
    }
  });

  it('keeps active directive and axiom sources free of compatibility-overlay references', () => {
    for (const file of [
      ...sourceFilesUnder('ai/directives'),
      ...sourceFilesUnder('ai/kit/axiom'),
    ]) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /legacy-overlay|legacyOverlay/, file);
    }
  });
});
