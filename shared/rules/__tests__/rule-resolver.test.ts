// @file: Adversarial contract tests for deterministic rule selection and dependency closure.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPhaseFacts } from '../phase-facts.ts';
import { createRuleRegistry } from '../rule-registry.ts';
import { RuleResolver } from '../rule-resolver.ts';

type HeaderChild =
  | { readonly tag: 'When' | 'Unless'; readonly attributes: Readonly<Record<string, string>> }
  | { readonly tag: 'DependsOn'; readonly rule: string };

function prompt(input: {
  readonly id: string;
  readonly type?: 'required' | 'suggested';
  readonly children?: readonly HeaderChild[];
  readonly body?: string;
}): string {
  const children = (input.children ?? [])
    .map((child) => {
      if (child.tag === 'DependsOn') return `  <DependsOn rule="${child.rule}"/>`;
      const attributes = Object.entries(child.attributes)
        .map(([name, value]) => `${name}="${value}"`)
        .join(' ');
      return `  <${child.tag} ${attributes}/>`;
    })
    .join('\n');
  return [
    `<Rule rule-id="${input.id}" rule-schema="1" type="${input.type ?? 'required'}" ver="1">`,
    '<Meta>',
    children,
    '</Meta>',
    input.body ?? `\n# ${input.id}\n`,
    '</Rule>',
    '',
  ].join('\n');
}

function registry(
  rules: readonly Parameters<typeof prompt>[0][]
): ReturnType<typeof createRuleRegistry> {
  return createRuleRegistry(
    rules.map((rule, index) => ({
      source: `rules/${String(index).padStart(2, '0')}-${rule.id}`,
      content: prompt(rule),
    }))
  );
}

const typescriptProduction = classifyPhaseFacts({
  targetFiles: ['src/app.ts'],
  plannedFiles: [],
});
const vitestOnly = classifyPhaseFacts({
  targetFiles: ['src/app.test.ts'],
  plannedFiles: [],
  artifacts: [{ path: 'src/app.test.ts', frameworks: ['vitest'] }],
});

