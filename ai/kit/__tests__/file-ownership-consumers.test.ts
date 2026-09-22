// @file: FO-5 contract tests for resolver-backed workflow consumers and canonical V2 headers.
// @spec: AI-SKILLS-DIRECTIVE-ASSEMBLY
// @consumers: directive templates, file-header axioms, SDD scaffold templates

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { TEMPLATES } from '../../../shared/sdd/templates.ts';

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('FO-5 V2 file-header contract', () => {
  it('makes @spec the one semantic owner in canonical header order without @tasks history', () => {
    const axiom = source('ai/kit/axiom/coding/ax-file-header-task-traceability.xml');
    const header = axiom.match(/Canonical header shape:\s*```([\s\S]*?)```/)?.[1] ?? '';

    assert.ok(header.indexOf('// @file:') < header.indexOf('// @spec:'));
    assert.ok(header.indexOf('// @spec:') < header.indexOf('// @consumers:'));
    assert.doesNotMatch(header, /@tasks:/);
    assert.match(axiom, /history.*never routing authority/);
  });

  it('publishes the same V2 header rule in the project-index scaffold', () => {
    const scaffold = TEMPLATES['project-index'].skeleton;
    assert.match(scaffold, /@file.*@spec.*@consumers/);
    assert.match(scaffold, /orient --file <path> --json/);
    assert.match(scaffold, /never carry legacy `@tasks`/);
  });
});

describe('FO-5 workflow consumers', () => {
  it('makes reconcile consume versioned resolver output and rejects historical routing', () => {
    const reconcile = source('ai/kit/templates/sdd-v2/reconcile.directive.hbs');

    assert.match(reconcile, /gennady orient --file &lt;repo-relative-path&gt; --json/);
    assert.match(reconcile, /\*\*task-continue\*\*.+resolver-confirmed `active`/s);
    assert.match(
      reconcile,
      /`planned`\/`blocked` relations\s+are evidence for that spec-level selection, not routing authority/
    );
    assert.match(reconcile, /history[\s\S]*never opens a new Round automatically/);
    assert.doesNotMatch(reconcile, /\*\*task-reopen\*\*/);
    assert.doesNotMatch(reconcile, /resolve every `@tasks:/);
    assert.doesNotMatch(reconcile, /ANY code finding with a resolvable `@tasks:` owner/);
  });

  it('uses the same resolver in execute, phase work, and audit without copying full file bodies', () => {
    for (const path of [
      'ai/kit/templates/sdd-v2/execute.directive.hbs',
      'ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs',
    ]) {
      const template = source(path);
      assert.match(template, /gennady orient --file .* --json/, path);
      assert.match(template, /AX_TASK_RESOLUTION/, path);
      assert.doesNotMatch(template, /read (?:the )?full bod(?:y|ies).*ownership/i, path);
    }
    const audit = source('ai/kit/templates/sdd-v2/audit.directive.hbs');
    assert.match(audit, /gennady orient --file .* --json/);
    assert.match(audit, /shared deterministic resolver/);
  });

  it('keeps legacy append-only explicitly outside the V2 resolver contract', () => {
    const compatibility = source('shared/sdd/tasks-append-only.ts');
    const mechanical = source('ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml');

    assert.match(compatibility, /Legacy-V1-only/);
    assert.match(mechanical, /legacy-only \*\*TASKS_APPEND_ONLY\*\*/);
    assert.match(mechanical, /Untouched V1 files outside that historical surface remain ungraded/);
  });
});
