// @file: Ten source-owned template authoring cases and a read-only, phase-correct artifact oracle.
// @spec: AI-SKILLS
// @consumers: flow-eval authoring integration; deterministic benchmark tests

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import {
  checkDecisionLogIds,
  checkPortal,
  checkSpecAuthoringDraft,
  checkTrackers,
  checkScopeDeps,
  checkSpecHierarchy,
  ticketRef,
} from '../../shared/sdd/check.ts';
import { collectHeadings, extractSection } from '../../shared/sdd/section.ts';
import { parseGraphEdges, parseScopes } from '../../shared/sdd/portal.ts';
import { parseTrackerRows } from '../../shared/sdd/tracker.ts';
import { deriveInitialSpecId, parseSpecId } from '../../shared/sdd/spec-id.ts';
import { extractMermaidBlocks } from '../../shared/mermaid/mermaid.ts';
import { TEMPLATES, type ArtifactKind } from '../../shared/sdd/templates.ts';
import {
  REFERENCE_PORTAL,
  TOKEN_EXAMPLES,
  referenceIndex,
  referenceSpec,
  referenceTicket,
  type AuthoringRevision,
} from './authoring-benchmark-fixtures.ts';

export const AUTHORING_CASE_IDS = [
  'portal',
  'scope-product',
  'scope-library',
  'scope-infrastructure',
  'scope-interface',
  'module-flat',
  'module-nested',
  'index-module',
  'index-scope',
  'index-project',
] as const;
export type AuthoringCaseId = (typeof AUTHORING_CASE_IDS)[number];
/** @purpose Version new oracle calibrations without regrading explicit historical revisions. */
export type AuthoringBenchmarkRevision =
  | AuthoringRevision
  | 'calibrated-v2'
  | 'calibrated-v3'
  | 'calibrated-v4'
  | 'calibrated-v5';
export const CURRENT_AUTHORING_BENCHMARK_REVISION: AuthoringBenchmarkRevision = 'calibrated-v5';
export type AuthoringFact = { id: string; section: string; description: string };
export type AuthoringCase = {
  id: AuthoringCaseId;
  kind: ArtifactKind;
  target: string;
  createArgs: string[];
  brief: string;
  files: Record<string, string>;
  requiredFacts: AuthoringFact[];
};
export type AuthoringCheck = { id: string; pass: boolean; detail: string };
export type AuthoringBenchmarkResult = {
  rule: 'AUTHORING';
  pass: boolean;
  detail: string;
  checks: AuthoringCheck[];
};

const SCOPE = 'specs/token/token.spec.md';
const MODULE = 'specs/token/normalize/normalize.spec.md';
const MODULE_INDEX = 'specs/token/normalize/normalize.3-tasks.md';
const SCOPE_INDEX = 'specs/token/token.3-tasks.md';
const PROJECT_INDEX = 'specs/3-tasks.md';
const INFRA = 'specs/infra-base/infra-base.spec.md';
const TICKETS = ['NOR-normalize', 'NOR-reject'] as const;
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

