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
gennady inbox --vcs-source=gitlab.corp.mail.ru              # список со стадиями
gennady inbox-context --ref group/proj!510 --vcs-source=…    # ВЕСЬ контекст MR одним вызовом:
                                                            #   worktree + repoLayout + changeset
                                                            #   + stage + threads + drafts + package
gennady inbox-context --ref group/proj!510 --skip-worktree   # без клона (только stage+threads)
gennady inbox-context --ref group/proj!510 --skip-threads    # без обсуждений (только changeset)
gennady inbox --pick group/proj!510 --vcs-source=…          # work packet одного MR (legacy)
gennady inbox --no-save --vcs-source=…                       # read-only (без обновления реестра)
echo '[{"discussionId":"…","body":"…"}]' | gennady vcs-reply --project=group/proj --iid=510
gennady inbox --reset                                        # чистый лист
```

## 4. Requirements & Constraints

### 4.1 Functional Requirements (сводка; полный EARS — в README §4)

| ID    | Требование                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-01 | Источник actionable MR — `vcs-client.Inbox.getActionable()` (один GraphQL-запрос; роль + события). `markTodoDone(todoId)` — гашение одного todo после реакции через GraphQL `todoMarkDone`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AI-02 | Группировка по роли, отсев шума (no-role/stale/drafts/merged-closed), CI-события только для author. Влитые/закрытые MR (приходят через незакрытый pending-todo GitLab) отсекаются всегда, даже под `--all`. По умолчанию список сужен до **actionable**: стадии `awaiting_reply`/`idle` и MR с моим approve скрыты (реакция от меня не нужна); счётчики — в `hidden` (`waiting`/`approved`). Полный список — под `--all`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| AI-03 | Реестр `~/.gennady/inbox-registry.json` — дельта `NEW`/`↑` и кэш стадии (глобальный, не пер-репо)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| AI-04 | Стадия MR (review_needed/reply_needed/awaiting/idle) через скан обсуждений + identity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AI-05 | Код-ревью — read-only worktree клона (`vcs-worktree`), сабагент `code-review`, код MR не исполняется                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AI-06 | reply (ревьювер) — честный факт-чек собеседника (прав/не прав) по треду+коду + один краткий ответ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| AI-07 | Постинг (стадия B) — `vcs-reply` ТОЛЬКО после Ask-согласования каждого ответа                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AI-08 | Вывод-черновики и итоги — `~/.gennady/inbox-out/`; `inbox --reset` — чистый лист                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AI-09 | Жизненный цикл worktree ограничен: GC по TTL на каждом prepare + `--cleanup`/`--cleanup-all`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AI-10 | Перед ревью подтягиваются существующие треды (`review-issues --all`) и мои черновики (`--draft`): чужие доводы учитываются, уже сказанное (Reviewer/Author/AI_Agent/мой draft) не дублируется, упоминания меня помечаются как ждущие ответа                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AI-11 | `getActionable` несёт контекст для карточек/хедера одним GraphQL-запросом: `description`, `author`, `reviewers`, `approvedBy`. `approvedBy` — основа отсева «я уже заапрувил»; `description` потребитель усекает для показа                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AI-12 | Интерактивный разбор (режим по умолчанию) — управляемый оператором: выбор задач `AskUserQuestion` `multiSelect` (≤4 чекбокса + Other), контроллер «Дальше?» (углубиться/вопрос/действия/следующий), меню действий одним `multiSelect` (замечания+треды+approve+пропуск). Постинг сразу live — dry-run во флоу не используется (флаг остаётся в CLI для отладки)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AI-13 | Полный VCS-инструментарий с политикой «когда что»:<br>**Основные:** `inbox`/`vcs-worktree`/`review-issues`/`vcs-reply`/`vcs-approve`.<br>**Вспомогательные:** `vcs-diff` (быстрый просмотр diff без клона), `vcs-pipeline` + `vcs-job` + `vcs-job-log` (CI/пайплайн — статус, логи упавших джоб), `vcs-todo` (гашение todo после реакции).<br>`vcs-reply` несёт reply/line/discussion/**resolve**/**reopen**/**suggestion** (code-suggestion с range)/**edit-note**/**delete-note** (`{discussionId,resolve:true/false}`, ± body, ±suggestionRange). Резолв = «вопрос снят» (не «прочитал»); approve — только без открытых блокирующих замечаний; approve по MR (`--revoke` для отзыва), resolve по треду.                                                                                                                                                                                                                                                                                                                   |
| AI-14 | Роль автора в скоупе для self-review: каждый исходящий MR проходит inbox (его `idle` не прячется, пока нет моей сводки) и получает **один общий комментарий-сводку** (Mermaid-overview + scope + «готово к ревью») для ревьюеров; плюс ответы/резолв в тредах ревьюеров                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AI-15 | Ревью большого MR разбивается на сабагентов: скаут классифицирует изменённые файлы по дорожкам (security/ui/logic/tests/docs) простыми правилами по пути/расширению; малый MR (<=6 файлов, <=300 строк, <=1 дорожка) — инлайн один проход, крупный/многодорожечный — по сабагенту на дорожку + ВСЕГДА отдельный security; находки сводятся в один helicopter-отчёт (дедуп, сквозные ID). Cost-aware и портативно: инлайн по умолчанию, fan-out ≤~5 сабагентов только когда окупается; если харнесс не умеет сабагентов — попросить заспаунить ревьюера либо ревьюить дорожки инлайн последовательно                                                                                                                                                                                                                                                                                                                                                                                                                          |
| AI-16 | **`inbox-context`** — атомарный сбор всего контекста MR в один JSON. Один вызов `gennady inbox-context --ref <group/project!iid> [--vcs-source=<host>]` возвращает: `ref`, `title`, `webUrl`; `worktree { path, base, diffRefs, repoLayout: { dirs, rootFiles } }` (поднимает worktree через существующий `prepareWorktree` + `ls` дерева проекта); `changeset { files: [{path, status, plus, minus}], totals: {files, plus, minus}, byCategory: {code, tests, docs, config, assets} }` (через `git diff --numstat` + `--name-status` в worktree); `stage` (`classifyMrStage` из существующей логики); `openQuestions`, `lastAuthor`; `threads { all: <Review_Threads>, drafts: <Review_Threads> }` (через `review-issues --all` + `--draft`); `package { role, author, reviewers, description, approvedBy }` (из `getActionable`). Флаги экономии: `--skip-worktree` (без клона — changeset и worktree пусты, только stage+threads+package), `--skip-threads` (без загрузки обсуждений, только changeset+worktree+package). |
| AI-17 | **Golden chat output example** — файл `ai/directives/agent-inbox/golden-chat-output.example.md` с конкретным образцом финального отчёта агента в чате: от шапки до подвала, все 10 секций `OutputFormat` на вымышленных правдоподобных данных. Демонстрирует: ASCII-дерево карты файлов, таблицу категорий, C4-диаграмму в ASCII, карточки сущностей с [E-IDs] и вердиктами, таблицу кандидатов с осями и kind. Используется агентом как эталон структуры перед выдачей отчёта — сверяет свой вывод с примером.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AI-18 | **Self-check в arch-interrogation** — блок `<SelfCheck>` в `arch-interrogation.directive.xml` внутри `STEP_5` (после `Precondition`, перед `Action`): контрольный список из 6 обязательных секций (шапка с ссылкой на webUrl, обзор с картой файлов, C4-диаграмма, карточки сущностей с [E-IDs], таблица кандидатов, подвал с ссылкой на webUrl). Агент проходит его перед отправкой вывода. Если любой пункт ✗ — возвращается и добавляет пропущенное. Не выдаёт неполный отчёт.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| AI-19 | **Remit-триггер в скилле** — в шаге 4 `SKILL.md` (и его зеркале `.claude/skills/agent-inbox/SKILL.md`), после слов «применяет директиву»: жёсткая инструкция `⚠️ Перед формированием любого вывода по MR прочитай arch-interrogation.directive.xml целиком. Игнорируй предыдущее знание о ней. Следуй OutputFormat буквально — все 10 секций, в этом порядке, с этими разделителями. Не сокращай, не пропускай, не переупорядочивай. После формирования — пройди SelfCheck из директивы.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 4.2 Non-Functional Constraints

