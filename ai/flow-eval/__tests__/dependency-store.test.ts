// @file: Retention contract for flow-eval's lock-verified shared dependency metadata stores.
// @spec: AI-SKILLS
// @consumers: dependency-store.ts

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EVAL_ALLOWED_DEPENDENCIES, prepareEvalDependencyStore } from '../dependency-store.ts';

const roots = new Set<string>();
const DAY_MS = 24 * 60 * 60 * 1000;

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'eval-dependency-store-'));
  roots.add(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function store(root: string, name: string, modified: Date, active = false): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  const metadata = join(directory, 'metadata.json');
  writeFileSync(metadata, '{}\n');
  utimesSync(metadata, modified, modified);
  if (active) {
    mkdirSync(join(directory, 'leases'));
    writeFileSync(join(directory, 'leases/active.json'), '{}\n');
  }
  return directory;
}

function dependencySource(): string {
  const root = temporaryRoot();
  const packages: Record<string, unknown> = { '': { name: 'fixture' } };
  const installed: Record<string, unknown> = {};
  for (const [index, name] of EVAL_ALLOWED_DEPENDENCIES.entries()) {
    const entry = {
      version: `1.0.${index}`,
      resolved: `https://registry.invalid/${name}.tgz`,
      integrity: `sha512-${name}`,
    };
    packages[`node_modules/${name}`] = entry;
    installed[`node_modules/${name}`] = entry;
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
  }
  writeFileSync(
    join(root, 'package-lock.json'),
    `${JSON.stringify({ lockfileVersion: 3, packages })}\n`
  );
  writeFileSync(
    join(root, 'node_modules/.package-lock.json'),
    `${JSON.stringify({ lockfileVersion: 3, packages: installed })}\n`
  );
  return root;
}

describe('flow-eval dependency-store retention', () => {
  it('never removes an active lease even after the age boundary', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const now = new Date('2026-09-24T12:00:00.000Z');
    const old = new Date(now.getTime() - 7 * DAY_MS - 1);
    const active = store(storeRoot, 'active', old, true);
    const expired = store(storeRoot, 'expired', old);
    await prepareEvalDependencyStore({ sourceRoot, storeRoot, nowMs: now.getTime() });
    assert.equal(existsSync(expired), false);
    assert.equal(existsSync(active), true);
  });

  it('keeps only the bounded number of newest inactive contracts', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const now = new Date('2026-09-24T12:00:00.000Z');
    const directories = Array.from({ length: 3 }, (_, index) =>
      store(storeRoot, `contract-${index}`, new Date(now.getTime() - index * 1_000))
    );
    const current = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      nowMs: now.getTime(),
    });
    assert.equal(directories.filter((directory) => existsSync(directory)).length, 1);
    assert.equal(existsSync(directories[0]!), true);
    assert.equal(existsSync(current.directory), true);
  });

  it('refuses a lease for an existing inactive third contract when two others are active', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const existing = await prepareEvalDependencyStore({ sourceRoot, storeRoot });
    assert.equal(existsSync(existing.directory), true);
    const now = new Date('2026-09-24T12:00:00.000Z');
    store(storeRoot, 'active-a', now, true);
    store(storeRoot, 'active-b', now, true);
    await assert.rejects(
      prepareEvalDependencyStore({ sourceRoot, storeRoot, leaseId: 'third-active' }),
      /retention is full with active contracts/
    );
    assert.equal(existsSync(join(existing.directory, 'leases')), false);
  });
});
