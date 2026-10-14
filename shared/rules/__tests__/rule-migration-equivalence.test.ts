// @file: Frozen entry-by-entry proof for the central-registry to embedded-metadata cutover.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES, loadBuiltinRuleRegistry } from '../builtin-rule-sources.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/rule-migration-equivalence.json', import.meta.url), 'utf8')
) as {
  schema: number;
  operatorApprovedChanges: string[];
  entries: Array<{
    id: string;
    rootTag: string;
    ruleSchema: string;
    type: string;
    version: string;
    source: string;
    bodyDigest: string;
    when: Array<Record<string, string[]>>;
    unless: Array<Record<string, string[]>>;
    dependsOn: string[];
    intent: string;
  }>;
};

function productionSources(root: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, name.name);
    if (name.isDirectory()) {
      if (name.name !== '__tests__') result.push(...productionSources(path));
    } else if (/\.(?:ts|md|hbs|xml)$/.test(name.name)) result.push(path);
  }
  return result;
}

describe('embedded rule migration equivalence', () => {
  it('preserves every old entry body, predicate intent, dependency and source exactly once', () => {
    assert.equal(FIXTURE.schema, 2);
    assert.deepEqual(FIXTURE.operatorApprovedChanges, [
      'typescript-rules: Unless role=test',
      'UV-14: eslint-setup, git-setup, and nodejs-npm-setup replace the retired whole-project runner with universal Verify',
    ]);
    assert.equal(
      FIXTURE.entries.every(({ intent }) => intent.trim() !== ''),
      true
    );
    const actual = loadBuiltinRuleRegistry(ROOT)
      .list()
      .filter(({ ruleId }) => FIXTURE.entries.some(({ id }) => id === ruleId))
      .map(
        ({
          ruleId,
          rootTag,
          ruleSchema,
          type,
          version,
          source,
          bodyDigest,
          when,
          unless,
          dependsOn,
        }) => ({
          id: ruleId,
          rootTag,
          ruleSchema,
          type,
          version,
          source,
          bodyDigest,
          when,
          unless,
          dependsOn,
        })
      );
    const expected = FIXTURE.entries.map(
      ({
        id,
        rootTag,
        ruleSchema,
        type,
        version,
        source,
        bodyDigest,
        when,
        unless,
        dependsOn,
      }) => ({
        id,
        rootTag,
        ruleSchema,
        type,
        version,
        source,
        bodyDigest,
        when,
        unless,
        dependsOn,
      })
    );

    assert.equal(actual.length, 14);
    assert.deepEqual(actual, expected);
    assert.deepEqual(
      [...BUILTIN_RULE_SOURCES]
        .filter((source) => expected.some((entry) => entry.source === source))
        .sort(),
      expected.map(({ source }) => source).sort()
    );
  });

  it('has no runtime central registry and no production consumer of its former filename', () => {
    const formerName = ['knowledge', 'xml'].join('.');
    assert.equal(existsSync(join(ROOT, 'ai', 'directives', formerName)), false);
    const consumers = ['shared', 'cli', 'services', 'ai/kit']
      .flatMap((directory) => productionSources(join(ROOT, directory)))
      .filter((path) => readFileSync(path, 'utf8').includes(formerName));
    assert.deepEqual(consumers, []);
  });
});
