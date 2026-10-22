# infra-token: Infrastructure Specification

<!--SECTION:SPEC_ID-->
INFRA-TOKEN
<!--/SECTION:SPEC_ID-->

<!--SECTION:SCOPE_TYPE-->
## scope-type
infrastructure
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision
Provide the local, offline tooling boundary for a deterministic ASCII token normalizer. The scope fixes the runtime, version-control and hook expectations around `normalizeToken(input: string): string` while leaving every implementation artifact to a separate product/library owner.

Consumers are local CLI and library callers. The experience this scope covers is a reproducible local environment in which token normalization can be specified, checked and later implemented without network access, hidden state or package installation. No implementation is requested or implied by this description.
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
```text
CLI / library consumer
          │
          ▼
  normalizeToken(input)
          │
          ├── valid ASCII ──► "foo-bar"
          │
          └── empty / separator-only / non-ASCII ──► TypeError
```
_Форма контракта нормализации и его отказной путь — IT-REQ-1, IT-REQ-2._

The runtime and the local Gennady CLI are supplied by `infra-base`; this scope consumes them as-is. The diagram shows the contract shape that the tooling boundary exists to protect, not an implementation that this spec creates.
<!--/SECTION:OVERVIEW-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** [`infra-base`](../infra-base/infra-base.spec.md) — local Node.js 22 runtime and the installed Gennady CLI.
- **Provides rules to:** product/library scopes that consume deterministic token normalization; no concrete consumer spec is declared yet, so no additional dependency edge is invented here.
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## Requirements & Constraints

### Requirements

### IT-REQ-1 [должен]
**Когда** `normalizeToken` получает ASCII-строку, **функция должна** удалить ведущие и хвостовые ASCII-пробелы, привести ASCII-буквы к нижнему регистру и заменить каждую серию пробелов, подчёркиваний и дефисов одним дефисом.

> Единая детерминированная форма нужна CLI и библиотечным потребителям; без неё одно и то же имя токена записывается по-разному.

### IT-REQ-2 [должен · нештатная]
**Если** вход пустой, состоит только из разделителей или содержит не-ASCII символ, **то функция должна** выбросить `TypeError` без файлового, сетевого или иного ввода-вывода.

> Невалидный вход нельзя молча приводить к пустому токену: явная ошибка сохраняет контракт и исключает скрытые побочные эффекты.

### IT-REQ-3 [должен]
**Функция должна** быть чистой и детерминированной: один и тот же вход даёт один и тот же результат независимо от окружения, без сети, состояния и чтения файлов.

> Локальность и воспроизводимость — основа доверия к нормализатору; скрытое состояние сделало бы результат нестабильным.

### IT-REQ-4 [должен]
**Когда** разработчик запускает проверку или тесты, **окружение должно** использовать локальные Node.js 22, npm и git из `infra-base`, не устанавливая пакеты из registry.

> Общий предоставленный runtime исключает дрейф версий и скрытую загрузку зависимостей; без него проверка невоспроизводима.

### Acceptance Examples
| Example | Input | Outcome |
|---|---|---|
| normalize-example | `"  Foo__BAR  "` | `"foo-bar"` |
| empty-input-rejection | `""` | `TypeError` |

### Out-of-Scope
- Implementation of `normalizeToken`, CLI packaging and application UX.
- Network services, persistent storage and any non-local runtime.
- Module decomposition for consumers of token normalization.

### Runtime & Deferred Scope
The Node.js 22 runtime, git and the local Gennady CLI are inherited from `infra-base`. This section states the dependency; it is not an execution or verification receipt.

### Rules
`nodejs-npm-setup` and `git-setup` are inherited as the governing infra rules; no coding or testing rule is activated because this scope contains no implementation.
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:TOOL_STACK-->
## Tool Stack

### Categories Covered
Mandatory categories are covered: `vcs` = git, `package-management` = npm on the supplied Node.js 22, `git-hooks` = native git hooks through `core.hooksPath`. Optional `type-check`, `linting`, `formatting`, `test-unit`, `test-e2e`, `bundler`, `ci`, `monorepo-tool` and `docs` are excluded because no implementation is requested and no source tree exists to configure. Excluding them avoids inventing tooling that no requirement can justify.

### Tool Choices
| Category | Tool | Rationale |
|---|---|---|
| vcs | Git | IT-DL-1 |
| package-management | npm on Node.js 22 | IT-DL-2 |
| git-hooks | native git hooks (`core.hooksPath`) | IT-DL-3 |

### Integration Detail
- **Git**
  - Версия/API: git supplied by the `infra-base` environment; no version is asserted beyond that harness.
  - Нужные методы: `git status`, `git add`, `git commit`, `git diff`.
  - Эскиз интеграции: native CLI against the existing local repository; no adapter or remote.
  - Ограничения: local history only; no remote, no signing and no CI integration are introduced here.
- **npm on Node.js 22**
  - Версия/API: npm supplied with Node.js 22 by `infra-base`.
  - Нужные методы: `npm ci`, `npm run` once scripts exist.
  - Эскиз интеграции: use the existing `package.json` with `"type": "module"`; no dependency is added by this spec.
  - Ограничения: no package install is needed now; `package-lock.json` is absent until an implementation ticket owns it.
- **native git hooks (`core.hooksPath`)**
  - Версия/API: git hook mechanism supplied by the same local git.
  - Нужные методы: `core.hooksPath` configuration and a `pre-commit` hook entry point.
  - Эскиз интеграции: repository-local `.githooks/pre-commit` selected through `core.hooksPath`; activation belongs to a future implementation ticket.
  - Ограничения: the hook is declared but not active in this bounded authoring scope; no hook-manager dependency is introduced.

