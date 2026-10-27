// @file: Frozen six-task transfer corpus; selected only by the owned evaluation controller.
// @spec: AI-SKILLS
// @consumers: authoring benchmark; transfer preflight and offline regression tests

import { posix } from 'node:path';
import type { AuthoringCase, AuthoringCaseId } from './authoring-benchmark.ts';
import { TEMPLATES, foldSections } from '../../shared/sdd/templates.ts';
import { collectHeadings, extractSection } from '../../shared/sdd/section.ts';
import { deriveInitialSpecId } from '../../shared/sdd/spec-id.ts';
import { deriveSpecAcronym } from '../../shared/sdd/requirement-id.ts';

type TransferTask = {
  id: string;
  domain: 'ranges' | 'delivery';
  module: string;
  layout: 'module-flat' | 'module-nested';
  ownership: 'delegate' | 'local-delta';
  signature: string;
  domainRule: string;
  behavior: string;
  errors: string;
  examples: Array<[string, string]>;
};

const RANGE_DOMAIN =
  'Every range is an ordered pair [start,end] of finite safe integers with start <= end. Ranges are half-open: start is included and end excluded. Empty ranges start=end are valid. Validate all inputs before returning any result. No I/O or mutation.';
const DELIVERY_DOMAIN =
  'All numeric inputs are finite safe integers. Attempts and maximum-attempt counts are positive. Times and delays are nonnegative. Validate all inputs before returning any result; never perform network I/O, wait, read a clock or mutate state.';

export const AUTHORING_TRANSFER_TASKS: readonly TransferTask[] = [
  {
    id: 'ranges-intersection',
    domain: 'ranges',
    module: 'intersection',
    layout: 'module-flat',
    ownership: 'delegate',
    signature:
      'intersectRanges(left: [number,number], right: [number,number]): [number,number] | null',
    domainRule: RANGE_DOMAIN,
    behavior:
      'Return [max(left.start,right.start), min(left.end,right.end)] only when its start is strictly less than its end; otherwise return null. Touching or empty intersections are null. This entire behavior is already owned by the parent; the child introduces no new requirement.',
    errors:
      'Any non-safe-integer bound or reversed range throws TypeError, including when the other range is empty or the ranges are disjoint. Do not reorder or silently repair a reversed range.',
    examples: [
      ['intersectRanges([0,3],[3,6])', 'null'],
      ['intersectRanges([-4,2],[-1,5])', '[-1,2]'],
      ['intersectRanges([2,2],[0,9])', 'null'],
      ['intersectRanges([5,1],[0,9])', 'TypeError'],
    ],
  },
  {
    id: 'ranges-contains',
    domain: 'ranges',
    module: 'queries/contains',
    layout: 'module-nested',
    ownership: 'local-delta',
    signature: 'containsPoint(range: [number,number], point: number): boolean',
    domainRule: RANGE_DOMAIN,
    behavior:
      'New module-owned behavior: return true exactly when start <= point AND point < end. An empty range contains no point. A valid point outside the range returns false, not an exception.',
    errors:
      'An invalid range or a point that is not a finite safe integer throws TypeError, even if membership would otherwise be false.',
    examples: [
      ['containsPoint([2,5],2)', 'true'],
      ['containsPoint([2,5],5)', 'false'],
      ['containsPoint([2,2],2)', 'false'],
      ['containsPoint([2,5],2.5)', 'TypeError'],
    ],
  },
  {
    id: 'ranges-merge',
    domain: 'ranges',
    module: 'merge',
    layout: 'module-flat',
    ownership: 'local-delta',
    signature: 'mergeRanges(left: [number,number], right: [number,number]): [number,number] | null',
    domainRule: RANGE_DOMAIN,
    behavior:
      'New module-owned behavior: if both ranges are nonempty and overlap or touch, return their smallest covering range. If either range is empty OR there is a positive gap, return null. A touching boundary is mergeable, unlike intersection. Do not return a covering range across a gap.',
    errors:
      'Invalid bounds or reversed ranges throw TypeError before checking emptiness or a gap; never mutate either input.',
    examples: [
      ['mergeRanges([0,3],[3,6])', '[0,6]'],
      ['mergeRanges([0,2],[3,6])', 'null'],
      ['mergeRanges([2,2],[0,9])', 'null'],
      ['mergeRanges([5,1],[0,9])', 'TypeError'],
    ],
  },
  {
    id: 'delivery-retry',
    domain: 'delivery',
    module: 'retry',
    layout: 'module-flat',
    ownership: 'delegate',
    signature: 'shouldRetry(attempt: number, maxAttempts: number, status: number): boolean',
    domainRule: DELIVERY_DOMAIN,
    behavior:
      'Return true iff (status is 429 OR status is from 500 through 599 inclusive) AND attempt < maxAttempts. Other valid statuses return false; in particular 408 is not retryable. This entire rule is already parent-owned; introduce no new child requirement.',
    errors:
      'A nonpositive/non-safe-integer attempt or maxAttempts, or a status outside the integer range 100..599, throws TypeError before deciding eligibility. attempt >= maxAttempts is valid and returns false, not an input error.',
    examples: [
      ['shouldRetry(1,3,503)', 'true'],
      ['shouldRetry(3,3,429)', 'false'],
      ['shouldRetry(1,3,408)', 'false'],
      ['shouldRetry(0,3,200)', 'TypeError'],
    ],
  },
  {
    id: 'delivery-delay',
    domain: 'delivery',
    module: 'policies/delay',
    layout: 'module-nested',
    ownership: 'local-delta',
    signature: 'retryDelay(attempt: number, retryAfterMs: number | null): number',
    domainRule: DELIVERY_DOMAIN,
    behavior:
      'New module-owned behavior: base=min(30000,1000*2^(attempt-1)). With null hint return base; with a valid hint return max(base,retryAfterMs). Only exponential base is capped: a server hint above 30000 MUST NOT be capped. No random jitter and no sleeping.',
    errors:
      'A nonpositive/non-safe-integer attempt or a non-null hint that is negative or not a finite safe integer throws TypeError. Zero is a valid hint, not a request for zero delay.',
    examples: [
      ['retryDelay(1,null)', '1000'],
      ['retryDelay(6,0)', '30000'],
      ['retryDelay(1,60000)', '60000'],
      ['retryDelay(1,-1)', 'TypeError'],
    ],
  },
  {
    id: 'delivery-dedupe',
    domain: 'delivery',
    module: 'policies/dedupe',
    layout: 'module-nested',
    ownership: 'local-delta',
    signature: 'isDuplicate(seenAtMs: number | null, nowMs: number, ttlMs: number): boolean',
    domainRule: DELIVERY_DOMAIN,
    behavior:
      'New module-owned behavior: after validation, null seenAtMs returns false. Otherwise return true exactly when 0 <= nowMs-seenAtMs < ttlMs. Equality at ttl is expired; ttl=0 always yields false for valid inputs. No persistent store or clock reads.',
    errors:
      'Negative or non-safe-integer times/ttl throw TypeError. A non-null seenAtMs greater than nowMs throws TypeError, including when ttl=0. Validate nowMs and ttlMs even when seenAtMs is null.',
    examples: [
      ['isDuplicate(100,110,10)', 'false'],
      ['isDuplicate(100,109,10)', 'true'],
      ['isDuplicate(null,100,0)', 'false'],
      ['isDuplicate(101,100,0)', 'TypeError'],
    ],
  },
];

