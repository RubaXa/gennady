# ai-skills: Library Specification

<!--SECTION:SCOPE_TYPE-->

## scope-type

library

<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->

## 1. Vision & Primary Goal

Библиотека AI-навыков для агентов — переиспользуемые текстовые артефакты (`SKILL.md` + scripts + prompts). Навык = тонкий клиент над директивой: самодостаточный workflow, который агент (Claude Code, OpenCode) активирует по trigger-фразам оператора, загружает его body и следует процедуре.

Навыки разрабатываются в `ai/skills/`, деплоятся в проекты через `npx gennady sync-skills` в `.claude/skills/`. Директивы — в `ai/directives/`, переиспользуются между навыками.

13 навыков: 12 SDD (sdd-setup, sdd-discover, sdd-module-decomposition, sdd-scaffold, sdd-execute, sdd-execute-batch, sdd-audit, sdd-check, sdd-continue, sdd-critic, sdd-fix, sdd-infra) + 1 non-SDD (alt-opinion).

<!--/SECTION:VISION-->

<!--SECTION:GOLDEN_DX-->

## 2. Approved Golden DX Example (Composition View)

Навыки потребляются агентом через 3 паттерна. Детали каждого паттерна — в модульных спеках.

### Directive-based: [`skill-contract` → `DirectiveActivation`](./skill-contract/skill-contract.spec.md#directiveactivation)

```markdown
1. Extract intent → 2. Load & activate directive → 3. Execute plan
```

Потребители: sdd-discover, sdd-setup, sdd-audit, sdd-scaffold, sdd-module-decomposition, sdd-infra, sdd-critic, sdd-continue, sdd-fix.

### Orchestrator: [`sdd-skills` → `OrchestratorProtocol`](./sdd-skills/sdd-skills.spec.md#orchestratorprotocol)

```
Plan (read ticket surface) → Dispatch phases (sequential, typed Handoff) → Audit (mandatory)
```

Потребители: sdd-execute, sdd-execute-batch.

### CLI-delegation: [`alt-opinion` → `AltOpinionSkill`](./alt-opinion/alt-opinion.spec.md#altopinionskill)

```bash
npx gennady alt-opinion --file="<path>"
```

Потребители: alt-opinion.

Навык не содержит логики — только трёхшаговый активатор: извлеки intent, загрузи директиву, активируйся как она, выполни план директивы.

### Паттерн 2: Orchestrator skill

````markdown
---
name: sdd-execute
description: Execute ONE task ticket end-to-end ...
license: MIT
compatibility: opencode
---

<SddExecuteOrchestrator role="orchestrator-only">
You are an ORCHESTRATOR. You PLAN and DISPATCH; you do NOT execute phases yourself.

<Protocol>
1. **Resolve task:** ...
2. **Plan:** Read ONLY ticket sections 1, 2, and 7-current-Round.
3. **Phase dispatch loop** — sequential, one phase at a time:
   a. Dispatch PHASE subagent with prompt:
      ```
      Step 1 — Read the directive:
        ai/directives/sdd/phase-execution-protocol.xml
      Step 2 — Activate. Announce: "🔒 DIRECTIVE ACTIVATED: SddPhaseExecution"
      Step 3 — Apply to intent. Ticket: <path>, Phase: <P<N>>
      SDD tooling available at: ~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd
      ```
5. **Dispatch AUDIT** with prompt:
````

Step 1 — Read the directive:
ai/directives/sdd/audit.directive.xml
Step 2 — Activate. Announce: "🔒 DIRECTIVE ACTIVATED: SddAudit"

```
</Protocol>
</SddExecuteOrchestrator>
```

Оркестратор композирует несколько директив (phase-execution + audit), диспатчит subagent с typed Handoff. Сам код не пишет.

### Паттерн 3: CLI-delegation skill

````markdown
---
name: alt-opinion
description: Multi-model alternative opinion via CLI (gennady alt-opinion) ...
license: MIT
compatibility: opencode
---

Делегирует CLI `gennady alt-opinion`. Не изобретает пайплайн — использует готовый.

### Шаг 1: Подготовь артефакт

...

### Шаг 2: Запусти CLI

```bash
npx tsx ~/Developer/gennady/cli/gennady.ts alt-opinion --file="<path>"
```
````

### Шаг 3: Покажи результат

CLI возвращает готовый синтез-блок. Покажи как есть.

```

### Файловая структура навыка

```

