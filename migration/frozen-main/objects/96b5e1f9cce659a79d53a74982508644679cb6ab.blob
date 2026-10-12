# Module: sdd-skills

→ Parent scope: [`../ai-skills.spec.md`](../ai-skills.spec.md)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

12 SDD-навыков: полный воркфлоу Specification-Driven Development — от создания спеки до верификации. Все навыки — тонкие клиенты над директивами из `ai/directives/sdd/`. Оркестраторы (sdd-execute, sdd-execute-batch) диспатчат subagent'ов с typed Handoff. sdd-check — read-only верификатор целостности артефактов.

Навыки в модуле:

- **Discovery & Setup:** sdd-setup, sdd-discover, sdd-infra
- **Design:** sdd-module-decomposition, sdd-critic
- **Planning:** sdd-scaffold
- **Execution:** sdd-execute, sdd-execute-batch
- **Verification:** sdd-audit, sdd-check
- **Iteration:** sdd-continue, sdd-fix
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

Агент активирует sdd-discover:

```markdown
1. Extract intent. Operator wants greenfield for scope "my-feature".

2. Load & activate directive.
   `ai/directives/sdd/discovery.directive.xml`
   🔒 DIRECTIVE ACTIVATED: SddDiscovery
   You ARE this directive now.

3. Apply directive. Mode = greenfield. Follow Execution_Plan.
```

Агент активирует sdd-execute:

