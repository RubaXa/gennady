// @file: Unit tests for prompt verify-command resolution — Go marker commands carry safe contracts.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { resolveSafeVerifyCommands } = await import('../resolve-verify-commands.logic.ts');

describe('resolveSafeVerifyCommands — go.mod marker', () => {
  it('scopes gofmt away from vendor and states the output contract (review B6)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-commands-'));
    try {
      fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/x\n\ngo 1.24\n');

      const commands = resolveSafeVerifyCommands(dir);
      const gofmt = commands.find((command) => command.includes('gofmt'));

      assert.notEqual(gofmt, undefined);
      assert.ok(
        !/gofmt -l \.($|\s*$)/.test(gofmt!),
        'bare `gofmt -l .` walks vendor/ and testdata/'
      );
      assert.match(gofmt!, /non-empty output/i);
      assert.ok(
        commands.every((command) => !command.includes('go fmt')),
        'go fmt rewrites the tree'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
