// @file: Regression contract for the SDD critic directive markup and its documented loop semantics.
// @consumers: CI
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIRECTIVE = fs.readFileSync(
  path.join(REPO_ROOT, 'ai', 'directives', 'sdd', 'critic.directive.xml'),
  'utf-8'
);
const PROTOCOL = fs.readFileSync(
  path.join(REPO_ROOT, 'ai', 'directives', 'sdd', 'critic-protocol.xml'),
  'utf-8'
);
const FLOW_GUIDE = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'sdd-flow.md'), 'utf-8');

describe('SDD critic convergence contract', () => {
  it('stops on the first CLEAN instead of forcing minimum rounds or a polish pass', () => {
    assert.doesNotMatch(DIRECTIVE, /AX_MIN_ROUNDS|Minimum 3 rounds|round ≥ 3/);
    assert.match(DIRECTIVE, /CLEAN is terminal at any round/);
    assert.match(DIRECTIVE, /Verdict CLEAN → conclude immediately/);
    assert.match(DIRECTIVE, /Re-dispatch after any CLEAN verdict/);
  });

  it('uses later rounds to verify accepted fixes rather than reopen a broad audit', () => {
    assert.match(DIRECTIVE, /AX_ROUND_FRONTIER/);
    assert.match(DIRECTIVE, /Round 2\+ = verification of previously accepted fixes/);
    assert.match(DIRECTIVE, /Run a broad baseline audit after round 1/);
    assert.match(PROTOCOL, /AX_REVIEW_MODE/);
    assert.match(PROTOCOL, /Do not restart the dimension sweep in verification mode/);
    assert.match(PROTOCOL, /do not re-read unaffected sections to start a new audit/);
    assert.doesNotMatch(PROTOCOL, /Read full content/);
    assert.match(PROTOCOL, /under `## What I did NOT understand` as `AUTHORING_REQUIRED`/);
  });

  it('requires evidence and triages confusion without turning it directly into work', () => {
    assert.match(DIRECTIVE, /AX_FINDING_EVIDENCE/);
    assert.match(DIRECTIVE, /AX_CONFUSION_TRIAGE/);
    assert.match(DIRECTIVE, /ARTIFACT_GAP.*CONTEXT_MISSING.*NON_BLOCKING_QUESTION/s);
    assert.doesNotMatch(DIRECTIVE, /Confusion = underspecification|ALWAYS accept/);
    assert.match(PROTOCOL, /AX_FINDING_PROVENANCE/);
    assert.match(PROTOCOL, /Uncertainty without provenance and concrete breakage never changes/);
  });

  it('keeps critique inside the current artifact and out of authoring', () => {
    assert.match(DIRECTIVE, /AX_ARTIFACT_BOUNDARY/);
    assert.match(DIRECTIVE, /Reconcile only the entity\/type\/method\/contract implicated/);
    assert.match(DIRECTIVE, /AP_COAUTHOR/);
    assert.match(PROTOCOL, /You are a reviewer, not a co-author/);
    assert.match(PROTOCOL, /AX_AUTHOR_BOUNDARY/);
    assert.match(PROTOCOL, /does not add requirements, choose a better architecture/);
  });

  it('keeps operator documentation aligned with immediate CLEAN and focused verification', () => {
    assert.match(FLOW_GUIDE, /CLEAN на любом раунде/);
    assert.match(FLOW_GUIDE, /проверяет только принятые правки/);
    assert.doesNotMatch(FLOW_GUIDE, /минимум 3 раунда|min 3/);
  });
});
