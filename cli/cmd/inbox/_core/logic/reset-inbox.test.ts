// @file: Unit tests for resetInboxState.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetInboxState } from './inbox-registry.logic.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inbox-reset-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resetInboxState', () => {
  it('removes the registry file and the drafts dir', () => {
    const registry = join(dir, 'inbox-registry.json');
    const out = join(dir, 'inbox-out');
    writeFileSync(registry, '{}', 'utf8');
    mkdirSync(out);
    writeFileSync(join(out, 'a.md'), 'draft', 'utf8');

    const res = resetInboxState(registry, out);

    assert.deepStrictEqual(res, { registryRemoved: true, outRemoved: true });
    assert.ok(!existsSync(registry));
    assert.ok(!existsSync(out));
  });

  it('is a no-op when nothing exists', () => {
    const res = resetInboxState(join(dir, 'none.json'), join(dir, 'none-dir'));
    assert.deepStrictEqual(res, { registryRemoved: false, outRemoved: false });
  });
});
