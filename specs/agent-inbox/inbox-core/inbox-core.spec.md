# Module: inbox-core (v2 — полный рерайт)

> Parent scope: [`../agent-inbox.spec.md`](../agent-inbox.spec.md) · владеет решениями:
> D-302 (журнал решений = датасет), D-305 (барьер готовности), D-317 (лента событий:
> журнал + `lastReadAt` → непрочитанное/📬)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Состояние и истина agent-inbox: **журнал событий (event store)** как единственный
источник истины, реестр как кэш, конфиг, барьер готовности, dry-run. Очередь, лента,
доска и датасет решений — проекции журнала.

<!--/SECTION:MODULE_VISION-->

## 2. Журнал событий (`events.jsonl` на MR)

```json
{
  "ts": "...",
  "seq": 41,
  "mr": "mail/messenger!174",
  "kind": "task_status",
  "actor": "queue",
  "payload": { "taskId": "#14", "status": "running" }
}
```

Конверт един: `{ts, seq, mr, kind, actor, payload}` — **все** kind-специфичные поля живут внутри `payload`. Kinds: `task_created|task_status|artifact_produced|gitlab_event|widget_bump|proposal|
decision|chat_turn|mutation|system`.

**Контракт JournalPort (каноника — здесь; ссылка из корня §5.3):**

- `append(entry)`: per-MR **один писатель в момент времени** — in-process очередь
  сериализует продюсеров (sync/queue/chat/api). Запись — **строчный append** (одна
  JSON-строка, O_APPEND + fsync); tmp+rename для журнала НЕ используется (остаётся для
  реестра/конфига — иначе конкурентные append теряют записи). Каждая запись получает
  монотонный `seq` (per MR).
- `read()` / `since(cursor)`: порядок = `seq`; `cursor = seq` последней прочитанной;
  `since(cursor) → {entries, nextCursor}` (основа пагинации ленты).
- Гарантии: append-only; fsync-запись переживает краш; битый хвост (обрыв строки после
  краша) отбрасывается при реплее.
- MR-less события (boot, system, dryrun) — глобальный журнал `agent-inbox/events.jsonl`
  (тот же контракт, `mr='system'`).

**Payloads по kind (`ts, seq, mr, kind` — всегда обязательны):**

| kind              | продюсер       | payload (обязательное)                                                                                                                            |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| task_created      | queue          | taskId, type, params, dependsOn, dedupKey, priority, createdBy                                                                                    |
| task_status       | queue          | taskId, status, progress?, error?                                                                                                                 |
| artifact_produced | pipeline       | taskId, path, producedBy{sessionId, model}                                                                                                        |
| gitlab_event      | vcs            | event (commits/threads/pipeline/approval), data                                                                                                   |
| widget_bump       | api            | widgetId, lastActivity                                                                                                                            |
| proposal          | queue/pipeline | proposalId, capability, payload, producedBy                                                                                                       |
| decision          | api            | proposalId, verdict, diff?, actor                                                                                                                 |
| chat_turn         | chat           | turnId, anchor?, role (operator/machine)                                                                                                          |
| mutation          | chat           | path, revision, snapshotId                                                                                                                        |
| system            | core           | event (boot/phase/dryrun/effect_applied/error), data; для effect_applied data = `{effectId}` (маркер идемпотентности эффектов, hash(mr+тип+цель)) |

### 2.1 Датасет решений (D-302) — первоклассная сущность

```json
{"kind":"proposal","proposalId":"p-881","capability":"post_findings","mr":"...",
 "payload":{"findings":["F-1","F-2"]},"producedBy":{"sessionId":"...","taskId":"#11","model":"..."}}
{"kind":"decision","proposalId":"p-881","verdict":"accept|edit|reject",
 "diff":"...","ts":"...","actor":"operator"}
```

- Каждое предложение машины (постинг, реакция, резолв, аппрув, ответ в тред) пишется как
  `proposal`; решение оператора — как `decision` (accept/edit/reject + diff при edit).
- Метрики: `accept-rate` и `edit-rate` **per capability**; порог градации (стартовый:
  accept ≥ 90% на выборке ≥ 20) → capability переходит в auto-mode (с лентой
  автодействий + undo).
- Потребители: inbox-eval (метрики схожести), dashboard (индикатор градации),
  аналитика (какие типы решений машине не удаются).
