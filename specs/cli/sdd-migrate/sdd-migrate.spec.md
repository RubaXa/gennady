# Module: `sdd-migrate`

**Module:** sdd-migrate · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Миграция v1 SDD-артефактов в v2 — детерминированные, верифицируемые шаги. Текущий режим — **`anchors`**: v1-тикеты идут без `<!--SECTION:-->`-якорей (голые `## N.`), а v2-тулы (`sdd-extract`/`sdd-task`/`sdd-check`) их требуют; `anchors` оборачивает канонические секции маркерами по карте header→name. Dry-run по умолчанию; `--write` применяет. Ядро `shared/sdd/anchor-inject.ts` (`injectAnchors`), идемпотентно. Будущие режимы (план архивирован): `ids` (`TSK-NN`→slug по map, курируемые паттерны) + структурный move `tasks/`→`specs/`.

**Key properties:**

- Deterministic + verifiable — после `--write` результат проверяется `sdd-check --all` (баланс якорей) и `sdd-extract` по секциям
- Dry-run-first — без `--write` только репорт «что бы изменил»; на боевом репо вскрыл 56 голых / 12 уже-заякоренных из 68
- Idempotent — секция с уже-имеющимся маркером пропускается; покрывает оба v1-суб-формата (голые / newer-с-якорями)

**Invariants:**

- header→name: `## 1. Meta`→META · `## 2. Phases Overview`→PHASES_OVERVIEW · `### P<N>`→PHASE_P<N> · `## 4. …(BDD)`→BDD · `## 5. Verification`→VERIFICATION · `## 6. …Coverage`→TEST_COVERAGE · `## 7. Execution Log`→EXECUTION_LOG · `## 8. Decision Log`→DECISION_LOG; `## 3. Phases`-контейнер НЕ якорим
- span: заголовок → следующий заголовок уровня ≤ своего (или EOF); секции не вкладываются
- exit `0` репорт · `4` неизвестный режим / нет цели
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-migrate anchors tasks/cli/cat/cli-cat.task-31.md
[sdd-migrate anchors] DRY-RUN · 1 ticket(s)
  would tasks/cli/cat/cli-cat.task-31.md — META, PHASES_OVERVIEW, PHASE_P1, PHASE_P2, BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG
(dry-run — re-run with --write to apply)

$ npx gennady sdd-migrate anchors --all .          # обзор всех v1-тикетов (dry-run)
$ npx gennady sdd-migrate anchors --all . --write  # применить + затем: gennady sdd-check --all
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                   | Type    | Purpose                                                                                                      |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `run`                  | Command | Точка входа CLI: режим `anchors`, dry-run/`--write`, single/`--all`                                          |
| `findV1Tickets`        | Utility | Рекурсивный сбор `tasks/**/*.task-*.md`                                                                      |
| `injectAnchors`        | Utility | (`shared/sdd/anchor-inject`) обёртка канонических секций маркерами                                           |
| `scaffoldExecutionLog` | Utility | (`shared/sdd/anchor-inject`) скаффолдит `## Execution Log`, если у v1-тикета (Meta-сигнатура) его нет вообще |
| `badInvocation`        | Utility | Билдер диагностики (exit 4)                                                                                  |
| `MigrateOutcome`       | Type    | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                                                     |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Anchors Mode

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - режим `anchors`; цель — `<ticket>` или `--all [root]`
- Postconditions:
  - dry-run (без `--write`) — репорт `would <file> — <sections>`; файлы не тронуты
  - `--write` — каждая голая каноническая секция обёрнута маркерами; уже-заякоренные — `skip`
  - результат проходит `sdd-check` (баланс якорей) и `sdd-extract` по секциям
