// @file: Unit tests for the 🐞 telemetry merge — client + server lines interleave chronologically
//   and carry an origin tag, so a copied log reads as one coherent user-path timeline (D-113).
// @consumers: node:test runner
// @tasks: TSK-debug-log

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTimeline } from '../services/debug-log.ts';

describe('mergeTimeline', () => {
  it('interleaves client and server lines by their ISO timestamp', () => {
    const client = [
      '[2026-07-23T09:00:01.000Z][ui#role-toggle] reviewer activate',
      '[2026-07-23T09:00:03.000Z][state#board] role reviewer activated',
    ];
    const server = [
      '[2026-07-23T09:00:02.000Z][INFO] [RoleEngine#activate] reviewer',
      '[2026-07-23T09:00:04.000Z][DEBUG] [RoleScheduler#tick] activeRoles:1',
    ];
    const out = mergeTimeline(client, server).split('\n');
    // First line is the header, then the 4 lines in strict time order.
    assert.match(out[0], /^# agent-inbox telemetry — 2 client \+ 2 server/);
    assert.match(out[1], /ui#role-toggle/);
    assert.match(out[2], /RoleEngine#activate/);
    assert.match(out[3], /state#board/);
    assert.match(out[4], /RoleScheduler#tick/);
  });

  it('tags each line with its origin after the timestamp', () => {
    const out = mergeTimeline(
      ['[2026-07-23T09:00:01.000Z][ui#assign-mr] a!1 → reviewer'],
      ['[2026-07-23T09:00:02.000Z][ERROR] [RoleInstance#step] boom']
    ).split('\n');
    assert.ok(out[1].includes('[CLIENT]') && out[1].includes('ui#assign-mr'));
    assert.ok(out[2].includes('[SERVER]') && out[2].includes('RoleInstance#step'));
  });

  it('sinks untimed lines to the end, preserving their order', () => {
    const out = mergeTimeline(
      ['no-timestamp-client-line', '[2026-07-23T09:00:05.000Z][ui#x] later'],
      []
    ).split('\n');
    // header, then the timestamped line, then the untimed one last.
    assert.match(out[1], /ui#x/);
    assert.match(out[2], /no-timestamp-client-line/);
  });

  it('handles an empty server tail without throwing (server unreachable)', () => {
    const out = mergeTimeline(['[2026-07-23T09:00:01.000Z][ui#x] only client'], []);
    assert.match(out, /1 client \+ 0 server/);
    assert.match(out, /\[CLIENT\]/);
  });
});
