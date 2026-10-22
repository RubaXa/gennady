// @file: Source-owned identity for controlled authoring experiments, separate from requested variant labels.
// @spec: AI-SKILLS
// @consumers: flow-eval CLI; authoring comparison reports

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { getAuthoringCase, type AuthoringCaseId } from './authoring-benchmark.ts';
import type { SddEvalConfig } from './types.ts';
import { TEMPLATES, foldSections, loadBearingSections } from '../../shared/sdd/templates.ts';
import {
  collectHeadings,
  extractHeadingSection,
  extractSection,
} from '../../shared/sdd/section.ts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const TEMPLATE_SOURCE = 'shared/sdd/templates.ts';
const FLASH = 'llm-proxy/deepseek-v4-flash';

/** @purpose Bind validator-facing template structure, not the fill guidance being experimentally changed. */
function templateValidationTopology() {
  return Object.values(TEMPLATES).map((template) => ({
    kind: template.kind,
    sections: template.sections.map(({ fill: _fill, ...section }) => section),
    anchors: [...template.skeleton.matchAll(/<!--\/?SECTION:([A-Z][A-Z0-9_]*)-->/g)].map(
      (match) => match[0]
    ),
    // Anchored draft validation reads the first heading in each section. Plain index/portal
    // validation maps exact level-2 headings to the manifest. Offsets/body prose are not criteria.
    headings: template.skeleton.includes('<!--SECTION:')
      ? template.sections.map((section) => {
          const body = extractSection(template.skeleton, section.name);
          const first = body.status === 'ok' ? collectHeadings(body.content)[0] : undefined;
          return {
            section: section.name,
            heading: first ? { level: first.level, text: first.text } : null,
          };
        })
      : collectHeadings(template.skeleton)
          .filter((heading) => heading.level === 2)
          .map(({ level, text }) => ({ level, text })),
    tables: template.skeleton.split('\n').flatMap((line, index, lines) =>
      line.trim().startsWith('|') && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1] ?? '')
        ? [
            line
              .split('|')
              .slice(1, -1)
              .map((cell) => cell.trim()),
          ]
        : []
    ),
    loadBearing: loadBearingSections(template.kind),
    folded: foldSections(template.kind),
    // The artifact oracle explicitly demands byte-preserving inheritance of these conventions.
    ...(template.kind === 'project-index'
      ? {
          conventions: extractHeadingSection(
            template.skeleton,
            'project-wide-conventions-declared-once-inherited'
          ),
        }
      : {}),
  }));
}

/** @purpose Hash the conservative static local dependency closure, including type/re-export/dynamic-literal edges.
 * External packages are bound by package-lock.json. Template body/guidance is deliberately projected
 * as validation topology, while its own local dependencies are still traversed. No source is executed. */
