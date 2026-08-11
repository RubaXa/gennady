# Module: sdd-skills

→ Parent scope: [`../ai-skills.spec.md`](../ai-skills.spec.md)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

9 SDD-навыков: полный воркфлоу Specification-Driven Development — от создания спеки до верификации. Большинство навыков — тонкие клиенты над директивами из `ai/directives/sdd-v2/`. `sdd-execute` — единственный оркестратор, диспатчит subagent'ов с typed Handoff (включая batch-режим — та же дверь, LOGIC_SWITCH на intent). `sdd-check` — read-only репортер над CLI-инструментом (без директивы).

Навыки в модуле:

- **Router (единая дверь):** `sdd` — маршрутизирует к portal / scope / infra / interface / module / recover-from-code
- **Planning:** `sdd-scaffold`
- **Execution:** `sdd-execute` (single ticket или batch — интент внутри одного навыка)
- **Verification:** `sdd-audit`, `sdd-check`, `sdd-code-review`
- **Iteration:** `sdd-critic`, `sdd-reconcile` (режимы fix и from-code)
- **Setup:** `sdd-hooks-install`
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

Агент активирует `sdd` (роутер) для greenfield-скоупа:

```markdown
1. GATHER: sdd-state (portal/scopes) + читает ai/directives/sdd-v2/router.directive.xml

2. EMBODY: You ARE the router directive now. Intent — "новый скоуп my-feature".

3. ROUTE: LOGIC_SWITCH(state, intent, scope-type) → READ_AND_USE_DIRECTIVE(scope.directive.xml)
```

Агент активирует `sdd-execute` (single ticket или batch — один и тот же навык):

