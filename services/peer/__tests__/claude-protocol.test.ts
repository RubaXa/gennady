// @file: Tests for the Claude Code wire protocol and peer message vocabulary.
// @spec: PEER
// @consumers: N/A

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeEnvelope,
  parseClaudeEnvelope,
  toUdsAddress,
  socketPathFromAddress,
  buildClaudeFrame,
  serializeClaudeFrame,
  parseClaudeFrame,
} from '../claude-code/claude-protocol.ts';
import { buildHandshake, buildTask, buildReport, parsePeerXml } from '../peer-message.ts';
import type { ReplyContract } from '../peer-port.ts';

test('claude envelope round-trips sender attributes and body', () => {
  const envelope = buildClaudeEnvelope({
    from: 'uds:/tmp/cc-socks/1.sock',
    fromName: 'gennady',
    fromMode: 'prompting',
    body: '<peer-task id="T1"><goal>do it</goal></peer-task>',
  });
  const parsed = parseClaudeEnvelope(envelope);
  assert.ok(parsed);
  assert.equal(parsed.from, 'uds:/tmp/cc-socks/1.sock');
  assert.equal(parsed.fromName, 'gennady');
  assert.equal(parsed.fromMode, 'prompting');
  assert.equal(parsed.body, '<peer-task id="T1"><goal>do it</goal></peer-task>');
});

test('claude frame serializes as one JSON line and parses back', () => {
  const frame = buildClaudeFrame({ from: 'uds:/tmp/cc-socks/1.sock', content: 'hello' });
  const line = serializeClaudeFrame(frame).trimEnd();
  assert.ok(line.startsWith('{'));
  const parsed = parseClaudeFrame(line);
  assert.ok(parsed && parsed.type === 'user');
  assert.equal((parsed as typeof frame).msgV, 1);
  assert.equal((parsed as typeof frame).message.content, 'hello');
});

test('uds addresses encode and decode', () => {
  const address = toUdsAddress('/tmp/cc-socks/1.sock');
  assert.equal(address, 'uds:/tmp/cc-socks/1.sock');
  assert.equal(socketPathFromAddress(address), '/tmp/cc-socks/1.sock');
  assert.equal(socketPathFromAddress('http://x'), null);
});

test('handshake advertises the reply tool, address and report contract', () => {
  const reply: ReplyContract = {
    tool: 'SendMessage',
    address: 'uds:/tmp/cc-socks/999.sock',
    format: 'peer-xml',
    instructions: 'call SendMessage with to=...',
  };
  const handshake = buildHandshake({
    self: { name: 'gennady', role: 'leader', runtime: 'gennady', address: reply.address },
    reply,
  });
  assert.match(handshake, /<peer-handshake v="1">/);
  assert.match(handshake, /tool="SendMessage"/);
  assert.match(handshake, /to="uds:\/tmp\/cc-socks\/999.sock"/);
  assert.match(handshake, /<report-contract v="1" format="peer-xml">/);
  assert.match(handshake, /<section name="status" \/>/);
  assert.match(handshake, /call SendMessage with to=\.\.\./);
});

test('task and report builders escape text and expose ids', () => {
  const task = buildTask({ id: 'T1', goal: 'a < b & c' });
  const parsedTask = parsePeerXml(task);
  assert.ok(parsedTask);
  assert.equal(parsedTask.tag, 'peer-task');
  assert.equal(parsedTask.attrs.id, 'T1');
  assert.match(parsedTask.inner, /a &lt; b &amp; c/);

  const report = buildReport({ task: 'T1', status: 'done', summary: 'ok' });
  const parsedReport = parsePeerXml(report);
  assert.ok(parsedReport);
  assert.equal(parsedReport.attrs.task, 'T1');
  assert.equal(parsedReport.attrs.status, 'done');
});