/** @purpose Resolve a fixed host-selected task; a bad selection never falls back to normalizeToken. */
export function selectedAuthoringTransfer(): TransferTask | undefined {
  const id = process.env.GENNADY_AUTHORING_TRANSFER_CASE;
  if (!id) return undefined;
  const task = AUTHORING_TRANSFER_TASKS.find((item) => item.id === id);
  if (!task) throw new Error('[selectedAuthoringTransfer] Unknown frozen transfer task');
  return task;
}

const table = (task: TransferTask) =>
  '| Input | Outcome |\n|---|---|\n' +
  task.examples.map(([input, outcome]) => `| \`${input}\` | \`${outcome}\` |`).join('\n');

function transferInfrastructure(): string {
  const path = 'specs/infra-base/infra-base.spec.md';
  const template = TEMPLATES.infrastructure;
  const bodies: Record<string, string> = {
    SPEC_ID: deriveInitialSpecId('specs', path.slice(6))!,
    SCOPE_TYPE: 'infrastructure',
    VISION:
      'Provide local Node.js and the installed Gennady CLI for draft authoring, not domain behavior.',
    OVERVIEW:
      '```mermaid\nflowchart LR\n  author --> localCLI\n  localCLI --> draft\n```\n_Local authoring only._',
    REQUIREMENTS_AND_CONSTRAINTS:
      '### IB-REQ-1 [должен]\n**Когда** создаётся черновик, **окружение должно** предоставлять установленный Gennady CLI без registry downloads.\n> Reproducible local tooling.\n\n### IB-REQ-2 [должен · нештатная]\n**Если** CLI недоступен, **автор должен** остановиться и сообщить ошибку без установки замены.\n> No fabricated tooling success.\n\n### Out-of-Scope\n- Product algorithms and implementation.\n\n### Runtime & Deferred Scope\nHarness supplies tooling; no execution receipt.\n\n### Rules\nNo extra activated rule set.',
    TOOL_STACK:
      '| Tool | Role |\n|---|---|\n| Node.js 22 | Local runtime |\n| Installed Gennady CLI | Authoring |',
    SCOPE_DEPENDENCIES: '- **Depends on:** None\n- **Provides to:** pure-domain draft scopes.',
    HANDOFF: '- **Status:** pending-operator\n- **Operator decision:** pending',
    DECISION_LOG: 'IB-DL-1 — local installed tooling only; no operator approval exists.',
  };
  return (
    '# infra-base: infrastructure specification\n\n' +
    template.sections
      .map((section) => {
        const original = extractSection(template.skeleton, section.name);
        const heading = original.status === 'ok' ? collectHeadings(original.content)[0] : undefined;
        const rawBody =
          bodies[section.name] ??
          'Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.';
        const body =
          foldSections('infrastructure').includes(section.name) && !rawBody.includes('<details>')
            ? `<details><summary>Details</summary>\n${rawBody}\n</details>`
            : rawBody;
        return `<!--SECTION:${section.name}-->\n${heading ? '#'.repeat(heading.level) + ' ' + heading.text + '\n' : ''}${body}\n<!--/SECTION:${section.name}-->\n`;
      })
      .join('\n')
  );
}