### Tool Interaction Check
git, npm and native hooks share the local filesystem and need no bridge. npm does not require a hook manager, and native hooks do not require a test runner; no interaction conflict is present. Activating a `pre-commit` check that calls `npm test` stays deferred until the implementation scope supplies a test script.
<!--/SECTION:TOOL_STACK-->

<!--SECTION:WORKFLOW_EXAMPLE-->
## Developer Workflow Example
```bash
# setup — runtime supplied by infra-base
node --version
npm --version
git --version

# authoring check for this spec
npx --no-install gennady sdd-check --spec specs/infra-token/infra-token.spec.md --authoring

# daily flow — no implementation phase is active in this scope
# (future implementation ticket owns src/, tests/ and npm scripts)

# commit flow
git add specs/infra-token/infra-token.spec.md
git commit -m "docs(infra-token): author infrastructure specification"

# debug flow — reproduce the authoring diagnostics exactly
npx --no-install gennady sdd-check --spec specs/infra-token/infra-token.spec.md --authoring
```
If Node.js 22, npm or git is unavailable, stop before changing the target and report the concrete command error; do not install a replacement toolchain.
<!--/SECTION:WORKFLOW_EXAMPLE-->

<!--SECTION:FILE_STRUCTURE-->
## File Structure
```text
.
├── package.json                         # supplied ESM harness; no new dependency here
├── specs
│   ├── infra-base
│   │   └── infra-base.spec.md           # inherited runtime and local CLI rules
│   └── infra-token
│       └── infra-token.spec.md          # this infrastructure spec
└── .claude
    └── tmp/                             # shared scratch directory, never committed
```

### File Mapping
| Path | Purpose |
|---|---|
| `specs/infra-token/infra-token.spec.md` | This infrastructure specification |
| `specs/infra-base/infra-base.spec.md` | Inherited runtime, git and local CLI provisioning |
| `package.json` | Existing ESM declaration from the harness; untouched by this spec |
| `.claude/tmp/` | Shared scratch location that `.gitignore` must exclude once implementation begins |
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:EFFECTIVE_RULES-->
## Effective Rules (for cascade)
Two infra rules are inherited from `infra-base`; no coding or testing rule is activated because this scope has no implementation.

<details>
<summary>Таблица правил</summary>

| Rule | Category | Source |
|---|---|---|
| nodejs-npm-setup | infra | `ai/directives/infra/nodejs-npm-setup.xml` (IT-DL-2) |
| git-setup | infra | `ai/directives/infra/git-setup.xml` (IT-DL-1) |

</details>

No formatter is chosen, so no formatter ignore file is activated. Once implementation begins, `.gitignore` must cover `.claude/tmp/`, `node_modules/` and `dist/`.
<!--/SECTION:EFFECTIVE_RULES-->

<!--SECTION:VERIFICATION_COMMANDS-->
## Verification Commands
Only the authoring gate is active in this bounded scope; implementation phases have no source tree, type-checker, linter, formatter or test runner to invoke.

| Command Name | Invocation |
|---|---|
| authoring-check-command | `npx --no-install gennady sdd-check --spec specs/infra-token/infra-token.spec.md --authoring` |

`typecheck-command`, `test-command`, `coverage-command`, `lint-command`, `format-command`, `check-command` and `fix-command` are not applicable because no implementation is requested here; the implementation scope owns them together with its source tree. No verification result beyond the authoring check is claimed by this spec.
<!--/SECTION:VERIFICATION_COMMANDS-->

<!--SECTION:RESEARCH-->
## Research
None — no external research was run for this bounded draft. The contract comes from `docs/token-contract.md` and the runtime from `infra-base`; no tool or version claim beyond the supplied harness is made.
<!--/SECTION:RESEARCH-->

<!--SECTION:DECISION_LOG-->
## Decision Log
Three tool-boundary decisions: git for version control, npm on the supplied Node.js 22, and native git hooks without a new dependency.

<details>
<summary>Полные записи Decision Log</summary>

IT-DL-1 2026-10-22 — use the existing local git repository as vcs (почему: the harness already supplies git and a repository; отвергнуто: a remote or hosted VCS — out of scope for local normalization tooling; риск: none beyond local history).

IT-DL-2 2026-10-22 — use npm on the Node.js 22 runtime supplied by infra-base and add no dependencies (почему: one shared runtime avoids version drift; отвергнуто: installing a separate runtime or package manager — duplicates infra-base and needs network; риск: package-lock.json is absent until an implementation ticket owns it).

IT-DL-3 2026-10-22 — cover the git-hooks category with native hooks via core.hooksPath rather than a hook-manager package (почему: the mandatory category is covered without a new dependency; отвергнуто: husky or another hook manager — adds a package before any implementation exists; риск: the hook is declared but not active until an implementation ticket).

</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
One cross-scope prerequisite: the Node.js 22, npm and git runtime provided by `infra-base`. No package or file installation is outstanding.

<details>
<summary>Таблица предусловий</summary>

| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |
|---|---|---|---|---|---|
| Node.js 22, npm and git are available locally | tool | external-prereq-scope | Consume the infra-base provisioning as-is | — | — |

</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff
- **Setup tasks to scaffold:** none for this spec; hook activation and any source tree belong to a future implementation scope.
- **Effective rules ready for cascade:** see Effective Rules
- **Verification Commands ready for cascade:** see Verification Commands
- **Bootstrap tickets ready for cascade:** see Prerequisites
- **Open risks:** native git hooks are declared but not active; implementation and test tooling are deferred; operator approval remains pending.
- **Status:** pending-operator
<!--/SECTION:HANDOFF-->
