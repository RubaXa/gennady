// @file: Claude Code wire protocol — UDS frames, peer envelope and `uds:` addresses.
// @consumers: claude-send, claude-inbox, claude-code.transport
// @tasks: N/A

import { randomUUID } from 'node:crypto';

/**
 * @purpose Tag the Claude Code cross-session inbox wraps around a peer message body.
 * @consumer claude-protocol
 */
export const PEER_TAG = 'cross-session-message';

/**
 * @purpose Protocol version accepted by the Claude Code UDS inbox (`msgV`).
 * @consumer claude-protocol
 */
export const PEER_MSG_VERSION = 1;

/**
 * @purpose A user-turn frame written to a Claude Code session's UDS inbox.
 * @consumer claude-send, claude-inbox
 */
export type ClaudeFrame = {
  /** @purpose Frame protocol version. */
  msgV: number;
  /** @purpose Unique message id for correlation. */
  msg_id: string;
  /** @purpose Frame kind understood by the inbox. */
  type: 'user';
  /** @purpose User-turn payload. */
  message: { role: 'user'; content: string };
  /** @purpose Queue priority the inbox uses. */
  priority: 'next';
  /** @purpose Sender address (`uds:<socket>`). */
  from: string;
};

/**
 * @purpose The optional first line a client sends to authenticate to an inbox.
 * @consumer claude-send
 */
export type ClaudeAuthFrame = {
  /** @purpose Frame discriminator. */
  type: 'auth';
  /** @purpose Shared per-inbox secret read from the peer key file. */
  token: string;
};

/**
 * @purpose Attribute set carried on a `<cross-session-message>` envelope.
 * @consumer claude-protocol
 */
export type ClaudeEnvelope = {
  /** @purpose Parsed sender address. */
  from?: string;
  /** @purpose Optional sender session id. */
  fromSession?: string;
  /** @purpose Optional sender display name. */
  fromName?: string;
  /** @purpose Optional sender permission-mode class. */
  fromMode?: string;
  /** @purpose Message body between the envelope tags. */
  body: string;
};

/**
 * @purpose Percent-encode a socket path the way Claude Code addresses peers.
 */
export const encodeAddressPath = (socketPath: string): string =>
  socketPath.replace(/[^A-Za-z0-9:_/.\-]/gu, (ch) =>
    Array.from(Buffer.from(ch))
      .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
      .join('')
  );

/**
 * @purpose Build a Claude Code peer address (`uds:<encoded socket path>`).
 */
export const toUdsAddress = (socketPath: string): string => `uds:${encodeAddressPath(socketPath)}`;

/**
 * @purpose Extract the socket path from a `uds:` peer address.
 */
export const socketPathFromAddress = (address: string): string | null => {
  if (!address.startsWith('uds:')) return null;
  try {
    return decodeURIComponent(address.slice('uds:'.length));
  } catch {
    return null;
  }
};

/**
 * @purpose Wrap a message body in the `<cross-session-message>` envelope the inbox expects.
 */
export const buildClaudeEnvelope = (envelope: ClaudeEnvelope): string => {
  const attrs: string[] = [];
  if (envelope.from) attrs.push(`from="${envelope.from}"`);
  if (envelope.fromSession) attrs.push(`from-session="${envelope.fromSession}"`);
  if (envelope.fromName) attrs.push(`from-name="${envelope.fromName.replace(/["<>]/g, '')}"`);
  if (envelope.fromMode) attrs.push(`from-mode="${envelope.fromMode}"`);
  const head = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  return `<${PEER_TAG}${head}>\n${envelope.body}\n</${PEER_TAG}>`;
};

/**
 * @purpose Parse a `<cross-session-message>` envelope produced by this or any peer session.
 */
export const parseClaudeEnvelope = (content: string): ClaudeEnvelope | null => {
  const match = content.match(
    /^<cross-session-message([^>]*)>\n?([\s\S]*?)\n?<\/cross-session-message>\s*$/
  );
  if (!match) return null;
  const [, attrStr, body] = match;
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z][\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrStr))) attrs[m[1]] = m[2];
  return {
    from: attrs['from'],
    fromSession: attrs['from-session'],
    fromName: attrs['from-name'],
    fromMode: attrs['from-mode'],
    body,
  };
};

/**
 * @purpose Build a user-turn frame for a peer inbox.
 */
export const buildClaudeFrame = (params: {
  from: string;
  content: string;
  msgId?: string;
}): ClaudeFrame => ({
  msgV: PEER_MSG_VERSION,
  msg_id: params.msgId ?? randomUUID(),
  type: 'user',
  message: { role: 'user', content: params.content },
  priority: 'next',
  from: params.from,
});

/**
 * @purpose Serialize a frame to the newline-delimited JSON the inbox reads.
 */
export const serializeClaudeFrame = (frame: ClaudeFrame | ClaudeAuthFrame): string =>
  `${JSON.stringify(frame)}\n`;

/**
 * @purpose Parse one newline-delimited frame line coming from a peer.
 */
export const parseClaudeFrame = (line: string): ClaudeAuthFrame | ClaudeFrame | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const type = (value as { type?: unknown }).type;
  if (type === 'auth' || type === 'user') return value as ClaudeAuthFrame | ClaudeFrame;
  return null;
};