- **NFC-01:** Стадия A/B — публичных действий в GitLab без явного approve нет; автономия (стадия C) — позже, по делегированию.
- **NFC-02:** Код MR — read-only; запуск тестов/сборки (исполнение чужого кода) вне скоупа (нужна docker-изоляция).
- **NFC-03:** Только GitLab; GitHub — позже. Роль ревьювер/упомянут — основная; роль автора — в скоупе для self-review сводки + ответов/резолва в тредах ревьюеров (полный автор-цикл — мердж, ребейз — позже).
- **NFC-04:** Токен — ENV `GITLAB_PERSONAL_TOKEN`; не коммитить, не логировать.
- **NFC-05 (конфигурация):** ENV — только секрет (`GITLAB_PERSONAL_TOKEN`). Локации
  состояния — строгие дефолты под `~/.gennady/` (один флаг `--state-dir` переносит всё);
  host (`--vcs-source`) и база клонов (`--repos-base`, default `~/Developer`) — флаги;
  REST path (`/api/v4`) и worktree TTL (3ч) — строгие дефолты. Никаких прочих `GENNADY_*` env.
- **NFC-06 (синхронизация артефактов):** Промты, примеры и инструменты должны быть
  синхронизированы между собой. Любое изменение `OutputFormat` в
  `arch-interrogation.directive.xml` требует обновления `golden-chat-output.example.md`.
  Любое изменение сигнатуры `inbox-context` требует обновления `SKILL.md` (секция
  «VCS-инструменты») и `specs/agent-inbox/agent-inbox.spec.md` (Golden DX). Ответственность —
  на агенте, выполняющем изменение; проверка — на ревьюере.

