// @file: Unit tests for the portal Scopes-table parser.
// @consumers: portal
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScopes } from '../portal.ts';

const PORTAL = [
  '# my-project',
  '',
  '## Vision',
  'One line.',
  '',
  '## Scope Graph',
  '```mermaid',
  'graph TD',
  '  web --> infra-base',
  '```',
  '',
  '## Scopes',
  '',
  '| Scope | Type | Spec | Description |',
  '|---|---|---|---|',
  '| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | TS + vitest |',
  '| [`api-contracts`](./api-contracts/api-contracts.spec.md) | contracts | 🚧 | REST v1 |',
  '| [`backend`](./backend/backend.spec.md) | product | ✅ | Node IMAP |',
  '',
  '## Notes',
  '| not | a | scope | row |',
].join('\n');

describe('parseScopes', () => {
  it('parses every data row under ## Scopes', () => {
    const scopes = parseScopes(PORTAL);
    assert.strictEqual(scopes.length, 3);
  });

  it('extracts name, type, status, and spec path', () => {
    const [infra, api, backend] = parseScopes(PORTAL);
    assert.deepStrictEqual(infra, {
      name: 'infra-base',
      type: 'infrastructure',
      status: 'done',
      description: 'TS + vitest',
      specPath: './infra-base/infra-base.spec.md',
    });
    assert.strictEqual(api?.status, 'wip');
    assert.strictEqual(api?.type, 'contracts');
    assert.strictEqual(backend?.name, 'backend');
  });

  it('ignores header, separator, and rows outside the Scopes section', () => {
    const scopes = parseScopes(PORTAL);
    assert.ok(!scopes.some((s) => s.name === 'not' || s.type === 'Type'));
  });

  it('returns empty when there is no Scopes section', () => {
    assert.deepStrictEqual(parseScopes('# proj\n\n## Vision\nhi\n'), []);
  });

  it('maps an unknown status cell to unknown', () => {
    const src = ['## Scopes', '|---|---|---|', '| [`x`](./x/x.spec.md) | product | ? | d |'].join(
      '\n'
    );
    assert.strictEqual(parseScopes(src)[0]?.status, 'unknown');
  });
});
