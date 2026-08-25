# Module: `sdd-state`

**Module:** sdd-state · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Детерминированный preflight-снимок проекта для роутера, одним вызовом. Без LLM. Вместе с `FLOW_VERSION`, `READINESS`, scopes, session и code/infra probe он сообщает `GATE_QUEUE`: TODO-тикеты infrastructure scope, которые уже строят отсутствующие гейты. Поэтому роутеру не нужен ранний вызов task-lifecycle команды `sdd-task`.

**Key properties:**

- Deterministic — чистые ядра `shared/sdd/portal.ts` (таблица Scopes + Description) + `shared/sdd/readiness.ts` (точная проверка required-скриптов)
- Exact readiness — есть `package.json`, все семь «кирпичиков» `sdd-verify`-лестницы (`type-check` (алиас `typecheck`) · `test` · `test:coverage` · `format` · `format:fix` · `lint` (+`gennady` в цепочке) · `lint:fix`) по ТОЧНОМУ имени, `format`/`lint` только-чтение, `format:fix`/`lint:fix` несут реальный мутирующий флаг, и `gennady` установлен (`node_modules/.bin/gennady`); без угадываний. `check`/`fix` — НЕобязательные обёртки для человека/CI/pre-commit; если объявлены, `check` обязан быть только-чтение
- Absence-is-data — нет портала → `PORTAL=absent` (project-setup); нет сессии → `(no active session)` — exit 0, не ошибка
- Minimal-knowledge default — код/инфру (`[PROBE]`) зондирует ТОЛЬКО по `--probe`; дефолт молчит, чтобы не искажать картину на старте флоу

**Invariants:**

- `FLOW_VERSION=v1` ⇔ `<root>/tasks/` — каталог (старая раскладка); роутер на этом halt'ит в миграцию
- `READINESS=ready` ⇔ есть `package.json` + все семь required-скриптов по точному имени + `format`/`lint` только-чтение (и `check`, если объявлен) + `format:fix`/`lint:fix` реально мутируют (`--write`/`--fix`/`--autofix`) + `lint` достигает `gennady` (прямо или через `npm run`-цепочку) + `gennady` установлен. `check`/`fix` НЕ входят в required-набор — это необязательные обёртки, не гейты сами по себе
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

[SUMMARY]
flow=v2 · portal=present · readiness=not-ready · scopes=1 · session=absent
```

(`[SUMMARY]` в выводе построчно `key=value`; здесь сжато.)

С `--probe` добавляется секция `[PROBE]` (`CODE=present (N file(s))` · `code-dirs` · `INFRA=present` · `configs`) и строки `code=`/`infra=` в `[SUMMARY]`. Без флага секции нет.

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                        | Type         | Purpose                                                                                                                                                                                            |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`                       | Command      | Точка входа CLI: резолв корня, flow/portal/readiness/session → снимок                                                                                                                              |
| `isV1Layout`                | Utility      | Маркер v1 — `<root>/tasks/` это каталог                                                                                                                                                            |
| `detectGennady`             | Utility      | gennady установлен — `<root>/node_modules/.bin/gennady` существует                                                                                                                                 |
| `probeRepo`                 | Utility      | (`shared/sdd/probe`) эвристики кода/инфры за `--probe` (find `*.js/jsx/ts/tsx` без node_modules + конфиги)                                                                                         |
| `checkReadiness`            | Utility      | (`shared/sdd/readiness`) точная проверка: package.json + required-скрипты + lint→gennady + gennady-install                                                                                         |
| `parseScopes`               | Utility      | (`shared/sdd/portal`) таблица Scopes → `Scope[]` (incl. description)                                                                                                                               |
| `formatSnapshot`            | Utility      | Рендер `StateSnapshot` в bracketed-формат                                                                                                                                                          |
| `badInvocation` / `badRoot` | Utility      | Билдеры диагностик                                                                                                                                                                                 |
| `StateSnapshot`             | Value Object | root · flowVersion · portalPresent · portalPath · scopes · readiness · queuedGateTicketIds · sessionContent · probe?                                                                               |
| `FlowVersion`               | Type         | `v1` / `v2`                                                                                                                                                                                        |
| `ReadinessResult`           | Value Object | packageJsonPresent · required[] · lintHasGennady · gennadyAvailable · formatReadOnly · lintReadOnly · checkReadOnly · formatFixMutates · lintFixMutates · ready · missing (`shared/sdd/readiness`) |
| `ReadinessInput`            | Value Object | packageJsonPresent · scripts · gennadyAvailable — вход `checkReadiness` (`shared/sdd/readiness`)                                                                                                   |
| `RepoProbe`                 | Value Object | codePresent · codeFileCount · codeDirs · infraPresent · configFiles (`shared/sdd/probe`)                                                                                                           |
| `Scope`                     | Value Object | name · type · status · description · specPath (`shared/sdd/portal`)                                                                                                                                |
| `StateOutcome`              | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                                                                                                           |

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
  - `[READINESS]` — `package.json` `✔/✘`, каждый из семи required-скриптов по ТОЧНОМУ имени `✔/✘`, `lint→gennady`, `gennady-installed`; `READINESS=ready` только при package.json + полном наборе из семи скриптов + `format`/`lint` read-only (и `check`, если объявлен) + `format:fix`/`lint:fix` реально мутируют + lint→gennady + установленном gennady; `check`/`fix` НЕ входят в набор — необязательные обёртки; `GATE_QUEUE=<ids>` называет queued infrastructure TODO, иначе `none`
  - `[SCOPES]` — name/type/status/**description**/spec из таблицы портала; absent → метка project-setup
  - `[SESSION]` — содержимое `specs/.sdd-session.md` или `(no active session)`
  - `[PROBE]` — ТОЛЬКО при `--probe`: `CODE`/`INFRA` present/absent + счётчик файлов / dirs / configs; без флага секции нет
  - exit 0 (снимок — это данные; отсутствие портала/сессии/готовности НЕ роняет тул)
