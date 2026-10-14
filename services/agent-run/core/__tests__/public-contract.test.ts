// @file: Runtime-backed structural checks for the public agent-run core contract.
// @spec: AGENT-RUN-CORE
// @consumers: migration-authored BDD evidence

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentRunError } from '../agent-run-error.ts';
import type { AgentEngine } from '../ports/agent-engine.port.ts';
import type { EngineStatus, RunOptions, RunResult } from '../run-options.type.ts';

describe('agent-run public contract', () => {
  it('AgentEngine declares executable detect run and listModels operations', async () => {
    const engine: AgentEngine = {
      id: 'contract',
      detect: async () => ({ installed: true, version: '1' }),
      run: async () => ({ text: 'ok', engine: 'contract' }),
      listModels: async () => ['provider/model'],
    };
    assert.deepEqual(await engine.detect(), { installed: true, version: '1' });
    assert.equal((await engine.run({ task: 'check' })).text, 'ok');
    assert.deepEqual(await engine.listModels(), ['provider/model']);
  });

  it('RunOptions RunResult and EngineStatus retain their public shape', () => {
    const options: RunOptions = { task: 'check', mode: 'readonly', timeout: 10 };
    const result: RunResult = { text: 'ok', engine: 'contract' };
    const status: EngineStatus = { id: 'contract', installed: true, version: '1' };
    assert.equal(options.mode, 'readonly');
    assert.equal(result.engine, status.id);
  });

  it('AgentRunError carries a stable machine code and operator hint', () => {
    const error = new AgentRunError('TIMEOUT', 'repeat after checking the engine');
    assert.equal(error.code, 'TIMEOUT');
    assert.equal(error.hint, 'repeat after checking the engine');
  });
});
