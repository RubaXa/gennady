// @file: Frozen source bytes and bounded adaptation proof for the four MAIN rule bodies.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES, loadBuiltinRuleRegistry } from '../builtin-rule-sources.ts';

type CarryEntry = {
  id: string;
  source: string;
  sourceBlobSha: string;
  sourceDigest: string;
  originalContent: string;
  bodyDigest: string;
  when: Readonly<Record<string, string[]>>[];
  unless: Readonly<Record<string, string[]>>[];
  dependsOn: string[];
  adaptedAxioms: string[];
  adaptations: string[];
};

const ROOT = resolve(import.meta.dirname, '../../..');
const CARRY = JSON.parse(
  readFileSync(new URL('./fixtures/main-carry-rules.json', import.meta.url), 'utf8')
) as {
  schema: number;
  sourceRevision: string;
  exceptionHierarchySource: string;
  entries: CarryEntry[];
};
const HISTORICAL = JSON.parse(
  readFileSync(new URL('./fixtures/rule-migration-equivalence.json', import.meta.url), 'utf8')
) as { entries: { id: string; source: string }[] };

function anchors(content: string, tag: 'Axiom' | 'AntiPattern'): Map<string, string> {
  return new Map(
    [...content.matchAll(new RegExp(`<${tag} id="([^"]+)">[\\s\\S]*?</${tag}>`, 'g'))].map(
      ([body, id]) => [id!, body]
    )
  );
}

describe('MAIN rule source provenance', () => {
  it('accounts for the complete current manifest separately from immutable historical UV-21 entries', () => {
    assert.equal(CARRY.schema, 1);
    assert.equal(CARRY.sourceRevision, '9663c65b6376c65f4b1df0daf27a06df5b25f7a3');
    assert.deepEqual(
      CARRY.entries.map(({ id }) => id),
      ['coding-baseline', 'go-rules', 'python-rules', 'testing-baseline']
    );
    const expected = [...HISTORICAL.entries, ...CARRY.entries];
    assert.equal(new Set(expected.map(({ id }) => id)).size, 18);
    assert.deepEqual(
      loadBuiltinRuleRegistry(ROOT)
        .list()
        .map(({ ruleId }) => ruleId)
        .sort(),
      expected.map(({ id }) => id).sort()
    );
    assert.deepEqual([...BUILTIN_RULE_SOURCES].sort(), expected.map(({ source }) => source).sort());
  });

  it('freezes original Git blob/source identities without depending on Git refs at test runtime', () => {
    for (const entry of CARRY.entries) {
      const bytes = Buffer.from(entry.originalContent);
      assert.equal(
        `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        entry.sourceDigest
      );
      assert.equal(
        createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
        entry.sourceBlobSha
      );
      assert.ok(entry.adaptations.length > 0, entry.id);
    }
  });

  it('preserves every axiom and antipattern except documented Python authority and testing assurance deltas', () => {
    const registry = loadBuiltinRuleRegistry(ROOT);
    for (const entry of CARRY.entries) {
      // #region START_PROVENANCE_ASSERT_EXACT_BODY_AND_ANCHORS
      const actual = registry.get(entry.id)!;
      assert.equal(actual.bodyDigest, entry.bodyDigest, entry.id);
      assert.deepEqual(actual.when, entry.when);
      assert.deepEqual(actual.unless, entry.unless);
      assert.deepEqual(actual.dependsOn, entry.dependsOn);
      const original = anchors(entry.originalContent, 'Axiom');
      const carried = anchors(actual.body, 'Axiom');
      assert.deepEqual([...carried.keys()], [...original.keys()], entry.id);
      assert.deepEqual(
        anchors(actual.body, 'AntiPattern'),
        anchors(entry.originalContent, 'AntiPattern'),
        entry.id
      );
      for (const [id, body] of original) {
        if (!entry.adaptedAxioms.includes(id)) assert.equal(carried.get(id), body, id);
      }
      assert.deepEqual(
        entry.adaptedAxioms,
        entry.id === 'python-rules'
          ? ['AX_PY_NARROW_EXCEPT', 'AX_PY_FORMAT_AND_LINT', 'AX_PY_TYPE_HINTS']
          : entry.id === 'testing-baseline'
            ? ['AX_TEST_ONE_BEHAVIOR']
            : []
      );
      // #endregion END_PROVENANCE_ASSERT_EXACT_BODY_AND_ANCHORS
    }
  });

  it('states configured DAG authority, fail-closed tooling and conditional framework examples explicitly', () => {
    const registry = loadBuiltinRuleRegistry(ROOT);
    for (const entry of CARRY.entries) {
      const body = registry.get(entry.id)!.body;
      assert.match(body, /Only the configured selector\/DAG/);
      assert.doesNotMatch(body, /<Command>|verify --wip|&lt;|skip if the project does not install/);
    }
    assert.match(
      registry.get('go-rules')!.body,
      /missing required executable is BLOCKED\/ENV_FAIL, not PASS/
    );
    assert.match(registry.get('python-rules')!.body, /If the project selects pytest/);
    assert.match(
      registry.get('python-rules')!.body,
      /except Exception:` does not catch those termination exceptions/
    );
    assert.equal(
      CARRY.exceptionHierarchySource,
      'https://docs.python.org/3/library/exceptions.html#exception-hierarchy'
    );
  });
});
