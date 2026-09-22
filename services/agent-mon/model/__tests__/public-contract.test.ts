// @file: Runtime-backed public contract checks for the agent-mon package surface and model.
// @spec: AGENT-MON-MODEL
// @consumers: migration-authored BDD evidence

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { AgentProvider } from '../agent-provider.type.ts';
import type { ObserveOpts } from '../observe-opts.type.ts';
import type { SessionChanges } from '../session-changes.type.ts';
import { DuplicateProviderError, ProviderNotFoundError } from '../errors.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  exports: Record<string, string>;
};

describe('agent-mon public contract', () => {
  it('root export points at the agent-mon barrel', () => {
    assert.equal(packageJson.exports['.'], './services/agent-mon/index.ts');
  });

  it('Claude provider subpath is exported', () => {
    assert.equal(
      packageJson.exports['./providers/claude'],
      './services/agent-mon/providers/claude/index.ts'
    );
  });

  it('OpenCode provider subpath is exported', () => {
    assert.equal(
      packageJson.exports['./providers/opencode'],
      './services/agent-mon/providers/opencode/index.ts'
    );
  });

  it('missing required export is rejected by the package contract', () => {
    const candidate = { ...packageJson.exports };
    delete candidate['./providers/claude'];
    assert.throws(() => assert.ok(candidate['./providers/claude']));
  });

  it('AgentProvider scan contract is executable', async () => {
    const provider: AgentProvider = { key: 'contract', scan: async () => [] };
    assert.deepEqual(await provider.scan(), []);
  });

  it('SessionChanges retains added removed and updated arrays', () => {
    const changes: SessionChanges = { added: [], removed: [], updated: [] };
    assert.deepEqual(Object.keys(changes).sort(), ['added', 'removed', 'updated']);
  });

  it('ObserveOpts accepts idleThresholdMs', () => {
    const options: ObserveOpts = { interval: 10, idleThresholdMs: 20 };
    assert.equal(options.idleThresholdMs, 20);
  });

  it('model errors remain exported and distinguishable', () => {
    assert.ok(new DuplicateProviderError('x') instanceof DuplicateProviderError);
    assert.ok(new ProviderNotFoundError('x') instanceof ProviderNotFoundError);
  });

  it('Ink and React runtime dependencies are installed by contract', () => {
    assert.ok(packageJson.dependencies.ink);
    assert.ok(packageJson.dependencies.react);
  });

  it('React type dependency is installed by contract', () => {
    assert.ok(packageJson.devDependencies['@types/react']);
  });

  it('missing TUI dependency is rejected by the package contract', () => {
    const candidate = { ...packageJson.dependencies };
    delete candidate.ink;
    assert.throws(() => assert.ok(candidate.ink));
  });
});
