# Module: `sdd-migrate`

**Module:** sdd-migrate · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. [ai/sdd-v2-plan.md](../../../ai/sdd-v2-plan.md))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Миграция v1 SDD-артефактов в v2 — детерминированные, верифицируемые шаги. Текущий режим — **`anchors`**: v1-тикеты идут без `<!--SECTION:-->`-якорей (голые `## N.`), а v2-тулы (`sdd-extract`/`sdd-task`/`sdd-check`) их требуют; `anchors` оборачивает канонические секции маркерами по карте header→name. Dry-run по умолчанию; `--write` применяет. Ядро `shared/sdd/anchor-inject.ts` (`injectAnchors`), идемпотентно. Будущие режимы (по [плану](../../../ai/sdd-v2-plan.md)): `ids` (`TSK-NN`→slug по map, курируемые паттерны) + структурный move `tasks/`→`specs/`.

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

| Name             | Type         | Purpose                                                              |
| ---------------- | ------------ | -------------------------------------------------------------------- |
| `run`            | Command      | Точка входа CLI: режим `anchors`, dry-run/`--write`, single/`--all`   |
| `findV1Tickets`  | Utility      | Рекурсивный сбор `tasks/**/*.task-*.md`                               |
| `injectAnchors`  | Utility      | (`shared/sdd/anchor-inject`) обёртка канонических секций маркерами     |
| `badInvocation`  | Utility      | Билдер диагностики (exit 4)                                          |
| `MigrateOutcome` | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`              |

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

| Argument          | Type    | Description                                          |
| ----------------- | ------- | ---------------------------------------------------- |
| `anchors`         | mode    | Инжект `<!--SECTION:-->` в v1-тикеты                  |
| `<ticket>`        | string  | Один тикет (если не `--all`)                         |
| `--all [root]`    | flag    | Все `tasks/**/*.task-*.md` под root (по умолч. cwd)   |
| `--write`         | flag    | Применить (иначе dry-run)                            |

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
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/anchor-inject.ts`, `#logger`
- **Provides to:** `gennady.ts`; результат верифицируется `sdd-check` / `sdd-extract`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
