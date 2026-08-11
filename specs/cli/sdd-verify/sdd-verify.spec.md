# Module: `sdd-verify`

**Module:** sdd-verify · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling (без тикета; см. [ai/sdd-v2-plan.md](../../../ai/sdd-v2-plan.md))

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Детерминированный gate верификации фазы. Прогоняет ФИКСИРОВАННЫЙ набор проектных скриптов по точным именам — `format → lint → typecheck → test:coverage → yagni` — мутирующие первыми (autofix переписывает файлы, поэтому не гоняется параллельно с чтением). Вывод краткий: на успехе строка на gate; детали — только у упавших. Реверс-спека — `verify.sh` (идея gate), но без fuzzy-классификатора (D-SV004). `yagni` — та же RUN-ALL-дисциплина, что у остальных gate: YAGNI-находка в диффе фазы блокирует гейт наравне с типами и тестами (D-SV007).

**Key properties:**

- Exact gates — ровно `npm run format/lint/typecheck/test:coverage/yagni`; никакого обнаружения/угадывания
- Mutating-first, sequential — `format`, `lint` (autofix) идут первыми по очереди; read-only после; autofix не гоняется с чтением
- RUN-ALL — падение gate не пропускает остальные (агент видит все проблемы)
- Brief-on-success — `✅ <gate> (<dur>)`; на падении — exit code + захваченный output только упавшего

**Invariants:**

- Порядок нормативен: format → lint → typecheck → test:coverage → yagni
- Все прошли → exit 0; ≥1 упал → exit 1
- Раннер инъектируется (`run(runner)`); tail в `index.ts`, поэтому импорт `run()` в тесте НЕ запускает реальные гейты
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
# всё прошло — кратко
$ npx gennady sdd-verify
[verify] ✅ ALL PASS (5/5)
  ✅ format (0.6s)
  ✅ lint (2.3s)
  ✅ typecheck (1.4s)
  ✅ test:coverage (5.1s)
  ✅ yagni (0.9s)
# exit 0

# падение — детали только у упавшего
$ npx gennady sdd-verify
[verify] 4/5 passed — 1 FAILED
  ✅ format (0.6s)
  ✅ lint (2.3s)
  ✅ test:coverage (5.1s)
  ✅ yagni (0.9s)
  ❌ typecheck — exit 2
  --- output ---
  src/foo.ts(12,3): error TS2345: ...
  --- end ---
# exit 1
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name            | Type         | Purpose                                                                      |
| --------------- | ------------ | ---------------------------------------------------------------------------- |
| `run`           | Command      | Прогон всех GATES по порядку (RUN-ALL), тайминг, вердикт                     |
| `defaultRunner` | Utility      | Раннер по умолчанию через `spawnSync` (без shell), exit + output             |
| `verdict`       | Utility      | Свёртка результатов: кратко на успехе, детали упавших                        |
| `GATES`         | Value Object | Фикс-последовательность: format · lint (mutates) · typecheck · test:coverage · yagni |
| `Gate`          | Value Object | name + mutates                                                               |
| `GateRunResult` | Value Object | exitCode + output                                                            |
| `GateResult`    | Value Object | name · exitCode · output · durationMs                                        |
| `GateRunner`    | Type         | `(command, args) => GateRunResult` — инъектируемый                           |
| `VerifyOutcome` | Type         | `{ok:true,text}` либо `{ok:false,code,exitCode,message}`                     |
| `Profile`       | Type         | Профиль гейтов: `code` \| `test` \| `full` (D-SV006)                         |
| `gatesFor`      | Utility      | Гейты профиля в каноническом порядке GATES (подмножество)                    |
| `isProfile`     | Utility      | Type-guard токена профиля из CLI-ввода                                       |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Verification Gate

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `e2e`

**Contract (DbC):**

- Preconditions:
  - Required-скрипты существуют (это проверяет `sdd-state` readiness; `sdd-verify` идёт после ready)
- Postconditions:
  - Каждый gate запускается ровно один раз как `npm run <name>` в нормативном порядке
  - Мутирующие (`format`, `lint`) — первыми и последовательно; падение одного не прерывает остальные (RUN-ALL)
  - Успех → exit 0 + `✅ <gate> (<dur>)` на gate; падение → exit 1 + output только упавших
- Invariants:
  - Набор и порядок gate — фиксированные (нет обнаружения по package.json)
  - `run(runner)` детерминистична при фиксированном раннере; реальные подпроцессы — только в `index.ts`
  <!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Argument                       | Type   | Description                                      |
| ------------------------------ | ------ | ------------------------------------------------ |
| `--profile <code\|test\|full>` | string | Какой профиль гейтов гнать. По умолчанию `full`. |
| `--help` / `-h`                | —      | Справка.                                         |

