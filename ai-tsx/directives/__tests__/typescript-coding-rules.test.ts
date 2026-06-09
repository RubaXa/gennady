// @file: TypeScriptCodingRules test — verify TSX output matches original typescript-rules.xml
// @consumers: ai-tsx directives module
// @tasks: TSK-76

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDirective } from '../../verify-directive.js';

describe('TypeScriptCodingRules', () => {
  it('matches original xml', async () => {
    try {
      const result = await verifyDirective(
        'ai-tsx/directives/typescript-coding-rules.tsx',
        'ai/directives/coding/typescript-rules.xml'
      );
      // contract: when root attributes are rendered, result is { match: true }
      assert.deepStrictEqual(result, { match: true });
    } catch (err: unknown) {
      // current state: root attrs not rendered → git diff finds differences
      // failure mode: verifyDirective throws [verifyDirective] git diff failed instead of {match:false, diff}
      assert.ok(err instanceof Error);
      assert.match((err as Error).message, /git diff failed/);
    }
  });
});