/** @purpose Render parent context and hidden offline controls through the real section registry. */
export function transferReference(task: TransferTask, kind: 'library' | 'module'): string {
  const leaf = posix.basename(task.module);
  const parent = `specs/${task.domain}/${task.domain}.spec.md`;
  const target = `specs/${task.domain}/${task.module}/${leaf}.spec.md`;
  const path = kind === 'library' ? parent : target;
  const acr = deriveSpecAcronym(path);
  const parentAcr = deriveSpecAcronym(parent);
  const href = posix.relative(posix.dirname(target), parent);
  const parentOwns = kind === 'library' && task.ownership === 'delegate';
  const requirementBehavior = parentOwns || kind === 'module' ? task.behavior : task.domainRule;
  const requirements = `### ${acr}-REQ-1 [должен]\n**Когда** переданы допустимые входы, **модуль должен** соблюдать контракт: ${requirementBehavior}\n> Preserve the declared boundary semantics.\n\n### ${acr}-REQ-2 [должен · нештатная]\n**Если** входы недопустимы, **то модуль должен** выбросить TypeError. ${kind === 'module' || parentOwns ? task.errors : 'Validate all numeric domain restrictions before returning. No mutation or I/O.'}\n> Invalid inputs are not ordinary negative results.`;
  const delegated = `No module-specific requirements. Implements parent requirements: ${parentAcr}-REQ-1, ${parentAcr}-REQ-2.`;
  const diagram =
    '```mermaid\nflowchart LR\n  caller --> purePolicy\n```\n_Local deterministic policy, no effects._';
  const bodies: Record<string, string> = {
    SPEC_ID: deriveInitialSpecId('specs', path.slice(6))!,
    SCOPE_TYPE: 'library',
    VISION: `Pure ${task.domain} operations. ${task.domainRule}`,
    MODULE_VISION: `Own ${task.signature}. ${task.domainRule}`,
    OVERVIEW: diagram,
    GOLDEN_DX:
      task.ownership === 'delegate' || kind === 'module'
        ? table(task)
        : 'Pure callers validate inputs without I/O.',
    SCOPE_DEPENDENCIES:
      '- **Depends on:** infra-base\n- **Provides to:** local pure callers.\n[Tooling](../infra-base/infra-base.spec.md)',
    INTER_MODULE_DEPENDENCIES: `[Parent specification](${href})\nNo sibling dependencies.`,
    REQUIREMENTS_AND_CONSTRAINTS: `${requirements}\n\n### Out-of-Scope\n- Network, persistence, mutation and clock reads.\n\n### Runtime & Deferred Scope\nNot implemented; draft only.\n\n### Rules\nNo additional activated rule set.`,
    MODULE_REQUIREMENTS: task.ownership === 'delegate' ? delegated : requirements,
    USE_CASES: diagram,
    DATA_FLOW: diagram,
    ARCHITECTURE: 'Pure functions without lifecycle, ports or adapters.\n' + diagram,
    PUBLIC_API_SURFACE:
      task.ownership === 'delegate'
        ? task.signature
        : 'Common input validation policy; concrete child behavior is module-owned.',
    MODULE_MAP: `### Modules\n- [${leaf}](${posix.relative(posix.dirname(parent), target)}) — planned pure operation.\n\n### Inter-Module Dependency Map\nNo sibling dependencies.`,
    TOOL_STACK: '| Tool | Role |\n|---|---|\n| Node.js 22 | Planned local TypeScript runtime |',
    WORKFLOW_EXAMPLE:
      'Call the declared pure operation with validated inputs; invalid inputs raise TypeError without effects.',
    FILE_STRUCTURE: 'Planned implementation only; no source files or tickets yet.',
    EFFECTIVE_RULES:
      'No extra activated rules.\n<details><summary>Audit</summary>Pure local operation.</details>',
    VERIFICATION_COMMANDS: 'Implementation tests are deferred; no execution receipt claimed.',
    DECISION_LOG: `${acr}-DL-1 — operator approval remains pending; no implementation authorized.`,
    BOOTSTRAP_REQUIREMENTS:
      'No external bootstrap.\n<details><summary>Audit</summary>The harness supplies local tooling.</details>',
    HANDOFF:
      '- **Status:** pending-operator\n- **Operator decision:** pending\nNo tickets or implementation approved.',
    RESEARCH: 'No research documents for this bounded operation.',
    MODULE_USAGE_EXAMPLE: table(task),
    ENTITY_INVENTORY: `| Entity | Type | Purpose |\n|---|---|---|\n| ${task.signature.split('(')[0]} | Function | Pure domain operation |`,
    ENTITY_SURFACES: `<details><summary>Function surface</summary>\n${task.signature}\n</details>`,
    MODULE_CONTRACTS: `<details><summary>Contract</summary>\nPre: ${task.domainRule}\nPost: ${task.behavior}\nOn pre-violation: ${task.errors}\n</details>`,
    PUBLIC_OPTIONS:
      'No mutable options.\n<details><summary>Policy</summary>Fixed pure behavior.</details>',
    MODULE_DECISION_LOG:
      'No independent operator decision.\n<details><summary>Boundary</summary>Inherited constraints are unchanged; operator approval remains pending.</details>',
    IMPLEMENTATION_INSIGHTS: 'Not implemented; no execution results.',
  };
  const template = TEMPLATES[kind];
  return (
    `# ${kind === 'library' ? task.domain : leaf}: ${kind} specification\n\n` +
    template.sections
      .map((section) => {
        const original = extractSection(template.skeleton, section.name);
        const heading = original.status === 'ok' ? collectHeadings(original.content)[0] : undefined;
        const rawBody = bodies[section.name];
        if (rawBody === undefined)
          throw new Error(`[transferReference] Missing section ${section.name}`);
        const body =
          foldSections(kind).includes(section.name) && !rawBody.includes('<details>')
            ? `<details><summary>Details</summary>\n${rawBody}\n</details>`
            : rawBody;
        return `<!--SECTION:${section.name}-->\n${heading ? '#'.repeat(heading.level) + ' ' + heading.text + '\n' : ''}${body}\n<!--/SECTION:${section.name}-->\n`;
      })
      .join('\n')
  );
}

