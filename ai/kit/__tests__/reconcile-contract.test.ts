// @file: Regression guard for reconcile ownership, design-before-code ordering, and bounded direct evidence.
// @consumers: build-directives, sdd-reconcile
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('reconcile remediation contract', () => {
  const reconcile = read('ai', 'kit', 'templates', 'sdd-v2', 'reconcile.directive.hbs');
  const classification = read('ai', 'kit', 'axiom', 'process', 'ax-fix-classification.xml');
  const ownership = read('ai', 'kit', 'axiom', 'process', 'ax-task-resolution.xml');
  const reopen = read('ai', 'kit', 'axiom', 'process', 'ax-reopen-format.xml');
  const specLifecycle = read('ai', 'kit', 'axiom', 'spec', 'ax-spec-lifecycle.xml');
  const directReceipt = read(
    'ai',
    'kit',
    'contract',
    'process',
    'direct-verification-receipt.xml'
  );

  it('reopens even a one-line task-owned code bug with concrete fix and test phases', () => {
    const classify = step(reconcile, 'STEP_2B_CLASSIFY');
    const apply = step(reconcile, 'STEP_5_APPLY');
    const taskBranch =
      apply.match(/WHEN \*\*task-reopen\*\*([\s\S]*?)- WHEN \*\*semantic-spec-update\*\*/)?.[1] ??
      '';

    assert.match(classify, /ANY code finding with a resolvable `@tasks:` owner/);
    assert.match(classify, /Always append a new Round.+even for a one-line fix/s);
    assert.match(classify, /concrete next-unused PhaseIDs.+`fix` phase.+regression `test` phase/s);
    assert.match(classify, /tracker row to `\[ \] TODO`/);
    assert.match(reopen, /including a one-line bug.+appends a new Round/s);
    assert.match(reopen, /concrete `fix` PhaseID.+dependent concrete `test` PhaseID/s);
    assert.match(ownership, /resolvable code owner is binding.+new Round/s);
    assert.match(classification, /even for a one-line fix; size never authorizes a direct patch/);
    assert.match(taskBranch, /append the planned new Round/);
    assert.match(taskBranch, /concrete fix and dependent test PhaseIDs/);
    assert.match(taskBranch, /tracker row to TODO/);
    assert.ok(
      taskBranch.indexOf('append the planned new Round') <
        taskBranch.indexOf('execute.directive.xml'),
      'the Round and TODO state must exist before ordinary execute'
    );
    assert.doesNotMatch(reconcile, /trivial branch|skips the Round|short-circuit|single site/);
  });

  it('cannot execute a semantic spec finding before authoring and merged publication', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    const semanticBranch =
      apply.match(
        /WHEN \*\*semantic-spec-update\*\*([\s\S]*?)- WHEN \*\*bounded-direct\*\*/
      )?.[1] ?? '';

    for (const directive of ['scope', 'module', 'infra', 'interface']) {
      assert.match(
        semanticBranch,
        new RegExp(`READ_AND_USE_DIRECTIVE\\("ai/directives/sdd-v2/${directive}\\.directive\\.xml"\\)`)
      );
    }
    const authoringAt = semanticBranch.indexOf('scope.directive.xml');
    const lifecycleAt = semanticBranch.indexOf('review-lifecycle.directive.xml');
    const mergedAt = semanticBranch.indexOf('publication=MERGED');
    const scaffoldAt = semanticBranch.indexOf('scaffold.directive.xml');
    const executeAt = semanticBranch.indexOf('hand ordinary execute');
    assert.ok(authoringAt >= 0 && lifecycleAt > authoringAt && mergedAt > lifecycleAt);
    assert.ok(scaffoldAt > mergedAt && executeAt > mergedAt);
    assert.match(semanticBranch, /Only AFTER that proof may implementation move/);
    assert.match(semanticBranch, /missing proof is `H_SPEC_REVIEW_NOT_MERGED`/);
    assert.match(classification, /semantic spec.+authoring flow.+review\/publication.+before implementation/s);
    assert.match(
      specLifecycle,
      /editorial correction.+exact `sdd-check --all` direct receipt.+Any such delta is semantic.+before scaffold\/reopen\/execute/s
    );
  });

  it('allows direct edits only for a frozen task-free target-set with an exact receipt', () => {
    const classify = step(reconcile, 'STEP_2B_CLASSIFY');
    const plan = step(reconcile, 'STEP_3_PLAN');
    const apply = step(reconcile, 'STEP_5_APPLY');
    const directBranch =
      apply.match(
        /WHEN \*\*bounded-direct\*\*([\s\S]*?)- WHEN \*\*ticket-create-or-recover\*\*/
      )?.[1] ?? '';

    assert.match(classify, /only canonical task-free SDD tracker\/index metadata/);
    assert.match(classify, /editorial-spec-correction.+`semantic: no`/s);
    assert.match(classify, /Any GOAL or behavioural delta reclassifies it as semantic/);
    assert.match(plan, /ordered literal `<direct-target-set>`/);
    assert.match(plan, /npx gennady sdd-check --all <verification-root>/);
    assert.match(directBranch, /Edit only `<direct-target-set>`/);
    assert.match(directBranch, /DIRECT_VERIFICATION_RECEIPT/);
    assert.match(directReceipt, /target-set: \[<ordered literal repo-relative paths>\]/);
    assert.match(directReceipt, /command: npx gennady sdd-check --all <verification-root>/);
    assert.match(directReceipt, /literal unmodified command output/);
    assert.match(classify, /without the bounded-direct contract.+Recover a matching ticket/s);
    assert.match(directBranch, /ticket-create-or-recover rather than substituting a lighter command/);
  });

  it('uses path-owned evidence without a bare reconcile sync or duplicate audits', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    const verify = step(reconcile, 'STEP_6_VERIFY');

    assert.doesNotMatch(reconcile, /triviality/i);
    assert.doesNotMatch(reconcile, /`sdd-sync` brings|<Action>`sdd-sync`/);
    assert.match(apply, /execute owns phase work, tracker sync, audit, and code-review/);
    assert.match(verify, /ordinary execute's per-ticket sync and phase\s+gates/s);
    assert.match(verify, /Do not run a catch-all second audit\/code-review or a duplicate sync\/check tail/);
    assert.doesNotMatch(
      verify,
      /READ_AND_USE_DIRECTIVE\("ai\/directives\/sdd-v2\/(?:audit|code-review)\.directive\.xml"\)/
    );
  });

  it('keeps operator questions delta-only', () => {
    const agree = step(reconcile, 'STEP_4_AGREE');

    assert.match(agree, /only the new or unresolved plan delta/);
    assert.match(agree, /already accepted classification\/choice without restating or re-asking/);
    assert.match(agree, /batch independent\s+unresolved choices/);
  });
});