- Замкнутый набор capability: `post_findings|post_reply|react|resolve|approve|
update_description`. `accept-rate` — **чистая функция над журналом, живёт здесь** (inbox-eval её рендерит); выборка — последние 20 решений per capability (rolling); при n < 20 градация запрещена. Текущий режим
  capability (`proposal|auto`) хранится в реестре-кэше `capabilities{}`, переключается
  по порогу; queue применяет: `proposal` → виджет решения, `auto` → effect + запись в
  ленту + undo.

## 3. Реестр — только кэш

`inbox-registry.json` остаётся кэшем (никогда не источник истины). Поля (все —
пересобираемые из GitLab + журналов):

| Поле                  | Форма                   | Назначение                                                           |
| --------------------- | ----------------------- | -------------------------------------------------------------------- |
| `lastSeenUpdatedAt`   | ISO ts                  | дельта-опрос                                                         |
| `lastReviewedHeadSha` | sha                     | детект новых коммитов (🔀)                                           |
| `lastReadAt`          | ISO ts                  | непрочитанное/📬 (D-317): unread = записи журнала после `lastReadAt` |
| `capabilities`        | `{cap: proposal\|auto}` | режимы градации (§2.1)                                               |
| `assignedRole`        | `author\|reviewer`      | **только** override для mentioned-only MR (D-304)                    |

## 4. Барьер готовности (D-305)

Фазы: `connect → poll → reconcile → restore → ready` (+`failed` с причиной и retry).
Контракт `GET /api/boot` → `{phase, progress: {done, total, label}, ready, error?}`.
Bootstrap порядок: config → журналы → **api listen** (до фаз — иначе фазы невидимы по
HTTP) → `connect` (vcs connect) → `poll` (первый опрос) → `reconcile` (сверка
реестр/диск) → `restore` (восстановление очередей из журналов) → `ready`.
Worktree — не фаза (лениво, фоном).

## 5. Конфиг и dry-run

`agent-inbox/config.json`: `{version: 1, reposBase: path, vcsHost: string}`; при
отсутствии/битом файле — `{configured: false, missing[]}` (без throw), boot → фаза
`failed` с причиной. Dry-run: флаг `dryRun` в `agent-inbox/config.json` (или env override). Здесь живут: флаг + запись о подавлении (kind `system`, payload `{event:"dryrun", effectId}`). Сама супрессия — в executor очереди (inbox-queue §4.1); SSE-кадр `dryrun` эмитит inbox-api по записи.

## 6. Хранилище (как было, без изменений адресов)

```
~/.gennady/
├── inbox-registry.json              # кэш
└── agent-inbox/
    ├── config.json
    ├── mrs/<group__proj-iid>/
    │   ├── events.jsonl             # ЖУРНАЛ (истина)
    │   ├── worktree/
    │   └── report/ (PLAN/README/review.json/tasks/sessions/)
    └── telemetry/ (phase-timings, tool-trace)
```

## 7. Приёмка

1. Краш сервера → рестарт → очереди и лента восстановлены из `events.jsonl`; карточки
   не деградировали.
2. Каждое предложение и каждое решение пишутся в журнал (проверка записей proposal/
   decision на реальном потоке).
3. `/api/boot` отражает фазы; падение фазы видимо с причиной и retry.
4. Реестр: удаление файла не ломает доску (пересборка из GitLab + журналов).

## Critic Rounds

### Round 1 — 2026-07-29

- Verdict: NEEDS_WORK (1 CRITICAL, 4 MAJOR)
- Accepted: 6 — контракт JournalPort (cursor/seq/конкурентные писатели; tmp+rename терял бы записи), payloads по kind, порядок слушателя boot (фазы были невидимы по HTTP), самоссылки «как сейчас» (config/dry-run/append), содержание D-317 (lastReadAt → 📬), снятие ложного владения D-329
- Rejected: 0
- Reconcile: JournalPort → каноника здесь, корень §5.3 ссылается (EXTEND); snapshots → REUSE `report/snapshots/`
- Changes: §2 контракт JournalPort + таблица payloads; §2.1 механика capability (замкнутый набор, хранение режима, кто переключает); §3 поля реестра; §4 порядок bootstrap + progress {done,total,label}; §5 config-схема и dry-run; шапка — D-329 убран

### Round 2 — 2026-07-29

- Stop: лимит оператора (2 раунда); R2-валидация не вернулась (пустой отчёт диспетчей) — правки R1 в силе, статус: недовалидировано

## Handoff Rules Additions

- [typescript-rules](../../../ai/directives/coding/typescript-rules.xml) — impl-фазы (\*.ts)
- [node-test](../../../ai/directives/testing/node-test.xml) (+ testing-common) — test-фазы