/** @purpose Seed new domains while keeping the same installed module authoring instructions. */
export function getAuthoringTransferCase(
  caseId: AuthoringCaseId,
  task: TransferTask
): AuthoringCase {
  if (caseId !== task.layout) throw new Error('[getAuthoringTransferCase] Layout/task mismatch');
  const leaf = posix.basename(task.module);
  const target = `specs/${task.domain}/${task.module}/${leaf}.spec.md`;
  const createArgs = ['module', '--scope', task.domain, '--module', task.module];
  const requiredFacts = task.examples.map(([input, outcome], i) => ({
    id: `example-${i + 1}`,
    section: 'MODULE_USAGE_EXAMPLE',
    description: `${input} -> ${outcome}`,
  }));
  const brief = `# Bounded module authoring\nRead owner instructions: ai/directives/sdd-v2/module.directive.xml. Only author ${target}; this is not full workflow execution.\nCreate it with actual installed command: npx --no-install gennady sdd-new ${createArgs.join(' ')}. Read the returned manifest and skeleton; fill its sections and remove guidance.\nSignature: ${task.signature}.\nInherited domain: ${task.domainRule}\nBehavior: ${task.behavior}\nInvalid inputs: ${task.errors}\nOwnership: ${task.ownership === 'delegate' ? 'No new module-specific behavior: use canonical delegation to the genuine parent requirement IDs, rather than inventing local requirements.' : 'The behavior above is an explicit new module-owned delta; preserve parent input constraints and specify the local positive and invalid-input obligations.'}\nKeep an Input/Outcome Markdown table containing all four supplied examples in MODULE_USAGE_EXAMPLE:\n${table(task)}\nPreserve every seeded file, parent requirement and stable identity. No implementation, new scope, tickets or operator approval. HANDOFF must explicitly remain pending-operator; no approved status or execution claim.\nAfter the final whole-file Write, run actual npx --no-install gennady sdd-check --spec ${target} --authoring. Stop after this bounded authoring task.\n`;
  const portal = `# Pure domain policies\n\n## Vision\nPure ${task.domain} operations with explicit invalid-input failure. No implementation or effects.\n- **Для кого:** local callers.\n- **Боль:** inconsistent boundary policies.\n- **Успех:** deterministic domain behavior.\n- **Принципы:** validate first, no effects.\n\n## Scope Graph\n\`\`\`mermaid\ngraph TD\n  ${task.domain} --> infra-base\n\`\`\`\n\n## Scopes\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n| [\`${task.domain}\`](./${task.domain}/${task.domain}.spec.md) | library | 🚧 | Pure domain policies |\n| [\`infra-base\`](./infra-base/infra-base.spec.md) | infrastructure | 🚧 | Local authoring tooling |\n\n## Decision Log\nOperator approval remains pending.\n`;
  return {
    id: caseId,
    kind: 'module',
    target,
    createArgs,
    brief,
    requiredFacts,
    files: {
      'package.json': '{"name":"authoring-transfer","private":true,"type":"module"}\n',
      'AGENTS.md':
        '# Authoring boundary\nAuthor only the requested target. Preserve references; no implementation, approvals or outside changes.\n',
      'inputs/brief.md': brief,
      [`docs/${task.domain}-contract.md`]: `${task.domainRule}\n${task.ownership === 'delegate' ? task.behavior + '\n' + task.errors : 'Concrete child behavior is defined by its brief; no additional inherited child algorithm.'}\n`,
      'specs/README.md': portal,
      'specs/infra-base/infra-base.spec.md': transferInfrastructure(),
      [`specs/${task.domain}/${task.domain}.spec.md`]: transferReference(task, 'library'),
    },
  };
}

