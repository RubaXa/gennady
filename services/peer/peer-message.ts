// @file: Peer message vocabulary — handshake, task, report, directive, ack as runtime-agnostic XML.
// @consumers: peer-invoker, adapters, peer.cmd
// @tasks: N/A

import { escapeXml, serializeXmlNode } from '../../shared/common/xml.ts';
import type { PeerLimits, PeerSelf, ReplyContract } from './peer-port.ts';

/**
 * @purpose Logical kind of a peer message, independent of the runtime wire format.
 * @consumer peer-message, peer-invoker
 */
export type PeerMessageKind =
  | 'handshake'
  | 'task'
  | 'report'
  | 'directive'
  | 'ack'
  | 'question'
  | 'answer';

/**
 * @purpose A runtime-agnostic message to a peer.
 * @consumer peer-invoker, adapters
 */
export type PeerMessage = {
  /** @purpose Logical kind. */
  kind: PeerMessageKind;
  /** @purpose Message body: peer XML or plain text. */
  body: string;
  /** @purpose Correlating task id, when applicable. */
  taskId?: string;
  /** @purpose Optional model override (`provider/model`), runtime-permitting. */
  model?: string;
};

/**
 * @purpose Fields of a `<peer-handshake>` offer.
 * @consumer peer-message
 */
export type HandshakeSpec = {
  /** @purpose Our identity. */
  self: PeerSelf;
  /** @purpose Reply contract (tool + address + instructions). */
  reply: ReplyContract;
  /** @purpose Report sections the subordinate should use. */
  reportSections?: string[];
  /** @purpose Optional limits. */
  limits?: PeerLimits;
};

/**
 * @purpose Default report sections requested from a subordinate.
 * @consumer peer-invoker, peer.cmd
 */
export const DEFAULT_REPORT_SECTIONS = [
  'status',
  'summary',
  'env',
  'artifacts',
  'evidence',
  'blockers',
  'next',
];

/**
 * @purpose Serialize a `<reply>` element describing exactly how the peer should answer.
 */
export const buildReplyElement = (reply: ReplyContract): string =>
  serializeXmlNode({
    tag: 'reply',
    attrs: { tool: reply.tool, to: reply.address, format: reply.format },
    children: [{ tag: 'how', children: reply.instructions }],
  });

/**
 * @purpose Build a `<peer-handshake>` that tells a peer who we are and how to reply.
 */
export const buildHandshake = (spec: HandshakeSpec): string => {
  const sections = spec.reportSections ?? DEFAULT_REPORT_SECTIONS;
  const replyXml = buildReplyElement(spec.reply);
  const reportXml = serializeXmlNode({
    tag: 'report-contract',
    attrs: { v: '1', format: 'peer-xml' },
    children: sections.map((name) => ({ tag: 'section', attrs: { name } })),
  });
  const limitsXml = spec.limits
    ? serializeXmlNode({
        tag: 'limits',
        attrs: {
          ...(spec.limits.forbidden ? { forbidden: spec.limits.forbidden } : {}),
          ...(spec.limits.approve ? { approve: spec.limits.approve } : {}),
          ...(spec.limits.budget ? { budget: spec.limits.budget } : {}),
        },
      })
    : '';
  const selfXml = serializeXmlNode({
    tag: 'self',
    attrs: { name: spec.self.name, role: spec.self.role, runtime: spec.self.runtime },
  });
  return `<peer-handshake v="1">\n${selfXml}\n${replyXml}\n${reportXml}${limitsXml ? `\n${limitsXml}` : ''}\n</peer-handshake>`;
};

/**
 * @purpose Build a `<peer-request>` wrapper identifying the caller and reply address.
 */
export const buildRequest = (
  caller: PeerSelf,
  task: { id: string; goal: string; acceptance?: string; forbidden?: string },
  replyTo: string
): string =>
  serializeXmlNode({
    tag: 'peer-request',
    attrs: {
      from: caller.name,
      runtime: caller.runtime,
      role: caller.role,
      task: task.id,
      'reply-to': replyTo,
    },
    children: [
      { tag: 'goal', children: task.goal },
      ...(task.acceptance ? [{ tag: 'acceptance', children: task.acceptance }] : []),
      ...(task.forbidden ? [{ tag: 'forbidden', children: task.forbidden }] : []),
    ],
  });

/**
 * @purpose Build a `<peer-task>` assignment from a leader.
 */
export const buildTask = (task: {
  id: string;
  goal: string;
  acceptance?: string;
  forbidden?: string;
  cadence?: string;
}): string =>
  serializeXmlNode({
    tag: 'peer-task',
    attrs: { id: task.id, ...(task.cadence ? { report: task.cadence } : {}) },
    children: [
      { tag: 'goal', children: task.goal },
      ...(task.acceptance ? [{ tag: 'acceptance', children: task.acceptance }] : []),
      ...(task.forbidden ? [{ tag: 'forbidden', children: task.forbidden }] : []),
    ],
  });

/**
 * @purpose Build a `<peer-report>` from a subordinate.
 */
export const buildReport = (report: {
  task: string;
  status: 'working' | 'blocked' | 'done' | 'failed';
  summary: string;
  next?: string;
  blockers?: string;
}): string =>
  serializeXmlNode({
    tag: 'peer-report',
    attrs: { task: report.task, status: report.status },
    children: [
      { tag: 'summary', children: report.summary },
      ...(report.next ? [{ tag: 'next', children: report.next }] : []),
      ...(report.blockers ? [{ tag: 'blockers', children: report.blockers }] : []),
    ],
  });

/**
 * @purpose Build a `<peer-directive>` from a leader.
 */
export const buildDirective = (directive: { task?: string; text: string }): string =>
  serializeXmlNode({
    tag: 'peer-directive',
    attrs: { ...(directive.task ? { task: directive.task } : {}) },
    children: directive.text,
  });

/**
 * @purpose Build a `<peer-ack>` confirming receipt.
 */
export const buildAck = (taskId: string): string =>
  serializeXmlNode({ tag: 'peer-ack', attrs: { task: taskId } });

/**
 * @purpose One parsed peer XML element.
 * @consumer peer.cmd
 */
export type ParsedPeerXml = {
  /** @purpose Tag name. */
  tag: string;
  /** @purpose Attributes. */
  attrs: Record<string, string>;
  /** @purpose Inner markup. */
  inner: string;
};

/**
 * @purpose Leniently parse the outermost peer XML element of a body.
 */
export const parsePeerXml = (text: string): ParsedPeerXml | null => {
  const match = text
    .trim()
    .match(/^<([A-Za-z][\w-]*)((?:\s+[\w-]+="[^"]*")*)\s*>([\s\S]*)<\/\1>\s*$/);
  if (!match) return null;
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z][\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(match[2]))) attrs[m[1]] = m[2];
  return { tag: match[1], attrs, inner: match[3] };
};

/**
 * @purpose Escape a value for interpolating into peer XML.
 */
export const peerEscape = escapeXml;
