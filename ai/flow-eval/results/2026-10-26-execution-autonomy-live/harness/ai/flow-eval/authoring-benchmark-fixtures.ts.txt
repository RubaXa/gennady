// @file: Source-owned reference context for template authoring benchmarks, never a target answer.
// @spec: AI-SKILLS
// @consumers: authoring-benchmark; deterministic authoring controls

import { posix } from 'node:path';
import { TEMPLATES, type ArtifactKind } from '../../shared/sdd/templates.ts';
import { collectHeadings, extractSection } from '../../shared/sdd/section.ts';
import { deriveSpecAcronym } from '../../shared/sdd/requirement-id.ts';
import { deriveInitialSpecId } from '../../shared/sdd/spec-id.ts';

export const TOKEN_EXAMPLES = [
  { id: 'normalize-example', input: '  Foo__BAR  ', outcome: 'foo-bar' },
  { id: 'empty-input-rejection', input: '', outcome: 'TypeError' },
] as const;

/** @purpose Keep historical experiment inputs replayable without silently regrading their results. */
export type AuthoringRevision = 'frozen-oct22' | 'calibrated';

/** @purpose Small concrete requirement context, shared by reference owners, not an implementation. */
export function tokenRequirements(
  path: string,
  revision: AuthoringRevision = 'calibrated'
): string {
  const acr = deriveSpecAcronym(path);
  const domain =
    revision === 'frozen-oct22'
      ? 'передана ASCII-строка'
      : 'передана ASCII-строка, которая содержит хотя бы один символ, отличный от пробела, underscore и hyphen';
  return `### ${acr}-REQ-1 [должен]
**Когда** ${domain}, **нормализатор должен** обрезать крайние пробелы, привести буквы к lower-case и свернуть пробелы, underscore и hyphen в один hyphen.
> Один детерминированный формат токена нужен CLI и библиотечным потребителям.

### ${acr}-REQ-2 [должен · нештатная]
**Если** строка пустая, состоит из разделителей или содержит не-ASCII символы, **то нормализатор должен** выбросить TypeError без ввода-вывода.
> Ошибку входа нельзя маскировать пустым корректным токеном.

| Input | Outcome |
|---|---|
| ${'`"  Foo__BAR  "`'} | ${'`"foo-bar"`'} |
| ${'`""`'} | ${'`TypeError`'} |`;
}

const DIAGRAM =
  '```mermaid\nflowchart LR\n  caller --> normalizeToken\n```\n_Нормализация токена без состояния._';
const BOOTSTRAP = `No external bootstrap required.
<details><summary>Bootstrap audit</summary>
The authoring fixture has no executable product code, package setup or external service prerequisite.
</details>`;

