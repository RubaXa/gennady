// @file: Directive contract for the deterministic scaffold feasibility barrier.
// @consumers: sdd-scaffold
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');

describe('scaffold deterministic feasibility contract', () => {
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const bootstrap = read('ai', 'kit', 'axiom', 'scaffold', 'ax-bootstrap-ticket-derivation.xml');
  const ticket = read('shared', 'sdd', 'templates.ts');

  it('runs the parser-backed graph gate before the semantic feasibility critic', () => {
    assert.match(scaffold, /sdd-check --scaffold-feasibility/);
    assert.match(
      scaffold,
      /sdd-check --scaffold-feasibility[\s\S]+STEP_3B_FEASIBILITY_CRITIC/
    );
    assert.match(scaffold, /named causal diagnostics/);
  });

  it('authors explicit package provider/consumer facts and exact command probes', () => {
    assert.match(bootstrap, /Bootstrap Action.+dependency-install/s);
    assert.match(bootstrap, /Provides Packages/);
    assert.match(bootstrap, /Requires Packages/);
    assert.match(ticket, /:: command.+npm run/s);
    assert.match(scaffold, /one exact owner.+package\.json.+active lockfile/s);
  });
});