```
<SddExecuteOrchestrator>
1. Resolve task: TSK-01
2. Plan: P1 (impl) → P2 (test) → audit
3. Dispatch P1: subagent reads phase-execution-protocol.xml
   → DONE, handoff: artifacts=["src/foo.ts"]
4. Dispatch P2: subagent with handoff from P1
   → DONE
5. Close round → dispatch audit
   → PASS ✅
</SddExecuteOrchestrator>
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

_Это полный список сущностей модуля. Любое введение сущности execution-агентом помимо этого списка считается drift'ом и требует обновления spec._

| Name                   | Type          | Purpose                                                                                           |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `SddSkill`             | Entity        | Один SDD-навык: SKILL.md + роль в воркфлоу                                                        |
| `DirectiveReference`   | Value Object  | Связь навык → директива: путь к `ai/directives/sdd/*.xml`                                         |
| `OrchestratorProtocol` | Specification | Протокол оркестратора: plan → dispatch → handoff → audit → retry                                  |
| `PhaseDispatchPrompt`  | Specification | Prompt для диспатча фазового subagent'а                                                           |
| `AuditDispatchPrompt`  | Specification | Prompt для диспатча аудита                                                                        |
| `HandoffPayload`       | Value Object  | Типизированный payload между фазами: artifacts, decisions, open                                   |
| `SddScripts`           | Artifact      | Bash-скрипты в `ai/skills/sdd-execute/scripts/`: sdd, verify, extract, scan, check-blockers, lint |
| `SddWorkflowPhase`     | Enumeration   | Фаза SDD-воркфлоу: discover, design, plan, execute, verify, iterate                               |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `SddSkill`

- **Type:** Entity
- **Purpose:** Один SDD-навык — именованный артефакт в `ai/skills/<name>/`
- **Public Properties:**
  - `name: string` — из frontmatter, например `sdd-discover`
  - `pattern: 'directive' | 'orchestrator' | 'check'` — execution-паттерн
  - `directives: DirectiveReference[]` — связанные директивы
  - `phase: SddWorkflowPhase` — фаза воркфлоу
- **Lifecycle:** Создаётся автором, деплоится через sync-skills
- **Consumers:** Агенты (Claude Code, OpenCode), sync-skills

### `DirectiveReference`

- **Type:** Value Object
- **Purpose:** Связь навык → директива
- **Public Properties:**
  - `path: string` — относительный путь от корня проекта: `ai/directives/sdd/<name>.xml`
  - `activationMode: 'self' | 'subagent'` — как навык активирует директиву: сам или через subagent
- **Lifecycle:** Immutable
- **Consumers:** `SddSkill`

### `OrchestratorProtocol`

- **Type:** Specification
- **Purpose:** Протокол оркестратора для sdd-execute и sdd-execute-batch
- **Public Operations:**
  - Resolve task — найти задачу по Task-ID или вычислить pickable
  - Plan — read planning surface (Meta, Phases Overview, Execution Log); detect state
  - Dispatch phases — sequential loop: fresh context per phase, typed Handoff between phases
  - Close round — append round close to Execution Log, sync trackers
  - Dispatch audit — mandatory, always runs after round close
  - Retry on FAIL — selective phase re-run while findings materially converge; stop on evidenced
    no-progress or an external/requirements decision
- **Invariants:**
  - Оркестратор не читает bodies фаз, BDD, Verification, Coverage
  - Оркестратор не пишет код
  - Preflight: check-blockers перед стартом
- **Consumers:** sdd-execute, sdd-execute-batch

### `PhaseDispatchPrompt`

- **Type:** Specification
- **Purpose:** Шаблон prompt'а для диспатча фазового subagent'а
- **Public Properties:**
  - Step 1: Read directive (`ai/directives/sdd/phase-execution-protocol.xml`)
  - Step 2: Apply directive silently (no activation or internal-step narration)
  - Step 3: Apply to intent (Ticket + Phase + Reason + Inputs)
  - Tooling: `${SKILL_DIR}/scripts/sdd`
- **Consumers:** sdd-execute, sdd-execute-batch

### `AuditDispatchPrompt`

- **Type:** Specification
- **Purpose:** Шаблон prompt'а для диспатча аудита
- **Public Properties:**
  - Step 1: Read directive (`ai/directives/sdd/audit.directive.xml`)
  - Step 2: Apply directive silently (no activation or internal-step narration)
  - Step 3: Apply to intent (Task + Ticket + Round + Artifacts + Mode)
- **Consumers:** sdd-execute, sdd-execute-batch

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
- **Consumers:** Phase subagents, audit subagents, sdd-check
- **Invariants:**
  - macOS-совместимый bash (нет GNU-only флагов)
  - Единый permission-паттерн: `Bash(scripts/sdd/sdd *)`
  - AX_BASH_NO_SILENT_EMPTY

### `SddWorkflowPhase`

- **Type:** Enumeration
- **Purpose:** Классификация навыка по фазе SDD-воркфлоу
- **Values:**
  - `discover` — sdd-setup, sdd-discover, sdd-infra
  - `design` — sdd-module-decomposition, sdd-critic
  - `plan` — sdd-scaffold
  - `execute` — sdd-execute, sdd-execute-batch
  - `verify` — sdd-audit, sdd-check
  - `iterate` — sdd-continue, sdd-fix
- **Consumers:** `SddSkill`
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

### Specification: `OrchestratorProtocol`

- **Purpose:** Контракт оркестрации выполнения задач
- **Consumers:** sdd-execute, sdd-execute-batch
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
  - Аудит выполнен (`PASS` или `FAIL` с деталями)
  - Нештатные решения и предложения обратной связи перечислены оператору в финальной сводке
- **Invariants:**
  - `sdd-execute` is the only per-task lifecycle owner. Batch schedules that lifecycle serially for
    ready TODO/IN_PROGRESS tickets; it does not duplicate phase/audit/retry logic or run parallel
    lanes in one working tree
  - Scaffolded open Round/phase skeletons are filled in place. A later Round is created only after a
    closed Round when new phase work is required
  - Phase, critic and audit dispatch inherit the caller's configured model; directives do not pin
    provider-specific model aliases
  - The execution invocation authorizes deterministic task selection and the printed batch plan;
    execution does not request a duplicate start confirmation
  - Audit retries have no numeric attempt token: remediation continues while it closes preceding
    blocking findings or yields new evidence and a different owned remediation; it stops on an
    equivalent finding set with neither new evidence nor a different in-scope remediation
  - Каждый audit finding обрабатывается один раз по собственным `route` и `phase`; смешанные
    phase/ticket/spec findings не подавляют друг друга
  - Селективный реран: только фазы, явно названные владельцами audit findings
  - Оркестратор не читает bodies фаз, BDD, Verification, Coverage
  - Безопасно разрешимое расхождение не останавливает execution: фаза использует существующие
    `decision`/`insight` и Handoff, сохраняет BDD/requirements/Vision и продолжает до обычного аудита
  - Runtime PASS requires executed evidence tied to the audited revision; printed commands and code
    reading alone do not prove runtime behavior
  - Audit proposes owned remediation; the orchestrator applies only exact bounded corrections.
    Requirement/Vision changes, risk acknowledgements, external state, and optional insight backflow
    remain operator decisions
  - Meta `Reopens` counts only persisted audit records with `triggered-reopen != none`; the mechanical
    check also validates the audit ↔ phase-owned route in both directions and the declared next
    Round. Audit refreshes Meta in the same ticket write; a latest causative FAIL is `PENDING` until
    execution creates that Round
  - Mechanical checks recognize legacy `TSK-NN` and current `TSK-{PREFIX}-{NNN}` IDs from ticket Meta,
    independent of filename convention
  - A checked Execution Log protocol line retaining a scaffold marker is a mechanical
    `fabricated-placeholder` finding; matching is token-aware, so ordinary event prose may mention
    unrelated angle-bracket literals
  - A valid but nonexistent Task-ID is a mechanical `missing` finding, never a clean empty result
  - `ANCHOR_NOT_FOUND` alone enters readable-legacy fallback; a present `ANCHOR_EMPTY` section is a
    distinct MAJOR corruption and cannot pass with zero BDD scenarios
  - A fix phase that returns BLOCKED/FAIL leaves its Round open and prevents a fresh audit until the
    concrete blocker is resolved
  - Control-plane exemption is limited to the active ticket, its Task-ID-owning scope tracker, and
    its aggregate scope row; unrelated modified trackers remain undeclared-diff findings
  - Tree and task rule scans share one predicate covering canonical cascade categories, including
    architecture and quality rules, while excluding protocol `*.directive.xml` files

### Artifact: `SddScripts`

- **Purpose:** Helper-скрипты для SDD-операций
- **Consumers:** Phase subagents, audit subagents, sdd-check
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
├── sdd-setup/SKILL.md
├── sdd-discover/SKILL.md
├── sdd-infra/SKILL.md
├── sdd-module-decomposition/SKILL.md
├── sdd-critic/SKILL.md
├── sdd-scaffold/SKILL.md
├── sdd-execute/
│   ├── SKILL.md
│   └── scripts/
│       ├── sdd                     # диспатчер
│       ├── verify.sh
│       ├── extract-section.sh
│       ├── check-blockers.sh
│       ├── scan.sh
│       ├── lint-artifacts.sh
│       ├── classify-scripts.js
│       ├── classify-scripts.ts
│       └── README.md
├── sdd-execute-batch/SKILL.md
├── sdd-audit/SKILL.md
├── sdd-check/SKILL.md
├── sdd-continue/SKILL.md
└── sdd-fix/SKILL.md
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

### D-M002 — 12 SDD-навыков в одном модуле

- **Status:** active
- **Recorded:** session ModuleDecomposition, ai-skills, sdd-skills
- **Why:** Все SDD-навыки объединены в один модуль по общему execution-паттерну (активация директив) и общей SDD-воркфлоу-семантике. Разделение на подмодули по фазам — overengineered для текущих 12 навыков.
- **Risk accepted:** При росте количества навыков модуль может потребовать дальнейшей декомпозиции.
- **Rejected alternatives:**
  - 5 подмодулей по фазам — overengineered: некоторые содержали бы 1-2 навыка
  - Навыки как отдельные модули — 12 модулей, overhead управления

### D-M003 — Adaptive execution reuses the existing flow

- **Status:** active
- **Recorded:** RCA TSK-IB-005, 2026-09-01
- **Why:** `sdd-execute` должен автономно доходить до аудита при неполной или временно
  противоречивой документации. Фаза фиксирует выбор через `decision`/`insight` в Execution Log и
  `decisions` в Handoff; аудит проверяет результат обычными PASS/FAIL и `INSIGHT_BACKFLOW`, а итоговая
  сводка предъявляет решения оператору одним блоком.
- **Safety boundary:** продолжение допустимо только для in-scope выбора, сохраняющего BDD,
  functional requirements и Vision и проверяемого обычными тестами/аудитом. Иначе `BLOCKED`.
- **Backflow:** оператор направляет предложение в существующий refine/reopen/follow-up flow.
- **Rejected alternatives:**
  - BLOCKED на любом spec/task mismatch — лишает execution автономности

### D-M004 — Review roles stay separate; orchestration owns transitions

- **Status:** active
- **Recorded:** independent SDD flow simulations, 2026-09-01
- **Why:** Critic проверяет качество task/spec до разработки; audit независимо проверяет реализацию
  после неё. Общими являются только механика сохранения результата, явный владелец каждого finding и
  повторный запуск после исправления. Это устраняет расхождения без объединения критериев двух ролей.
- **Critic evidence:** финальный `CLEAN` сохраняется компактной строкой; подробный scratch удаляется.
- **Audit autonomy:** один запуск проходит все проверки без промежуточного подтверждения и возвращает
  один терминальный результат.
- **Remediation:** execution обрабатывает все route-группы одного FAIL и запускает свежий audit,
  пока исправления закрывают предыдущие блокирующие findings либо дают новые доказательства и другой
  owned remediation. Эквивалентный результат без новых доказательств и нового пути означает
  доказанный no-progress, а не запрос токена у оператора.
- **Evidence:** runtime-утверждение подтверждается фактически выполненной командой или probe с
  наблюдаемым результатом; напечатанная команда и чтение кода не подменяют прогон.
- **Severity:** документное рассогласование блокирует только тогда, когда из-за него неоднозначны
  поведение, scope, владелец исправления или проверка; иначе это `MINOR`.
- **Dispatch:** phase, critic и audit наследуют настроенную модель и не показывают оператору
  внутреннее объявление активации.
- **Reopens:** счётчик выводится из сохранённых audit records с `triggered-reopen != none`, а не из
  общего количества Execution Rounds.
- **Legacy:** отсутствие anchors не блокирует читаемый старый тикет; неоднозначная структура блокирует.
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

- **Implementation files to be created:** Все 12 навыков уже существуют в `ai/skills/`. Tooling path
  резолвится от фактически загруженного `sdd-execute/SKILL.md` и передаётся subagent'ам абсолютным.
- **Test files to be created:** Интеграционные тесты для скриптов (sdd verify, sdd extract, sdd check-blockers)
- **Stack dependencies:**
  - Language: TypeScript (для classify-scripts.ts)
  - Test framework: node:test
- **Module Rules Additions:** None

| Rule | Category | Source |
| ---- | -------- | ------ |
| —    | —        | —      |

- **Open risks & validation needs:**
  - Runtime должен сообщить путь загруженного SKILL; fallback на другой checkout запрещён, чтобы
    audit/execute не проверяли не ту ревизию
  - Скрипты завязаны на macOS/bash 3.2+ — не кроссплатформенны
  - classify-scripts.js и classify-scripts.ts — дублирование, требует консолидации
  <!--/SECTION:HANDOFF-->
