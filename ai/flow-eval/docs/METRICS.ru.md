# Метрики и детерминизм

Слой проверки, который не зависит от LLM: механический quality-gate плюс детерминированные метрики
сессии. Общая картина — [ARCHITECTURE.ru.md § 4](./ARCHITECTURE.ru.md#4-что-детерминировано-а-что--judge);
здесь — как каждый инструмент устроен и что именно он читает.

## 1. Quality-gate (`quality-gate.ts`)

Работает на файлах уже завершённой песочницы — LLM не вызывается.

### R1 — структурная целостность

```bash
gennady sdd-check --all .
```

`parseSddCheckResult` разбирает вывод: `clean` → pass, `N error(s)` → fail с числом ошибок в `detail`,
иначе — fail `no sdd-check verdict parsed` (отсутствие вердикта — это fail, не тихий pass). Применяется
к сценариям, которые ПРОИЗВОДЯТ спеки (все фазы кроме `task` и не-spec-режимов `brownfield`).

### R-COMPLETE — реальное завершение (opt-in через `completion`)

Отвечает на вопрос «артефакт создан, но тикет доведён ли до настоящего DONE». Читает с диска, не
выводит:

| Сигнал           | Как проверяется                                                      |
| ---------------- | -------------------------------------------------------------------- |
| `artifactExists` | Файл `completion.artifact` существует.                               |
| `ticketDone`     | В тикете `**Status:** [x]`.                                          |
| `roundClosed`    | Внутри `<!--SECTION:EXECUTION_LOG-->…` есть строка `- [x] ... DONE`. |
| `auditReceipt`   | Владеющая спека (`completion.spec`) содержит `SDD_AUDIT_RECEIPT`.    |
| `reviewReceipt`  | Владеющая спека содержит `SDD_REVIEW_RECEIPT`.                       |

Вердикт: `!artifactExists` → fail `declared artifact was not produced`; артефакт есть, но чего-то не
хватает → fail `artifact built but <перечень отсутствующего>`; всё есть → pass. Это механический ответ
на «заброшенный артефакт» — код написан, а тикет не закрыт корректно. `R-COMPLETE`, если присутствует,
решающий над `R1` (чистая структура ≠ доведённая до конца работа).

## 2. `session-metrics.py` — детерминированные метрики сессии

Источники: SQLite OpenCode (`~/.local/share/opencode/opencode.db`, таблицы `session`/`message`/`part`)
для счётчиков сессии + файлы фикстуры на диске для completion-сигналов. LLM не используется.

### `record` — снять и сохранить метрику прогона

```bash
python3 ai/flow-eval/scripts/session-metrics.py record \
  --run r1234567890 \
  --session sdd-eval:RT-cloud-ios-IB-script \
  --fixture /Users/k.lebedev/.gennady/eval/cloud-ios/rt-regen \
  --bench-out /path/to/bench-regen.out
```

Пишет одну JSON-строку в `ai/flow-eval/.results/metrics-ledger.jsonl`:

```json
{
  "run": "r1234567890",
  "session": "ses_abcdef123456",
  "tool_calls_total": 42,
  "by_tool": { "bash": 20, "read": 15, "write": 5, "edit": 2 },
  "writes": 7,
  "steps": 12,
  "reasoning_tokens": 18320,
  "output_tokens": 4110,
  "guard_written": true,
  "guard_lines": 96,
  "ticket_status": "[x] DONE",
  "round_closed": true,
  "impl_receipt": true,
  "audit_receipt": true,
  "review_receipt": true,
  "bench_soft": "78/82"
}
```

### `gate` — RED-first завершение

```bash
python3 ai/flow-eval/scripts/session-metrics.py gate --fixture <dir>
```

Логика (текущая реализация завязана на конкретную фикстуру cloud-ios — `guard_written`, путь тикета
`IB-script`; при переносе на другой репозиторий адаптировать `state_metrics()`): если артефакт написан,
но `ticket_status` не содержит `[x]`, или раунд не закрыт, или отсутствует `audit_receipt`/
`review_receipt` — печатает `COMPLETION GATE: RED` с перечнем причин и выходит с ненулевым кодом. Иначе
`COMPLETION GATE: GREEN`, код 0.

### `compare` — non-regression между двумя прогонами

```bash
python3 ai/flow-eval/scripts/session-metrics.py compare r_before r_after
```

Правило non-regression: `steps`, `tool_calls_total`, `reasoning_tokens` не должны ВЫРАСТИ; completion-
сигналы (`guard_written`, `round_closed`, `impl_receipt`, `audit_receipt`, `review_receipt`) не должны
УХУДШИТЬСЯ (были `true` → стали `false`). Любое нарушение → `VERDICT: FAIL — regression detected`,
код 1; иначе `VERDICT: PASS — no regression`, код 0. Оба прогона должны уже быть в
`metrics-ledger.jsonl` (через `record`).

## 3. `session-telemetry.py` — обзервабилити (без вердиктов)

Только для чтения; ничего не решает, помогает диагностировать. По `session_id` или фрагменту заголовка
восстанавливает таймлайн из той же SQLite:

- сколько тулов вызвано и с каким breakdown (`bash×20, read×15, ...`);
- какие файлы читались и в каком порядке;
- reasoning/plan-шаги (что worker собирался делать);
- сигнатуры падений (`SIGBUS`, `Traceback`, `command not found`, …) в выводе тулов;
- повторяющиеся bash-команды (`>=2×`) — механический признак «застрял»;
- где именно worker остановился (последние 3 вызова тула).

```bash
python3 ai/flow-eval/scripts/session-telemetry.py sdd-eval:RT-cloud-ios-IB-script
```

Используется для разбора `fail`/`inconclusive`/`stuck`-прогонов — то же назначение, что у наблюдателя
харнесса (`observer.ts`), но с полным доступом к SQLite постфактум, а не bounded snapshot в реальном
времени.

## 4. Где смотреть дальше

- Как обе эти проверки встраиваются в pipeline — [ARCHITECTURE.ru.md](./ARCHITECTURE.ru.md).
- Пример полного round-trip прогона, где используются `record`/`gate` — [WRITING-EVALS-EXTERNAL.ru.md](./WRITING-EVALS-EXTERNAL.ru.md).
- Бэклог правил качества (R1…R6) и дисциплина both-outcomes — [QUALITY-RULES.ru.md](../QUALITY-RULES.ru.md).