describe('RuleResolver predicate semantics', () => {
  it('evaluates When clauses as OR, attributes as same-artifact AND, and comma values as OR', () => {
    const rules = registry([
      {
        id: 'or-and-comma',
        children: [
          { tag: 'When', attributes: { language: 'typescript,go', role: 'production' } },
          { tag: 'When', attributes: { framework: 'vitest', role: 'test' } },
        ],
      },
      {
        id: 'no-cross-artifact-and',
        children: [{ tag: 'When', attributes: { language: 'typescript', role: 'test' } }],
      },
      {
        id: 'source-pattern',
        children: [{ tag: 'When', attributes: { language: 'typescript', pattern: 'src/**/*.ts' } }],
      },
    ]);
    const mixed = classifyPhaseFacts({
      targetFiles: ['src/app.ts', 'cmd/main_test.go'],
      plannedFiles: [],
    });

    assert.deepEqual(
      RuleResolver.resolve(rules, typescriptProduction).required.map(({ rule }) => rule.ruleId),
      ['or-and-comma', 'source-pattern']
    );
    assert.deepEqual(
      RuleResolver.resolve(rules, vitestOnly).required.map(({ rule }) => rule.ruleId),
      ['no-cross-artifact-and', 'or-and-comma', 'source-pattern']
    );
    assert.deepEqual(
      RuleResolver.resolve(rules, mixed).required.map(({ rule }) => rule.ruleId),
      ['or-and-comma', 'source-pattern']
    );
  });

  it('lets any matching Unless veto an otherwise matching rule', () => {
    const rules = registry([
      {
        id: 'strict-production',
        children: [
          { tag: 'When', attributes: { language: 'typescript' } },
          { tag: 'Unless', attributes: { framework: 'vitest', role: 'test' } },
        ],
      },
    ]);
    const mixed = classifyPhaseFacts({
      targetFiles: ['src/app.ts', 'src/app.test.ts'],
      plannedFiles: [],
      artifacts: [{ path: 'src/app.test.ts', frameworks: ['vitest'] }],
    });
    const resolution = RuleResolver.resolve(rules, mixed);

    assert.deepEqual(resolution.required, []);
    assert.equal(resolution.skipped[0]?.rule.ruleId, 'strict-production');
    assert.match(resolution.skipped[0]?.reason ?? '', /Unless veto/);
  });

  it('selects TS core + test-light + Vitest for tests while excluding production strictness', () => {
    const rules = registry([
      {
        id: 'typescript-core',
        children: [{ tag: 'When', attributes: { language: 'typescript' } }],
      },
      {
        id: 'typescript-production-strict',
        children: [{ tag: 'When', attributes: { language: 'typescript', role: 'production' } }],
      },
      {
        id: 'testing-light',
        children: [{ tag: 'When', attributes: { role: 'test' } }],
      },
      {
        id: 'vitest',
        type: 'suggested',
        children: [{ tag: 'When', attributes: { framework: 'vitest' } }],
      },
    ]);
    const resolution = RuleResolver.resolve(rules, vitestOnly);

    assert.deepEqual(
      resolution.required.map(({ rule }) => rule.ruleId),
      ['testing-light', 'typescript-core']
    );
    assert.deepEqual(
      resolution.suggested.map(({ rule }) => rule.ruleId),
      ['vitest']
    );
    assert.deepEqual(
      resolution.skipped.map(({ rule }) => rule.ruleId),
      ['typescript-production-strict']
    );
  });

  it('matches mixed artifact and phase/project facts without primary-stack fallback', () => {
    const rules = registry([
      { id: 'ts', children: [{ tag: 'When', attributes: { language: 'typescript' } }] },
      { id: 'go', children: [{ tag: 'When', attributes: { language: 'go' } }] },
      { id: 'css', children: [{ tag: 'When', attributes: { language: 'css' } }] },
      { id: 'bash', children: [{ tag: 'When', attributes: { language: 'bash' } }] },
      {
        id: 'release-operation',
        children: [
          {
            tag: 'When',
            attributes: { operation: 'release', intent: 'ship', platform: 'linux', tool: 'vite' },
          },
        ],
      },
    ]);
    const facts = classifyPhaseFacts({
      targetFiles: ['src/app.ts', 'cmd/main.go', 'web/app.css', 'scripts/release.sh'],
      plannedFiles: [],
      operations: ['release'],
      intents: ['ship'],
      platforms: ['linux'],
      project: { tool: ['vite'] },
    });

    assert.deepEqual(
      RuleResolver.resolve(rules, facts).required.map(({ rule }) => rule.ruleId),
      ['bash', 'css', 'go', 'release-operation', 'ts']
    );
  });

  it('fails closed when a descriptor supplies an unsupported predicate fact', () => {
    const valid = registry([
      { id: 'bad', children: [{ tag: 'When', attributes: { language: 'typescript' } }] },
    ]);
    const descriptor = valid.list()[0];
    assert.ok(descriptor);
    const unsupported = {
      list: () => [
        {
          ...descriptor,
          when: [{ runtime: ['node'] }],
          unless: [{ language: ['typescript'] }],
        },
      ],
      get: () => descriptor,
    };

    assert.throws(
      () => RuleResolver.resolve(unsupported, typescriptProduction),
      /RULE_RESOLUTION_UNSUPPORTED_PREDICATE: bad: runtime/
    );
  });
});

