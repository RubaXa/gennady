// @file: Fail-closed provider identity resolution tests for remote Verify.
// @spec: CLI-VERIFY
// @consumers: VerifyCommand

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveRemotePipelineObserver } from '../remote-provider.ts';

function repository(origin: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-remote-provider-'));
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', origin]);
  return root;
}

describe('resolveRemotePipelineObserver', () => {
  it('blocks an unknown origin instead of assuming it is GitLab', () => {
    const root = repository('https://code.example.com/group/project.git');
    try {
      const result = resolveRemotePipelineObserver(root);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.match(result.message, /does not prove a supported GitHub or GitLab provider/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts an explicitly GitLab-identifying self-hosted origin', () => {
    const root = repository('https://gitlab.internal.example/group/project.git');
    const previous = process.env.GITLAB_PERSONAL_TOKEN;
    process.env.GITLAB_PERSONAL_TOKEN = 'test-read-only-token';
    try {
      const result = resolveRemotePipelineObserver(root);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.observer.provider, 'gitlab');
      assert.equal(result.observer.project, 'group/project');
    } finally {
      if (previous === undefined) delete process.env.GITLAB_PERSONAL_TOKEN;
      else process.env.GITLAB_PERSONAL_TOKEN = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
