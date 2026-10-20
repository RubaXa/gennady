// @file: Contract tests for the real-input/dynamic-output OpenCode acceptance adapter.
// @consumers: node:test runner

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OpenCodeDynamicMock } from '../opencode.dynamic-mock.ts';

describe('OpenCodeDynamicMock', () => {
  it('returns the grounded Sidebar navigation finding with its referenced diff', async () => {
    const mock = new OpenCodeDynamicMock();
    const session = await mock.createSession({ title: 'track_ui', directory: '/tmp', tools: true });
    const result = await mock.prompt(session.sid, {
      text: 'files: src/components/Sidebar/Sidebar.tsx, src/styles/variables.css — inspect',
      format: {
        type: 'json_schema',
        schema: { title: 'pipeline_track_ui', type: 'object', properties: {} },
      },
    });

    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    const findings = result.output.findings as Array<Record<string, unknown>>;
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.file, 'src/components/Sidebar/Sidebar.tsx');
    assert.strictEqual(findings[0]?.line, 47);
    assert.deepStrictEqual(findings[0]?.factcheck, 'verified');
    assert.ok(
      (findings[0]?.diff as Array<{ text: string }>).some(
        (line) => line.text === 'event.preventDefault();'
      )
    );
    assert.deepStrictEqual(await mock.toolCalls(session.sid), [
      { tool: 'read', path: 'src/components/Sidebar/Sidebar.tsx' },
      { tool: 'read', path: 'src/styles/variables.css' },
    ]);
  });
});
