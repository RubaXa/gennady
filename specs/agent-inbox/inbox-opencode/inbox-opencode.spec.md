# Module: inbox-opencode (v2 — полный рерайт)

> Parent scope: [`../agent-inbox.spec.md`](../agent-inbox.spec.md) · владеет решениями:
> D-311 (один сервер, TTL-паркинг), D-312 (единый маршрут промптов), D-313 (указатели,
> не дифы), D-316 (tool-trace)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Адаптер `opencode serve`: единственный дочерний процесс на весь agent-inbox, жизненный
цикл сессий (создание → паркинг → резюм → закрытие), единый приоритетный пул,
компиляция промптов, X-ray и tool-телеметрия.

Классы реализации: `SessionLifecycle` (§3), `SessionRegistry` (§3), `UnifiedPool` (§2), `PromptCompiler` (§4); типы `SessionState`, `SessionPriority`, функция `classifyOutcome` (§5, лесенка). Aging пула: конфиг, дефолт 60с (уточнение 2026-08-06 — вместо 10 мин: LLM-ходы минуты, 10 мин редко срабатывало бы).

<!--/SECTION:MODULE_VISION-->

## 2. Сервер и пул

- Один `opencode serve` (spawn + health-poll + pid-файл, как сейчас; zero-timeout
  dispatcher для длинных ходов).
- **Единый приоритетный пул** вместо раздвоённых chat=4/review=3: лимит — конфиг;
  👤-задачи вытесняют фоновые из очереди пула.

## 3. Жизненный цикл сессии (D-311, D-331)

```
create → work → park (idle-TTL 30–60 мин) → resume (та же сессия, продолжение)
       → close (TTL / supersede / явное)
```

Session registry: `sessionId ↔ {taskId, mr, artifacts[], model}` — основа связности
`producedBy` и маршрутизации «та же сессия».

## 4. Промпт-компиляция (D-312, D-313)

Единый маршрут для всех задач: Handlebars-шаблоны (`ai/kit/templates/**`) +
кирпичи-partials (`ai/kit/**/*.xml`), рендер по контексту задачи (mrShape, роль,
линза). Статическая конкатенация директив запрещена. Контракт: system = директивы;
task = указатели (файлы/SHA/пути — контент добывает агент); JSON-схема — в тексте
задачи (урок: схема в system вешала модель).

## 5. Телеметрия

- X-ray: prompt/response каждого хода → `report/sessions/<node>__<ts>.txt` (как сейчас).
- Tool-trace: `session.messages` после хода → `telemetry/tool-trace.jsonl` —
  **источник coverage-гейта** (D-316).
- Outcome-классификация исходов (ok/timeout/parse_error/schema_mismatch/…) —
  переезжает сюда из inbox-roles вместе с лесенкой continue/restart (исполняет
  inbox-queue).

## 6. Поверхности

| Порт           | Методы                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| `OpenCodePort` | createSession, prompt, continue, park, resume, close, abort, status, messages |

## 7. Приёмка

1. Один дочерний процесс opencode на сервер (pid-файл, health-check).
2. Паркинг: задача `deepen` резюмирует ту же сессию (в X-ray — continuation, не новый
   system-промпт).
3. Tool-trace пишется на каждый ход и доступен coverage-гейту.
4. Промпт любой задачи собран единым маршрутом и содержит указатели, не инлайн-данные.

## Handoff Rules Additions

- [typescript-rules](../../../ai/directives/coding/typescript-rules.xml) — impl-фазы (\*.ts)
- [node-test](../../../ai/directives/testing/node-test.xml) (+ testing-common) — test-фазы