```
<SddDoor door="execute">
1. GATHER: sdd-state + читает ai/directives/sdd-v2/execute.directive.xml
2. EMBODY: You ARE the execute orchestrator now. Task-ID = TSK-01 (или "batch").
3. Plan: P1 (impl) → P2 (test) → audit
4. Dispatch P1: worker reads phase-execution-protocol.directive.xml
   → DONE, handoff: artifacts=["src/foo.ts"]
5. Dispatch P2: worker with handoff from P1
   → DONE
6. Close round → dispatch audit
   → PASS ✅
</SddDoor>
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

_Это полный список сущностей модуля. Любое введение сущности execution-агентом помимо этого списка считается drift'ом и требует обновления spec._

| Name                   | Type          | Purpose                                                                                           |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `SddSkill`             | Entity        | Один SDD-навык: SKILL.md + роль в воркфлоу                                                        |
| `DirectiveReference`   | Value Object  | Связь навык → директива: путь к `ai/directives/sdd-v2/*.xml`                                      |
| `OrchestratorProtocol` | Specification | Протокол оркестратора: plan → dispatch → handoff → audit → retry                                  |
| `PhaseDispatchPrompt`  | Specification | Prompt для диспатча фазового subagent'а                                                           |
| `AuditDispatchPrompt`  | Specification | Prompt для диспатча аудита                                                                        |
| `HandoffPayload`       | Value Object  | Типизированный payload между фазами: artifacts, decisions, open                                   |
| `SddScripts`           | Artifact      | Bash-скрипты в `ai/skills/sdd-execute/scripts/`: sdd, verify, extract, scan, check-blockers, lint — доступны фазовым/аудит-subagent'ам как `<sdd-path>` |
| `SddWorkflowPhase`     | Enumeration   | Фаза SDD-воркфлоу: route, plan, execute, verify, iterate, setup                                   |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `SddSkill`

- **Type:** Entity
- **Purpose:** Один SDD-навык — именованный артефакт в `ai/skills/<name>/`
- **Public Properties:**
  - `name: string` — из frontmatter, например `sdd-scaffold`
  - `pattern: 'directive' | 'orchestrator' | 'check'` — execution-паттерн
  - `directives: DirectiveReference[]` — связанные директивы
  - `phase: SddWorkflowPhase` — фаза воркфлоу
- **Lifecycle:** Создаётся автором, деплоится через sync-skills
- **Consumers:** Агенты (Claude Code, OpenCode), sync-skills

### `DirectiveReference`

- **Type:** Value Object
- **Purpose:** Связь навык → директива
- **Public Properties:**
  - `path: string` — относительный путь от корня проекта: `ai/directives/sdd-v2/<name>.directive.xml`
  - `activationMode: 'self' | 'subagent'` — как навык активирует директиву: сам или через subagent
- **Lifecycle:** Immutable
- **Consumers:** `SddSkill`

### `OrchestratorProtocol`

- **Type:** Specification
- **Purpose:** Протокол оркестратора для sdd-execute (single ticket и batch — один и тот же навык, LOGIC_SWITCH на intent)
- **Public Operations:**
  - Resolve task — найти задачу по Task-ID или вычислить pickable
  - Plan — read planning surface (Meta, Phases Overview, Execution Log); detect state
  - Dispatch phases — sequential loop: fresh context per phase, typed Handoff between phases
  - Close round — append round close to Execution Log, sync trackers
  - Dispatch audit — mandatory, always runs after round close
  - Retry on FAIL — max 2 audit attempts, selective phase re-run
- **Invariants:**
  - Оркестратор не читает bodies фаз, BDD, Verification, Coverage
  - Оркестратор не пишет код
  - Preflight: check-blockers перед стартом
- **Consumers:** sdd-execute

### `PhaseDispatchPrompt`

- **Type:** Specification
- **Purpose:** Шаблон prompt'а для диспатча фазового subagent'а
- **Public Properties:**
  - Step 1: Read directive (`ai/directives/sdd-v2/phase-execution-protocol.directive.xml`)
  - Step 2: Activate (`🔒 DIRECTIVE ACTIVATED: SddPhaseExecution`)
  - Step 3: Apply to intent (Ticket + Phase + Reason + Inputs)
  - Tooling: `${SKILL_DIR}/scripts/sdd`
- **Consumers:** sdd-execute

### `AuditDispatchPrompt`

- **Type:** Specification
- **Purpose:** Шаблон prompt'а для диспатча аудита
- **Public Properties:**
  - Step 1: Read directive (`ai/directives/sdd-v2/audit.directive.xml`)
  - Step 2: Activate (`🔒 DIRECTIVE ACTIVATED: SddAudit`)
  - Step 3: Apply to intent (Task + Ticket + Round + Artifacts + Mode)
- **Consumers:** sdd-execute

### `HandoffPayload`

- **Type:** Value Object
- **Purpose:** Типизированный контекст, передаваемый между фазами
- **Public Properties:**
  - `artifacts: string[]` — созданные/изменённые файлы
  - `decisions: string[]` — принятые решения
  - `open: string[]` — открытые вопросы для следующей фазы
- **Lifecycle:** Создаётся фазой при DONE, потребляется следующей фазой как Inputs
- **Consumers:** Phase subagents (через orchestrator)

### `SddScripts`

- **Type:** Artifact
- **Purpose:** Bash-скрипты для SDD-операций
- **Public Operations:**
  - `sdd extract <file> <NAME>` — извлечь SECTION из markdown
  - `sdd verify <files>` — all gates (typecheck + gennady DBC lint + lint + test + format check); RUN-ALL: failures accumulate; SUPPRESS-ON-SUCCESS: passing gates produce zero output
  - `sdd check-blockers <ticket>` — сканировать BLOCKER в Execution Log
  - `sdd scan [root]` — снапшот проекта
  - `sdd lint <files>` — DBC AST lint
- **Location:** `ai/skills/sdd-execute/scripts/`
- **Consumers:** Phase subagents, audit subagents (через `<sdd-path>` в диспатч-промпте оркестратора). `sdd-check` (skill) НЕ вызывает эти скрипты — его механическая проверка идёт через `npx gennady sdd-check`, TypeScript-инструмент `shared/sdd/check.ts`, отдельный от `SddScripts`
- **Invariants:**
  - macOS-совместимый bash (нет GNU-only флагов)
  - Единый permission-паттерн: `Bash(scripts/sdd/sdd *)`
  - AX_BASH_NO_SILENT_EMPTY

### `SddWorkflowPhase`

- **Type:** Enumeration
- **Purpose:** Классификация навыка по фазе SDD-воркфлоу
- **Values:**
  - `route` — sdd (единая дверь-роутер: portal / scope / infra / interface / module / recover-from-code)
  - `plan` — sdd-scaffold
  - `execute` — sdd-execute (single ticket и batch)
  - `verify` — sdd-audit, sdd-check, sdd-code-review
  - `iterate` — sdd-critic, sdd-reconcile
  - `setup` — sdd-hooks-install
- **Consumers:** `SddSkill`
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

### Specification: `OrchestratorProtocol`

- **Purpose:** Контракт оркестрации выполнения задач
- **Consumers:** sdd-execute
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

**Contract (DbC):**

- **Preconditions:**
  - `tasks/` директория существует
  - Ticket содержит section 1 (Meta), 2 (Phases Overview), 7 (Execution Log)
  - `${SKILL_DIR}/scripts/sdd check-blockers` возвращает CLEAN
- **Postconditions:**
  - Все pending-фазы выполнены последовательно
  - Execution Log содержит закрытый раунд
  - Tracker синхронизирован: ticket Meta.Status ↔ tasks/\*/README.md ↔ tasks/README.md
  - Аудит выполнен (PASS или FAIL с деталями)