/** @purpose Return fresh source-owned truth; callers cannot mutate the oracle via a fixture object. */
export function getAuthoringCase(
  id: AuthoringCaseId,
  revision: AuthoringRevision = 'calibrated'
): AuthoringCase {
  if (!AUTHORING_CASE_IDS.includes(id)) throw new Error(`Unknown authoring case: ${id}`);
  const scopeKind = id.startsWith('scope-')
    ? (id.slice(6) as 'product' | 'library' | 'infrastructure' | 'interface')
    : undefined;
  const kind: ArtifactKind =
    scopeKind ??
    (id === 'portal'
      ? 'portal'
      : id.startsWith('module-')
        ? 'module'
        : id === 'index-module'
          ? 'module-index'
          : id === 'index-scope'
            ? 'scope-index'
            : 'project-index');
  const scopeName =
    scopeKind === 'infrastructure'
      ? 'infra-token'
      : scopeKind === 'interface'
        ? 'token-api'
        : 'token';
  const scopePath = `specs/${scopeName}/${scopeName}.spec.md`;
  const modulePath = id === 'module-nested' ? 'pipeline/normalize' : 'normalize';
  const moduleTarget = `specs/token/${modulePath}/normalize.spec.md`;
  const target = scopeKind
    ? scopePath
    : kind === 'portal'
      ? 'specs/README.md'
      : kind === 'module'
        ? moduleTarget
        : kind === 'module-index'
          ? MODULE_INDEX
          : kind === 'scope-index'
            ? SCOPE_INDEX
            : PROJECT_INDEX;
  const createArgs = [kind] as string[];
  if (!['portal', 'project-index'].includes(kind)) createArgs.push('--scope', scopeName);
  if (kind === 'module') createArgs.push('--module', modulePath);
  if (kind === 'module-index') createArgs.push('--module', 'normalize');
  const files: Record<string, string> = {
    'package.json': '{"name":"token-authoring-benchmark","private":true,"type":"module"}\n',
    'AGENTS.md':
      '# Authoring boundary\nCreate and author only the requested target. Preserve all seeded references. No product implementation, tickets, approvals or tooling changes.\n',
    'docs/token-contract.md':
      '# Token contract\nnormalizeToken(input: string): string. Trim ASCII spaces, lowercase ASCII letters, collapse spaces/underscores/hyphens to one hyphen. Empty, separator-only or non-ASCII input throws TypeError without I/O.\n',
    [INFRA]: referenceSpec('infrastructure', INFRA, { revision }),
    [SCOPE]: referenceSpec('library', SCOPE, {
      child: kind === 'module' ? moduleTarget : MODULE,
      revision,
    }),
    'specs/README.md': REFERENCE_PORTAL,
  };
  if (scopeKind) {
    delete files[SCOPE];
    files['specs/README.md'] = REFERENCE_PORTAL.replace(
      '[`token`](./token/token.spec.md) | library',
      `[\`${scopeName}\`](./${scopeName}/${scopeName}.spec.md) | ${scopeKind}`
    ).replace('token --> infra-base', `${scopeName} --> infra-base`);
  }
  if (id === 'portal') files[MODULE] = referenceSpec('module', MODULE, { parent: SCOPE, revision });
  if (id.startsWith('index-')) {
    files[MODULE] = referenceSpec('module', MODULE, { parent: SCOPE, revision });
    files['specs/token/normalize/normalize.task.NOR-normalize.md'] = referenceTicket(
      TICKETS[0],
      undefined
    );
    files['specs/token/normalize/normalize.task.NOR-reject.md'] = referenceTicket(
      TICKETS[1],
      TICKETS[0]
    );
    files[MODULE_INDEX] = referenceIndex('module-index');
    files[SCOPE_INDEX] = referenceIndex('scope-index');
    files[PROJECT_INDEX] = referenceIndex('project-index');
    files['specs/infra-base/infra-base.3-tasks.md'] = referenceIndex('scope-index')
      .replace('# Tasks: token', '# Tasks: infra-base')
      .replace('./token.spec.md', './infra-base.spec.md')
      .replace('token (target)', 'infra-base (target)')
      .replace('| infra-base (traversed) | — | — | — | — |\n', '')
      .replace('  normalize\n', '  infra-base\n')
      .replace(/^\| NOR-.*\n/gm, '');
  }
  delete files[target];
  const section = kind === 'module' ? 'MODULE_REQUIREMENTS' : 'REQUIREMENTS_AND_CONSTRAINTS';
  const requiredFacts: AuthoringFact[] = target.endsWith('.spec.md')
    ? TOKEN_EXAMPLES.map((example) => ({
        id: example.id,
        section,
        description: `Input ${JSON.stringify(example.input)} has outcome ${example.outcome === 'TypeError' ? 'TypeError' : JSON.stringify(example.outcome)}. Encode both rows in an Input/Outcome Markdown table inside ${section}.`,
      }))
    : kind === 'portal'
      ? [
          {
            id: 'scope-map',
            section: 'Scopes',
            description:
              'Exactly token/library and infra-base/infrastructure, both 🚧 with correct relative links.',
          },
          {
            id: 'scope-dependency',
            section: 'Scope Graph',
            description: 'token depends on infra-base, never the reverse.',
          },
        ]
      : [
          {
            id: 'todo-truth',
            section:
              kind === 'module-index'
                ? 'Tracker Index'
                : kind === 'scope-index'
                  ? 'Tracker'
                  : 'Scope Tracker',
            description:
              'Reflect exactly the two seeded TODO tickets; NOR-reject depends on NOR-normalize, none is complete.',
          },
        ];
  const owner =
    kind === 'portal'
      ? 'root'
      : kind === 'module'
        ? 'module'
        : kind === 'infrastructure'
          ? 'infra'
          : kind === 'interface'
            ? 'interface'
            : 'scope';
  const ownerPath = kind.endsWith('-index')
    ? `ai/directives/sdd-v2/formats/${kind.replace('-index', '-tasks-index')}.xml`
    : `ai/directives/sdd-v2/${owner}.directive.xml`;
  const brief = `# Template-owned authoring: ${id}
Read owner instructions: ${ownerPath}. This is isolated template-to-artifact authoring, not the owner's complete interactive workflow.
Create ${target} using the actual installed CLI command: npx --no-install gennady sdd-new ${createArgs.join(' ')}.
Read its returned manifest and local skeleton instructions; fill the canonical artifact, then remove guidance and placeholders. Do not create the target by copying a complete answer from a reference owner. Only ${target} may change.
Intent: a local deterministic CLI/library token normalizer. normalizeToken(input: string): string trims leading/trailing ASCII spaces, lowercases ASCII letters, collapses runs of spaces/underscore/hyphen into one hyphen. Empty, separator-only and non-ASCII input throws TypeError without I/O. No implementation is requested.
${requiredFacts.map((fact) => `- ${fact.id} in ${fact.section}: ${fact.description}`).join('\n')}
${kind === 'module-index' ? 'Keep Slug Registry exactly normalize/reject; Intra-Module DAG is NOR-reject --> NOR-normalize. Link project conventions using the true relative path.' : ''}
${kind === 'scope-index' ? 'Scope link is ./token.spec.md. Only normalize module exists. Inter-Module DAG has the normalize node and no dependency edges. Cascade Table contains infra-base (traversed) and token (target) with all four rule cells —; no additional rule IDs have been activated.' : ''}
${kind === 'project-index' ? 'Keep canonical Project-Wide Conventions verbatim. Scope Tracker links ./token/token.3-tasks.md with Tasks=2, Done=0/2 and ./infra-base/infra-base.3-tasks.md with Tasks=0, Done=0/0. Cross-Scope DAG follows the portal: token --> infra-base.' : ''}
All references are read-only. Retain valid relative links and stable identity. No operator approval has been given: owner handoff must remain pending; no approved/✅ status, accepted verdict, ticket creation or execution claim. State explicitly when a required section is not applicable and why. Stop after bounded authoring, not project --all/ticket completion.
${target.endsWith('.spec.md') ? `After writing, run actual npx --no-install gennady sdd-check --spec ${target} --authoring; heed its authoring diagnostics.` : 'There is no exact sdd-check --spec CLI for portal/index artifacts: do not fake one. The trusted host artifact oracle grades this format after you stop.'}
`;
  files['inputs/brief.md'] = brief;
  return { id, kind, target, createArgs, brief, files, requiredFacts };
}