Профили — фикс-наборы, выбор по ЯВНОМУ флагу (не обнаружение):

- `code` — `format · lint · typecheck · yagni` (фазы кода: impl/refactor/config/doc/bootstrap; тесты НЕ гоняются — их ещё может не быть; `yagni` гоняется — это уже проверка кода диффа, не тестов)
- `test` — `format · typecheck · test:coverage` (фаза тестов; `lint`/`yagni` не гоняются — фаза тестов не трогает прод-код)
- `full` — `format · lint · typecheck · test:coverage · yagni` (финал, все фазы закрыты; **default**)

Порядок внутри профиля нормативен (мутирующие первыми). Плоский `test` НЕ гоняется (покрыт `test:coverage`), но в required-наборе readiness остаётся.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```
cli/cmd/sdd-verify/
├── index.ts             # entry + tail (runs gates, exits) — вынесен сюда, чтобы импорт run() не запускал гейты
├── sdd-verify.cmd.ts    # defaultRunner + run(runner)  (без tail)
├── sdd-verify.types.ts  # GATES, verdict, Gate/GateResult/VerifyOutcome
├── help.ts
└── __tests__/sdd-verify.cmd.test.ts
```

**Registration points (4 files):** `cli/gennady.ts` · `cli/cmd/help/help.cmd.ts` · `cli/AGENTS.md` · `cli/cmd/README.md`.
**Вызывается из:** `phase-execution-protocol` (STEP_5) и `reconcile` (STEP_7), без аргументов.
**E2E:** отложен (прокси) + живьём мутирует/требует test:coverage → покрытие unit через fake-runner.

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-SV001 — Инъектируемый раннер + tail в index.ts

- **Status:** active · **Why:** оркестрация (порядок, RUN-ALL, вердикт) unit-тестируема без подпроцессов; argless-команда не должна запускать реальные гейты при импорте `run()` в тесте — поэтому self-exec в `index.ts`, а `cmd.ts` только экспортирует. **Risk:** нет.

### D-SV002 — Фикс-гейты по точным именам (без обнаружения)

- **Status:** active · **Why:** оператор: «строго, без угадываний». Набор и порядок зашиты; `sdd-state` гарантирует наличие скриптов. **Risk:** проект обязан иметь точные имена — это и есть стандарт v2.

### D-SV003 — Мутирующие первыми, последовательно

- **Status:** active · **Why:** `format`/`lint` делают autofix (переписывают файлы); параллель с читающими (`typecheck`/`test:coverage`) — гонка. Последовательность безопасна. **Risk:** медленнее; read-only пару можно распараллелить позже (async-spawn).

### D-SV004 — Классификатор `scripts.ts` ретайрнут

- **Status:** active · **Why:** после перехода на точные имена fuzzy-классификатор стал мёртв (ни один потребитель) — удалён вместе с тестами. **Risk:** нет.

### D-SV005 — Плоский `test` не гоняется

- **Status:** active · **Why:** `test:coverage` запускает те же тесты с покрытием; гонять оба — избыточно. **Risk:** если нужна быстрая прогонка без coverage — добавить `test` в GATES.

### D-SV006 — Профили гейтов по виду фазы

- **Status:** active · **Why:** гейт привязан к `kind` фазы. Фаза кода не должна гонять тесты (их ещё нет; и корректнее, и экономит) — только format/lint/typecheck; фаза тестов — покрытие; финал — всё. Профиль выбирается ЯВНЫМ `--profile` от оркестратора по виду фазы, НЕ обнаружением по package.json — дух D-SV002 («без угадываний») сохранён, наборы по-прежнему фиксированы. Default `full` — безопасный максимум, если флаг не передан. **Risk:** оркестратор обязан передать верный профиль; недопроверка от неверного профиля ловится финальным `full` (Пункт 3).

### D-SV007 — `yagni` добавлен как read-only гейт, в конце последовательности

- **Status:** active
- **Why:** YAGNI-проверка (`gennady yagni`, `specs/cli/yagni/yagni.spec.md`) читает готовый диф фазы — запускать её до финальных правок кода (до `typecheck`/`test:coverage`) бессмысленно, поэтому она встаёт последней в `GATES`. Она не мутирует файлы (не autofix), поэтому не конкурирует за порядок с `format`/`lint`. Включена в профили `code` и `full` (код-диф уже есть), исключена из `test` (тестовая фаза не трогает прод-символы).
- **Risk accepted:** Требует npm-скрипт `yagni` (`tsx cli/gennady.ts yagni`) в `package.json` — уже добавлен вместе с этим решением.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 8. Inter-Module Dependencies

- **Depends on:** `node:child_process` (spawnSync), `#logger`
- **Provides to:** `gennady.ts`; вызывается из `phase-execution-protocol` (STEP_5), `reconcile` (STEP_7)
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->