/** @purpose Fill reference owners using the actual registry's anchors/headings; no skeleton tokens survive. */
export function referenceSpec(
  kind: 'product' | 'library' | 'infrastructure' | 'interface' | 'module',
  path: string,
  options: { child?: string; parent?: string; revision?: AuthoringRevision } = {}
): string {
  const heading = posix.basename(path, '.spec.md');
  const acr = deriveSpecAcronym(path);
  const requirements = tokenRequirements(path, options.revision);
  const related = options.parent
    ? `[Parent specification](${posix.relative(posix.dirname(path), options.parent)})`
    : 'No external scope dependency.';
  const bodies: Record<string, string> = {
    SPEC_ID: deriveInitialSpecId('specs', path.slice('specs/'.length))!,
    SCOPE_TYPE: kind,
    VISION:
      'A deterministic token normalizer for local CLI and library consumers; no network or persistence.',
    MODULE_VISION:
      'Own normalizeToken(input: string): string and its invalid-input TypeError; no state or I/O.',
    OVERVIEW: DIAGRAM,
    PROJECT_TYPE:
      '- **Type:** cli-utility\n- **Why this type:** one local deterministic token conversion.',
    GOLDEN_DX:
      'normalizeToken("  Foo__BAR  ") returns "foo-bar". Empty input throws TypeError. No setup or network.',
    MODULE_USAGE_EXAMPLE:
      '```ts\nnormalizeToken("  Foo__BAR  "); // "foo-bar"\nnormalizeToken(""); // throws TypeError\n```',
    SCOPE_DEPENDENCIES:
      path === 'specs/infra-base/infra-base.spec.md'
        ? '- **Depends on:** None\n- **Provides to:** token authoring scopes.'
        : `- **Depends on:** infra-base\n- **Provides to:** CLI consumers.\n[Authoring infrastructure](${posix.relative(posix.dirname(path), 'specs/infra-base/infra-base.spec.md')})`,
    INTER_MODULE_DEPENDENCIES: `No sibling dependencies.\n${related}`,
    REQUIREMENTS_AND_CONSTRAINTS: `${requirements}\n\n### Out-of-Scope\n- Unicode transliteration, network and persistent configuration.\n\n### Runtime & Deferred Scope\nNot implemented; no runtime claim.\n\n### Rules\nNo additional activated rule set.`,
    MODULE_REQUIREMENTS: requirements,
    USE_CASES: DIAGRAM,
    DATA_FLOW: DIAGRAM,
    ARCHITECTURE:
      'One pure normalizeToken function. A stateful service was rejected because the transformation needs no state.\n' +
      DIAGRAM,
    PUBLIC_API_SURFACE:
      '`normalizeToken(input: string): string` throws TypeError for invalid input. No other exports.',
    MODULE_MAP: options.child
      ? `### Modules\n- [${posix.basename(options.child, '.spec.md')}](${posix.relative(posix.dirname(path), options.child)}) — token normalization.\n\n### Inter-Module Dependency Map\nNo sibling dependencies.`
      : '### Modules\nNo decomposed child module yet.\n\n### Inter-Module Dependency Map\nNo module dependency edges.',
    TOOL_STACK:
      '| Tool | Role |\n|---|---|\n| Node.js 22 | Local token CLI runtime; not installed by this draft. |',
    WORKFLOW_EXAMPLE:
      'A local consumer passes "  Foo__BAR  " and receives "foo-bar". Empty input produces TypeError without network calls.',
    FILE_STRUCTURE:
      'Planned, not implemented:\n```text\nsrc/normalize-token.ts\nsrc/normalize-token.test.ts\n```',
    EFFECTIVE_RULES:
      'No extra activated rules.\n<details><summary>Rule audit</summary>Local pure behavior only; no external service rules.</details>',
    VERIFICATION_COMMANDS:
      'After implementation: node --test src/normalize-token.test.ts. No tests have been executed or claimed complete.',
    INTERFACE_DECLARATION:
      '```ts\nexport declare function normalizeToken(input: string): string;\n```\nInvalid or empty input throws TypeError; no I/O.',
    VERSIONING_POLICY:
      'Adding an optional helper is minor; changing normalization output or TypeError behavior requires a major version.',
    COMPATIBILITY_MATRIX:
      'One local TypeScript signature.\n<details><summary>Compatibility</summary>Node.js 22 consumers; no wire protocol or persisted schema.</details>',
    ENTITY_INVENTORY:
      '| Entity | Type | Purpose |\n|---|---|---|\n| normalizeToken | Function | Deterministic token conversion |',
    ENTITY_SURFACES:
      'One public function.\n<details><summary>Function surface</summary>\nnormalizeToken(input: string): string. Invalid input throws TypeError. No lifecycle or emitted events.\n</details>',
    MODULE_CONTRACTS:
      'One pure service, no ports/adapters or call-chain graph.\n<details><summary>Contract</summary>\nPre: ' +
      (options.revision === 'frozen-oct22'
        ? 'ASCII input with letters or digits.'
        : 'ASCII input containing at least one non-separator character; empty, separator-only and non-ASCII inputs are invalid.') +
      ' Post: trim, lower-case, collapse separator runs to hyphen. On violation: TypeError; no I/O or mutation.\n</details>',
    PUBLIC_OPTIONS:
      'No public options.\n<details><summary>Policy</summary>Fixed deterministic transformation; no mutable configuration.</details>',
    DECISION_LOG: `${acr}-DL-1 — keep authoring pending; no operator approval exists.\n<details><summary>Boundary</summary>Pure local operation; no implementation or approval claimed.</details>`,
    MODULE_DECISION_LOG:
      'No independent module decisions or approval.\n<details><summary>Boundary</summary>Parent normalization rules are inherited unchanged.</details>',
    BOOTSTRAP_REQUIREMENTS: BOOTSTRAP,
    HANDOFF:
      '- **Status:** pending-operator\n- **Operator decision:** pending\nNo tickets created or execution approved by this draft.',
    RESEARCH: 'No research documents for this bounded deterministic draft.',
    IMPLEMENTATION_INSIGHTS: 'Not implemented; no implementation findings claimed.',
  };
  if (kind === 'infrastructure' && path === 'specs/infra-base/infra-base.spec.md') {
    Object.assign(bodies, {
      VISION:
        'Own the local specification-authoring environment: Node.js 22 and the installed Gennady CLI. Product behavior belongs to its separate scope and module owners.',
      OVERVIEW:
        '```mermaid\nflowchart LR\n  author --> localCLI[Installed Gennady CLI]\n  localCLI --> drafts[Markdown drafts]\n```\n_Локальный CLI создаёт и проверяет черновики спецификаций._',
      REQUIREMENTS_AND_CONSTRAINTS: `### ${acr}-REQ-1 [должен]
**Когда** автор создаёт или проверяет черновик, **окружение должно** предоставлять локальный Gennady CLI через npx --no-install без загрузки пакетов из registry.
> Один предоставленный harness набор инструментов делает авторинг воспроизводимым.

### ${acr}-REQ-2 [должен · нештатная]
**Если** локальный CLI или Node.js 22 недоступен, **то автор должен** остановиться до изменения целевого артефакта и сообщить фактическую ошибку запуска, не устанавливая другой инструмент.
> Отсутствие инструмента нельзя маскировать выдуманным результатом проверки.

### Out-of-Scope
- Product-domain algorithms, application APIs and product implementation.

### Runtime & Deferred Scope
The harness provisions the local CLI and dependency bindings; this reference is not an execution or verification receipt.

### Rules
No additional activated rule set.`,
      TOOL_STACK:
        '| Tool | Role |\n|---|---|\n| Node.js 22 | Local CLI runtime |\n| Installed Gennady CLI | Canonical artifact creation and scoped authoring checks |',
      WORKFLOW_EXAMPLE:
        'Use npx --no-install gennady sdd-new with the case-owned arguments, read the created template, then author the requested draft. Scope/module drafts use npx --no-install gennady sdd-check --spec with their exact target and --authoring. Missing tooling stops the workflow; no registry installation or fabricated receipt.',
      FILE_STRUCTURE:
        'Provisioned tooling and authored drafts are separate:\n```text\nnode_modules/.bin/gennady\nnode_modules/gennady/\nspecs/\n```',
      EFFECTIVE_RULES:
        'No extra activated rules.\n<details><summary>Rule audit</summary>The infrastructure supplies local authoring tools only; it does not own product-domain requirements.</details>',
      VERIFICATION_COMMANDS:
        'For scope/module drafts, use npx --no-install gennady sdd-check --spec with the exact draft path and --authoring. Portal/index cases use the host artifact oracle; no exact product authoring CLI is asserted for them. No verification result is claimed here.',
      DECISION_LOG: `${acr}-DL-1 — use the provided local tool copy without registry installation; operator approval remains pending.\n<details><summary>Boundary</summary>No product behavior, implementation or operator approval is owned by this tooling reference.</details>`,
      BOOTSTRAP_REQUIREMENTS:
        'No external bootstrap required.\n<details><summary>Bootstrap audit</summary>The harness already supplies the local CLI and dependency bindings. If unavailable, stop and report the concrete invocation error; do not install a replacement.</details>',
    });
  }
  const template = TEMPLATES[kind];
  return (
    `# ${heading}: ${kind} specification\n\n` +
    template.sections
      .map((section) => {
        const original = extractSection(template.skeleton, section.name);
        const title = original.status === 'ok' ? collectHeadings(original.content)[0] : undefined;
        const body = bodies[section.name];
        if (body === undefined) throw new Error(`Reference fixture lacks ${kind}/${section.name}`);
        return `<!--SECTION:${section.name}-->\n${title ? `${'#'.repeat(title.level)} ${title.text}\n` : ''}${body}\n<!--/SECTION:${section.name}-->\n`;
      })
      .join('\n')
  );
}

