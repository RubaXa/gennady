// @file: Canonical RuleSnapshot identity and immutability contract tests.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPhaseFacts } from '../phase-facts.ts';
import { createRuleRegistry } from '../rule-registry.ts';
import { RuleResolver } from '../rule-resolver.ts';
import { createRuleSnapshot } from '../rule-snapshot.ts';

type RuleOverride = NonNullable<Parameters<typeof RuleResolver.resolve>[2]>[number];

function prompt(input: {
  readonly id: string;
  readonly body?: string;
  readonly predicate?: string;
  readonly dependsOn?: string;
  readonly type?: 'required' | 'suggested';
}): string {
  return [
    `<Rule rule-id="${input.id}" rule-schema="1" type="${input.type ?? 'required'}" ver="1">`,
    '<Meta>',
    `  <When ${input.predicate ?? 'language="typescript"'}/>`,
    ...(input.dependsOn === undefined ? [] : [`  <DependsOn rule="${input.dependsOn}"/>`]),
    '</Meta>',
    input.body ?? `\n# ${input.id}\n\nExact A & B prompt body.\n`,
    '</Rule>',
    '',
  ].join('\n');
}

function build(input?: {
  readonly reverse?: boolean;
  readonly body?: string;
  readonly predicate?: string;
  readonly files?: readonly string[];
  readonly overrides?: readonly RuleOverride[];
  readonly source?: string;
}) {
  const sources = [
    {
      source: input?.source ?? 'ai/rules/typescript.prompt',
      content: prompt({
        id: 'typescript',
        body: input?.body,
        predicate: input?.predicate,
        dependsOn: 'base',
      }),
    },
    {
      source: 'ai/rules/base.prompt',
      content: prompt({ id: 'base', predicate: 'role="never-selected"' }),
    },
  ];
  const registry = createRuleRegistry(input?.reverse ? [...sources].reverse() : sources);
  const files = input?.files ?? ['src/app.ts', 'src/z.ts'];
  const facts = classifyPhaseFacts({
    targetFiles: input?.reverse ? [...files].reverse() : files,
    plannedFiles: [],
    operations: input?.reverse ? ['write', 'review'] : ['review', 'write'],
  });
  const overrides = input?.overrides ?? [];
  return createRuleSnapshot(registry, facts, overrides);
}

describe('RuleSnapshot canonical identity', () => {
  it('is byte-identical and deeply frozen independent of registry and fact insertion order', () => {
    const forward = build();
    const reverse = build({ reverse: true });

    assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
    assert.equal(forward.digest, reverse.digest);
    assert.match(forward.digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.isFrozen(forward), true);
    assert.equal(Object.isFrozen(forward.required), true);
    assert.equal(Object.isFrozen(forward.required[0]), true);
    assert.equal(forward.required[0]?.body, '\n\n# base\n\nExact A & B prompt body.\n\n');
    assert.deepEqual(
      forward.required.map(({ id, via }) => [id, via]),
      [
        ['base', 'dependency'],
        ['typescript', 'predicate'],
      ]
    );
  });

  it('changes for body, predicate, facts, override reason and override provenance drift', () => {
    const baseline = build();
    const variants = [
      build({ body: '\nchanged body\n' }),
      build({ predicate: 'language="javascript"' }),
      build({ files: ['src/other.ts'] }),
      build({ source: 'project/rules/typescript.prompt' }),
      build({
        overrides: [
          {
            action: 'add',
            ruleId: 'base',
            reason: 'project policy',
            provenance: 'gennady.yaml:rules.add',
          },
        ],
      }),
      build({
        overrides: [
          {
            action: 'add',
            ruleId: 'base',
            reason: 'project policy',
            provenance: '.gennadyrc:rules.add',
          },
        ],
      }),
    ];

    for (const variant of variants) assert.notEqual(variant.digest, baseline.digest);
    assert.equal(new Set(variants.map(({ digest }) => digest)).size, variants.length);
  });

  it('rejects absolute source identity instead of hashing host-specific paths', () => {
    assert.throws(
      () => build({ source: '/private/tmp/typescript.prompt' }),
      /RULE_SNAPSHOT_NON_PORTABLE_IDENTITY: typescript\.source/
    );
  });
});