/** @purpose Materialize only reference context; the selected target is deliberately absent. */
export function buildAuthoringFixture(
  id: AuthoringCaseId,
  revision: AuthoringRevision = 'calibrated'
): Record<string, string> {
  return getAuthoringCase(id, revision).files;
}

function sectionBody(content: string, kind: ArtifactKind, name: string): string | undefined {
  if (content.includes(`<!--SECTION:${name}-->`)) {
    const section = extractSection(content, name);
    return section.status === 'ok' ? section.content : undefined;
  }
  const template = TEMPLATES[kind];
  // Heading-based formats have no SECTION anchors; use the actual template heading order.
  const expected = collectHeadings(template.skeleton).filter((heading) => heading.level === 2);
  const names = template.sections.map((entry) => entry.name);
  const title = expected[names.indexOf(name)]?.text;
  if (!title) return undefined;
  const headings = collectHeadings(content).filter(
    (heading) => heading.level === 2 && heading.text === title
  );
  if (headings.length !== 1) return undefined;
  const heading = headings[0]!;
  const next = collectHeadings(content).find(
    (candidate) => candidate.start > heading.start && candidate.level <= heading.level
  );
  return content.slice(heading.lineEnd, next?.start ?? content.length).trim();
}

function safeRead(root: string, path: string): string {
  const proof = proveRepoFile(root, path);
  if (!proof.ok) throw new Error(`${path}: ${proof.detail}`);
  const stat = lstatSync(proof.identity.absolute);
  if (stat.size > 256 * 1024 || stat.nlink !== 1)
    throw new Error(`${path}: oversized or hardlinked artifact`);
  const read = readProvenRepoFile(proof.identity);
  if (!read.ok) throw new Error(`${path}: ${read.detail}`);
  return read.content;
}