/** @purpose Truthful TODO ticket references for index authoring; never a fabricated completed round. */
export function referenceTicket(id: string, dependency: string | undefined): string {
  const values: Record<string, string> = {
    META: `- **Task-ID:** ${id}\n- **Scope:** token\n- **Module:** normalize\n- **Structural Owner:** module\n- **Owning Spec:** [Normalize](./normalize.spec.md)\n- **Status:** [ ] TODO\n- **Dependencies:** ${dependency ?? '—'}`,
  };
  return (
    `# Task: ${id} — ${id.endsWith('normalize') ? 'Normalize ASCII token' : 'Reject empty token'}\n\n` +
    TEMPLATES.task.sections
      .map((section) => {
        const original = extractSection(TEMPLATES.task.skeleton, section.name);
        const title = original.status === 'ok' ? collectHeadings(original.content)[0] : undefined;
        return `<!--SECTION:${section.name}-->\n${title ? `${'#'.repeat(title.level)} ${title.text}\n` : ''}${values[section.name] ?? 'Draft task; no execution, verification receipt or operator approval exists.'}\n<!--/SECTION:${section.name}-->\n`;
      })
      .join('\n')
  );
}

/** @purpose Read-only reference indexes for the sibling/project links a selected index must summarize. */
export function referenceIndex(
  kind: Extract<ArtifactKind, 'module-index' | 'scope-index' | 'project-index'>
): string {
  if (kind === 'module-index')
    return `# normalize — Tasks

## Tracker Index
| Task-ID | Title | Dependencies | Status | Reopens |
|---|---|---|---|---|
| NOR-normalize | Normalize ASCII token | — | [ ] TODO | — |
| NOR-reject | Reject empty token | NOR-normalize | [ ] TODO | — |

## Slug Registry
- normalize
- reject

## Intra-Module DAG

\`\`\`mermaid
graph TD
  NOR-reject --> NOR-normalize
\`\`\`

## Decision Log (module-task level)
No decisions or approvals recorded.

## Conventions
Inherit [Project conventions](../../3-tasks.md); no execution is complete.
`;
  if (kind === 'scope-index')
    return `# Tasks: token

## Scope Spec
- [Scope spec](./token.spec.md)

## Cascade Table
| Tier | coding | testing | architecture | infra |
|---|---|---|---|---|
| infra-base (traversed) | — | — | — | — |
| token (target) | — | — | — | — |

## Inter-Module DAG
\`\`\`mermaid
graph TD
  normalize
\`\`\`

## Tracker
| Task-ID | Title | Module | Dependencies | Status | Reopens |
|---|---|---|---|---|---|
| NOR-normalize | Normalize ASCII token | normalize | — | [ ] TODO | — |
| NOR-reject | Reject empty token | normalize | NOR-normalize | [ ] TODO | — |

## Decision Log (scope task level)
No decisions or approvals recorded.
`;
  // Keep the canonical project-wide execution vocabulary verbatim: it is explanatory, not a placeholder.
  const canonical = TEMPLATES['project-index'].skeleton;
  const start = canonical.indexOf('## Project-Wide Conventions');
  const end = canonical.indexOf('## Cross-Scope DAG');
  return `# Project Tasks

## Entry Points
- [Specs Portal](./README.md)
- Tickets execute only through /sdd-execute; all listed work remains TODO.

${canonical.slice(start, end)}## Cross-Scope DAG
\`\`\`mermaid
graph TD
  token --> infra-base
\`\`\`

## Scope Tracker
| Scope | Type | Index | Tasks | Done |
|---|---|---|---|---|
| token | library | [3-tasks](./token/token.3-tasks.md) | 2 | 0/2 |
| infra-base | infrastructure | [3-tasks](./infra-base/infra-base.3-tasks.md) | 0 | 0/0 |

## Decision Log (project task level)
No decisions or approvals recorded.
`;
}

export const REFERENCE_PORTAL = `# Token tools

## Vision
Local CLI and library consumers normalize an ASCII token deterministically. Empty input is rejected with TypeError; no network or state.
- **Для кого:** local CLI and library consumers.
- **Боль:** inconsistent token spelling.
- **Успех:** "  Foo__BAR  " becomes "foo-bar"; empty input fails.
- **Принципы:** pure transformation and explicit invalid-input failure.

## Scope Graph
\`\`\`mermaid
graph TD
  token --> infra-base
\`\`\`

## Scopes
| Scope | Type | Spec | Description |
|---|---|---|---|
| [\`token\`](./token/token.spec.md) | library | 🚧 | Deterministic ASCII token normalization |
| [\`infra-base\`](./infra-base/infra-base.spec.md) | infrastructure | 🚧 | Local authoring tooling |

## Decision Log
No operator approval; both specifications remain pending.
`;