describe('RuleResolver dependencies and overrides', () => {
  it('closes dependencies transitively in deterministic topological then id order', () => {
    const rules = registry([
      {
        id: 'app',
        children: [
          { tag: 'When', attributes: { language: 'typescript' } },
          { tag: 'DependsOn', rule: 'base' },
        ],
      },
      { id: 'root', children: [{ tag: 'When', attributes: { language: 'never' } }] },
      {
        id: 'base',
        children: [
          { tag: 'When', attributes: { language: 'never' } },
          { tag: 'DependsOn', rule: 'root' },
        ],
      },
      { id: 'alpha', children: [{ tag: 'When', attributes: { language: 'typescript' } }] },
    ]);
    const resolution = RuleResolver.resolve(rules, typescriptProduction);
    const reversedRegistry = {
      list: () => [...rules.list()].reverse(),
      get: rules.get,
    };
    const reversed = RuleResolver.resolve(reversedRegistry, typescriptProduction);

    assert.deepEqual(
      resolution.required.map(({ rule }) => rule.ruleId),
      ['alpha', 'root', 'base', 'app']
    );
    assert.deepEqual(reversed, resolution);
    assert.equal(resolution.required.find(({ rule }) => rule.ruleId === 'root')?.via, 'dependency');
  });

  it('fails closed for missing dependencies and cycles anywhere in the registry', () => {
    const missing = registry([
      {
        id: 'parent',
        children: [
          { tag: 'When', attributes: { language: 'typescript' } },
          { tag: 'DependsOn', rule: 'absent' },
        ],
      },
    ]);
    const cycle = registry([
      { id: 'a', children: [{ tag: 'DependsOn', rule: 'b' }] },
      { id: 'b', children: [{ tag: 'DependsOn', rule: 'a' }] },
    ]);

    assert.throws(
      () => RuleResolver.resolve(missing, typescriptProduction),
      /RULE_RESOLUTION_MISSING_DEPENDENCY: parent -> absent/
    );
    assert.throws(
      () => RuleResolver.resolve(cycle, typescriptProduction),
      /RULE_RESOLUTION_DEPENDENCY_CYCLE: a -> b -> a/
    );
  });

  it('applies reasoned add/skip overrides with provenance and preserves exact prompt identity', () => {
    const rules = registry([
      {
        id: 'suggested-extra',
        type: 'suggested',
        body: '\nEXACT BODY & <opaque>\n',
        children: [{ tag: 'When', attributes: { language: 'go' } }],
      },
      { id: 'default', children: [{ tag: 'When', attributes: { language: 'typescript' } }] },
    ]);
    const resolution = RuleResolver.resolve(rules, typescriptProduction, [
      {
        action: 'add',
        ruleId: 'suggested-extra',
        reason: 'Project requires this review',
        provenance: 'gennady.yaml:rules.add',
      },
      {
        action: 'skip',
        ruleId: 'default',
        reason: 'Generated source is exempt',
        provenance: 'ticket:P1',
      },
    ]);

    assert.deepEqual(resolution.required, []);
    assert.equal(resolution.suggested[0]?.rule.ruleId, 'suggested-extra');
    assert.equal(resolution.suggested[0]?.rule.body, '\n\nEXACT BODY & <opaque>\n\n');
    assert.equal(resolution.suggested[0]?.reason, 'Project requires this review');
    assert.equal(resolution.suggested[0]?.provenance, 'gennady.yaml:rules.add');
    assert.equal(resolution.suggested[0]?.via, 'override');
    assert.equal(resolution.skipped[0]?.rule.ruleId, 'default');
    assert.equal(resolution.skipped[0]?.reason, 'Generated source is exempt');
    assert.equal(resolution.skipped[0]?.provenance, 'ticket:P1');
    assert.equal(Object.isFrozen(resolution), true);
    assert.equal(Object.isFrozen(resolution.suggested), true);
    assert.equal(Object.isFrozen(resolution.suggested[0]), true);
  });

  it('rejects empty override evidence, conflicts, unknown ids, and skipped required dependencies', () => {
    const rules = registry([
      {
        id: 'parent',
        children: [
          { tag: 'When', attributes: { language: 'typescript' } },
          { tag: 'DependsOn', rule: 'base' },
        ],
      },
      { id: 'base' },
    ]);

    assert.throws(
      () =>
        RuleResolver.resolve(rules, typescriptProduction, [
          { action: 'skip', ruleId: 'base', reason: 'not here', provenance: 'ticket:P1' },
        ]),
      /RULE_RESOLUTION_REQUIRED_DEPENDENCY_SKIPPED: parent -> base/
    );
    assert.throws(
      () =>
        RuleResolver.resolve(rules, typescriptProduction, [
          { action: 'add', ruleId: 'base', reason: ' ', provenance: 'ticket:P1' },
        ]),
      /RULE_RESOLUTION_INVALID_OVERRIDE: base: reason/
    );
    assert.throws(
      () =>
        RuleResolver.resolve(rules, typescriptProduction, [
          { action: 'add', ruleId: 'base', reason: 'needed', provenance: '' },
        ]),
      /RULE_RESOLUTION_INVALID_OVERRIDE: base: provenance/
    );
    assert.throws(
      () =>
        RuleResolver.resolve(rules, typescriptProduction, [
          { action: 'add', ruleId: 'missing', reason: 'needed', provenance: 'ticket:P1' },
        ]),
      /RULE_RESOLUTION_UNKNOWN_OVERRIDE: missing/
    );
    assert.throws(
      () =>
        RuleResolver.resolve(rules, typescriptProduction, [
          { action: 'add', ruleId: 'base', reason: 'needed', provenance: 'ticket:P1' },
          { action: 'skip', ruleId: 'base', reason: 'not needed', provenance: 'ticket:P1' },
        ]),
      /RULE_RESOLUTION_OVERRIDE_CONFLICT: base/
    );
    assert.throws(
      () =>
        RuleResolver.resolve(rules, typescriptProduction, [
          {
            action: 'replace' as 'add',
            ruleId: 'base',
            reason: 'needed',
            provenance: 'ticket:P1',
          },
        ]),
      /RULE_RESOLUTION_INVALID_OVERRIDE: base: action/
    );
  });
});