/** @purpose Grade bounded artifact completeness, never claim independent semantic review or ticket completion. */
export function checkAuthoringBenchmark(
  root: string,
  caseId: AuthoringCaseId,
  revision: AuthoringBenchmarkRevision = CURRENT_AUTHORING_BENCHMARK_REVISION
): AuthoringBenchmarkResult {
  const checks: AuthoringCheck[] = [];
  const run = (id: string, action: () => void): void => {
    try {
      action();
      checks.push({ id, pass: true, detail: 'passed' });
    } catch (cause) {
      checks.push({
        id,
        pass: false,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };
  const need = (ok: unknown, detail: string): void => {
    if (!ok) throw new Error(detail);
  };
  const item = getAuthoringCase(
    caseId,
    revision === 'calibrated-v2' ||
      revision === 'calibrated-v3' ||
      revision === 'calibrated-v4' ||
      revision === 'calibrated-v5'
      ? 'calibrated'
      : revision
  );
  let content: string | undefined;
  run('safe-target', () => {
    content = safeRead(root, item.target);
  });
  run('seeded-bytes', () => {
    for (const [path, expected] of Object.entries(item.files))
      need(digest(safeRead(root, path)) === digest(expected), `Seeded reference changed: ${path}`);
  });
  run('write-zone-artifact', () => {
    // Runtime materialization is owned by the harness, not this artifact oracle. Never follow it.
    const runtime = new Set(['.git', 'node_modules', 'ai', '.claude', '.tmp']);
    const expected = new Set([...Object.keys(item.files), item.target]);
    let count = 0;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (!dir && runtime.has(entry.name)) continue;
        need(++count <= 2000, 'Artifact inventory exceeds bounded read');
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        need(!entry.isSymbolicLink(), `Unsafe artifact alias: ${path}`);
        if (entry.isDirectory()) walk(path);
        else need(entry.isFile() && expected.has(path), `Unexpected artifact: ${path}`);
      }
    };
    walk('');
  });
  if (content !== undefined) {
    const observed = content;
    run('canonical-shape', () => {
      const template = TEMPLATES[item.kind];
      need(
        collectHeadings(observed).filter((h) => h.level === 1).length === 1,
        'Expected one document title'
      );
      for (const section of template.sections.filter(
        (s) => s.required || s.name === 'SPEC_ID' || (item.kind === 'portal' && s.name === 'VISION')
      ))
        need(
          sectionBody(observed, item.kind, section.name)
            ?.replace(/^#{1,6} .*$/gm, '')
            .trim(),
          `Missing or duplicate required section: ${section.name}`
        );
      const anchors = [...observed.matchAll(/<!--\/?SECTION:([A-Z][A-Z0-9_]*)-->/g)].map(
        (m) => m[1]!
      );
      for (const name of new Set(anchors)) {
        need(
          template.sections.some((s) => s.name === name),
          `Foreign section: ${name}`
        );
        need(
          anchors.filter((candidate) => candidate === name).length === 2 &&
            extractSection(observed, name).status === 'ok',
          `Duplicate/unbalanced section: ${name}`
        );
      }
      if (!item.target.endsWith('.spec.md')) {
        for (const section of [
          'SCOPE_GRAPH',
          'INTRA_MODULE_DAG',
          'INTER_MODULE_DAG',
          'CROSS_SCOPE_DAG',
        ]) {
          if (!template.sections.some((entry) => entry.name === section)) continue;
          const graphs = extractMermaidBlocks(sectionBody(observed, item.kind, section) ?? '');
          need(
            graphs.length === 1 &&
              /^(?:graph|flowchart)\s+(?:TD|TB|BT|LR|RL)\s*\n[\s\S]*\w/m.test(graphs[0]!),
            `Missing concrete Mermaid graph: ${section}`
          );
          if (item.kind === 'scope-index')
            need(/\bnormalize\b/.test(graphs[0]!), 'Missing real module node');
        }
      }
      if (item.target.endsWith('.spec.md')) {
        const identity = sectionBody(observed, item.kind, 'SPEC_ID')?.trim() ?? '';
        need(
          parseSpecId(observed).status === 'valid' &&
            identity === deriveInitialSpecId(join(root, 'specs'), join(root, item.target)),
          'Missing, malformed or changed initial SPEC_ID'
        );
        for (const [path, value] of Object.entries(item.files).filter(([path]) =>
          path.endsWith('.spec.md')
        ))
          need(
            sectionBody(value, 'module', 'SPEC_ID')?.trim() !== identity,
            `SPEC_ID duplicates ${path}`
          );
        need(
          item.kind === 'module'
            ? !observed.includes('<!--SECTION:SCOPE_TYPE-->')
            : sectionBody(observed, item.kind, 'SCOPE_TYPE')
                ?.replace(/^## .*$/gm, '')
                .trim() === item.kind,
          'Conflicting artifact kind'
        );
        const findings = [
          ...checkSpecAuthoringDraft(item.target, observed),
          ...checkDecisionLogIds(item.target, observed),
        ];
        need(
          !findings.length,
          findings.map((finding) => `${finding.code}: ${finding.message}`).join('; ')
        );
        const portal = item.files['specs/README.md'];
        if (portal && item.kind !== 'module')
          need(
            !checkScopeDeps(item.target, observed, parseGraphEdges(portal)).length,
            'Declared dependencies contradict the portal'
          );
        const hierarchy = checkSpecHierarchy([
          ...Object.entries(item.files)
            .filter(([file]) => file.endsWith('.spec.md'))
            .map(([file, content]) => ({ file, content, flowVersion: 'v2' as const })),
          { file: item.target, content: observed, flowVersion: 'v2' },
        ]);
        need(
          !hierarchy.length,
          hierarchy.map((finding) => `${finding.code}: ${finding.message}`).join('; ')
        );
      }
    });
    run('no-skeleton', () => {
      let inspect = observed;
      // The canonical project vocabulary explains token arguments; keep it byte-exact, not globally allowlisted.
      if (item.kind === 'project-index') {
        const canonical = sectionBody(
          TEMPLATES['project-index'].skeleton,
          item.kind,
          'PROJECT_WIDE_CONVENTIONS'
        );
        const actual = sectionBody(observed, item.kind, 'PROJECT_WIDE_CONVENTIONS');
        need(actual?.trim() === canonical?.trim(), 'Canonical project conventions changed');
        inspect = inspect.replace(actual!, '');
      }
      inspect = inspect
        .replace(/<!--\/?SECTION:[A-Z][A-Z0-9_]*-->/g, '')
        .replace(/<\/?(?:details|summary)(?:\s[^>]*)?>/g, '');
      need(
        !/<!--[\s\S]*?-->|<[^>\n]+>|\b(?:TBD|TODO_FILL|PLACEHOLDER)\b|\[(?:MANDATORY|Commentary-rich|Опционально)[\s\S]*?\]/i.test(
          inspect
        ),
        'Unreplaced skeleton guidance or placeholder'
      );
    });
    run('pending-approval', () => {
      const plain = observed.replace(/[*`]/g, '');
      need(
        !/✅|(?:operator decision|status|approval)\s*:\s*approved\b|\[verdict:\s*(?:accepted|rework|rolled-back)\]/i.test(
          plain
        ),
        'Forged operator approval/status'
      );
      if (revision !== 'frozen-oct22') {
        // Closed, explicit forms rather than a claim to understand arbitrary natural language.
        // Reject granted claims even when a separate sentence still says pending.
        need(
          !/(?:^|[\n.!?])\s*(?:[-+>]|\d+[.)])?\s*(?:оператор\s+одобрил|спецификация\s+утверждена\s+оператором|approved\s+by\s+(?:the\s+)?operator|operator\s+approval\s+has\s+been\s+granted|(?:одобрение\s+оператора|статус)\s*:\s*(?:получено|одобрено|утверждено))(?=$|[\s.!?])/imu.test(
            plain
          ),
          'Forged operator approval/status'
        );
      }
      if (
        revision === 'calibrated-v3' ||
        revision === 'calibrated-v4' ||
        revision === 'calibrated-v5'
      ) {
        // A negative clause must not hide a later explicit grant, including after a semicolon.
        // Keep this closed vocabulary separate so historical v2 outcomes remain reproducible.
        need(
          !/(?<![\p{L}\p{N}_])(?:оператор\s+одобрил|спецификация\s+утверждена\s+оператором|approved\s+by\s+(?:the\s+)?operator|operator\s+approval\s+has\s+been\s+granted|(?:операторское\s+одобрение|одобрение\s+оператора)\s*(?::\s*)?(?:(?:теперь|уже)\s+)?(?:выдано|получено|предоставлено)|(?:одобрение\s+оператора|статус)\s*:\s*(?:получено|одобрено|утверждено))(?=$|[^\p{L}\p{N}_])/iu.test(
            plain
          ),
          'Forged operator approval/status'
        );
      }
      if (item.target.endsWith('.spec.md')) {
        const handoff = sectionBody(observed, item.kind, 'HANDOFF') ?? '';
        if (
          revision === 'calibrated-v2' ||
          revision === 'calibrated-v3' ||
          revision === 'calibrated-v4' ||
          revision === 'calibrated-v5'
        )
          need(
            !/не\s+ожидает\s+(?:операторского\s+approval|operator\s+approval|решения\s+оператора)|\bnot\s+awaiting\s+operator\s+approval\b/iu.test(
              handoff
            ),
            'Handoff must remain pending'
          );
        need(
          (revision === 'frozen-oct22'
            ? /\bpending(?:-operator)?\b/i
            : /\bpending(?:-operator)?\b|\bno operator approval (?:has been given|exists)\b|\boperator approval has not been granted\b|\bawaiting operator approval\b|одобрения\s+нет|одобрение\s+оператора\s+отсутствует|операторское\s+одобрение\s+отсутствует|решение\s+оператора\s+(?:ещ[ёе]\s+)?не\s+получено|спецификация\s+не\s+утверждена\s+оператором|ожидает\s+(?:решения\s+оператора|operator\s+approval)/iu
          ).test(handoff) ||
            ((revision === 'calibrated-v2' ||
              revision === 'calibrated-v3' ||
              revision === 'calibrated-v4' ||
              revision === 'calibrated-v5') &&
              /(?<![\p{L}\p{N}_])ожидает\s+операторского\s+approval(?=$|[^\p{L}\p{N}_])/iu.test(
                handoff
              )) ||
            ((revision === 'calibrated-v3' ||
              revision === 'calibrated-v4' ||
              revision === 'calibrated-v5') &&
              /(?:^|[\n.!?;:])\s*(?:[-+>]|\d+[.)])?\s*операторское\s+одобрение\s+не\s+выдано(?=\s*(?:[.;\n]|$))/iu.test(
                handoff.replace(/[*`]/g, '')
              )) ||
            ((revision === 'calibrated-v4' || revision === 'calibrated-v5') &&
              /(?:^|[\n.!?;:])\s*(?:[-+>]|\d+[.)])?\s*(?:операторское\s+одобрение|одобрение\s+оператора)\s+(?:(?:ещ[ёе]|пока)\s+)?не\s+(?:выдано|получено)(?=\s*(?:[.;\n]|$))/iu.test(
                handoff.replace(/[*`]/g, '')
              )),
          'Handoff must remain pending'
        );
      }
    });
    run('relative-links', () => {
      for (const match of observed.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
        const href = match[1]!;
        need(!/^(?:[a-z]+:|\/|\\)/i.test(href), `Non-relative link: ${href}`);
        const [path, fragment] = href.split('#');
        const target = path
          ? posix.normalize(posix.join(posix.dirname(item.target), path))
          : item.target;
        const linked = safeRead(root, target);
        if (fragment)
          need(
            (revision === 'calibrated-v5' && extractSection(linked, fragment).status === 'ok') ||
              collectHeadings(linked).some(
                (h) =>
                  h.text
                    .toLowerCase()
                    .replace(/[^\p{L}\p{N}\s-]/gu, '')
                    .replace(/\s+/g, '-') === fragment
              ),
            `Missing heading link: ${href}`
          );
      }
    });
    run('required-facts', () => {
      if (item.target.endsWith('.spec.md')) {
        const section = item.requiredFacts[0]!.section;
        const body = sectionBody(observed, item.kind, section) ?? '';
        const cells = (line: string): string[] =>
          line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim().replace(/^`|`$/g, ''));
        const lines = body.split('\n');
        const tables: string[][][] = [];
        for (let i = 0; i + 1 < lines.length; i++) {
          if (!lines[i]!.includes('|')) continue;
          const header = cells(lines[i]!);
          const separator = cells(lines[i + 1]!);
          if (
            header.length !== separator.length ||
            !separator.every((cell) => /^:?-+:?$/.test(cell))
          )
            continue;
          const table = [header];
          i += 2;
          while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|'))
            table.push(cells(lines[i++]!));
          i--;
          if (header.includes('Input') || header.includes('Outcome')) tables.push(table);
        }
        need(tables.length === 1, `Expected one Input/Outcome table in ${section}`);
        const [header, ...rows] = tables[0]!;
        need(
          header!.filter((cell) => cell === 'Input').length === 1 &&
            header!.filter((cell) => cell === 'Outcome').length === 1,
          `Expected unique Input/Outcome headers in ${section}`
        );
        const input = header!.indexOf('Input');
        const outcome = header!.indexOf('Outcome');
        need(
          rows.every(
            (row) =>
              row.length === header!.length && row[input] !== 'Input' && row[outcome] !== 'Outcome'
          ),
          `Malformed row or repeated Input/Outcome headers in ${section}`
        );
        for (const example of TOKEN_EXAMPLES) {
          need(
            rows.filter((row) => row[input] === JSON.stringify(example.input)).length === 1,
            `Duplicate or missing input fact: ${example.id}`
          );
          need(
            rows.some(
              (row) =>
                row[input] === JSON.stringify(example.input) &&
                row[outcome] ===
                  (example.outcome === 'TypeError' ? 'TypeError' : JSON.stringify(example.outcome))
            ),
            `${example.id} missing or wrong in ${section}`
          );
        }
        const requirements = collectHeadings(body).filter(
          (heading) => heading.level === 3 && /^[A-Z][A-Z0-9]*-REQ-\d+\s+\[/.test(heading.text)
        );
        if (item.kind === 'module' && body.includes('No module-specific requirements.')) {
          // Canonical modules may implement the existing scope obligations without inventing new IDs.
          // The parent is immutable fixture truth, not arbitrary IDs supplied by the authored module.
          const inherited = [
            ...body.matchAll(
              /^No module-specific requirements\. Implements parent requirements: ([A-Z][A-Z0-9]*-REQ-\d+(?:,\s*[A-Z][A-Z0-9]*-REQ-\d+)*)\.[ \t]*$/gm
            ),
          ];
          need(
            inherited.length === 1 &&
              (body.match(/^No module-specific requirements\./gm) ?? []).length === 1 &&
              requirements.length === 0,
            'Expected one canonical inherited-requirements statement without local requirements'
          );
          const parent = collectHeadings(
            sectionBody(item.files[SCOPE]!, 'library', 'REQUIREMENTS_AND_CONSTRAINTS') ?? ''
          ).filter(
            (heading) => heading.level === 3 && /^[A-Z][A-Z0-9]*-REQ-\d+\s+\[/.test(heading.text)
          );
          const expected = parent.map((heading) => heading.text.split(/\s/)[0]!);
          const actual = inherited[0]![1]!.split(',').map((id) => id.trim());
          need(
            expected.length >= 2 &&
              parent.some((heading) => /\[.*нештатная.*\]/.test(heading.text)) &&
              actual.length === expected.length &&
              new Set(actual).size === actual.length &&
              expected.every((id) => actual.includes(id)),
            'Inherited requirements must name exactly the genuine positive and negative parent IDs'
          );
        } else {
          need(
            requirements.length >= 2 &&
              requirements.some((entry) => /\[.*нештатная.*\]/.test(entry.text)),
            'Missing genuine requirement IDs or negative-path requirement'
          );
        }
      } else if (item.kind === 'portal') {
        const scopes = parseScopes(observed);
        const edges = parseGraphEdges(sectionBody(observed, 'portal', 'SCOPE_GRAPH') ?? '');
        const findings = checkPortal({ scopes, edges, specDirs: ['token', 'infra-base'] });
        need(!findings.length, findings.map((finding) => finding.code).join(', '));
        need(
          scopes.length === 2 && new Set(scopes.map((s) => s.name)).size === 2,
          'Expected two unique scope rows'
        );
        for (const [name, type] of [
          ['token', 'library'],
          ['infra-base', 'infrastructure'],
        ])
          need(
            scopes.some(
              (s) =>
                s.name === name &&
                s.type === type &&
                s.status === 'wip' &&
                s.specPath === `./${name}/${name}.spec.md`
            ),
            `Wrong scope truth: ${name}`
          );
        const dataRows = (sectionBody(observed, 'portal', 'SCOPES') ?? '')
          .split('\n')
          .filter((line) => /^\|/.test(line) && !/^\|\s*(?:Scope\s*\||-)/.test(line));
        need(dataRows.length === scopes.length, 'Unparsed or duplicate scope table rows');
        need(
          edges.length === 1 && edges[0]!.from === 'token' && edges[0]!.to === 'infra-base',
          'Wrong scope dependency direction'
        );
      } else checkIndexTruth(item, observed, need);
    });
  }
  const failed = checks.filter((check) => !check.pass);
  return {
    rule: 'AUTHORING',
    pass: failed.length === 0,
    detail: failed.length
      ? failed.map((check) => `${check.id}: ${check.detail}`).join('; ')
      : `${item.id}: bounded artifact checks passed; independent semantic review not claimed`,
    checks,
  };
}

function checkIndexTruth(
  item: AuthoringCase,
  content: string,
  need: (ok: unknown, detail: string) => void
): void {
  if (item.kind === 'project-index') {
    need(
      /\]\(\.\/README\.md\)/.test(sectionBody(content, item.kind, 'ENTRY_POINTS') ?? ''),
      'Missing canonical portal entry point'
    );
    const body = sectionBody(content, item.kind, 'SCOPE_TRACKER') ?? '';
    const rows = body
      .split('\n')
      .filter((line) => /^\|/.test(line) && !/^\|\s*(?:Scope\s*\||-)/.test(line));
    need(rows.length === 2, 'Expected exactly two scope rollups');
    for (const [name, type, tasks, done] of [
      ['token', 'library', '2', '0/2'],
      ['infra-base', 'infrastructure', '0', '0/0'],
    ]) {
      const row = rows.find((row) => row.split('|')[1]?.trim() === name);
      const cells =
        row
          ?.split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()) ?? [];
      need(
        cells.length === 5 &&
          cells[1] === type &&
          new RegExp(`\\]\\(\\./${name}/${name}\\.3-tasks\\.md\\)`).test(cells[2]!) &&
          cells[3] === tasks &&
          cells[4] === done,
        `Invented rollup count/status/index: ${name}`
      );
    }
    const graph = parseGraphEdges(sectionBody(content, item.kind, 'CROSS_SCOPE_DAG') ?? '');
    need(
      graph.length === 1 && graph[0]!.from === 'token' && graph[0]!.to === 'infra-base',
      'Wrong cross-scope dependency'
    );
    return;
  }
  const body =
    sectionBody(content, item.kind, item.kind === 'module-index' ? 'TRACKER_INDEX' : 'TRACKER') ??
    '';
  const rows = parseTrackerRows(body);
  need(
    rows.length === 2 && new Set(rows.map((row) => row.taskId)).size === 2,
    'Expected exactly two unique tracker rows'
  );
  const tickets = Object.entries(item.files)
    .filter(([path]) => path.includes('.task.'))
    .map(([file, content]) => ticketRef(file, content, 'v2'));
  const findings = checkTrackers(
    tickets,
    rows.map((row) => ({ ...row, file: item.target, flowVersion: 'v2' }))
  );
  need(!findings.length, findings.map((finding) => finding.code).join(', '));
  const dataLines = body
    .split('\n')
    .filter((line) => /^\|/.test(line) && !/^\|\s*(?:Task-ID\s*\||-)/.test(line));
  need(dataLines.length === 2, 'Unexpected or unparsed tracker row');
  const cells = dataLines.map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) =>
        cell
          .trim()
          .replace(/`/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      )
  );
  for (const id of TICKETS) {
    const row = cells.find((row) => row[0] === id);
    const offset = item.kind === 'scope-index' ? 1 : 0;
    need(
      row?.[2 + offset] === (id === 'NOR-reject' ? 'NOR-normalize' : '—'),
      `Wrong dependency: ${id}`
    );
    if (offset) need(row?.[2] === 'normalize', `Wrong module: ${id}`);
  }
  const graph = parseGraphEdges(
    sectionBody(
      content,
      item.kind,
      item.kind === 'module-index' ? 'INTRA_MODULE_DAG' : 'INTER_MODULE_DAG'
    ) ?? ''
  );
  if (item.kind === 'module-index') {
    need(
      /\]\(\.\.\/\.\.\/3-tasks\.md\)/.test(sectionBody(content, item.kind, 'CONVENTIONS') ?? ''),
      'Missing inherited project-conventions link'
    );
    need(
      graph.length === 1 && graph[0]!.from === 'NOR-reject' && graph[0]!.to === 'NOR-normalize',
      'Wrong intra-module dependency graph'
    );
    const slugs = (sectionBody(content, item.kind, 'SLUG_REGISTRY') ?? '')
      .split('\n')
      .filter((line) => /^- /.test(line))
      .map((line) => line.slice(2).trim().replace(/`/g, ''))
      .sort();
    need(JSON.stringify(slugs) === JSON.stringify(['normalize', 'reject']), 'Wrong slug registry');
  } else {
    need(graph.length === 0, 'Invented inter-module dependency');
    need(
      /\]\(\.\/token\.spec\.md\)/.test(sectionBody(content, item.kind, 'SCOPE_SPEC_LINK') ?? ''),
      'Wrong scope owner link'
    );
    const cascade = (sectionBody(content, item.kind, 'CASCADE_TABLE') ?? '')
      .split('\n')
      .filter((line) => /^\|/.test(line) && !/^\|\s*(?:Tier\s*\||-)/.test(line));
    need(cascade.length === 2, 'Wrong cascade tiers');
    for (const tier of ['infra-base (traversed)', 'token (target)']) {
      const cells =
        cascade
          .find((line) => line.split('|')[1]?.trim() === tier)
          ?.split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()) ?? [];
      need(
        cells.length === 5 && cells.slice(1).every((cell) => cell === '—'),
        `Invented activated rules: ${tier}`
      );
    }
  }
}
