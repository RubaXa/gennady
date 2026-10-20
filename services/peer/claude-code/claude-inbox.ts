// @file: Gennady peer inbox — a synthetic Claude Code session that can receive cross-session messages.
// @consumers: claude-code.transport
// @tasks: N/A

import { createServer, type Server, type Socket } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseClaudeEnvelope,
  parseClaudeFrame,
  toUdsAddress,
  type ClaudeFrame,
} from './claude-protocol.ts';
import { sessionsDir } from './claude-sessions.ts';
import type { InboundMessage } from '../peer-port.ts';

/**
 * @purpose Handle returned by {@link startClaudeInbox}.
 * @consumer claude-code.transport
 */
export type ClaudeInbox = {
  /** @purpose Pid used in the session record. */
  pid: number;
  /** @purpose Synthetic session id. */
  sessionId: string;
  /** @purpose Inbox socket path. */
  socketPath: string;
  /** @purpose Address to advertise as `from`. */
  address: string;
  /** @purpose Shared per-inbox secret. */
  peerToken: string;
  /**
   * @purpose Register a handler called for every user frame.
   * @param handler Callback receiving each decoded inbound message.
  
   */
  onMessage: (handler: (message: InboundMessage) => void) => void;
  /**
   * @purpose Stop listening and remove the session record, key and socket.
   * @returns Resolves once the inbox and its files are removed.
   */
  stop: () => Promise<void>;
};

/**
 * @purpose Directory used for inbox sockets.
 */
export const peerSocketDir = (): string => process.env.GENNADY_PEER_SOCK_DIR ?? '/tmp/cc-socks';

/**
 * @purpose Read this process's start timestamp the way Claude Code records it.
 * @param pid Process id.
 * @returns `ps` lstart string, or '' when unavailable.
 */
const processStart = (pid: number): string => {
  try {
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

/**
 * @purpose Start a synthetic peer session that can receive cross-session messages.
 */
export const startClaudeInbox = async (
  options: { name?: string; requireAuth?: boolean } = {}
): Promise<ClaudeInbox> => {
  const requireAuth = options.requireAuth ?? true;
  const pid = process.pid;
  const sessionId = randomUUID();
  const socketPath = join(peerSocketDir(), `${pid}.sock`);
  const peerToken = randomBytes(16).toString('hex');
  const address = toUdsAddress(socketPath);
  const sha = createHash('sha256').update(socketPath).digest('hex');
  const dir = sessionsDir();
  const recordFile = join(dir, `${pid}.json`);
  const keyFile = join(dir, `${pid}.${sha}.key`);
  const procStart = processStart(pid);
  const now = Date.now();

  mkdirSync(dir, { recursive: true });
  mkdirSync(peerSocketDir(), { recursive: true });
  writeFileSync(
    recordFile,
    JSON.stringify({
      pid,
      sessionId,
      cwd: process.cwd(),
      startedAt: now,
      procStart,
      version: '0.0.0-gennady-peer',
      peerProtocol: 1,
      peerFeatures: ['notify_idle', 'reply_across_default_dirs', 'artifact_yield'],
      kind: 'interactive',
      entrypoint: 'cli',
      pidDomain: process.platform,
      messagingSocketPath: socketPath,
      name: options.name ?? `gennady-${pid}`,
      nameSource: 'user',
      nameSince: now,
      status: 'idle',
      updatedAt: now,
      statusUpdatedAt: now,
    })
  );
  writeFileSync(keyFile, JSON.stringify({ peerToken, procStart, pidDomain: process.platform }));

  const handlers: ((message: InboundMessage) => void)[] = [];
  const sockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let authenticated = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        const frame = parseClaudeFrame(line);
        if (!frame) continue;
        if (frame.type === 'auth') {
          if (frame.token === peerToken) authenticated = true;
          continue;
        }
        const user = frame as ClaudeFrame;
        if (requireAuth && !authenticated) continue;
        const raw = user.message?.content ?? '';
        const envelope = parseClaudeEnvelope(raw);
        const message: InboundMessage = {
          from: envelope?.from,
          fromName: envelope?.fromName,
          authenticated,
          raw,
          body: envelope?.body ?? raw,
          msgId: user.msg_id,
        };
        for (const handler of handlers) handler(message);
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve());
  });

  const stop = async (): Promise<void> => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const file of [recordFile, keyFile, socketPath]) {
      try {
        rmSync(file, { force: true });
      } catch {
        /* ignore */
      }
    }
  };

  return {
    pid,
    sessionId,
    socketPath,
    address,
    peerToken,
    onMessage: (handler) => handlers.push(handler),
    stop,
  };
};
