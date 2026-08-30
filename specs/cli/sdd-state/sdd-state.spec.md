# Module: `sdd-state`

**Module:** sdd-state · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Детерминированный preflight-снимок проекта для роутера, одним вызовом. Без LLM. Вместе с `FLOW_VERSION`, `READINESS`, scopes, session и code/infra probe он сообщает `GATE_QUEUE`: TODO-тикеты infrastructure scope, которые уже строят отсутствующие гейты. Поэтому роутеру не нужен ранний вызов task-lifecycle команды `sdd-task`.

**Key properties:**

- Deterministic — чистые ядра `shared/sdd/portal.ts` (таблица Scopes + Description) + `shared/sdd/readiness.ts` (точная проверка required-скриптов)
- Exact readiness — восемь точных bricks: foundation, read-only lint/format, два mutating repair leaves и публичный whole-project `fix`. Только `check` optional.
- Absence-is-data — нет портала → `PORTAL=absent` (project-setup); нет сессии → `(no active session)` — exit 0, не ошибка
- Single-turn snapshot — code/infra `[PROBE]` всегда включён; `--probe` принят как compatibility no-op для старых синхронизированных директив

**Invariants:**

- `FLOW_VERSION=v1` ⇔ `<root>/tasks/` — каталог (старая раскладка); роутер на этом halt'ит в миграцию
- `READINESS=ready` ⇔ есть `package.json` + восемь required scripts + read-only `format`/`lint` + mutating repair leaves + canonical-order `fix` + `lint` достигает `gennady` + `gennady` установлен; объявленный optional `check` обязан быть read-only
- exit `0` снимок · `2` корень не директория · `4` лишние аргументы
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-state
# sdd-state v1
ROOT=/abs/project
FLOW_VERSION=v2
PORTAL=present	specs/README.md

[READINESS]
package.json	✔
# required-script	declared
type-check	✔
test	✔
test:coverage	✘
format	✔
format:fix	✔
lint	✔
lint:fix	✔
fix	✔
lint→gennady	✔
gennady-installed	✔
READINESS=not-ready (missing: test:coverage)
GATE_QUEUE=none

[SCOPES]
# name	type	status	description	spec
backend	product	wip	REST API	./backend/backend.spec.md

[SESSION]
# specs/.sdd-session.md
# (no active session)

[PROBE]
CODE=present (N file(s))
code-dirs=src
INFRA=present
configs=package.json, tsconfig.json