- Invariants:
  - идемпотентно (повторный прогон ничего не меняет)
  - `## 3. Phases`-контейнер не якорится; секции не вкладываются

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument       | Type   | Description                                         |
| -------------- | ------ | --------------------------------------------------- |
| `anchors`      | mode   | Инжект `<!--SECTION:-->` в v1-тикеты                |
| `<ticket>`     | string | Один тикет (если не `--all`)                        |
| `--all [root]` | flag   | Все `tasks/**/*.task-*.md` под root (по умолч. cwd) |
| `--write`      | flag   | Применить (иначе dry-run)                           |

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-migrate/  index.ts · sdd-migrate.cmd.ts · sdd-migrate.types.ts · help.ts · __tests__/sdd-migrate.cmd.test.ts
shared/sdd/anchor-inject.ts  (injectAnchors)  + __tests__/anchor-inject.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси). Покрытие: unit (core + cmd) + lint + typecheck + dry-run-смок на 68 боевых v1-тикетах.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-MG001 — Dry-run по умолчанию, `--write` явно

- **Status:** active · **Why:** миграция мутирует много файлов; dry-run-first даёт верифицируемый предпросмотр (вскрыл 56/12 из 68) без риска. **Risk:** нет (git-tracked).

### D-MG002 — Ядро в `shared/sdd/anchor-inject.ts`

- **Status:** active · **Why:** чистая, переиспользуемая, unit-тестируемая трансформация; cmd — тонкая обёртка. **Risk:** низкий.

### D-MG003 — Идемпотентность по наличию маркера

- **Status:** active · **Why:** v1 имеет два суб-формата (голые / уже-с-якорями); пропуск по `<!--SECTION:NAME-->` корректно покрывает оба. **Risk:** нет.

### D-MG004 — `anchors` первым (детерминированный шаг)

- **Status:** active · **Why:** самый детерминированный + сразу verify через `sdd-check`. `ids` (slug-map) и move — следующие, см. план. **Risk:** нет.

### `mapHeadingToSection`

- **Usage Waiver:** курируемая таблица «заголовок v1 → секция v2» вынесена отдельно от рендера плана, чтобы правило соответствия можно было проверить юнит-тестами без генерации файлов плана.

### `HeadingSectionRule`

- **Usage Waiver:** тип строки таблицы соответствий — держит форму правила рядом с самой таблицей.

### `HEADING_SECTION_RULES`

- **Usage Waiver:** сама таблица соответствий; вынесена из тела функции, чтобы правила читались списком, а не терялись в ветвлении.

### `rewriteMovedLinks`

- **Usage Waiver:** чистое переписывание относительных ссылок отделено от файловых операций перемещения — единственный способ протестировать его без git.

### `LINK_ZONES`

- **Usage Waiver:** перечень зон, где ищутся ссылки на перемещаемые файлы; отдельным именем, чтобы охват был виден и правился без чтения алгоритма.

### `splitLinkTarget`

- **Usage Waiver:** разбор ссылки на путь и якорь; отдельная функция, потому что якорь должен пережить переписывание пути.

### `collectMdFiles`

- **Usage Waiver:** обход markdown-файлов зоны отделён от логики переписывания — граница ввода-вывода.

### D-MG005 — `parseMeta` терпим к v1 Meta без bold

- **Status:** active · **Was:** `parseMeta` требовал `**Task-ID:**` / `**Status:**` буквально — v1-тикеты со строками `- Task-ID:` / `- Status:` (без `**`) давали `taskId: null`, и `plan`/`ids --from-plan` молча теряли карту (ложно-зелёный гейт). **Now:** `parseMeta` (и однотипные разборы `Purpose:`/`Scope:`/`Module:` в `migration-plan.ts`) принимают `\*{0,2}` — с bold и без. **Risk:** нет (bold-форма — строгое подмножество нового паттерна).

### D-MG006 — Ticket Map проверяет колонку старого Task-ID; `idMapFromPlan` не глушит невалидные строки

- **Status:** active · **Why:** непрочитанный старый ID печатался как `—` в плане и никто это не проверял; `ids --from-plan --write` тихо получал пустую карту и гейт «нечего делать» отчитывался зелёным. **Now:** `verifyUnitFile` добавляет `MIG_TICKET_ID_UNREADABLE`, если старый Task-ID пуст/`—`; `idMapFromPlan` возвращает `{ok:false, errors}` на строке, где old/new не `?`, но и не проходит грамматику ID — `sdd-migrate ids --from-plan` падает с явным списком, не молчит. **Risk:** нет.