- Invariants:
  - Никакого fuzzy-классификатора: только точное совпадение имён
  - Детерминирован при фиксированной ФС

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument         | Type   | Default | Description                                                                            |
| ---------------- | ------ | ------- | -------------------------------------------------------------------------------------- |
| `[project-root]` | string | `.`     | Корень проекта для инспекции                                                           |
| `--probe`        | flag   | off     | Включить эвристики кода/инфры (`[PROBE]`); по умолчанию выключено (минимальное знание) |

Required-набор (точные имена, семь «кирпичиков» `sdd-verify`-лестницы): `type-check` (алиас: `typecheck`), `test`, `test:coverage`, `format` (только-чтение), `format:fix` (обязан мутировать — `--write`/`--fix`/`--autofix`), `lint` (+`gennady` в цепочке, только-чтение), `lint:fix` (обязан мутировать). Плюс: присутствует `package.json` и установлен `gennady` (`node_modules/.bin/gennady`). `check`/`fix` — НЕобязательные скрипты-обёртки (для человека/CI/pre-commit хука); если `check` объявлен, он обязан быть только-чтение; `fix` не проверяется вовсе.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-state/  index.ts · sdd-state.cmd.ts · sdd-state.types.ts · help.ts · __tests__/sdd-state.cmd.test.ts
shared/sdd/         portal.ts (parseScopes +description) · readiness.ts (checkReadiness) · probe.ts (probeRepo, за --probe)  + __tests__/
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

- **Status:** active · **Why:** оператор требует детерминизма; fuzzy-классификатор (`type-?check` и т.п.) убран. Стандарт v2 требует точные имена `type-check/test/test:coverage/format/format:fix/lint/lint:fix`; неконформное имя → not-ready. **Обновление:** `type-check` — единственное required-имя с закрытым алиасом (`typecheck`), т.к. gennady сам объявляет `type-check`, а живые проекты в дикой природе — `typecheck`; это тоже точное совпадение (проверка по фиксированному множеству из двух имён), не угадывание по паттерну. Канон в выводе — всегда `type-check`. **Risk:** проекты с третьим написанием (`type_check` и т.п.) всё ещё обязаны привести имя — покрыто setup-гайдом.

### D-ST005 — `FLOW_VERSION` по `tasks/`-каталогу

- **Status:** active · **Why:** оператор: «достаточно `tasks/` + `*.task-*.md`». `tasks/` dir — однозначный маркер v1-раскладки. **Risk:** репо с чужим `tasks/` ложно-v1 — на практике в SDD-проекте этого нет; миграц-гайд всё равно показывает, что делать.

### D-ST006 — Готовность включает `package.json` + установленный `gennady`

- **Status:** active · **Why:** оператор: state — единый источник «что не так» (нет `package.json` / нет команд / не установлен `gennady`). `gennadyAvailable` = существование `node_modules/.bin/gennady`. `not-ready` больше НЕ halt с гайдом, а вход в живой флоу `readiness.directive`. **Risk:** глобально установленный gennady (вне `node_modules`) читается как not-installed — в SDD-проектах ставится локально; редкий кейс.

### D-ST007 — Код/инфра зондируются ТОЛЬКО по `--probe` (минимальное знание по умолчанию)

- **Status:** active · **Why:** на старте флоу работаем с минимальным знанием окружения, чтобы не искажать картину; глубокий осмотр репо нужен лишь когда портала нет и root решает greenfield vs восстановление-из-кода — тогда root зовёт `sdd-state --probe`. Эвристики: `*.js/jsx/ts/tsx` вне `node_modules` (код) + тулинг-конфиги (инфра). **Risk:** эвристика грубая (конфиг на JS посчитается «кодом») — поэтому печатается счётчик, решение за root/оператором.

### D-ST008 — Required-набор расширен до семи «кирпичиков»; `check`/`fix` разжалованы из обязательных в необязательные обёртки

- **Status:** active · **Supersedes:** часть D-ST006/D-ST004, где readiness проверяла только `type-check/test/test:coverage/lint/format` и не различала мутирующие/read-only варианты
- **Why:** Реформа `sdd-verify` (см. `specs/cli/sdd-verify/sdd-verify.spec.md`, D-SV010) развела мутирующую починку (`format:fix`, `lint:fix`) от read-only проверки (`format`, `lint`) на отдельные gate лестницы — readiness обязана требовать все семь скриптов, которые эта лестница реально вызывает, а не только пять старых. Одновременно стало ясно, что `check`/`fix` — это скрипты для человека/CI/pre-commit хука (удобная обёртка «прогони всё разом»), а не то, что вызывает сама лестница; требовать их наравне с семью «кирпичиками» было избыточно и уже не отражало реальный вызов. `format`/`lint` (и `check`, если объявлен) обязаны быть только-чтение (запрещены `eslint --fix`/`prettier --write`/`--autofix`); `format:fix`/`lint:fix` обязаны нести реальный мутирующий переключатель — иначе `missing` содержит метку «…(no --write/--fix/--autofix — a fixer that never mutates)».
- **Risk accepted:** Проект с исторически совмещённым `lint`-скриптом (сам чинит и проверяет одновременно, без разделения на `lint`/`lint:fix`) должен провести рефакторинг npm-скриптов, чтобы дойти до `ready` — разовая цена миграции на новый стандарт, покрыта setup-гайдом.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/portal.ts`, `shared/sdd/readiness.ts`, `#logger`
- **Provides to:** `gennady.ts`; роутер (STEP_0 + preflight-halts)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