### 4.3 Out-of-Scope (этой итерации)

- Файловая очередь задач + `inbox-tick` + `inbox-watch` (фон-автоматизация) — заложены, не реализованы.
- Output sink `notify()` (мессенджер / нотификация ОС) — заложен интерфейс, реализация позже.
- Правила ревью под проект; роль автора; GitHub.
- Принудительная валидация вывода агента — не можем гарантировать; наша задача — максимально
  понятно объяснить агенту ожидания (self-check, golden example, remit-триггеры).

### 4.4 Runtime Backing

| Capability                                             | Posture                                |
| ------------------------------------------------------ | -------------------------------------- |
| Inbox / стадии / реестр / worktree / постинг           | `real-runtime` (проверено)             |
| Полный `review_needed` на реальном MR (worktree+clone) | `real-runtime` (не прогнан end-to-end) |
| `inbox-context` (AI-16)                                | `not-implemented`                      |
| Golden chat output example (AI-17)                     | `not-implemented`                      |
| Self-check в arch-interrogation (AI-18)                | `not-implemented`                      |
| Remit-триггер в SKILL.md (AI-19)                       | `not-implemented`                      |
| Очередь / tick / watch / loop / notify                 | `not-implemented` (deferred)           |

### 4.5 Rules

| Rule                 | Category    | Source                                                                                                                                                                                                                               |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typescript-rules`   | coding      | `ai/directives/coding/typescript-rules.xml`                                                                                                                                                                                          |
| `arch-interrogation` | agent-inbox | `ai/directives/agent-inbox/arch-interrogation.directive.xml`                                                                                                                                                                         |
| `code-interrogation` | agent-inbox | `ai/directives/agent-inbox/code-interrogation.directive.xml` (вторая батарея: код-гигиена через архитектурную призму — native/idioms/literals/deps/testability/security/business-goal; грузится из `arch-interrogation` на `STEP_2`) |
| `posting-rules`      | agent-inbox | `ai/directives/agent-inbox/posting-rules.directive.xml` (правила постинга: формат ответа, suggestion-range, edit/delete guard, кандидат-теггинг)                                                                                     |

## 5. High-Level Architecture

```
[inbox getActionable]→[группировка/стадии/реестр]→ навык agent-inbox (list/loop/reset)
                                                       │ Ask «что берём»
                                                       ▼
                         [inbox-context: ВЕСЬ контекст MR одним вызовом]
                          │ worktree + repoLayout + changeset
                          │ stage + threads + drafts + package
                                                       │ факт-чек / code-review субагент (дедуп против тредов)
                                                       │ директива arch-interrogation → helicopter-отчёт
                                                       │ self-check + golden example
                                                       ▼ Ask-согласование (per answer)
                                             [vcs-reply: reply / discussion / line-comment]
