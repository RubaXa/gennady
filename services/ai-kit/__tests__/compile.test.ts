// @file: Unit tests for ai-kit compile — buildNodePrompt and buildSystemPrompt.
// @consumers: node:test runner
// @tasks: TSK-116, TSK-136

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildNodePrompt, buildSystemPrompt } from '../compile.ts';
import { NODE_DIRECTIVE_MAP } from '../node-map.ts';

describe('buildNodePrompt', () => {
  it('node_review returns both arch-interrogation and code-interrogation directives', async () => {
    const prompt = await buildNodePrompt('node_review', {});

    assert.ok(prompt.length > 0, 'prompt should not be empty');
    assert.ok(prompt.includes('<ArchInterrogation'), 'should contain arch-interrogation directive');
    assert.ok(prompt.includes('<CodeInterrogation'), 'should contain code-interrogation directive');
  });

  it('node_scaffold returns arch-interrogation only', async () => {
    const prompt = await buildNodePrompt('node_scaffold', {});

    assert.ok(prompt.length > 0, 'prompt should not be empty');
    assert.ok(prompt.includes('<ArchInterrogation'), 'should contain arch-interrogation directive');
    assert.ok(
      !prompt.includes('<CodeInterrogation'),
      'should NOT contain code-interrogation directive'
    );
  });

  it('unknown node throws error indicating role cannot be loaded', async () => {
    await assert.rejects(
      () => buildNodePrompt('node_nonexistent', {}),
      (err: Error) => {
        assert.ok(
          err.message.includes('Unknown node'),
          `error should mention "Unknown node", got: ${err.message}`
        );
        assert.ok(
          err.message.includes('cannot be loaded'),
          `error should mention "cannot be loaded", got: ${err.message}`
        );
        return true;
      }
    );
  });
});

describe('buildSystemPrompt', () => {
  it('reviewer role returns non-empty system prompt with both directives', async () => {
    const prompt = await buildSystemPrompt('reviewer', {});

    assert.ok(prompt.length > 0, 'prompt should not be empty');
    assert.ok(prompt.includes('<ArchInterrogation'), 'should contain arch-interrogation');
    assert.ok(prompt.includes('<CodeInterrogation'), 'should contain code-interrogation');
  });

  it('author role returns non-empty system prompt with both directives', async () => {
    const prompt = await buildSystemPrompt('author', {});

    assert.ok(prompt.length > 0, 'prompt should not be empty');
    assert.ok(prompt.includes('<ArchInterrogation'), 'should contain arch-interrogation');
    assert.ok(prompt.includes('<CodeInterrogation'), 'should contain code-interrogation');
  });

  it('empty ctx returns directives without MR-specific data (raw directives only)', async () => {
    const prompt = await buildSystemPrompt('reviewer', {});

    // The prompt should be the raw XML content, starting with directive tags.
    // No MR-specific interpolation happens in v1.
    assert.ok(
      prompt.includes('<ArchInterrogation'),
      'should start with arch-interrogation directive'
    );
    assert.ok(prompt.includes('<CodeInterrogation'), 'should include code-interrogation directive');
    // Directives are concatenated, so there should be two separate XML documents.
    assert.ok(prompt.includes('</ArchInterrogation>'), 'should close arch-interrogation');
    assert.ok(prompt.includes('</CodeInterrogation>'), 'should close code-interrogation');
  });

  it('unknown role throws error indicating role not loaded', async () => {
    await assert.rejects(
      () => buildSystemPrompt('nonexistent', {}),
      (err: Error) => {
        assert.ok(
          err.message.includes('Unknown role'),
          `error should mention "Unknown role", got: ${err.message}`
        );
        assert.ok(
          err.message.includes('Role not loaded'),
          `error should mention "Role not loaded", got: ${err.message}`
        );
        return true;
      }
    );
  });
});

// TSK-136 (D-121): the five node-ids explicitly OUTSIDE the selector.ts scope boundary must stay
// on the static NODE_DIRECTIVE_MAP unchanged — proven by comparing against the same directive
// files loaded independently (no mock of compile.ts's own collaborators), both with and without a
// populated ctx.mrShape, since only presence in SELECTOR_NODE_ROUTE (not mrShape) governs routing.
describe('static out-of-scope node-ids unaffected by selector', () => {
  const OUT_OF_SCOPE_NODE_IDS = [
    'node_thread_triage',
    'node_delta_review',
    'node_synthesize_delta',
    'node_self_review',
    'node_analyze_feedback',
  ] as const;

  const directiveBase = resolve(import.meta.dirname, '../../../ai/directives/agent-inbox');

  function loadExpectedPrompt(nodeId: string): string {
    return NODE_DIRECTIVE_MAP[nodeId]
      .map((name) => readFileSync(resolve(directiveBase, `${name}.directive.xml`), 'utf-8'))
      .join('\n');
  }

  for (const nodeId of OUT_OF_SCOPE_NODE_IDS) {
    it(`${nodeId} resolves through the static NODE_DIRECTIVE_MAP unchanged`, async () => {
      // non-goal: does not exercise selector.ts — these five node-ids stay outside TSK-136 scope
      const expected = loadExpectedPrompt(nodeId);

      const withoutMrShape = await buildNodePrompt(nodeId, {});
      const withMrShape = await buildNodePrompt(nodeId, {
        mrShape: {
          newSymbols: true,
          nestedLoops: false,
          filterMapChain: false,
          isTiny: false,
          securityHits: false,
          depManifest: false,
        },
      });

      assert.strictEqual(withoutMrShape, expected);
      assert.strictEqual(withMrShape, expected);
    });
  }
});
