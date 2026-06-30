# Module: `sdd-state`

**Module:** sdd-state · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. [ai/sdd-v2-plan.md](../../../ai/sdd-v2-plan.md))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Детерминированный preflight-снимок проекта для роутера, одним вызовом. Без LLM. Закрывает четыре вопроса роутера сразу: на каком флоу репо (`FLOW_VERSION`), готов ли он (`READINESS`), какие scope есть (с описанием — для intent), и есть ли незакрытая сессия. По флагу `--probe` — ещё один вопрос: есть ли в репо код/инфра (для ветвления root: greenfield vs восстановление-из-кода); по умолчанию НЕ зондирует — минимальное знание окружения на старте (D-ST007). Реверс-спека частично — `scan.sh`; классификатор скриптов СОЗНАТЕЛЬНО не используется (см. D-ST004).

**Key properties:**

- Deterministic — чистые ядра `shared/sdd/portal.ts` (таблица Scopes + Description) + `shared/sdd/readiness.ts` (точная проверка required-скриптов)
- Exact readiness — есть `package.json`, `typecheck · test · test:coverage · lint(+gennady в цепочке) · format` по ТОЧНОМУ имени, и `gennady` установлен (`node_modules/.bin/gennady`); без угадываний
- Absence-is-data — нет портала → `PORTAL=absent` (project-setup); нет сессии → `(no active session)` — exit 0, не ошибка
- Minimal-knowledge default — код/инфру (`[PROBE]`) зондирует ТОЛЬКО по `--probe`; дефолт молчит, чтобы не искажать картину на старте флоу

**Invariants:**

- `FLOW_VERSION=v1` ⇔ `<root>/tasks/` — каталог (старая раскладка); роутер на этом halt'ит в миграцию
- `READINESS=ready` ⇔ есть `package.json` + все required-скрипты по точному имени + `lint` достигает `gennady` (прямо или через `npm run`-цепочку) + `gennady` установлен
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
typecheck	✔
test	✔
test:coverage	✘
lint	✔
format	✔
lint→gennady	✔
gennady-installed	✔
READINESS=not-ready (missing: test:coverage)

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

| Name             | Type         | Purpose                                                                    |
| ---------------- | ------------ | -------------------------------------------------------------------------- |
| `run`            | Command      | Точка входа CLI: резолв корня, flow/portal/readiness/session → снимок        |
| `isV1Layout`     | Utility      | Маркер v1 — `<root>/tasks/` это каталог                                     |
| `detectGennady`  | Utility      | gennady установлен — `<root>/node_modules/.bin/gennady` существует           |
| `probeRepo`      | Utility      | (`shared/sdd/probe`) эвристики кода/инфры за `--probe` (find `*.js/jsx/ts/tsx` без node_modules + конфиги) |
| `checkReadiness` | Utility      | (`shared/sdd/readiness`) точная проверка: package.json + required-скрипты + lint→gennady + gennady-install |
| `parseScopes`    | Utility      | (`shared/sdd/portal`) таблица Scopes → `Scope[]` (incl. description)         |
| `formatSnapshot` | Utility      | Рендер `StateSnapshot` в bracketed-формат                                  |
| `badInvocation` / `badRoot` | Utility | Билдеры диагностик                                              |
| `StateSnapshot`  | Value Object | root · flowVersion · portalPresent · portalPath · scopes · readiness · sessionContent · probe? |
| `FlowVersion`    | Type         | `v1` / `v2`                                                                |
| `ReadinessResult` | Value Object | packageJsonPresent · required[] · lintHasGennady · gennadyAvailable · ready · missing (`shared/sdd/readiness`) |
| `ReadinessInput` | Value Object | packageJsonPresent · scripts · gennadyAvailable — вход `checkReadiness` (`shared/sdd/readiness`) |
| `RepoProbe`      | Value Object | codePresent · codeFileCount · codeDirs · infraPresent · configFiles (`shared/sdd/probe`) |
| `Scope`          | Value Object | name · type · status · description · specPath (`shared/sdd/portal`)         |
| `StateOutcome`   | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                     |

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
  - `[READINESS]` — `package.json` `✔/✘`, каждый required-скрипт по ТОЧНОМУ имени `✔/✘`, `lint→gennady`, `gennady-installed`; `READINESS=ready` только при package.json + полном наборе скриптов + lint→gennady + установленном gennady; иначе `not-ready (missing: …)`
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

| Argument         | Type    | Default | Description                  |
| ---------------- | ------- | ------- | ---------------------------- |
| `[project-root]` | string  | `.`     | Корень проекта для инспекции |
| `--probe`        | flag    | off     | Включить эвристики кода/инфры (`[PROBE]`); по умолчанию выключено (минимальное знание) |

Required-набор (точные имена): `typecheck`, `test`, `test:coverage`, `lint` (+`gennady` в цепочке), `format` (фиксирующий). Плюс: присутствует `package.json` и установлен `gennady` (`node_modules/.bin/gennady`).

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
- **Status:** active · **Why:** оператор требует детерминизма; fuzzy-классификатор (`type-?check` и т.п.) убран. Стандарт v2 требует точные имена `typecheck/test/test:coverage/lint/format`; неконформное имя (`type-check`) → not-ready (это правильно). **Risk:** проекты обязаны привести имена — покрыто setup-гайдом.

### D-ST005 — `FLOW_VERSION` по `tasks/`-каталогу
- **Status:** active · **Why:** оператор: «достаточно `tasks/` + `*.task-*.md`». `tasks/` dir — однозначный маркер v1-раскладки. **Risk:** репо с чужим `tasks/` ложно-v1 — на практике в SDD-проекте этого нет; миграц-гайд всё равно показывает, что делать.

### D-ST006 — Готовность включает `package.json` + установленный `gennady`
- **Status:** active · **Why:** оператор: state — единый источник «что не так» (нет `package.json` / нет команд / не установлен `gennady`). `gennadyAvailable` = существование `node_modules/.bin/gennady`. `not-ready` больше НЕ halt с гайдом, а вход в живой флоу `readiness.directive`. **Risk:** глобально установленный gennady (вне `node_modules`) читается как not-installed — в SDD-проектах ставится локально; редкий кейс.

### D-ST007 — Код/инфра зондируются ТОЛЬКО по `--probe` (минимальное знание по умолчанию)
- **Status:** active · **Why:** на старте флоу работаем с минимальным знанием окружения, чтобы не искажать картину; глубокий осмотр репо нужен лишь когда портала нет и root решает greenfield vs восстановление-из-кода — тогда root зовёт `sdd-state --probe`. Эвристики: `*.js/jsx/ts/tsx` вне `node_modules` (код) + тулинг-конфиги (инфра). **Risk:** эвристика грубая (конфиг на JS посчитается «кодом») — поэтому печатается счётчик, решение за root/оператором.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/portal.ts`, `shared/sdd/readiness.ts`, `#logger`
- **Provides to:** `gennady.ts`; роутер (STEP_0 + preflight-halts)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
