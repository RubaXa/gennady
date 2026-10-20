import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./session-recover.mjs', import.meta.url));

function fixture(records, { name = 'Restore Codex Context' } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'session-context-recover-'));
  const id = '01900000-0000-7000-8000-000000000001';
  const rollout = join(home, '.codex', 'sessions', 'rollout-fixture.jsonl');
  const database = join(home, '.codex', 'state_5.sqlite');
  mkdirSync(dirname(rollout), { recursive: true });
  writeFileSync(rollout, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  const quote = (value) => value.replaceAll("'", "''");
  execFileSync('sqlite3', [database, `
    CREATE TABLE threads (
      id TEXT PRIMARY KEY, title TEXT, name TEXT, cwd TEXT, rollout_path TEXT,
      git_branch TEXT, git_sha TEXT, created_at INTEGER, updated_at INTEGER, archived INTEGER
    );
    INSERT INTO threads VALUES (
      '${id}', 'Initial recovery request', '${quote(name)}', '/workspace/project',
      '${quote(rollout)}', 'recover-context', 'abc123', 100, 200, 0
    );
  `]);
  return { home, id };
}

function run(home, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('prefers structured Codex items and preserves failures and tool identity', () => {
  const records = [
    { type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>injected</recommended_plugins>' }] } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Recover the real task' }] } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:02Z', payload: { type: 'task_started', turn_id: 'turn-1' } },
    { type: 'turn_context', timestamp: '2026-01-01T00:00:03Z', payload: { cwd: '/workspace/project' } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:04Z', payload: { type: 'item_completed', item: { type: 'UserMessage', id: 'user-1', content: [{ type: 'text', text: 'Recover the real task' }] } } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:05Z', payload: { type: 'item_completed', item: { type: 'AgentMessage', id: 'agent-1', phase: 'commentary', content: [{ type: 'Text', text: 'Looking at the session now.' }] } } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:06Z', payload: { type: 'item_completed', item: { type: 'CommandExecution', id: 'cmd-1', status: 'failed', exit_code: 137, command: ['rg', 'needle'], cwd: 'file:///workspace/project', stdout: '', stderr: '' } } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:07Z', payload: { type: 'item_completed', item: { type: 'FileChange', id: 'patch-1', status: 'completed', changes: { '/workspace/project/file.ts': { type: 'update' } }, stdout: 'updated', stderr: '' } } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:08Z', payload: { type: 'item_completed', item: { type: 'Extension', id: 'web-1', kind: 'web.search', query: 'Codex threads', action: { type: 'search' }, results: [] } } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:09Z', payload: { type: 'item_completed', item: { type: 'McpToolCall', id: 'mcp-1', server: 'codex_app', tool: 'read_thread', arguments: { threadId: 'target' }, status: 'completed', result: { ok: true } } } },
    { type: 'event_msg', timestamp: '2026-01-01T00:00:10Z', payload: { type: 'task_complete', turn_id: 'turn-1' } },
  ];
  const context = fixture(records);
  try {
    const evidence = run(context.home, 'evidence', '--provider', 'codex', '--id', context.id, '--view', 'full');
    assert.deepEqual(evidence.operatorMessages.map((item) => item.text), ['Recover the real task']);
    assert.deepEqual(evidence.assistantNarrative.map((item) => item.text), ['Looking at the session now.']);
    assert.deepEqual(evidence.actions.map((item) => item.tool), [
      'CommandExecution',
      'FileChange',
      'Extension:web.search',
      'McpToolCall:codex_app.read_thread',
    ]);
    assert.equal(evidence.toolResults.filter((item) => item.isError).length, 1);
    assert.equal(evidence.toolResults.find((item) => item.isError).exitCode, 137);
    assert.equal(evidence.terminalState.inProgress, false);
    assert.equal(evidence.terminalState.lastTaskEvent, 'completed');
    assert.equal(evidence.evidencePolicy.source, 'event_msg/item_completed');
    const audit = run(context.home, 'evidence', '--provider', 'codex', '--id', context.id, '--view', 'audit');
    assert.deepEqual(audit.operatorMessages.map((item) => item.text), ['Recover the real task']);
  } finally {
    rmSync(context.home, { recursive: true, force: true });
  }
});

test('uses bounded word matching when exact Codex title substring is absent', () => {
  const context = fixture([], { name: 'Restore Codex Context' });
  try {
    const located = run(context.home, 'locate', '--provider', 'codex', '--query', 'context restore');
    assert.equal(located.length, 1);
    assert.equal(located[0].id, context.id);
    assert.equal(located[0].titleMatchScore, 60);
  } finally {
    rmSync(context.home, { recursive: true, force: true });
  }
});

test('keeps the legacy rollout fallback bounded and filters injected user context', () => {
  const records = [
    { type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>injected</environment_context>' }] } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Actual operator request' }] } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:02Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Plain progress without label keywords.' }] } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:03Z', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'call-1', input: 'const r = await tools.web__run({});' } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:04Z', payload: { type: 'custom_tool_call_output', call_id: 'call-1', output: '{"exit_code":137,"output":""}' } },
  ];
  const context = fixture(records);
  try {
    const evidence = run(context.home, 'evidence', '--provider', 'codex', '--id', context.id, '--view', 'full');
    assert.deepEqual(evidence.operatorMessages.map((item) => item.text), ['Actual operator request']);
    assert.equal(evidence.assistantNarrative.length, 1);
    assert.equal(evidence.actions[0].tool, 'web__run');
    assert.equal(evidence.toolResults[0].isError, true);
    assert.equal(evidence.evidencePolicy.source, 'response_item fallback');
  } finally {
    rmSync(context.home, { recursive: true, force: true });
  }
});
