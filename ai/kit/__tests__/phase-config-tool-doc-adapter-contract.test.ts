// @file: Semantic contract for lazy, ecosystem-aware config-phase tool documentation lookup.
// @consumers: phase-execution-protocol directive authors
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const step = (text: string): string =>
  text.match(/<Step id="STEP_3B_TOOL_API">([\s\S]*?)<\/Step>/)?.[1] ?? '';

function assertTypedFailureRouting(text: string, label: string): void {
  assert.match(text, /unsupported adapter.+`H_THIRD_PARTY_API_UNVERIFIABLE`/s, label);
  assert.match(
    text,
    /Missing adapter,\s+version, or persisted docs is `RECOVERABLE_TECHNICAL`/s,
    label
  );
  assert.match(
    text,
    /exact external-access permission\s+is `EXTERNAL_AUTHORITY_REQUIRED`/s,
    label
  );
  assert.match(text, /Return evidence and the bounded next action/, label);
  assert.doesNotMatch(text, /ask(?:s|ing)?\s+the operator|AskUserQuestion/i, label);
  assert.doesNotMatch(text, /<ToolCall\b[^>]*>[^<]*--help/i, label);
}

describe('config-phase ToolDocAdapter contract', () => {
  const source = read('ai', 'kit', 'templates', 'sdd-v2', 'phase-execution-protocol.directive.hbs');
  const axiom = read('ai', 'kit', 'axiom', 'infra', 'ax-third-party-tool-current-api.xml');
  const configStep = step(source);

  it('is lazy: activates only for config and selects from declared phase/readiness evidence', () => {
    assert.equal(source.match(/<ToolDocAdapterRegistry>/g)?.length, 1);
    assert.equal(source.match(/<\/ToolDocAdapterRegistry>/g)?.length, 1);
    assert.match(configStep, /Activate only.+phaseContext\.kind=config/s);
    assert.match(configStep, /Target Files, Spec Refs, and\s+readiness evidence/s);
    assert.match(configStep, /every other kind skips without a\s+probe/s);
    assert.match(configStep, /BEFORE writing config, select and follow that adapter/);
  });

  it('preserves the Node/npm adapter without treating Node paths as universal', () => {
    assert.match(configStep, /\| `node\/npm` \|/);
    assert.match(configStep, /`node_modules\/<pkg>\/package\.json#version`/);
    assert.match(configStep, /installed package root's `README\*` and `CHANGELOG\*`/);
    assert.match(configStep, /exact `homepage` or `repository\.url` in that same package manifest/);
    assert.match(configStep, /registered ToolDocAdapter/);
    assert.doesNotMatch(configStep, /Per tool, BEFORE|Installed version: read|This four-step read/);
  });

  it('fails closed for unsupported Go, iOS, and Android adapters', () => {
    for (const adapter of ['`go`', '`ios/swift`', '`android/gradle`']) {
      assert.match(
        configStep,
        new RegExp(`\\| ${adapter.replace('/', '\\/')} \\|[^\\n]+unsupported`)
      );
    }
    assertTypedFailureRouting(configStep, 'source');
  });

  it('never falls back to help, silent network, cache guessing, or source archaeology', () => {
    assert.match(configStep, /Never guess, call `--help`,\s+explore an undeclared cache/);
    assert.match(configStep, /access the network outside the\s+selected adapter's remote policy/);
    assert.match(axiom, /through STEP_3B's declared\s+ToolDocAdapter/s);
  });

  it('keeps generated source and lazy STEP_3B package semantically aligned', () => {
    const skeleton = read('ai', 'directives', 'sdd-v2', 'phase-execution-protocol.directive.xml');
    const built = read(
      'ai',
      'directives',
      'sdd-v2',
      'phase-execution-protocol',
      'steps',
      'STEP_3B_TOOL_API.xml'
    );
    assert.doesNotMatch(skeleton, /<ToolDocAdapterRegistry>/);
    assert.match(built, /registered ToolDocAdapter/);
    assert.match(built, /<ToolDocAdapterRegistry>/);
    for (const adapter of ['`go`', '`ios/swift`', '`android/gradle`']) {
      assert.match(built, new RegExp(`\\| ${adapter.replace('/', '\\/')} \\|[^\\n]+unsupported`));
    }
    assertTypedFailureRouting(built, 'generated');
    assert.doesNotMatch(built, /four-step read|Installed version: read/);
  });
});
