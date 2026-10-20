// @file: End-to-end tests for peer messaging against a mock Claude Code session.
// @spec: PEER
// @consumers: N/A

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Server } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Redirect all peer state into a temp sandbox BEFORE any call reads the env.
const sandbox = mkdtempSync(join(tmpdir(), 'gennady-peer-'));
const sessionsDir = join(sandbox, 'sessions');
const projectsDir = join(sandbox, 'projects');
const sockDir = join(sandbox, 'socks');
process.env.GENNADY_CLAUDE_SESSIONS_DIR = sessionsDir;
process.env.GENNADY_CLAUDE_PROJECTS_DIR = projectsDir;
process.env.GENNADY_PEER_SOCK_DIR = sockDir;
process.env.GENNADY_HOME = join(sandbox, 'gennady');
mkdirSync(sessionsDir, { recursive: true });
mkdirSync(projectsDir, { recursive: true });
mkdirSync(sockDir, { recursive: true });

const { defaultTransport } = await import('../peer-transport-registry.ts');
const { invokePeer, sendPeer } = await import('../peer-invoker.ts');
const { startClaudeInbox } = await import('../claude-code/claude-inbox.ts');
const { parseClaudeEnvelope, toUdsAddress, buildClaudeFrame, serializeClaudeFrame } =
  await import('../claude-code/claude-protocol.ts');
const { transcriptPath, resolveSession, listSessions } =
  await import('../claude-code/claude-sessions.ts');
const { putPeer, getPeer, forgetPeer } = await import('../peer-store.ts');

const children: ChildProcess[] = [];
const servers: Server[] = [];

/** Create a live pseudo-process whose pid we can use in a session record. */
const spawnAlivePid = (): number => {
  const child = spawn('sleep', ['120'], { stdio: 'ignore' });
  children.push(child);
  return child.pid as number;
};

type MockTarget = {
  pid: number;
  sessionId: string;
  name: string;
  cwd: string;
  socketPath: string;
  received: string[];
  close: () => Promise<void>;
};

/** Register a session record and a mock inbox socket that records received peer frames. */
const createMockTarget = async (options: {
  name: string;
  cwd: string;
  onFrame?: (content: string) => void;
}): Promise<MockTarget> => {
  const pid = spawnAlivePid();
  const sessionId = randomUUID();
  const socketPath = join(sockDir, `${pid}.sock`);
  const received: string[] = [];
  const server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line) as { type?: string; message?: { content?: string } };
          if (frame.type === 'user' && typeof frame.message?.content === 'string') {
            received.push(frame.message.content);
            options.onFrame?.(frame.message.content);
          }
        } catch {
          /* ignore */
        }
      }
    });
    socket.on('error', () => {});
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(socketPath, () => resolve()));
  writeFileSync(
    join(sessionsDir, `${pid}.json`),
    JSON.stringify({
      pid,
      sessionId,
      cwd: options.cwd,
      name: options.name,
      kind: 'interactive',
      entrypoint: 'cli',
      status: 'idle',
      messagingSocketPath: socketPath,
      peerProtocol: 1,
    })
  );
  return {
    pid,
    sessionId,
    name: options.name,
    cwd: options.cwd,
    socketPath,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

before(() => {
  mkdirSync(projectsDir, { recursive: true });
});

after(async () => {
  for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const child of children) child.kill();
  rmSync(sandbox, { recursive: true, force: true });
});

test('session registry resolves a mock session by name', async () => {
  const mock = await createMockTarget({ name: 'UnitTarget', cwd: '/tmp/mockproj' });
  assert.ok(listSessions().some((s) => s.sessionId === mock.sessionId));
  const resolved = resolveSession('UnitTarget');
  assert.equal(resolved?.sessionId, mock.sessionId);
  await mock.close();
});

test('ask returns the reply produced in the target transcript', async () => {
  const mock = await createMockTarget({
    name: 'TranscriptTarget',
    cwd: '/tmp/mockproj',
    onFrame: () => {
      const transcript = transcriptPath({
        pid: mock.pid,
        sessionId: mock.sessionId,
        cwd: mock.cwd,
      });
      appendFileSync(
        transcript,
        JSON.stringify({
          type: 'assistant',
          uuid: randomUUID(),
          message: { content: [{ type: 'text', text: 'pong (computed 391)' }] },
        }) + '\n'
      );
    },
  });
  mkdirSync(join(projectsDir, '-tmp-mockproj'), { recursive: true });
  writeFileSync(
    transcriptPath({ pid: mock.pid, sessionId: mock.sessionId, cwd: mock.cwd }),
    JSON.stringify({ type: 'user', message: { content: 'existing turn' } }) + '\n'
  );

  const target = await defaultTransport().resolve('TranscriptTarget');
  assert.ok(target);
  const result = await invokePeer({
    target,
    task: { id: 'T-transcript', goal: 'compute 17*23' },
    mode: 'transcript',
    timeoutMs: 8000,
    pollMs: 100,
    settleMs: 100,
  });
  assert.equal(result.source, 'transcript');
  assert.match(result.reply, /pong \(computed 391\)/);
  assert.equal(result.task.includes('compute 17*23'), true);

  // The handshake must have told the target how to reply (tool + address).
  const sent = mock.received[0];
  assert.match(sent, /<peer-handshake v="1">/);
  assert.match(sent, /tool="SendMessage"/);
  assert.match(sent, /to="uds:[^"]+\.sock"/);
  await mock.close();
});

