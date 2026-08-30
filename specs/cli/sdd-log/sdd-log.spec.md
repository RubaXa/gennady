# Module: `sdd-log`

**Module:** sdd-log · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. ai/sdd-v2-plan.md (удалён))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Append-only запись в `EXECUTION_LOG` тикета. `execute` открывает/закрывает Round через `sdd-log`; фазовый агент добавляет event-строки, а также собственные форматные блоки — фазовый заголовок, `**Handoff →**` и BLOCKER — так, чтобы контракты `PHASE_BLOCK_FORMAT` / `HANDOFF_FORMAT` / `BLOCKER_FORMAT` (`ai/directives/sdd-v2/phase-execution-protocol.directive.xml`) собирались тулом, а не руками через `line` (который до этой итерации калечил `####`/`**…**`/эмодзи, оборачивая всё в `- [x] \`<ts>\` <content>`). Тул владеет механической+safety частью журналирования: ставит реальный timestamp где формат его требует, **структурно гарантирует append-only** (вставка строго перед close-маркером секции — прежние строки физически не трогаются) и **отклоняет фабрикованный DONE** (контент с неподставленным `<…>`-плейсхолдером). Семантику (что логировать) задаёт вызывающий.

**Key properties:**

- Append-only by construction — `findSectionBounds` находит close-маркер, строки вставляются перед ним; редактировать прошлое тул не умеет
- No fabricated DONE — `<…>`-плейсхолдер в контенте → отказ (exit 2); это audit-BLOCKER в ручном режиме
- Timestamped where the format calls for it — `round`/`line`/`close`/`blocker` ставят реальное время; `phase`/`handoff` — без метки времени (формат этого не требует); часы инъектируются (детерминизм в тестах)
- Human compatibility keeps positional content, but directives use one-shot `--content-file` / typed
  blocker `--payload-file`: arbitrary prose never crosses a shell argument boundary
- Verbatim pass-through — payload bytes are never executed, url-encoded, or escaped; quotes, `$()`,
  backticks, newlines, `%`, `**`, `####`, and emoji reach the builder literally (см. D-SL005)

**Invariants:**

- Ровно один режим: `round` | `line` | `close` | `phase` | `handoff` | `blocker`
- Round-номер авто-инкремент по числу `### Round N`
- exit `0` дописано · `1` файл · `2` нет EXECUTION_LOG / плейсхолдер · `4` плохой вызов / отсутствует `--axiom`/`--unblock` для `blocker`
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

$ npx gennady sdd-log ticket.md phase P1
[sdd-log] appended to EXECUTION_LOG:
#### P1

$ npx gennady sdd-log ticket.md phase P1 "— re-run: F-003"
[sdd-log] appended to EXECUTION_LOG:
#### P1 — re-run: F-003

$ npx gennady sdd-log ticket.md handoff "artifacts: [a.ts]; decisions: [x=1]; open: []"
[sdd-log] appended to EXECUTION_LOG:
**Handoff →** artifacts: [a.ts]; decisions: [x=1]; open: []

$ npx gennady sdd-log ticket.md blocker "network blocked" --axiom AX_BLOCKER_ESCALATION --unblock "grant network access"
[sdd-log] appended to EXECUTION_LOG:
- 🛑 `2026-06-21T10:00:00.000Z` BLOCKED: network blocked
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: grant network access

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