```

Поддерживающий surface — в scope `vcs` (порт `Inbox`, `getCurrentUser`,
`createDiscussion`) и `cli` (команды `inbox`, `inbox-context`, `vcs-worktree`, `vcs-reply`).

## 6. Decision Log

Полный лог — `services/agent-inbox/README.md` §10 (D1–D36). Ключевые: локально (D1),
GitLab (D2), file-очередь+CLI (D5), стадии автономии A→B→C (D23/D33), карта
действий + dispatch (D30), worktree из repos.json/`~/Developer` (D31), нейминг
`vcs-*` для общих VCS-операций (D после ревью), `--vcs-source` (D29).

| ID  | Статус   | Запись                                                                                              | Почему                                                                                                                                                                                          | Отвергнутые альтернативы                                                                                                               |
| --- | -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D37 | `active` | `inbox-context` — отдельная команда, не флаг `inbox`                                                | `inbox` отвечает за список/реестр/дельту; `inbox-context` — за контекст одного MR. Разные зоны ответственности, разные входные параметры (`--ref` обязателен).                                  | (a) флаг `--context` на `inbox` — раздувает команду, смешивает ортогональные задачи; (b) расширение `--pick` — тот же аргумент         |
| D38 | `active` | `repoLayout` в ответе `inbox-context` — плоский список `dirs` + `rootFiles`                         | Даёт агенту мгновенное представление о структуре проекта: есть ли `packages/` (→ AX_PACKAGE_EXTRACTION_PROBE), `eslint.config.mjs` (→ не дублировать линтер), `specs/` (→ связанные спеки)      | Без `repoLayout` — агент делает отдельные `ls`/`glob`, теряет контекст                                                                 |
| D39 | `active` | Golden chat output example — отдельный файл `golden-chat-output.example.md`, не встроен в директиву | Файл можно показать агенту через `INCLUDE_ONCE("path")` или прочитать отдельно. Не раздувает директиву. Синхронизация с OutputFormat обязательна (NFC-06).                                      | (a) встроить в директиву — раздует до ~400 строк; (b) несколько example-файлов — избыточно для одной структуры                         |
| D40 | `active` | Self-check внутри `STEP_5` директивы, перед `Action`; remit-триггер в `SKILL.md` шаг 4              | Self-check — структурная проверка перед выдачей. Remit-триггер — принудительное перечитывание директивы перед каждым MR. Оба механизма — «максимально понятно объяснить ожидания», не гарантия. | (a) внешний валидатор вывода — требует парсинга и отдельного инструмента, overengineered; (b) только один из механизмов — недостаточно |

## 7. Scope Dependencies

- **Depends on:** `infra-base`, `vcs` (Inbox/discussions/identity), `cli` (команды), `ai-skills` (формат навыка).
- **Provides to:** оператору — рабочий процесс разбора входящих.

## 8. Handoff to Task Scaffolding

- **Статус:** research-спайк. Реализовано без формальных TSK (`@tasks: N/A`), осознанно.
- **Новые требования (эта итерация):**
  - `inbox-context` — новая CLI-команда (`cli/cmd/inbox-context/`): точка входа, оркестрация,
    регистрация в `gennady.ts` + `cmd/README.md`. Переиспользует `prepareWorktree`,
    `classifyMrStage`, `buildInboxClient`, `resolveStateDir`.
  - `golden-chat-output.example.md` — новый файл в `ai/directives/agent-inbox/`.
  - `<SelfCheck>` — новый блок в `arch-interrogation.directive.xml#STEP_5`.
  - Remit-триггер — новый текст в `SKILL.md` (и зеркале `.claude/skills/agent-inbox/SKILL.md`).
- **Если переходить на полный SDD:** декомпозиция на модули `inbox-core` (getActionable/стадии/реестр),
  `vcs-worktree`, `vcs-reply`, `inbox-context`, `inbox-queue` (deferred), `inbox-skill`.
- **Open risks:** worktree-ревью не прогнан end-to-end на реальном клоне; постинг line-comment не прогнан реальным POST.
