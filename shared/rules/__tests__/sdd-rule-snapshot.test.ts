// @file: Complete pre-dispatch SDD RuleSnapshot composition tests.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES } from '../builtin-rule-sources.ts';
import { resolveSddRuleSnapshot } from '../sdd-rule-snapshot.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

function fixture(): { readonly root: string; readonly cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'sdd-rule-snapshot-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = true;\n');
  for (const source of BUILTIN_RULE_SOURCES) {
    mkdirSync(dirname(join(root, source)), { recursive: true });
    writeFileSync(join(root, source), readFileSync(join(REPO_ROOT, source), 'utf8'));
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const declared = [
  'ai/directives/testing/node-test.xml',
  'ai/directives/coding/typescript-rules.xml',
] as const;

describe('resolveSddRuleSnapshot', () => {
  it('loads the complete registry and freezes exact declared bodies, facts and provenance', () => {
    const { root, cleanup } = fixture();
    try {
      const dispatch = resolveSddRuleSnapshot({
        root,
        declaredSources: declared,
        declarationFile: 'specs/app/app.task.APP.md',
        declarationProvenance: 'specs/app/app.task.APP.md#PHASE_P1.Rules',
        targetFiles: ['src/app.ts'],
        plannedFiles: ['src/app.ts'],
        intents: ['implementation'],
      });

      assert.deepEqual(
        dispatch.snapshot.required.map(({ id }) => id),
        ['testing-common', 'node-test', 'typescript-rules']
      );
      assert.match(dispatch.snapshot.required[0]?.body ?? '', /Shared testing core/);
      assert.match(dispatch.snapshot.required[1]?.body ?? '', /Node\.js built-in `node:test`/);
      assert.equal(
        dispatch.snapshot.required[1]?.provenance,
        'specs/app/app.task.APP.md#PHASE_P1.Rules'
      );
      assert.deepEqual(dispatch.facts.providers, ['node']);
      assert.strictEqual(dispatch.snapshot.facts, dispatch.facts);
      assert.equal(Object.isFrozen(dispatch.snapshot), true);

      const reversed = resolveSddRuleSnapshot({
        root,
        declaredSources: [...declared].reverse(),
        declarationFile: 'specs/app/app.task.APP.md',
        declarationProvenance: 'specs/app/app.task.APP.md#PHASE_P1.Rules',
        targetFiles: ['src/app.ts'],
        plannedFiles: ['src/app.ts'],
        intents: ['implementation'],
      });
      assert.equal(reversed.snapshot.digest, dispatch.snapshot.digest);
      assert.equal(JSON.stringify(reversed.snapshot), JSON.stringify(dispatch.snapshot));
    } finally {
      cleanup();
    }
  });

  it('fails before dispatch for missing/malformed built-ins and undeclared sources', () => {
    const { root, cleanup } = fixture();
    try {
      unlinkSync(join(root, BUILTIN_RULE_SOURCES[0]));
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /RULE_REGISTRY_SOURCE_UNAVAILABLE/
      );
      writeFileSync(
        join(root, BUILTIN_RULE_SOURCES[0]),
        readFileSync(join(REPO_ROOT, BUILTIN_RULE_SOURCES[0]), 'utf8')
      );
      writeFileSync(
        join(root, BUILTIN_RULE_SOURCES[1]),
        '<Rule>not a valid embedded header</Rule>'
      );
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /RULE_HEADER_MALFORMED/
      );
      writeFileSync(
        join(root, BUILTIN_RULE_SOURCES[1]),
        readFileSync(join(REPO_ROOT, BUILTIN_RULE_SOURCES[1]), 'utf8')
      );
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            declaredSources: ['rules/unregistered.prompt'],
            declarationProvenance: 'ticket#phase',
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /RULE_REGISTRY_SOURCE_UNAVAILABLE/
      );
    } finally {
      cleanup();
    }
  });

  it('loads safe project-local embedded prompts and rejects duplicate, malformed, symlink and escape sources', () => {
    const { root, cleanup } = fixture();
    const custom = [
      '<ProjectRule rule-id="project-contract" rule-schema="1" type="required" ver="1">',
      '<Meta>',
      '  <When intent="implementation"/>',
      '</Meta>',
      '\nProject-owned exact body.\n',
      '</ProjectRule>',
      '',
    ].join('\n');
    try {
      mkdirSync(join(root, 'rules'));
      writeFileSync(join(root, 'rules', 'project.xml'), custom);
      const dispatch = resolveSddRuleSnapshot({
        root,
        declaredSources: ['../../rules/project.xml'],
        declarationFile: 'specs/app/app.task.APP.md',
        declarationProvenance: 'specs/app/app.task.APP.md#PHASE_P1.Rules',
        targetFiles: ['src/app.ts'],
        plannedFiles: ['src/app.ts'],
        intents: ['implementation'],
      });
      assert.equal(
        dispatch.snapshot.required.find(({ id }) => id === 'project-contract')?.body,
        '\n\nProject-owned exact body.\n\n'
      );

      writeFileSync(
        join(root, 'rules', 'duplicate.xml'),
        custom.replace('project-contract', 'typescript-rules')
      );
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            declaredSources: ['../../rules/duplicate.xml'],
            declarationFile: 'specs/app/app.task.APP.md',
            declarationProvenance: 'ticket#phase',
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /RULE_REGISTRY_DUPLICATE_ID/
      );

      writeFileSync(join(root, 'rules', 'malformed.xml'), '<Rule>broken</Rule>');
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            declaredSources: ['../../rules/malformed.xml'],
            declarationFile: 'specs/app/app.task.APP.md',
            declarationProvenance: 'ticket#phase',
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /RULE_HEADER_MALFORMED/
      );

      symlinkSync('project.xml', join(root, 'rules', 'linked.xml'));
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            declaredSources: ['../../rules/linked.xml'],
            declarationFile: 'specs/app/app.task.APP.md',
            declarationProvenance: 'ticket#phase',
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /RULE_REGISTRY_SOURCE_UNAVAILABLE: rules\/linked\.xml: path contains a symlink/
      );
      assert.throws(
        () =>
          resolveSddRuleSnapshot({
            root,
            declaredSources: ['../../../../outside.xml'],
            declarationFile: 'specs/app/app.task.APP.md',
            declarationProvenance: 'ticket#phase',
            targetFiles: ['src/app.ts'],
            plannedFiles: [],
          }),
        /SDD_RULE_SOURCE_UNSAFE/
      );
    } finally {
      cleanup();
    }
  });

  it('detects Vitest facts for test artifacts, excludes strict TypeScript by default, and permits reasoned re-enable', () => {
    const { root, cleanup } = fixture();
    try {
      writeFileSync(join(root, 'src', 'app.test.ts'), 'export const test = true;\n');
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'vitest-project',
          devDependencies: { vitest: '^3.0.0' },
          scripts: { test: 'vitest run' },
        })
      );
      const input = {
        root,
        targetFiles: ['src/app.test.ts'],
        plannedFiles: ['src/app.test.ts'],
        intents: ['test'],
      } as const;
      const automatic = resolveSddRuleSnapshot(input);
      assert.deepEqual(
        automatic.snapshot.required.map(({ id }) => id),
        ['testing-common', 'vitest-rules']
      );
      assert.deepEqual(automatic.facts.artifacts[0]?.frameworks, ['vitest']);
      assert.equal(
        automatic.snapshot.skipped
          .find(({ id }) => id === 'typescript-rules')
          ?.reason.startsWith('Unless veto'),
        true
      );

      const explicit = resolveSddRuleSnapshot({
        ...input,
        overrides: [
          {
            action: 'add',
            ruleId: 'typescript-rules',
            reason: 'This test intentionally exercises the production TypeScript contract',
            provenance: 'gennady.yaml#rules.add.typescript-rules',
          },
        ],
      });
      assert.ok(
        explicit.snapshot.required.some(
          ({ id, via }) => id === 'typescript-rules' && via === 'override'
        )
      );
    } finally {
      cleanup();
    }
  });
});