[SUMMARY]
flow=v2 · portal=present · readiness=not-ready · scopes=1 · session=absent
```

(`[SUMMARY]` в выводе построчно `key=value`; здесь сжато.)

Секция `[PROBE]` (`CODE=present (N file(s))` · `code-dirs` · `INFRA=present` · `configs`) и строки `code=`/`infra=` в `[SUMMARY]` присутствуют всегда. `--probe` не меняет результат и оставлен как совместимый no-op.

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                        | Type         | Purpose                                                                                                                                                        |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`                       | Command      | Точка входа CLI: резолв корня, flow/portal/readiness/session → снимок                                                                                          |
| `isV1Layout`                | Utility      | Маркер v1 — `<root>/tasks/` это каталог                                                                                                                        |
| `detectGennady`             | Utility      | gennady установлен — `<root>/node_modules/.bin/gennady` существует                                                                                             |
| `probeRepo`                 | Utility      | (`shared/sdd/probe`) всегда включённые эвристики кода/инфры (find `*.js/jsx/ts/tsx` без node_modules + конфиги)                                                |
| `checkReadiness`            | Utility      | (`shared/sdd/readiness`) точная проверка: package.json + required-скрипты + lint→gennady + gennady-install                                                     |
| `parseScopes`               | Utility      | (`shared/sdd/portal`) таблица Scopes → `Scope[]` (incl. description)                                                                                           |
| `formatSnapshot`            | Utility      | Рендер `StateSnapshot` в bracketed-формат                                                                                                                      |
| `badInvocation` / `badRoot` | Utility      | Билдеры диагностик                                                                                                                                             |
| `StateSnapshot`             | Value Object | root · flowVersion · portalPresent · portalPath · scopes · readiness · queuedGateTicketIds · sessionContent · probe                                            |
| `FlowVersion`               | Type         | `v1` / `v2`                                                                                                                                                    |
| `ReadinessResult`           | Value Object | package/scripts/install facts + read-only checks, mutating leaves, static argument-prefix diagnostics, canonical `fix`, ready/missing (`shared/sdd/readiness`) |
| `ReadinessInput`            | Value Object | packageJsonPresent · scripts · gennadyAvailable — вход `checkReadiness` (`shared/sdd/readiness`)                                                               |
| `RepoProbe`                 | Value Object | codePresent · codeFileCount · codeDirs · infraPresent · configFiles (`shared/sdd/probe`)                                                                       |
| `Scope`                     | Value Object | name · type · status · description · specPath (`shared/sdd/portal`)                                                                                            |
| `StateOutcome`              | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                                                                       |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 State Snapshot

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - 0 или 1 позиционный аргумент (корень; по умолчанию cwd), существующая директория (иначе exit 2)
- Postconditions:
  - `FLOW_VERSION=v1` при наличии `<root>/tasks/`, иначе `v2`
  - `[READINESS]` — восемь required scripts, их read-only/mutating shape, canonical-order `fix`, `lint→gennady`, install; optional `check` валидируется только когда объявлен; `GATE_QUEUE=<ids>` называет queued infrastructure TODO, иначе `none`
  - `[SCOPES]` — name/type/status/**description**/spec из таблицы портала; absent → метка project-setup
  - `[SESSION]` — содержимое `specs/.sdd-session.md` или `(no active session)`
  - `[PROBE]` — всегда: `CODE`/`INFRA` present/absent + счётчик файлов / dirs / configs; `--probe` сохраняет тот же байтовый результат
  - exit 0 (снимок — это данные; отсутствие портала/сессии/готовности НЕ роняет тул)
- Invariants:
  - Никакого fuzzy-классификатора: только точное совпадение имён
  - Детерминирован при фиксированной ФС

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument         | Type   | Default | Description                                                                             |
| ---------------- | ------ | ------- | --------------------------------------------------------------------------------------- |
| `[project-root]` | string | `.`     | Корень проекта для инспекции                                                            |
| `--probe`        | flag   | no-op   | Compatibility-флаг старых директив; `[PROBE]` уже всегда включён, результат не меняется |

Required-набор: `type-check` (алиас `typecheck`), `test`, `test:coverage`, read-only `format`/`lint`, mutating declared argument-forwarding `format:fix`/`lint:fix`, и public whole-project `fix`, достигающий leaves в порядке formatter→linter. Статическая shape-проверка rejects obvious broad root/glob, но не доказывает write-zone; фактические phase-repair мутации проверяет runtime boundary `sdd-verify`. `check` — optional read-only wrapper.

`GATE_QUEUE` не является scope-wide allow-list. Каждый текущий missing readiness gate должен иметь ровно одного active `TODO`/`IN_PROGRESS` владельца: infra Bootstrap Requirements объявляет exact gate + Gate Artifacts, а одна phase того ticket повторяет gate в `Readiness Gates` и включает все artifacts в `Target Files`. Ноль/несколько владельцев печатаются как `GATE_QUEUE_DIAG`, очередь fail-closed пуста.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-state/  index.ts · sdd-state.cmd.ts · sdd-state.types.ts · help.ts · __tests__/sdd-state.cmd.test.ts
shared/sdd/         portal.ts (parseScopes +description) · readiness.ts (checkReadiness) · probe.ts (always-on probeRepo)  + __tests__/
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**Роутер:** STEP_0 зовёт `sdd-state`; `H_V1_REPO` (flow=v1) → migration-guide; `not-ready` → embody `readiness.directive` (живой флоу настройки; H_NOT_READY-halt снят).
**E2E:** отложен (прокси). Покрытие: unit + lint + typecheck + ручной smoke.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-ST001 — Портал как источник scope (не обход ФС)