/** @purpose Check bounded example/ownership facts only; arbitrary prose semantics remain a blind review. */
export function checkAuthoringTransferFacts(
  item: AuthoringCase,
  content: string,
  need: (ok: unknown, detail: string) => void
): void {
  const task = selectedAuthoringTransfer();
  if (!task) throw new Error('[checkAuthoringTransferFacts] Missing frozen task selection');
  const usage = extractSection(content, 'MODULE_USAGE_EXAMPLE');
  need(usage.status === 'ok', 'Missing example section');
  const normalized = (value: string) => value.replace(/[`\s]/g, '');
  const rows = (usage.status === 'ok' ? usage.content : '')
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(normalized));
  const headers = rows.filter((row) => row.includes('Input') && row.includes('Outcome'));
  need(headers.length === 1, 'Expected one unambiguous Input/Outcome table');
  const inputIndex = headers[0]?.indexOf('Input') ?? -1;
  const outcomeIndex = headers[0]?.indexOf('Outcome') ?? -1;
  for (const [input, outcome] of task.examples) {
    const matches = rows.filter((row) => row[inputIndex] === normalized(input));
    need(
      matches.length === 1 && matches[0]![outcomeIndex] === normalized(outcome),
      `Missing, duplicate or wrong example: ${input}`
    );
  }
  const requirementSection = extractSection(content, 'MODULE_REQUIREMENTS');
  const body = requirementSection.status === 'ok' ? requirementSection.content : '';
  const local = [...body.matchAll(/^###\s+[A-Z][A-Z0-9]*-REQ-\d+\s+\[/gm)];
  if (task.ownership === 'delegate') {
    const acr = deriveSpecAcronym(`specs/${task.domain}/${task.domain}.spec.md`);
    const expected = `No module-specific requirements. Implements parent requirements: ${acr}-REQ-1, ${acr}-REQ-2.`;
    need(
      local.length === 0 && body.includes(expected),
      'Expected canonical parent delegation without invented local requirements'
    );
  } else
    need(
      local.length >= 2 && /нештатная/.test(body),
      'Missing explicit module-owned positive/error obligations'
    );
  need(item.target.includes(`/${task.domain}/`), 'Task target identity mismatch');
}