test('ask can await a message-based SendMessage reply on our inbox', async () => {
  const mock = await createMockTarget({
    name: 'MessageTarget',
    cwd: '/tmp/mockproj',
    onFrame: (content) => {
      const envelope = parseClaudeEnvelope(content);
      assert.ok(envelope?.from);
      const socketPath = decodeURIComponent(envelope.from.replace(/^uds:/, ''));
      const replyFrame = buildClaudeFrame({
        from: toUdsAddress(mock.socketPath),
        content: `<cross-session-message from="${toUdsAddress(mock.socketPath)}">report-ok</cross-session-message>`,
      });
      // Authenticate to the peer's inbox the way a real session does.
      let token: string | undefined;
      try {
        const inboxPid =
          socketPath
            .split('/')
            .pop()
            ?.replace(/\.sock$/, '') ?? '';
        const sha = createHash('sha256').update(socketPath).digest('hex');
        token = JSON.parse(
          readFileSync(join(sessionsDir, `${inboxPid}.${sha}.key`), 'utf8')
        ).peerToken;
      } catch {
        token = undefined;
      }
      const connection = createConnection({ path: socketPath });
      connection.on('connect', () => {
        if (token) connection.write(serializeClaudeFrame({ type: 'auth', token }));
        connection.write(serializeClaudeFrame(replyFrame));
        connection.end();
      });
      connection.on('error', () => {});
    },
  });

  const target = await defaultTransport().resolve('MessageTarget');
  assert.ok(target);
  const result = await invokePeer({
    target,
    task: { id: 'T-message', goal: 'report back' },
    mode: 'message',
    timeoutMs: 8000,
  });
  assert.equal(result.source, 'message');
  assert.match(result.reply, /report-ok/);
  await mock.close();
});

test('send is fire-and-forget and still carries the handshake', async () => {
  const mock = await createMockTarget({ name: 'SendTarget', cwd: '/tmp/mockproj' });
  const target = await defaultTransport().resolve('SendTarget');
  assert.ok(target);
  const { msgId } = await sendPeer({
    target,
    task: { id: 'T-send', goal: 'start the refactor' },
  });
  assert.ok(msgId);
  assert.equal(mock.received.length, 1);
  assert.match(mock.received[0], /tool="SendMessage"/);
  assert.match(mock.received[0], /start the refactor/);
  await mock.close();
});

test('alias store remembers a stable sessionId', () => {
  putPeer({ name: 'stable', sessionId: 'sid-xyz', role: 'subordinate', addedAt: Date.now() });
  assert.equal(getPeer('stable')?.sessionId, 'sid-xyz');
  assert.equal(forgetPeer('stable'), true);
  assert.equal(getPeer('stable'), undefined);
});

test('sandbox uses an isolated home, not the real one', () => {
  assert.ok(process.env.GENNADY_HOME?.startsWith(sandbox));
  assert.notEqual(process.env.GENNADY_HOME, join(homedir(), '.gennady'));
});

test('inbox drops unauthenticated frames and accepts authenticated ones', async () => {
  const inbox = await startClaudeInbox({ name: 'auth-test' });
  const received: string[] = [];
  inbox.onMessage((message) => received.push(message.raw));
  const send = (authed: boolean): Promise<void> =>
    new Promise((resolve) => {
      const connection = createConnection({ path: inbox.socketPath });
      connection.on('connect', () => {
        if (authed)
          connection.write(serializeClaudeFrame({ type: 'auth', token: inbox.peerToken }));
        connection.write(
          serializeClaudeFrame(
            buildClaudeFrame({
              from: toUdsAddress(inbox.socketPath),
              content: `<cross-session-message from="x">${authed ? 'authed' : 'anon'}</cross-session-message>`,
            })
          )
        );
        connection.end();
      });
      connection.on('close', () => resolve());
    });
  await send(false);
  await send(true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(received.length, 1);
  assert.match(received[0], /authed/);
  await inbox.stop();
});