- **Status:** active · **Why:** `specs/README.md` — единый портал-индекс; описание scope (Description) берётся оттуда. Расхождение портал↔ФС ловит `sdd-check`. **Risk:** устаревший портал виден и чинится явно.

### D-ST002 — Ядра в `shared/sdd/` (portal + readiness)

- **Status:** active · **Why:** переиспользуемы и независимо тестируемы. **Risk:** низкий.

### D-ST003 — Отсутствие портала/сессии/готовности — данные, не ошибка (exit 0)

- **Status:** active · **Why:** роутер ветвится на этих фактах. exit ≠ 0 только на плохом вызове/корне. **Risk:** нет.

### D-ST004 — Точное совпадение имён, без классификатора

- **Status:** active for exact-name matching; required-script list finalized by D-ST012 · **Why:** оператор требует детерминизма; fuzzy-классификатор убран. Точные имена: `type-check/test/test:coverage/format/format:fix/lint/lint:fix/fix`; `type-check` — единственное имя с закрытым алиасом `typecheck`.

### D-ST005 — `FLOW_VERSION` по `tasks/`-каталогу

- **Status:** active · **Why:** оператор: «достаточно `tasks/` + `*.task-*.md`». `tasks/` dir — однозначный маркер v1-раскладки. **Risk:** репо с чужим `tasks/` ложно-v1 — на практике в SDD-проекте этого нет; миграц-гайд всё равно показывает, что делать.

### D-ST006 — Готовность включает `package.json` + установленный `gennady`

- **Status:** active · **Why:** оператор: state — единый источник «что не так» (нет `package.json` / нет команд / не установлен `gennady`). `gennadyAvailable` = существование `node_modules/.bin/gennady`. `not-ready` больше НЕ halt с гайдом, а вход в живой флоу `readiness.directive`. **Risk:** глобально установленный gennady (вне `node_modules`) читается как not-installed — в SDD-проектах ставится локально; редкий кейс.

### D-ST007 — Код/инфра зондируются ТОЛЬКО по `--probe` (минимальное знание по умолчанию)

- **Status:** superseded by D-ST014 · **Why (historical):** ранний контракт минимизировал знание по умолчанию и требовал отдельный `sdd-state --probe` для greenfield/recovery развилки. Это экономило миллисекундный обход, но добавляло агенту отдельный CLI round-trip и полный model turn.

### D-ST008 — Required-набор расширен до семи «кирпичиков»; `check`/`fix` разжалованы из обязательных в необязательные обёртки

- **Status:** superseded by D-ST009 · **Supersedes:** часть D-ST006/D-ST004, где readiness проверяла только `type-check/test/test:coverage/lint/format` и не различала мутирующие/read-only варианты
- **Why:** Реформа `sdd-verify` (см. `specs/cli/sdd-verify/sdd-verify.spec.md`, D-SV010) развела мутирующую починку (`format:fix`, `lint:fix`) от read-only проверки (`format`, `lint`) на отдельные gate лестницы — readiness обязана требовать все семь скриптов, которые эта лестница реально вызывает, а не только пять старых. Одновременно стало ясно, что `check`/`fix` — это скрипты для человека/CI/pre-commit хука (удобная обёртка «прогони всё разом»), а не то, что вызывает сама лестница; требовать их наравне с семью «кирпичиками» было избыточно и уже не отражало реальный вызов. `format`/`lint` (и `check`, если объявлен) обязаны быть только-чтение (запрещены `eslint --fix`/`prettier --write`/`--autofix`); `format:fix`/`lint:fix` обязаны нести реальный мутирующий переключатель — иначе `missing` содержит метку «…(no --write/--fix/--autofix — a fixer that never mutates)».
- **Risk accepted:** Проект с исторически совмещённым `lint`-скриптом (сам чинит и проверяет одновременно, без разделения на `lint`/`lint:fix`) должен провести рефакторинг npm-скриптов, чтобы дойти до `ready` — разовая цена миграции на новый стандарт, покрыта setup-гайдом.