ai/skills/<name>/
├── SKILL.md # обязателен: YAML frontmatter + markdown body
├── scripts/ # опционально: bash/js утилиты
└── \*.prompt.md # опционально: кастомные промпты для моделей

```
<!--/SECTION:GOLDEN_DX-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## 3. Requirements & Constraints

### 3.1 Functional Requirements

| ID | Требование |
|---|---|
| FR-01 | **Формат навыка.** YAML frontmatter (`name`, `description`, `compatibility`), markdown body с процедурой активации. Файл: `SKILL.md` в `ai/skills/<name>/` |
| FR-02 | **Активация директивы.** Навык говорит агенту: прочитай директиву по пути (из `ai/directives/`), активируй её, примени к intent'у оператора |
| FR-03 | **Композиция директив.** Навык может активировать несколько директив последовательно (например sdd-execute: phase-execution → audit) |
| FR-04 | **Trigger-фразы.** `description` во frontmatter содержит ключевые фразы, по которым агент-хостер определяет, когда активировать навык |
| FR-05 | **Артефакты навыка.** Навык может поставлять ресурсы: скрипты (`scripts/`), промпты (`*.prompt.md`) |
| FR-06 | **Синхронизация.** Навыки разрабатываются в `ai/skills/`, деплоятся через `npx gennady sync-skills` в `.claude/skills/` проекта |
| FR-07 | **Три execution-паттерна:** directive-based (загрузка + активация + применение), orchestrator (план + dispatch subagent), CLI-delegation (подготовка артефакта → вызов CLI) |

### 3.2 Non-Functional Constraints

| ID | Ограничение |
|---|---|
| NFR-01 | Навык — текстовый артефакт, не код. Нет runtime-зависимостей кроме директив и скриптов |
| NFR-02 | **Dev/prod dual path mode.** В исходниках (`ai/skills/`) пути указываются в dev-форме: `~/Developer/gennady/ai/directives/...` для директив, `~/Developer/gennady/ai/skills/...` для скриптов (вместо `${SKILL_DIR}`), `npx tsx ~/Developer/gennady/cli/gennady.ts` для CLI-вызовов. При `sync-skills` нормализуются в продуктовые: `ai/directives/...`, `.claude/skills/...`, `npx gennady ...`. Никаких абсолютных путей в продуктовой версии |
| NFR-03 | Scripts — bash, macOS-совместимые. Node.js скрипты только через `tsx` |
| NFR-04 | Директивы — XML, read-only для навыка. Навык не модифицирует директиву |
| NFR-05 | Cross-skill consistency: assume sync. No runtime validation |
| NFR-06 | `compatibility: opencode` для всех навыков. Claude Code игнорирует нераспознанные поля |

### 3.3 Out-of-Scope

- Валидация cross-skill/directive консистентности
- Интерактивный режим в sync-skills
- Watch-режим синхронизации
- Миграция форматов навыков

### 3.4 Runtime Backing & Deferred Scope

| Capability | Posture | Notes |
|---|---|---|
| SKILL.md + сопутствующие файлы | `real-runtime` | Статические текстовые артефакты в `ai/skills/` |
| Scripts (bash/tsx) | `real-runtime` | macOS, Node 22+ |
| sync-skills деплой | `real-runtime` | В скоупе `cli` |

Ничего не deferred.

### 3.5 Rules

| Rule | Category | Source |
|---|---|---|
| typescript-rules | coding | `ai/directives/coding/typescript-rules.xml` |
| node-test | testing | `ai/directives/testing/node-test.xml` |
| nodejs-npm-setup | infra | `ai/directives/infra/nodejs-npm-setup.xml` |
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:PUBLIC_API_SURFACE-->
## 4. Public API Surface

| Surface | Описание |
|---|---|
| `name` | Уникальный идентификатор: lowercase, kebab-case, совпадает с именем директории |
| `description` | Человекочитаемое описание с trigger-фразами. Агент матчит по нему intent оператора |
| `SKILL.md body` | Процедура: извлечение intent → загрузка директивы → активация → выполнение |
| `scripts/` | Опционально: bash/js утилиты. Доступны агенту внутри навыка |
| `*.prompt.md` | Опционально: кастомные промпты для моделей |
<!--/SECTION:PUBLIC_API_SURFACE-->

<!--SECTION:ARCHITECTURE-->
## 5. Architecture

**Принцип: навык = тонкий клиент над директивой.**

```