| Name                                                                                | Type         | Purpose                                                         |
| ----------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `run`                                                                               | Command      | Точка входа CLI: парс режима, чтение, валидация, append, запись |
| `findSectionBounds`                                                                 | Utility      | (`shared/sdd/section`) индексы маркеров секции — точка вставки  |
| `hasPlaceholder`                                                                    | Utility      | Детект неподставленного `<…>`-плейсхолдера                      |
| `nextRoundNumber`                                                                   | Utility      | Следующий номер Round по существующим `### Round N`             |
| `buildRoundHeader`                                                                  | Utility      | Текст заголовка Round                                           |
| `buildEventLine`                                                                    | Utility      | Строка `- [x] \`<ts>\` <content>`                               |
| `buildCloseBlock`                                                                   | Utility      | Блок `#### Round close` + DONE                                  |
| `buildPhaseHeader`                                                                  | Utility      | `#### <PhaseID>` [+ ` — re-run: <reason>`], verbatim            |
| `buildHandoffLine`                                                                  | Utility      | `**Handoff →** <payload>`, verbatim, без ts                     |
| `buildBlockerBlock`                                                                 | Utility      | Полный BLOCKER_FORMAT блок (🛑/🔗/💬)                           |
| `badInvocation` / `fileError` / `noLogSection` / `placeholderError` / `missingFlag` | Utility      | Билдеры диагностик                                              |
| `PLACEHOLDER_RE`                                                                    | Value Object | `/<[^>\s]+>/` — паттерн плейсхолдера                            |
| `LogOutcome`                                                                        | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`        |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Append-Only Log Write

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - `<ticket>` + ровно один режим (`round`/`line`/`close`/`phase`/`handoff`/`blocker`); все режимы кроме `close` требуют контент
  - `blocker` дополнительно требует `--axiom <AX_NAME>` и `--unblock "<action>"`
  - Тикет содержит ровно одну чистую пару маркеров `EXECUTION_LOG`
- Postconditions:
  - Новые строки вставлены строго перед `<!--/SECTION:EXECUTION_LOG-->`; прочие байты файла не изменены
  - Контент любого режима с `<…>`-плейсхолдером → отказ, файл не тронут (exit 2)
  - Round-номер = (число существующих Round) + 1
  - `phase`/`handoff`/`blocker` пишут контент байт-в-байт — без timestamp-обёртки `line`, без url-encoding/эскейпинга
- Invariants:
  - Append-only гарантируется конструкцией (вставка перед close-маркером)
  - Timestamp детерминирован при инъекции часов

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument                                               | Type   | Description                                                    |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------- |
| `<ticket>`                                             | string | Путь к тикету                                                  |
| `round "<reason>"`                                     | mode   | Открыть Round (авто-номер, дата)                               |
| `line "<content>"`                                     | mode   | Дописать timestamped event-строку                              |
| `close`                                                | mode   | Дописать блок Round-close                                      |
| `phase <P-ID> ["— re-run: <reason>"]`                  | mode   | Дописать заголовок фазы `#### <P-ID>` per `PHASE_BLOCK_FORMAT` |
| `handoff "<payload>"`                                  | mode   | Дописать `**Handoff →** <payload>` per `HANDOFF_FORMAT`        |
| `blocker "<reason>" --axiom <AX> --unblock "<action>"` | mode   | Human-compatible inline form                                   |
| `--content-file .claude/tmp/<name>`                    | flag   | One-shot literal payload for round/line/phase/handoff/resolved |
| `--payload-file .claude/tmp/<name>.json`               | flag   | Strict `{reason,axiom,unblock}` blocker payload                |

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
Переиспользует `shared/common/scratch-payload-file.ts`: exact repo-local path, regular non-symlink,
`.claude/tmp/` boundary, fatal UTF-8, 32768-byte cap, consume-after-success.

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

### D-SL004 — Собственные режимы под форматные контракты, verbatim без escaping

- **Status:** active
- **Why:** До этой итерации единственный "структурный" режим для фазовых агентов был `line`, который безусловно оборачивает контент в `- [x] <ts> <content>` — заголовок фазы (`#### P1`), `**Handoff →**`-строка и BLOCKER-блок (эмодзи-маркеры) при этом превращались в мусор. Добавлены `phase`/`handoff`/`blocker` — каждый пишет контент строго по своему `OutputContracts`-контракту (`PHASE_BLOCK_FORMAT`/`HANDOFF_FORMAT`/`BLOCKER_FORMAT` в `phase-execution-protocol.directive.xml`), без обёртки `line`.
- **`%25`-порча:** аудит кода sdd-log/parse-args не нашёл ни одного `encodeURIComponent`/`decodeURIComponent`/percent-escaping в тракте sdd-log — контент проходит `argv → parseArgs → join(' ') → writeFileSync` без трансформаций (проверено юнит-тестом на `%`, `**`, `####`, эмодзи побайтово). Порча `%` в `%25`, если она наблюдалась, возникает до передачи в sdd-log (двойное экранирование на стороне вызывающего — шелл/агент, который строит команду), не в самом тулле.
- **Risk accepted:** Нет — операторская заметка: контент передавать одним shell-quoted аргументом, не через двойную интерполяцию.

### D-SL005 — File-backed payload вместо shell-escaping агентского текста

- **Status:** active; supersedes the agent-call part of D-SL002/D-SL004 (inline remains human compatibility)
- **Why:** Shell quoting cannot safely and compactly carry model-produced quotes, `$()`, backticks and
  multiline handoffs. The agent writes exact bytes with its file-write tool under pre-existing
  `.claude/tmp/`; the CLI opens a regular non-symlink file with `O_NOFOLLOW`, validates size/UTF-8,
  treats bytes only as data, updates the log, then unlinks that exact file. A failed append keeps the
  payload for retry; a failed post-write unlink is reported with an exact cleanup instruction.
- **Blocker schema:** `--payload-file` accepts exactly JSON keys `reason`, `axiom`, `unblock`;
  `reason`/`unblock` are non-empty one-line strings and `axiom` matches `AX_[A-Z0-9_]+`.
- **Risk accepted:** Inline forms remain for direct human use, but no SDD directive may interpolate
free-form model text into them.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `shared/common/parse-args.ts`, `shared/common/scratch-payload-file.ts`, `shared/sdd/section.ts`, `#logger`
- **Provides to:** `gennady.ts`; вызывается из `execute` (open/close Round) и `phase-execution-protocol` (event-строки)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