### D-MG007 — `move`: пустой корневой `tasks/` удаляется вместе с последним scope

- **Status:** active · **Was:** `executeScopeMove` удалял только `tasks/<scope>/`; `detectFlowVersion` (`shared/sdd/flow.ts`) детектит v1 по самому наличию `tasks/` — после последнего scope пустой `tasks/` (иногда с одиноким `README.md`) держал репо в v1 навечно. **Now:** после удаления `tasks/<scope>/`, если в `tasks/` не осталось ничего кроме (опционально) `README.md` — удаляется весь `tasks/`. **Risk:** нет (условие строго «ничего значимого не осталось»).

### D-MG008 — Ticket Map destination — форма, не точный пересчёт; модульный индекс — по факту назначения

- **Status:** active · **Was:** `verifyUnitFile` требовал байт-в-байт `dirname(specFile)/<specBase>.task.<id>.md`, запрещая любую вложенность иную, чем у спеки; `executeScopeMove` группировал тикеты по `SpecUnit.module` (из пути спеки), а не по фактическому назначению из Ticket Map — тикет, направленный агентом в другую директорию, не попадал в правильный индекс. **Now:** verify — форма `specs/<scope>/**/*.task.<newId>.md` (`MIG_BAD_DESTINATION` при несовпадении); `executeScopeMove`/`renderScopeIndex` группируют по `dirname(dest)` каждого тикета — назначение из Ticket Map авторитетно. Флэт-назначение прямо в `specs/<scope>/` — легальный вариант без отдельного модульного индекса. **Risk:** нет.

### D-MG009 — Новый Task-ID: ACR верхним регистром

- **Status:** active · **Was:** `NEW_ID_REGEX` требовал lowercase-ACR (`^[a-z]...`), что противоречило конвенции репо (`AX_TASK_RESOLUTION`, `sdd-new --id`) — `<ACR>-<slug>` с ACR в верхнем регистре. **Now:** `^[A-Z][A-Z0-9]*(-[a-z0-9]+)+$`. **Risk:** нет (только строгость грамматики меняется — существующие корректные ID репо уже были в верхнем регистре).

### D-MG010 — `anchors --write` скаффолдит недостающий Execution Log для v1-тикетов

- **Status:** active · **Was:** `isTicket()` (`shared/sdd/check.ts`) требует и META, и EXECUTION*LOG; `injectAnchors` только оборачивает *существующие\_ заголовки маркерами. Реальный v1-тикет с Meta-заголовком, но без `## Execution Log` вообще (не голый заголовок — секции физически нет), после `anchors --write` остаётся без EXECUTION_LOG-якоря — механически невидим для `isTicket()` → `SDD_TRACKER_ORPHAN_ROW`, STEP_7 гейт красный навсегда, обычный прогон `anchors` его не лечит. **Now:** новая чистая функция `scaffoldExecutionLog` (`shared/sdd/anchor-inject.ts`) — когда текст несёт Meta-заголовок/якорь, но не несёт `<!--SECTION:EXECUTION_LOG-->`, дописывает в конец файла заголовок `## Execution Log`, обёрнутый якорями, с одной честной строкой `- <дата миграции> migrated from v1 — no rounds/phases recorded in v1 format`. `sdd-migrate anchors --write` вызывает её сразу после `injectAnchors`; отчёт помечает такие тикеты `EXECUTION_LOG (scaffolded — v1 ticket had none)`. Идемпотентно — второй прогон видит существующий якорь и не трогает файл (`skip`). **Risk:** нет — тикеты, у которых Execution Log уже был (голый заголовок или уже заякоренный), не затрагиваются; скаффолд активен только при Meta-сигнатуре без единого EXECUTION_LOG-якоря.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/anchor-inject.ts`, `#logger`
- **Provides to:** `gennady.ts`; результат верифицируется `sdd-check` / `sdd-extract`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
