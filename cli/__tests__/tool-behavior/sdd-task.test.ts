// @file: Live-CLI behavior of sdd-task's gate-queue diagnostic — a real run against a fixture whose
//   portal approves an infrastructure scope that no ticket references yet, so the not-ready project
//   must surface GATE_QUEUE_DIAG telling the operator to scaffold it, not stay silent.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

const PORTAL_WITH_INFRA_SCOPE = [
  '# Demo Project',
  '',
  '## Scopes',
  '',
  '| Scope | Type | Status | Description |',
  '|---|---|---|---|',
  '| [`infra-core`](./infra-core/infra-core.spec.md) | infrastructure | ✅ | bootstrap tooling |',
  '',
].join('\n');

/** @purpose A TODO ticket whose scope is deliberately NOT infra-core — infra-core stays unreferenced by any ticket. */
const UNRELATED_TICKET = [
  '# Task: app-1 — Unrelated',
  '<!--SECTION:META-->',
  '## 1. Meta',
  '- **Task-ID:** app-1',
  '- **Status:** [ ] TODO',
  '- **Scope:** app',
  '- **Dependencies:** None',
  '<!--/SECTION:META-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

describe('sdd-task — live gate-queue diagnostic', () => {
  it('approved infra scope with zero referencing tickets → GATE_QUEUE_DIAG names it, not silence', () => {
    const { root } = buildRepoFixture({
      noPackageJson: true, // not-ready by construction — no package.json at all.
      files: {
        'specs/README.md': PORTAL_WITH_INFRA_SCOPE,
        'ticket.md': UNRELATED_TICKET,
      },
      git: false, // sdd-task's gate-queue path has no git-scoped tool in play here.
    });
    try {
      const r = runCli(['sdd-task'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /GATE_QUEUE=none/);
      assert.match(
        r.stdout,
        /GATE_QUEUE_DIAG: infra-спека `infra-core` одобрена, тикетов пока нет — нарежь scaffold'ом/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