### D-ST009 — `fix` возвращён в required-набор как восьмой канонический brick

- **Status:** superseded by D-ST010 · **Supersedes:** D-ST008 в части optional `fix`
- **Why:** repair-first профили `code`/`test` вызывают единый `fix` до foundation. Ready-проект без этой команды проходил бы readiness, а затем неизбежно останавливался в первой фазе. Readiness теперь требует, чтобы `fix` транзитивно достигал `format:fix`, затем `lint:fix`; `check` остаётся единственной optional обёрткой.
- **Risk accepted:** нестандартный wrapper с динамическим shell-dispatch может быть ошибочно отклонён; рекомендуемый точный script устраняет неоднозначность.

### D-ST010 — Exact-target phase repair removes whole-project `fix` from readiness

- **Status:** superseded by D-ST012 · **Supersedes:** D-ST009
- **Why:** фазовый `sdd-verify` больше не вызывает whole-project wrapper: exact Target Files передаются явно, formatter/lint repair не трогают чужие файлы. Readiness требует реальные repair leaves, а `fix` снова optional human wrapper; если объявлен, его порядок по-прежнему валидируется.

### D-ST011 — Repair leaves declare argument-forwarding prefixes

- **Status:** active · **Extends:** D-ST010
- **Why:** одного write-switch недостаточно: `prettier --write .` формально мутирует, но проигнорирует фазовую границу и затронет весь проект. Поэтому non-stub `format:fix`/`lint:fix` объявляется как один argument-forwarding command prefix с terminal `--write`/`--fix`/`--autofix`; это только ранняя shape-диагностика. Фактическую фазовую границу доказывает runtime workspace diff в `sdd-verify` (D-SV022). Bootstrap echo-stubs остаются provisional-исключением и фазой не исполняются.
- **Risk:** статическая tool-agnostic проверка уверенно ловит shell chaining и очевидные broad roots/globs, но не может отличить baked exact operand (`src/a.ts`) от tool subcommand/config operand. Это принятая non-adversarial граница; сложный wrapper не проходит readiness.

### D-ST012 — Public whole-project `fix` remains the eighth required entrypoint

- **Status:** active · **Supersedes:** D-ST010 только в выводе об optional `fix`; exact-target phase repair сохранён
- **Why:** phase verifier вызывает leaves напрямую ради точного target-set, но это не отменяет согласованный единый human repair entrypoint. Readiness снова требует `fix`, который достигает `format:fix`, затем `lint:fix`; широкие roots принадлежат wrapper, а не phase.

### D-ST013 — GATE_QUEUE принадлежит exact missing gate phase

- **Status:** active
- **Why:** одно совпадение Meta Scope давало setup любой impl/test фазе infra ticket. Теперь SSOT `shared/sdd/gate-queue.ts` связывает missing gate с Bootstrap Requirements, exact Gate Artifacts, active ticket и одной phase с совпадающими `Readiness Gates` + `Target Files`. Mapping принимается только целиком; zero/ambiguous ownership краснит диагностикой.
- **Risk accepted:** Идентификаторы readiness gates — закрытый platform-neutral набор фактов `sdd-state`; конкретные инструменты и команды остаются в infra spec.

### D-ST014 — Probe always-on; `--probe` — compatibility no-op

- **Status:** active · **Supersedes:** D-ST007
- **Why:** один `sdd-state` обязан нести все факты, нужные любой router branch. Повторный CLI-вызов стоит агенту model turn, тогда как детерминированный probe-обход стоит миллисекунды. Поэтому `[PROBE]` и summary `code`/`infra` всегда присутствуют; старый `--probe` принимается, но даёт идентичный снимок.
- **Risk accepted:** эвристика грубая (`*.js/jsx/ts/tsx` и tooling-конфиги), поэтому вывод остаётся наблюдаемым evidence со счётчиками, а не скрытым классификатором.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/portal.ts`, `shared/sdd/readiness.ts`, `#logger`
- **Provides to:** `gennady.ts`; роутер (STEP_0 + preflight-halts)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
