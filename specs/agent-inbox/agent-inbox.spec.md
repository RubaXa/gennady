# agent-inbox: Scope Specification

## scope-type

product

> Детальный исследовательский PRD (проблема, полный список EARS, Decision Log D1–D36,
> карта покрытия, машина состояний, стадии автономии) — в
> [`services/agent-inbox/README.md`](../../services/agent-inbox/README.md). Эта спека —
> каноничный SDD-вход; не дублирует README, а фиксирует scope, surface и решения.

## 1. Vision & Primary Goal

Локальный ассистент входящих GitLab MR: находит то, что требует моей реакции (где я
ревьювер / упомянут / автор), вводит в контекст, делает честный факт-чек, готовит
ответ/ревью. Старт — роль ревьювера/упомянутого. Долгосрочно — обобщённый диспетчер
задач (ревью — первый тип), с автономией по явным гейтам.

Запуск локально (стадия прототипа — `/loop`/ручной; цель — launchd). Раздача —
через шаримый скилл + CLI.

## 2. Project Type

- **Type:** product (скилл-оркестратор + поддерживающие CLI-команды).
- **Why:** Навык `agent-inbox` (SKILL.md, интенты list/loop/reset) оркеструет команды
  `inbox` / `vcs-worktree` / `vcs-reply` и порт `vcs-client.Inbox`. Детерминированная
  механика — в CLI/клиенте; диалог, факт-чек и согласование — в навыке.

## 3. Approved Golden DX Example

```text
# интерактивный разбор (новая сессия): навык agent-inbox, интент list
gennady inbox --vcs-source=gitlab.corp.mail.ru        # список со стадиями
gennady inbox --pick group/proj!510 --vcs-source=…    # work packet одного MR
gennady vcs-worktree --ref group/proj!510 --vcs-source=…   # read-only код + diff_refs
echo '[{"discussionId":"…","body":"…"}]' | gennady vcs-reply --project=group/proj --iid=510
gennady inbox --reset                                  # чистый лист
```

## 4. Requirements & Constraints

### 4.1 Functional Requirements (сводка; полный EARS — в README §4)

| ID    | Требование                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------- |
| AI-01 | Источник actionable MR — `vcs-client.Inbox.getActionable()` (один GraphQL-запрос; роль + события)    |
| AI-02 | Группировка по роли, отсев шума (no-role/stale/drafts), CI-события только для author                 |
| AI-03 | Реестр `~/.gennady/inbox-registry.json` — дельта `NEW`/`↑` и кэш стадии (глобальный, не пер-репо)    |
| AI-04 | Стадия MR (review_needed/reply_needed/awaiting/idle) через скан обсуждений + identity                |
| AI-05 | Код-ревью — read-only worktree клона (`vcs-worktree`), сабагент `code-review`, код MR не исполняется |
| AI-06 | reply (ревьювер) — честный факт-чек собеседника (прав/не прав) по треду+коду + один краткий ответ    |
| AI-07 | Постинг (стадия B) — `vcs-reply` ТОЛЬКО после Ask-согласования каждого ответа                        |
| AI-08 | Вывод-черновики и итоги — `~/.gennady/inbox-out/`; `inbox --reset` — чистый лист                     |
| AI-09 | Жизненный цикл worktree ограничен: GC по TTL на каждом prepare + `--cleanup`/`--cleanup-all`         |

### 4.2 Non-Functional Constraints

- **NFC-01:** Стадия A/B — публичных действий в GitLab без явного approve нет; автономия (стадия C) — позже, по делегированию.
- **NFC-02:** Код MR — read-only; запуск тестов/сборки (исполнение чужого кода) вне скоупа (нужна docker-изоляция).
- **NFC-03:** Только GitLab; GitHub — позже. Только роль ревьювер/упомянут; автор своих MR — позже.
- **NFC-04:** Токен — ENV `GITLAB_PERSONAL_TOKEN`; не коммитить, не логировать.
- **NFC-05 (конфигурация):** ENV — только секрет (`GITLAB_PERSONAL_TOKEN`). Локации
  состояния — строгие дефолты под `~/.gennady/` (один флаг `--state-dir` переносит всё);
  host (`--vcs-source`) и база клонов (`--repos-base`, default `~/Developer`) — флаги;
  REST path (`/api/v4`) и worktree TTL (3ч) — строгие дефолты. Никаких прочих `GENNADY_*` env.

### 4.3 Out-of-Scope (этой итерации)

- Файловая очередь задач + `inbox-tick` + `inbox-watch` (фон-автоматизация) — заложены, не реализованы.
- Output sink `notify()` (мессенджер / нотификация ОС) — заложен интерфейс, реализация позже.
- Правила ревью под проект; роль автора; GitHub.

### 4.4 Runtime Backing

| Capability                                             | Posture                                |
| ------------------------------------------------------ | -------------------------------------- |
| Inbox / стадии / реестр / worktree / постинг           | `real-runtime` (проверено)             |
| Полный `review_needed` на реальном MR (worktree+clone) | `real-runtime` (не прогнан end-to-end) |
| Очередь / tick / watch / loop / notify                 | `not-implemented` (deferred)           |

### 4.5 Rules

| Rule               | Category | Source                                      |
| ------------------ | -------- | ------------------------------------------- |
| `typescript-rules` | coding   | `ai/directives/coding/typescript-rules.xml` |

## 5. High-Level Architecture

```
[inbox getActionable]→[группировка/стадии/реестр]→ navык agent-inbox (list/loop/reset)
                                                      │ Ask «что берём»
                                                      ▼
            [vcs-worktree: read-only код + diff_refs] + [inbox --pick: open questions]
                                                      │ факт-чек / code-review субагент
                                                      ▼ Ask-согласование (per answer)
                                            [vcs-reply: reply / discussion / line-comment]
```

Поддерживающий surface — в scope `vcs` (порт `Inbox`, `getCurrentUser`,
`createDiscussion`) и `cli` (команды `inbox`, `vcs-worktree`, `vcs-reply`).

## 6. Decision Log

Полный лог — `services/agent-inbox/README.md` §10 (D1–D36). Ключевые: локально (D1),
GitLab (D2), file-очередь+CLI (D5), стадии автономии A→B→C (D23/D33), карта
действий + dispatch (D30), worktree из repos.json/`~/Developer` (D31), нейминг
`vcs-*` для общих VCS-операций (D после ревью), `--vcs-source` (D29).

## 7. Scope Dependencies

- **Depends on:** `infra-base`, `vcs` (Inbox/discussions/identity), `cli` (команды), `ai-skills` (формат навыка).
- **Provides to:** оператору — рабочий процесс разбора входящих.

## 8. Handoff to Task Scaffolding

- **Статус:** research-спайк. Реализовано без формальных TSK (`@tasks: N/A`), осознанно.
- **Если переходить на полный SDD:** декомпозиция на модули `inbox-core` (getActionable/стадии/реестр),
  `vcs-worktree`, `vcs-reply`, `inbox-queue` (deferred), `inbox-skill`.
- **Open risks:** worktree-ревью не прогнан end-to-end на реальном клоне; постинг line-comment не прогнан реальным POST.