export async function authoringSourceTreeDigest(
  root: string,
  entries: readonly string[]
): Promise<string> {
  const canonicalRoot = resolve(root);
  const configuration = ts.readConfigFile(join(canonicalRoot, 'tsconfig.json'), ts.sys.readFile);
  if (configuration.error) throw new Error('Cannot read authoring protocol tsconfig');
  const converted = ts.convertCompilerOptionsFromJson(
    configuration.config.compilerOptions ?? {},
    canonicalRoot
  );
  if (converted.errors.length) throw new Error('Invalid authoring protocol compiler options');
  const contents = new Map<string, unknown>([
    ['package.json', await readFile(join(canonicalRoot, 'package.json'), 'utf8')],
    ['tsconfig.json', await readFile(join(canonicalRoot, 'tsconfig.json'), 'utf8')],
    ['package-lock.json', await readFile(join(canonicalRoot, 'package-lock.json'), 'utf8')],
  ]);
  const pending = entries.map((file) => resolve(canonicalRoot, file));
  const seen = new Set<string>();
  let bytes = 0;
  while (pending.length) {
    const absolute = pending.pop()!;
    const file = relative(canonicalRoot, absolute).split(sep).join('/');
    if (!file || file === '..' || file.startsWith('../') || isAbsolute(file))
      throw new Error('Protocol source escaped root');
    if (seen.has(file)) continue;
    seen.add(file);
    if (seen.size > 2000) throw new Error('Authoring protocol source closure exceeds file bound');
    const text = await readFile(absolute, 'utf8');
    bytes += Buffer.byteLength(text);
    if (bytes > 32 * 1024 * 1024)
      throw new Error('Authoring protocol source closure exceeds byte bound');
    contents.set(file, file === TEMPLATE_SOURCE ? templateValidationTopology() : text);
    for (const dependency of ts.preProcessFile(text, true, true).importedFiles) {
      const name = dependency.fileName;
      if (name.startsWith('node:')) continue;
      const module = ts.resolveModuleName(name, absolute, converted.options, ts.sys).resolvedModule;
      if (!module) {
        if (name.startsWith('.') || name.startsWith('#'))
          throw new Error(`Unresolved local protocol dependency: ${file} -> ${name}`);
        continue; // An optional external import is still lock-bound; never execute it here.
      }
      if (
        !module.isExternalLibraryImport &&
        !module.resolvedFileName.split(sep).includes('node_modules')
      )
        pending.push(module.resolvedFileName);
    }
  }
  return hash([...contents].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}

/** @purpose Read only the server's public version; absent health evidence cannot qualify a speed comparison. */
export async function readAuthoringRuntimeVersion(baseUrl: string): Promise<string | undefined> {
  try {
    const result = await fetch(new URL('/global/health', baseUrl), {
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) return;
    const data = (await result.json()) as { healthy?: unknown; version?: unknown };
    if (
      !(
        data.healthy === true &&
        typeof data.version === 'string' &&
        /^\d+\.\d+\.\d+(?:[-.][\w.-]+)?$/.test(data.version)
      )
    )
      return undefined;
    const settings = await fetch(new URL('/config', baseUrl), {
      signal: AbortSignal.timeout(3000),
    });
    if (!settings.ok) return undefined;
    const config = (await settings.json()) as Record<string, unknown>;
    if (config.model !== FLASH || config.small_model !== FLASH) return undefined;
    const agents = config.agent as Record<string, { model?: unknown }> | undefined;
    if (
      Object.values(agents ?? {}).some(
        (agent) => agent.model !== undefined && agent.model !== FLASH
      )
    )
      return undefined;
    const mcp = config.mcp as Record<string, { enabled?: boolean }> | undefined;
    if (Object.values(mcp ?? {}).some((entry) => entry.enabled !== false)) return undefined;
    // Only behavior-bearing configuration; never provider credentials, command environments or headers.
    const projection = Object.fromEntries(
      [
        'model',
        'small_model',
        'enabled_providers',
        'agent',
        'permission',
        'tools',
        'instructions',
        'compaction',
        'plugin',
      ].map((key) => [key, config[key]])
    );
    return `${data.version}:${hash(projection)}`;
  } catch {
    return undefined;
  }
}

/** @purpose Freeze task, oracle, harness and environment before worker execution, not after seeing outcomes. */
export async function authoringProtocolIdentity(
  root: string,
  caseId: AuthoringCaseId,
  config: SddEvalConfig,
  runtimeVersion?: string
) {
  const definition = getAuthoringCase(caseId);
  const harnessFiles = [
    'cli.ts',
    'types.ts',
    'prompts.ts',
    'runner.ts',
    'observer.ts',
    'evidence.ts',
    'opencode-runtime.ts',
    'trajectory.ts',
    'results-archive.ts',
    'authoring-metrics.ts',
    'authoring-protocol.ts',
    'provision.ts',
    'dependency-store.ts',
    'sandbox-lifecycle.ts',
    'opencode-client.ts',
    'judge.ts',
    'scripts/authoring-experiment.ts',
  ].map((name) => `ai/flow-eval/${name}`);
  return {
    taskDigest: hash({
      caseId,
      kind: definition.kind,
      target: definition.target,
      createArgs: definition.createArgs,
      brief: definition.brief,
      files: definition.files,
    }),
    oracleDigest: await authoringSourceTreeDigest(root, ['ai/flow-eval/authoring-benchmark.ts']),
    harnessDigest: await authoringSourceTreeDigest(root, harnessFiles),
    environmentDigest: hash({
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      runtimeVersion,
      dependencyLockDigest: hash(await readFile(join(root, 'package-lock.json'), 'utf8')),
      model: config.runnerModel,
      judgeModel: config.judgeModel,
      concurrency: config.concurrency,
      observeEveryMs: config.observeEveryMs,
      maxObservations: config.maxObservations,
      maxWallClockMs: config.maxWallClockMs,
      stuckAfter: config.stuckAfter,
      agent: config.agent,
    }),
    environmentVerified: runtimeVersion !== undefined,
  };
}
