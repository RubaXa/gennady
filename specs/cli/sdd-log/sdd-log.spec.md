# Module: `sdd-log`

**Module:** sdd-log · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Append-only запись в `EXECUTION_LOG` тикета. `execute` открывает/закрывает Round через `sdd-log`; фазовый агент добавляет event-строки. Тул владеет механической+safety частью журналирования: ставит реальный timestamp, **структурно гарантирует append-only** (вставка строго перед close-маркером секции — прежние строки физически не трогаются) и **отклоняет фабрикованный DONE** (контент с неподставленным `<…>`-плейсхолдером). Семантику (что логировать) задаёт вызывающий.

**Key properties:**

- Append-only by construction — `findSectionBounds` находит close-маркер, строки вставляются перед ним; редактировать прошлое тул не умеет
- No fabricated DONE — `<…>`-плейсхолдер в контенте → отказ (exit 2); это audit-BLOCKER в ручном режиме
- Timestamped — реальное время в каждую строку; дата в заголовок Round; часы инъектируются (детерминизм в тестах)
- Positional args — режим и контент позиционны (флаг `--line=` ломал бы `exit=0`)

**Invariants:**

- Ровно один режим: `round` | `line` | `close`
- Round-номер авто-инкремент по числу `### Round N`
- exit `0` дописано · `1` файл · `2` нет EXECUTION_LOG / плейсхолдер · `4` плохой вызов
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-log ticket.md round "initial"
[sdd-log] appended to EXECUTION_LOG:
### Round 1 — 2026-06-21, initial

$ npx gennady sdd-log ticket.md line 'ver `npm run check` → pass exit=0'
[sdd-log] appended to EXECUTION_LOG:
- [x] `2026-06-21T10:00:00.000Z` ver `npm run check` → pass exit=0

$ npx gennady sdd-log ticket.md close
[sdd-log] appended to EXECUTION_LOG:
#### Round close
- [x] `2026-06-21T10:00:00.000Z` DONE

# --- фабрикованный DONE отклонён ---
$ npx gennady sdd-log ticket.md line 'ver `<cmd>` → pass'
[sdd-log] ERR_CLI_SDD_LOG_PLACEHOLDER: "ver `<cmd>` → pass"
  ...
# exit 2
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                                                | Type         | Purpose                                                         |
| ------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `run`                                                               | Command      | Точка входа CLI: парс режима, чтение, валидация, append, запись |
| `findSectionBounds`                                                 | Utility      | (`shared/sdd/section`) индексы маркеров секции — точка вставки  |
| `hasPlaceholder`                                                    | Utility      | Детект неподставленного `<…>`-плейсхолдера                      |
| `nextRoundNumber`                                                   | Utility      | Следующий номер Round по существующим `### Round N`             |
| `buildRoundHeader`                                                  | Utility      | Текст заголовка Round                                           |
| `buildEventLine`                                                    | Utility      | Строка `- [x] \`<ts>\` <content>`                               |
| `buildCloseBlock`                                                   | Utility      | Блок `#### Round close` + DONE                                  |
| `badInvocation` / `fileError` / `noLogSection` / `placeholderError` | Utility      | Билдеры диагностик                                              |
| `PLACEHOLDER_RE`                                                    | Value Object | `/<[^>\s]+>/` — паттерн плейсхолдера                            |
| `LogOutcome`                                                        | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`        |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Append-Only Log Write

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<ticket>` + ровно один режим (`round`/`line`/`close`); `round`/`line` требуют контент
  - Тикет содержит ровно одну чистую пару маркеров `EXECUTION_LOG`
- Postconditions:
  - Новые строки вставлены строго перед `<!--/SECTION:EXECUTION_LOG-->`; прочие байты файла не изменены
  - `line`/`round` контент с `<…>`-плейсхолдером → отказ, файл не тронут (exit 2)
  - Round-номер = (число существующих Round) + 1
- Invariants:
  - Append-only гарантируется конструкцией (вставка перед close-маркером)
  - Timestamp детерминирован при инъекции часов

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument           | Type   | Description                       |
| ------------------ | ------ | --------------------------------- |
| `<ticket>`         | string | Путь к тикету                     |
| `round "<reason>"` | mode   | Открыть Round (авто-номер, дата)  |
| `line "<content>"` | mode   | Дописать timestamped event-строку |
| `close`            | mode   | Дописать блок Round-close         |

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-log/
├── index.ts             # Entry point for dynamic import
├── sdd-log.cmd.ts       # Command: parse mode, read, validate, splice before close marker, write
├── sdd-log.types.ts     # error codes, LogOutcome, pure builders (round/line/close, placeholder)
├── help.ts              # Help text output
└── __tests__/sdd-log.cmd.test.ts
```

Переиспользует `shared/sdd/section.ts` (`findSectionBounds`, добавлен в этой итерации).

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**E2E:** отложен (прокси-блок в песочнице). Покрытие: unit + lint + typecheck + ручной smoke (round→line→close).

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-SL001 — Append-only через вставку перед close-маркером

- **Status:** active
- **Why:** Audit требует append-only журнал (правка прошлого раунда = `EXECUTION_LOG_INCOMPLETE`). Тул не предоставляет операции правки вообще — только вставку перед `<!--/SECTION:EXECUTION_LOG-->`. Безопасность по конструкции, не по проверке.
- **Risk accepted:** Нет.

### D-SL002 — Позиционные аргументы вместо флагов

- **Status:** active
- **Why:** `parseArgs` режет значение по первому `=`, а контент журнала постоянно содержит `exit=0`. Режим+контент позиционны → `=` сохраняется. Проверено e2e-смоком и unit-тестом.
- **Risk accepted:** Нет.

### D-SL003 — Отклонение `<…>`-плейсхолдера (фабрикованный DONE)

- **Status:** active
- **Why:** `[x]`-строка с неподставленным `<…>` — это fabricated done (audit BLOCKER). Тул ловит механически до записи; `<ts>` ставит сам.
- **Risk accepted:** Реальный `<` с пробелом (редирект `cmd < file`) не матчится (`/<[^>\s]+>/` требует отсутствие пробела) — ложных срабатываний на командах нет.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/sdd/section.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (open/close Round) и `phase-execution-protocol` (event-строки)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