┌──────────────┐ activates ┌──────────────────┐
│ SKILL.md │ ──────────────────▶ │ directive.xml │
│ (frontmatter│ │ (Mission, │
│ + 3 steps) │ │ Belief_State, │
│ │ │ Execution_Plan)│
│ resources: │ └──────────────────┘
│ scripts/ │
│ \*.prompt.md│
└──────────────┘
▲
│ reads & follows
│
┌─────────┐
│ Agent │ (Claude Code / OpenCode)
└─────────┘

````

**Три execution-паттерна:**

| Паттерн | Навык делает | Примеры |
|---|---|---|
| **Directive activation** | Извлекает intent → читает директиву → активируется как она → выполняет план | sdd-discover, sdd-audit, sdd-scaffold, sdd-setup, sdd-module-decomposition, sdd-infra, sdd-critic, sdd-continue, sdd-fix |
| **Orchestrator** | Планирует → диспатчит subagent-фазы с typed Handoff → диспатчит audit. Сам код не пишет | sdd-execute, sdd-execute-batch |
| **CLI delegation** | Подготавливает артефакт → вызывает `npx gennady <cmd>` → показывает результат | alt-opinion |

**sdd-check** — read-only verifier: саморефлексия протокольных нарушений + механические проверки через `~/Developer/gennady/ai/skills/sdd-execute/scripts/sdd scan`. Код не пишет.

**Скрипты:** В dev-режиме скрипты доступны по пути `~/Developer/gennady/ai/skills/<skill-name>/scripts/`. При `sync-skills` путь нормализуется в `.claude/skills/<skill-name>/scripts/`. Скрипты есть только у `sdd-execute` (9 файлов), `sdd-check` использует их же.

### 5.1 Rejected Alternatives

| Решение | Почему отклонено |
|---|---|
| Навыки с embedded-логикой (вся процедура внутри SKILL.md) | Дублирование между навыками. Директивы переиспользуемы; навыки только активируют |
| Навыки как TypeScript-модули | Навыки потребляются разными агентами (Claude, OpenCode) с разным runtime. Markdown — универсальный формат |
| Одна мега-директива на всё SDD | Разные фазы SDD требуют разного контекста и изоляции. Разделение директив = изоляция контекста subagent'ов |
<!--/SECTION:ARCHITECTURE-->

<!--SECTION:DECISION_LOG-->
## 6. Decision Log

### D-001 — Навык = тонкий клиент над директивой

- **Status:** active
- **Recorded:** session Discovery, ai-skills
- **Why:** Навыки не содержат логику — только активируют переиспользуемые директивы. Директивы — source of truth для поведения; навыки — обёртка, которая заставляет агента прочитать и активировать директиву.
- **Risk accepted:** При изменении директивы все навыки-потребители должны оставаться совместимыми. Смягчается тем, что навык не содержит логики, только путь к директиве.
- **Rejected alternatives:**
  - Embedded-логика в каждом навыке — дублирование, расхождение
  - Навыки без директив — не переиспользуемо

### D-002 — Три execution-паттерна

- **Status:** active
- **Recorded:** session Discovery, ai-skills
- **Why:** Три разных способа активации покрывают все существующие навыки. Directive-based — основной. Orchestrator — для композиции нескольких директив с typed Handoff. CLI delegation — для делегирования готовому CLI.
- **Risk accepted:** Новые навыки могут не вписываться в существующие паттерны. Тогда — новый паттерн или refine спеки.
- **Rejected alternatives:**
  - Один универсальный паттерн — не покрывает orchestrator (subagent dispatch) и CLI-delegation
  - Каждый навык уникален — не переиспользуемо, нет контракта

### D-003 — `compatibility: opencode` для всех навыков

- **Status:** active
- **Recorded:** session Discovery, ai-skills
- **Why:** Навыки разрабатываются для Claude Code, но должны быть совместимы с OpenCode. Поле `compatibility` — опциональное, признано OpenCode (`opencode.ai/docs/skills`), Claude игнорирует нераспознанные поля.
- **Risk accepted:** Отсутствует (Claude и OpenCode оба игнорируют неизвестные поля frontmatter).
- **Rejected alternatives:**
  - `compatibility: claude, opencode` — нестандартный синтаксис; оставляем `opencode` как в существующих навыках

### D-004 — Декомпозиция: 3 модуля по execution-паттерну

