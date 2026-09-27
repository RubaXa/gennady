// @file: Adversarial contract tests for lexical rule headers and deterministic registry loading.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createRuleRegistry } from '../rule-registry.ts';
import { parseRuleHeader } from '../rule-header.parser.ts';

function prompt(
  ruleId = 'typescript-core',
  body = '\n# Prompt\n\nUse A & B; snippets such as `<broken attr=>` stay opaque.\n'
): string {
  return [
    `<Rule rule-id="${ruleId}" rule-schema="1" type="required" ver="2">`,
    '<Meta>',
    '  <When language="typescript, javascript" role="production"/>',
    '  <When framework="vitest" role="test"/>',
    '  <Unless operation="docs"/>',
    '  <DependsOn rule="base &amp; safety"/>',
    '</Meta>',
    body,
    '</Rule>',
    '',
  ].join('\n');
}

describe('embedded lexical rule header', () => {
  it('preserves arbitrary XML-invalid prompt body bytes exactly', () => {
    const body = '\n## Body\nA & B <not-xml attr=> {{template}}\n<Meta>body text only</Meta>\n';
    const descriptor = parseRuleHeader('rules/typescript.prompt', prompt('typescript-core', body));

    assert.equal(descriptor.body, `\n${body}\n`);
    assert.deepEqual(descriptor.when, [
      { language: ['javascript', 'typescript'], role: ['production'] },
      { framework: ['vitest'], role: ['test'] },
    ]);
    assert.deepEqual(descriptor.unless, [{ operation: ['docs'] }]);
    assert.deepEqual(descriptor.dependsOn, ['base & safety']);
    assert.match(descriptor.bodyDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor.when[0]), true);
  });

  const malformed = [
    ['leading bytes', ` \n${prompt()}`, /first bytes/],
    ['missing root attribute', prompt().replace(' rule-schema="1"', ''), /missing rule-schema/],
    [
      'duplicate root attribute',
      prompt().replace(' type="required"', ' type="required" type="suggested"'),
      /duplicates attribute type/,
    ],
    [
      'unknown root attribute',
      prompt().replace(' ver="2"', ' extra="x" ver="2"'),
      /unknown attribute extra/,
    ],
    ['unquoted scalar', prompt().replace('ver="2"', 'ver=2'), /unquoted or malformed/],
    [
      'unknown entity',
      prompt().replace('rule-schema="1"', 'rule-schema="1 &copy;"'),
      /unknown or malformed entity/,
    ],
    [
      'raw angle',
      prompt().replace('rule-schema="1"', 'rule-schema="1 < 2"'),
      /root tag|unescaped angle/,
    ],
    ['control', prompt().replace('ver="2"', 'ver="2\u0001"'), /control character/],
    [
      'Meta with attributes',
      prompt().replace('<Meta>', '<Meta version="1">'),
      /Meta must be the immediate header/,
    ],
    ['Meta text', prompt().replace('  <When', '  prose\n  <When'), /permits only self-closing/],
    [
      'unknown Meta child',
      prompt().replace('<Unless operation="docs"/>', '<Other/>'),
      /permits only/,
    ],
    [
      'non-self-closing child',
      prompt().replace('<Unless operation="docs"/>', '<Unless operation="docs"></Unless>'),
      /permits only/,
    ],
    [
      'unknown predicate',
      prompt().replace('operation="docs"', 'unknown="docs"'),
      /unknown attribute unknown/,
    ],
    [
      'duplicate predicate',
      prompt().replace('operation="docs"', 'operation="docs" operation="code"'),
      /duplicates attribute operation/,
    ],
    [
      'empty list member',
      prompt().replace('typescript, javascript', 'typescript, ,javascript'),
      /empty comma-list member/,
    ],
    [
      'DependsOn extra attribute',
      prompt().replace('rule="base &amp; safety"', 'rule="base" type="x"'),
      /unknown attribute type/,
    ],
    ['missing Meta close', prompt().replace('</Meta>', ''), /Meta has no literal closing tag/],
    ['mismatched final close', prompt().replace('</Rule>\n', '</Other>\n'), /final literal close/],
    ['trailing content', `${prompt()}extra`, /final literal close/],
  ] as const;

  for (const [name, source, expected] of malformed) {
    it(`fails closed with source for ${name}`, () => {
      assert.throws(
        () => parseRuleHeader('rules/broken.prompt', source),
        (error: unknown) => {
          assert.match(String(error), /RULE_HEADER_MALFORMED: rules\/broken\.prompt:/);
          assert.match(String(error), expected);
          return true;
        }
      );
    });
  }
});

describe('RuleRegistry', () => {
  it('orders sources and descriptors deterministically independent of input order', () => {
    const forward = createRuleRegistry([
      { source: 'z.prompt', content: prompt('alpha') },
      { source: 'a.prompt', content: prompt('zeta') },
    ]);
    const reverse = createRuleRegistry([
      { source: 'a.prompt', content: prompt('zeta') },
      { source: 'z.prompt', content: prompt('alpha') },
    ]);

    assert.deepEqual(
      forward.list().map(({ ruleId, source }) => [ruleId, source]),
      [
        ['alpha', 'z.prompt'],
        ['zeta', 'a.prompt'],
      ]
    );
    assert.deepEqual(forward.list(), reverse.list());
    assert.equal(forward.get('alpha')?.source, 'z.prompt');
    assert.equal(forward.get('missing'), undefined);
    assert.equal(Object.isFrozen(forward), true);
    assert.equal(Object.isFrozen(forward.list()), true);
  });

  it('rejects duplicate ids with both exact sources', () => {
    assert.throws(
      () =>
        createRuleRegistry([
          { source: 'b.prompt', content: prompt('duplicate') },
          { source: 'a.prompt', content: prompt('duplicate') },
        ]),
      /RULE_REGISTRY_DUPLICATE_ID: duplicate: a\.prompt, b\.prompt/
    );
  });

  it('rejects duplicate source identities before ambiguous loading', () => {
    assert.throws(
      () =>
        createRuleRegistry([
          { source: 'same.prompt', content: prompt('one') },
          { source: 'same.prompt', content: prompt('two') },
        ]),
      /RULE_REGISTRY_DUPLICATE_SOURCE: same\.prompt/
    );
  });

  it('keeps knowledge.xml and its legacy consumer until the later equivalence migration', () => {
    const knowledge = readFileSync('ai/directives/knowledge.xml', 'utf8');
    const consumer = readFileSync('shared/sdd/task-authoring-literals.ts', 'utf8');

    assert.match(knowledge, /<AiKnowledge/);
    assert.match(consumer, /knowledge\.xml/);
  });
});