- **Invariants:**
  - Max 2 попытки аудита
  - Селективный реран фаз: только те, что в `phases_to_fix`
  - Оркестратор не читает bodies фаз, BDD, Verification, Coverage

### Artifact: `SddScripts`

- **Purpose:** Helper-скрипты для SDD-операций
- **Consumers:** Phase subagents, audit subagents (не `sdd-check` skill — см. Entity Surfaces)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`
- **Deferred Runtime Scope:** None

**Contract (DbC):**

- **Preconditions:**
  - macOS (bash 3.2+)
  - `npx tsx` доступен для Node.js скриптов
- **Postconditions:**
  - `verify` → RUN-ALL: все гейты выполняются всегда, ошибки накапливаются. SUPPRESS-ON-SUCCESS: успешные гейты не печатают ничего; выводятся только упавшие (command + exit code + captured output). PASS → одна строка `[verify] ALL_GATES_PASS (N/N)`. FAIL → exit 1 с выводом только упавших гейтов.
  - `check-blockers` → exit 0 если нет неразрешённых BLOCKER
  - `extract` → содержимое SECTION или ошибка
- **Invariants:**
  - Никакой подкоманды не производит пустой вывод (AX_BASH_NO_SILENT_EMPTY)
  - Все подкоманды доступны через единый диспатчер `sdd`
  <!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 6. Public Options & Policies

| Option                       | Binding                                      | Status   |
| ---------------------------- | -------------------------------------------- | -------- |
| Директивы для каждого навыка | `DirectiveReference` в `SddSkill`            | ✅ bound |
| Протокол оркестратора        | `OrchestratorProtocol`                       | ✅ bound |
| Prompt-шаблоны               | `PhaseDispatchPrompt`, `AuditDispatchPrompt` | ✅ bound |
| Скрипты                      | `SddScripts`                                 | ✅ bound |
| Handoff между фазами         | `HandoffPayload`                             | ✅ bound |

Все опции привязаны. Нет отложенных.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```
ai/skills/
├── sdd/SKILL.md                    # единая дверь-роутер
├── sdd-scaffold/SKILL.md
├── sdd-execute/
│   ├── SKILL.md                    # single ticket и batch — LOGIC_SWITCH на intent
│   └── scripts/
│       ├── sdd                     # диспатчер
│       ├── verify.sh
│       ├── extract-section.sh
│       ├── check-blockers.sh
│       ├── scan.sh
│       ├── check.sh
│       ├── lint-artifacts.sh
│       ├── classify-scripts.js
│       ├── classify-scripts.ts
│       ├── _sdd-lib.sh
│       └── README.md
├── sdd-audit/SKILL.md
├── sdd-check/SKILL.md              # без директивы — тонкий репортер над `npx gennady sdd-check`
├── sdd-code-review/SKILL.md
├── sdd-critic/SKILL.md
├── sdd-reconcile/SKILL.md          # режимы fix и from-code
└── sdd-hooks-install/SKILL.md      # config-bootstrapper, вне 3 паттернов — см. ai-skills.spec.md D-005
```

**File Mapping:**
| Путь | Компонент |
|---|---|
| `sdd-{name}/SKILL.md` | `SddSkill` — тело навыка |
| `sdd-execute/scripts/sdd` | `SddScripts` — диспатчер |
| `sdd-execute/scripts/*.sh` | `SddScripts` — helper'ы |

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 8. Module Decision Log

### D-M002 — SDD-навыки в одном модуле

- **Status:** active
- **Recorded:** session ModuleDecomposition, ai-skills, sdd-skills
- **Why:** Все SDD-навыки объединены в один модуль по общему execution-паттерну (активация директив) и общей SDD-воркфлоу-семантике. Разделение на подмодули по фазам — overengineered. Решение принято при 12 навыках (сейчас 9 — см. `ai-skills.spec.md` D-005), рационале не изменился.
- **Risk accepted:** При росте количества навыков модуль может потребовать дальнейшей декомпозиции.
- **Rejected alternatives:**
  - 5 подмодулей по фазам — overengineered: некоторые содержали бы 1-2 навыка
  - Навыки как отдельные модули — 12 модулей, overhead управления
  <!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** `skill-contract` (паттерны активации, frontmatter)
- **Scope Reference (cross-scope):** `infra-base` (Node.js 22+, bash), `cli` (gennady CLI)
- **Provides to:** Все скоупы, использующие SDD-воркфлоу

```mermaid
graph TD
    sdd-skills --> skill-contract
    sdd-skills -. Runtime .-> cli
    sdd-skills -. Runtime .-> infra-base
```

<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## Critic Rounds

### Round 1 — 2026-05-31

- Verdict: NEEDS_WORK
- Accepted: 0
- Rejected: 7 — all findings are pre-existing spec gaps unrelated to the `verify` RUN-ALL/SUPPRESS-ON-SUCCESS change; out of scope for this surgical edit (AX_SURGICAL)
- Changes: none

## 10. Handoff to Task Scaffolding

- **Implementation files to be created:** Все 9 навыков уже существуют в `ai/skills/`. Пути в телах SKILL.md — в dev-форме (`~/Developer/gennady/...`), релативизуются `PathNormalizer` при `sync-skills` (закрыто, см. `skill-contract.spec.md` D-M001/handoff).
- **Test files to be created:** Интеграционные тесты для скриптов (sdd verify, sdd extract, sdd check-blockers)
- **Stack dependencies:**
  - Language: TypeScript (для classify-scripts.ts)
  - Test framework: node:test
- **Module Rules Additions:** None

| Rule | Category | Source |
| ---- | -------- | ------ |
| —    | —        | —      |

- **Open risks & validation needs:**
  - Скрипты завязаны на macOS/bash 3.2+ — не кроссплатформенны
  - classify-scripts.js и classify-scripts.ts — дублирование, требует консолидации
  - `ai/skills/sdd-execute/scripts/` (extract/lint/verify/check-blockers/scan/check) — живо используются только фазовыми/аудит-subagent'ами через `<sdd-path>` в phase-execution-protocol; сам `check.sh` дублирует по смыслу CLI-команду `gennady sdd-check` — требует отдельной проверки на dead code (вне scope этой сверки)
  <!--/SECTION:HANDOFF-->