- **Status:** active
- **Recorded:** session ModuleDecomposition, ai-skills
- **Why:** Выбрана декомпозиция по execution-паттерну: `skill-contract` (формат и контракты), `sdd-skills` (все 12 SDD), `alt-opinion` (CLI-delegation). Минимально достаточно для разделения контракта и реализации, не overengineered.
- **Risk accepted:** `sdd-skills` содержит 12 навыков — при росте может потребоваться дальнейшая декомпозиция.
- **Rejected alternatives:**
  - По фазам SDD (6 модулей) — overengineered: большинство модулей содержат 1-2 навыка
  - Монолитный (1 модуль) — нет разделения контракта и реализации
<!--/SECTION:DECISION_LOG-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## 7. Scope Dependencies

- **Depends on:** `infra-base` (Node.js 22+, TypeScript, node:test, Vite), `cli` (sync-skills для деплоя, gennady CLI для alt-opinion)
- **Provides to:** Все скоупы, использующие SDD-воркфлоу (cli, vcs, dbc, agent-mon, agent-mon-cli)
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:MODULE_MAP-->
## 8. Module Map

Spec hierarchy is materialized at `specs/ai-skills/`. Module specs are at `specs/ai-skills/<module>/<module>.spec.md`.

### 8.1 Modules
- [`skill-contract`](./skill-contract/skill-contract.spec.md) — Контракт навыка: frontmatter, naming, паттерны активации, файловая структура
- [`sdd-skills`](./sdd-skills/sdd-skills.spec.md) — 12 SDD-навыков: полный воркфлоу Specification-Driven Development
- [`alt-opinion`](./alt-opinion/alt-opinion.spec.md) — Мульти-модельный анализ через CLI (CLI-delegation паттерн)

### 8.2 Inter-Module Dependency Map

```mermaid
graph TD
    sdd-skills --> skill-contract
    alt-opinion --> skill-contract
    sdd-skills -. Runtime .-> cli
    alt-opinion -. Runtime .-> cli
    sdd-skills -. Runtime .-> infra-base
    alt-opinion -. Runtime .-> infra-base
````

### 8.3 Stack Dependencies

- Languages: TypeScript (для classify-scripts.ts)
- Test frameworks: node:test

### 8.4 Handoff to Task Scaffolding

- **Primary input:** `specs/ai-skills/ai-skills.spec.md` (this file).
- **Required directives:** `ai/directives/coding/typescript-rules.xml`, `ai/directives/testing/node-test.xml`
- **Open risks & validation needs:**
  - ~~Абсолютные пути в телах SKILL.md требуют релативизации~~ → Закрыто D-M007 (sync-skills): PathNormalizer заменяет dev-пути на продуктовые при синхронизации
  - Скрипты завязаны на macOS/bash — не кроссплатформенны
  - `${SKILL_DIR}` заменён на dev-пути `~/Developer/gennady/ai/skills/...`; при sync-skills нормализуется в `.claude/skills/...`
  <!--/SECTION:MODULE_MAP-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->

## 9. Bootstrap Requirements

| #     | Requirement                                     | Kind | Owner           | Resolution                            |
| ----- | ----------------------------------------------- | ---- | --------------- | ------------------------------------- |
| BR-01 | Создать `specs/ai-skills/ai-skills.spec.md`     | file | this-scope-task | Уже создан в STEP_8                   |
| BR-02 | Добавить ai-skills в Portal (`specs/README.md`) | file | operator-action | Запустить `sdd-setup` после discovery |

Все остальные зависимости (13 SKILL.md, директивы, скрипты, CLI) уже существуют в репозитории.

<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->

## 10. Handoff to module-decomposition

- **Primary input:** `specs/ai-skills/ai-skills.spec.md`
- **Areas requiring decomposition:**
  - SDD-навыки (12) — группа directive-based + orchestrator
  - alt-opinion — CLI-delegation паттерн
  - Общий контракт: формат SKILL.md, frontmatter-схема, структура директорий
- **Named abstractions:**
  - `SKILL.md` — артефакт навыка (frontmatter + body)
  - Directive activation pattern (3-step)
  - Orchestrator pattern (plan → dispatch → audit)
  - CLI delegation pattern (prepare → invoke → show)
- **Bootstrap tickets ready for cascade:** see §8
- **Open risks:**
  - ~~Абсолютные пути в теле существующих навыков (`/Users/k.lebedev/...`) — требуют релативизации при рефакторинге~~ → Закрыто: PathNormalizer в sync-skills (D-M007) + dev-пути в исходниках
  - `sdd-execute` скрипты привязаны к macOS/bash — не кроссплатформенны
  <!--/SECTION:HANDOFF-->

```

```
