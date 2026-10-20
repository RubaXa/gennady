// @file: Send a peer message to a Claude Code session's UDS inbox.
// @spec: PEER
// @consumers: claude-code.transport

import { createConnection } from 'node:net';
import { buildClaudeEnvelope, buildClaudeFrame, serializeClaudeFrame } from './claude-protocol.ts';
import { readPeerToken, type ClaudeSession } from './claude-sessions.ts';

/**
 * @purpose Options for {@link sendToClaudeSession}.
 * @consumer claude-code.transport
 */
export type ClaudeSendParams = {
  /** @purpose Target session record. */
  session: ClaudeSession;
  /** @purpose Message body (peer XML or plain text). */
  body: string;
  /** @purpose Sender address (`uds:<socket>`). */
  from: string;
  /** @purpose Sender display name. */
  fromName?: string;
  /** @purpose Sender permission-mode class asserted to the peer. */
  fromMode?: 'bypass' | 'prompting';
  /** @purpose Optional pre-generated message id. */
  msgId?: string;
  /** @purpose Connection timeout in ms. */
  timeoutMs?: number;
};

/**
 * @purpose Result of a successful send.
 * @consumer claude-code.transport
 */
export type ClaudeSendResult = {
  /** @purpose Message id assigned to the frame. */
  msgId: string;
  /** @purpose Target socket the frame was written to. */
  socketPath: string;
};

/**
 * @purpose Write a peer message to a session's inbox socket.
 * @throws Error when the session has no inbox socket or the write fails/times out.
 */
export const sendToClaudeSession = (params: ClaudeSendParams): Promise<ClaudeSendResult> =>
  new Promise((resolve, reject) => {
    const socketPath = params.session.messagingSocketPath;
    if (!socketPath) {
      reject(
        new Error(`Session "${params.session.name ?? params.session.pid}" has no messaging socket`)
      );
      return;
    }
    const content = buildClaudeEnvelope({
      from: params.from,
      fromName: params.fromName,
      fromMode: params.fromMode,
      body: params.body,
    });
    const frame = buildClaudeFrame({ from: params.from, content, msgId: params.msgId });
    const token = readPeerToken(socketPath);

    const socket = createConnection({ path: socketPath });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`Timed out sending to ${socketPath}`));
    }, params.timeoutMs ?? 5000);
    timeout.unref();

    socket.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    socket.on('connect', () => {
      if (token) socket.write(serializeClaudeFrame({ type: 'auth', token }));
      socket.write(serializeClaudeFrame(frame));
      socket.end();
    });
    socket.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ msgId: frame.msg_id, socketPath });
    });
  });
