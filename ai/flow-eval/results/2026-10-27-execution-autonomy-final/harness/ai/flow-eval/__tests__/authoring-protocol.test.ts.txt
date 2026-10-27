// @file: Causal provenance controls for local dependency closure, template criteria and Flash-only runtime qualification.
// @spec: AI-SKILLS
// @consumers: authoring-protocol; node:test

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authoringProtocolIdentity,
  authoringSourceTreeDigest,
  readAuthoringRuntimeVersion,
} from '../authoring-protocol.ts';
import { TEMPLATES } from '../../../shared/sdd/templates.ts';
import { checkSpecAuthoringDraft } from '../../../shared/sdd/check.ts';
import { referenceSpec } from '../authoring-benchmark-fixtures.ts';
import type { SddEvalConfig } from '../types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = {
  runnerModel: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
  judgeModel: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
  concurrency: 1,
  observeEveryMs: 2500,
  maxObservations: 80,
  maxWallClockMs: 180000,
  stuckAfter: 12,
} as SddEvalConfig;
const identity = () => authoringProtocolIdentity(ROOT, 'scope-library', CONFIG, 'test-runtime');

it('binds recursive provision, re-export, dynamic-literal, package-alias and type-only local dependencies', async () => {
  const root = mkdtempSync(join(tmpdir(), 'authoring-protocol-tree-'));
  const files: Record<string, string> = {
    'package.json':
      '{"name":"protocol-test","type":"module","imports":{"#guard":"./shared/common/guard.ts"}}',
    'package-lock.json': '{"lockfileVersion":3,"packages":{}}',
    'tsconfig.json':
      '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","allowImportingTsExtensions":true}}',
    'ai/flow-eval/cli.ts':
      'import "./provision.ts"; import type { Contract } from "./contract.ts"; export const x = import("../../shared/mermaid/mermaid.ts");',
    'ai/flow-eval/provision.ts':
      'export { proof } from "../../shared/common/repo-file-identity.ts";',
    'ai/flow-eval/contract.ts': 'export type Contract = { complete: boolean };',
    'shared/common/repo-file-identity.ts': 'import "#guard"; export const proof = 1;',
    'shared/common/guard.ts': 'export const safe = true;',
    'shared/mermaid/mermaid.ts': 'export const parse = 1;',
  };
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    for (const [path, text] of Object.entries(files)) put(path, text);
    const before = await authoringSourceTreeDigest(root, ['ai/flow-eval/cli.ts']);
    for (const path of [
      'ai/flow-eval/provision.ts',
      'ai/flow-eval/contract.ts',
      'shared/common/repo-file-identity.ts',
      'shared/common/guard.ts',
      'shared/mermaid/mermaid.ts',
      'package-lock.json',
    ]) {
      put(path, files[path]! + '\n');
      assert.notEqual(await authoringSourceTreeDigest(root, ['ai/flow-eval/cli.ts']), before, path);
      put(path, files[path]!);
    }
    put('unrelated.ts', 'export const irrelevant = true;');
    assert.equal(
      await authoringSourceTreeDigest(root, ['ai/flow-eval/cli.ts']),
      before,
      'unreachable file does not silently redefine runtime'
    );
    put('ai/flow-eval/provision.ts', 'import "./missing.ts";');
    await assert.rejects(
      authoringSourceTreeDigest(root, ['ai/flow-eval/cli.ts']),
      /Unresolved local protocol dependency/
    );
    await assert.rejects(authoringSourceTreeDigest(root, ['../outside.ts']), /escaped root/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('heading-criteria mutation changes oracle/harness identity even when task and section flags are unchanged', async () => {
  const template = TEMPLATES.library;
  const original = template.skeleton;
  const artifact = referenceSpec('library', 'specs/token/token.spec.md');
  const before = await identity();
  try {
    template.skeleton = original.replace('## Vision & Primary Goal', '### Vision & Primary Goal');
    assert.ok(
      checkSpecAuthoringDraft('specs/token/token.spec.md', artifact).some(
        (finding) => finding.code === 'SDD_AUTHORING_HEADING_LEVEL'
      )
    );
    const after = await identity();
    assert.equal(after.taskDigest, before.taskDigest);
    assert.notEqual(after.oracleDigest, before.oracleDigest);
    assert.notEqual(after.harnessDigest, before.harnessDigest);
  } finally {
    template.skeleton = original;
  }
});

it('pure template fill/guidance evolution leaves task/oracle/harness criteria comparable', async () => {
  const template = TEMPLATES.library;
  const original = template.skeleton;
  const section = template.sections.find((section) => section.name === 'VISION')!;
  const fill = section.fill;
  const before = await identity();
  try {
    section.fill += ' Changed experimental prose only.';
    template.skeleton = original.replace(
      '<!-- УДАЛИ ПОСЛЕ ЗАПОЛНЕНИЯ:',
      '<!-- Experimental wording only. УДАЛИ ПОСЛЕ ЗАПОЛНЕНИЯ:'
    );
    assert.notEqual(template.skeleton, original, 'control actually changes guidance');
    const after = await identity();
    assert.equal(after.taskDigest, before.taskDigest);
    assert.equal(after.oracleDigest, before.oracleDigest);
    assert.equal(after.harnessDigest, before.harnessDigest);
  } finally {
    template.skeleton = original;
    section.fill = fill;
  }
});

it('table criteria and byte-exact inherited conventions are not hidden as experimental fill prose', async () => {
  const before = await identity();
  const library = TEMPLATES.library;
  const project = TEMPLATES['project-index'];
  const originalLibrary = library.skeleton;
  const originalProject = project.skeleton;
  try {
    library.skeleton = originalLibrary.replace(
      '| Rule | Category | Source |',
      '| Rule | Kind | Source |'
    );
    assert.notEqual(library.skeleton, originalLibrary);
    assert.notEqual((await identity()).oracleDigest, before.oracleDigest);
    library.skeleton = originalLibrary;
    project.skeleton = originalProject.replace('every phase', 'some phases');
    assert.notEqual(project.skeleton, originalProject);
    assert.notEqual((await identity()).oracleDigest, before.oracleDigest);
  } finally {
    library.skeleton = originalLibrary;
    project.skeleton = originalProject;
  }
});

it('qualifies only healthy Flash/default-small/explicit-agent config and rejects active MCP', async (t) => {
  let configuration: Record<string, unknown> = {
    model: 'llm-proxy/deepseek-v4-flash',
    small_model: 'llm-proxy/deepseek-v4-flash',
    agent: { build: {}, plan: { model: 'llm-proxy/deepseek-v4-flash' } },
    mcp: {},
  };
  const good = structuredClone(configuration);
  t.mock.method(globalThis, 'fetch', async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    return new Response(
      JSON.stringify(
        url.pathname === '/global/health' ? { healthy: true, version: '1.2.3' } : configuration
      ),
      { status: 200 }
    );
  });
  assert.match(
    (await readAuthoringRuntimeVersion('http://owned.invalid:4109'))!,
    /^1\.2\.3:[a-f0-9]{64}$/
  );
  for (const patch of [
    { model: 'llm-proxy/deepseek-v4-pro' },
    { small_model: 'llm-proxy/deepseek-v4-pro' },
    { small_model: undefined },
    { agent: { build: { model: 'llm-proxy/deepseek-v4-pro' } } },
    { mcp: { personal: { enabled: true } } },
  ]) {
    configuration = { ...good, ...patch };
    assert.equal(
      await readAuthoringRuntimeVersion('http://owned.invalid:4109'),
      undefined,
      JSON.stringify(patch)
    );
  }
});
