// @file: Codex executable selection and standalone peer ask process lifecycle regression tests.
// @consumers: node:test
// @tasks: N/A

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundled =
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const legacy = '/Applications/ChatGPT.app/Contents/Resources/codex';
const available = new Set<string>();
const originalOverride = process.env.GENNADY_CODEX_BIN;
mock.module('node:fs', {
  namedExports: {
    ...fs,
    existsSync: (path: string) => available.has(String(path)),
  },
});
const { codexBinPath } = await import(root + '/services/peer/codex/codex-store.ts');

function paths(...values: string[]) {
  delete process.env.GENNADY_CODEX_BIN;
  available.clear();
  for (const value of values) available.add(value);
}

test('explicit executable override keeps priority, including a missing override', () => {
  paths(bundled, legacy);
  process.env.GENNADY_CODEX_BIN = '/explicit/codex';
  assert.equal(codexBinPath(), '/explicit/codex');
});
test('uses the current bundled executable when only it exists', () => {
  paths(bundled);
  assert.equal(codexBinPath(), bundled);
});
test('prefers the current bundle when both supported app paths exist', () => {
  paths(bundled, legacy);
  assert.equal(codexBinPath(), bundled);
});
test('retains the existing legacy executable fallback', () => {
  paths(legacy);
  assert.equal(codexBinPath(), legacy);
});
test('missing app executables keep an actionable bundled-path diagnostic', () => {
  paths();
  assert.equal(codexBinPath(), bundled);
  if (originalOverride === undefined) delete process.env.GENNADY_CODEX_BIN;
  else process.env.GENNADY_CODEX_BIN = originalOverride;
});

const childProgram = `
  import { registerTransport } from '${root}/services/peer/peer-transport-registry.ts';
  import { invokePeer } from '${root}/services/peer/peer-invoker.ts';
  const mode = process.env.PEER_CONTRACT_MODE;
  let sentAt = 0;
  registerTransport({
    runtime: 'codex', usesHandshake: false,
    bindInbox: async () => ({ address: 'test:inbox', onMessage() {}, stop: async () => console.log('CLEANUP') }),
    replyContract: () => ({ tool: 'test', address: 'test:inbox', format: 'peer-xml', instructions: 'test' }),
    markReplyPosition: async () => ({ position: 0 }),
    send: async () => { if (mode === 'send-error') throw new Error('SEND_FAILURE'); sentAt = Date.now(); return { msgId: 'test-send', address: 'test:target' }; },
    readReply: async () => mode === 'reply' && Date.now() - sentAt >= 120 ? 'DELAYED_REPLY' : null,
  });
  try {
    const result = await invokePeer({ target: { runtime: 'codex', id: 'test', address: 'test:target' }, task: { id: 'test', goal: 'test' }, mode: 'transcript', pollMs: 25, timeoutMs: 300 });
    console.log('REPLY:' + result.reply);
  } catch (error) { console.log('ERROR:' + error.message); process.exitCode = 2; }
`;

for (const mode of ['reply', 'timeout', 'send-error']) {
  test('standalone ask process waits and cleans up: ' + mode, () => {
    const home = fs.mkdtempSync(join(tmpdir(), 'peer-liveness-'));
    try {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', childProgram],
        {
          cwd: root,
          env: { ...process.env, GENNADY_HOME: home, PEER_CONTRACT_MODE: mode },
          encoding: 'utf8',
          timeout: 5000,
        }
      );
      assert.equal(
        result.error,
        undefined,
        'process must exit after cleanup, without a forced kill'
      );
      assert.equal(result.signal, null);
      assert.match(result.stdout, /CLEANUP/);
      assert.equal(result.status, mode === 'reply' ? 0 : 2, result.stderr);
      assert.match(
        result.stdout,
        mode === 'reply'
          ? /REPLY:DELAYED_REPLY/
          : mode === 'timeout'
            ? /ERROR:No reply .* within 300ms/
            : /ERROR:SEND_FAILURE/
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
