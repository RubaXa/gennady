# vcs-mr-management: Scope Specification

## scope-type

product

## 1. Vision & Primary Goal

Дополнение VCS-клиента и CLI возможностью создания и редактирования Merge Requests (GitLab + GitHub API; CLI — GitLab-first), а также CLI-командой чтения дискуссий. AI Agent должен пройти полный флоу: создать MR из текущей ветки, настроить draft/ready, labels, assignee, reviewer, прочитать дискуссии для контекста, отредактировать MR после правок. Без copy-paste: общее ядро методов API на абстрактном порте и единый CLI-паттерн через vcs-context-resolver.

**Provider split:** API-адаптеры реализуются для обоих провайдеров (GitLab + GitHub). CLI-команды — GitLab-first (vcs-context-resolver currently GitLab-only per parent FR-CTX-17). GitHub CLI — deferred до расширения resolver (следующий scope).

**Parent scope extensions:** этот scope добавляет методы `create` и `update` к существующему порту `VcsClientMergeRequests` (parent: `vcs.spec.md` FR-02). Методы `getList` и `getByIid` уже определены в parent spec для GitLab; для GitHub эти методы дореализуются из stub-заглушек (FR-DEP-01) — расширение parent FR-11 (ранее GitHub adapter ограничивался `getChanges` + `getFileContent`).

### Parent Spec Amendments

После реализации этого scope требуется обновить родительские спеки:

| Parent Spec         | What Changes                                                                                                                              | Trigger           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `vcs.spec.md` FR-02 | Добавить `create` и `update` в перечень методов `VcsClientMergeRequests`                                                                  | Новые порт-методы |
| `vcs.spec.md` FR-11 | Расширить GitHub adapter: `getChanges` + `getFileContent` → добавить `getList`, `getByIid`, `create`, `update`                            | FR-DEP-01         |
| `cli.spec.md` §4.1  | Добавить CLI-команды `vcs-mr-create`, `vcs-mr-edit`, `vcs-discussions` в таблицу команд с ссылкой на этот scope как канонический источник | FR-MR-22a         |

**Relationship to `review-issues`:** `vcs-discussions` — человекочитаемый вывод дискуссий MR (список с id/author/body/file:line/resolved). `review-issues` — XML-артефакт для AI Agent с полным контекстом ревью (meta, threads, cursor). Комплементарны: `vcs-discussions` для быстрого взгляда агенту, `review-issues` для передачи контекста AI-модели.

→ Parent scope: [../vcs.spec.md](../vcs.spec.md) (API), [../../cli/cli.spec.md](../../cli/cli.spec.md) (CLI)

## 2. Entity Inventory (Closed-World)

| Name                            | Type         | Purpose                                                                                                                                                     |
| ------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VcsMergeRequestCreateQuery`    | Value Object | Параметры создания MR: project, title, description, sourceBranch, targetBranch, draft, labels, assigneeIds, reviewerIds, milestoneId                        |
| `VcsMergeRequestUpdateQuery`    | Value Object | Параметры редактирования MR: project, iid, title?, description?, draft?, addLabels?, removeLabels?, assigneeIds?, reviewerIds?, targetBranch?, milestoneId? |
| `VcsClientMergeRequests.create` | Port Method  | Создать MR → `VcsMergeRequest`                                                                                                                              |
| `VcsClientMergeRequests.update` | Port Method  | Редактировать MR → `VcsMergeRequest`                                                                                                                        |
| `VcsGitlabMergeRequests.create` | Adapter      | GitLab: `POST /projects/:id/merge_requests`                                                                                                                 |
| `VcsGitlabMergeRequests.update` | Adapter      | GitLab: `PUT /projects/:id/merge_requests/:iid`                                                                                                             |
| `VcsGithubMergeRequests.create` | Adapter      | GitHub: `POST /repos/:owner/:repo/pulls`                                                                                                                    |
| `VcsGithubMergeRequests.update` | Adapter      | GitHub: `PATCH /repos/:owner/:repo/pulls/:number`                                                                                                           |
| `vcs-mr-create`                 | CLI Command  | Создать MR из текущей ветки (или явных параметров)                                                                                                          |
| `vcs-mr-edit`                   | CLI Command  | Редактировать существующий MR: title, description, draft↔ready, labels, assignee, reviewer                                                                  |
| `vcs-discussions`               | CLI Command  | Показать дискуссии MR (API getAll/getList уже есть)                                                                                                         |

### Существующие сущности (reused, не дублируются)

| Name                                | Source                                                                                                                      | Как используется                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VcsClientMergeRequests`            | `services/vcs-client/abstract/vcs-client-merge-requests.ts`                                                                 | Добавляются методы `create`, `update`                                                                                                                                                                                                                                                          |
| `VcsClientMergeDiscussions.getAll`  | `services/vcs-client/abstract/vcs-client-merge-discussions.ts`                                                              | Используется CLI `vcs-discussions` (уже существует, загружает все страницы)                                                                                                                                                                                                                    |
| `VcsClientMergeDiscussions.getList` | `services/vcs-client/abstract/vcs-client-merge-discussions.ts`                                                              | Не требуется для `vcs-discussions` — `getAll` загружает все дискуссии автоматически                                                                                                                                                                                                            |
| `resolveVcsContext`                 | `cli/cmd/_shared/vcs-context-resolver.ts`                                                                                   | Единая точка авто-детекта для всех VCS CLI-команд                                                                                                                                                                                                                                              |
| `VcsGitlabClient`                   | `services/vcs-client/gitlab/vcs-gitlab-client.ts`                                                                           | Расширяется: новые методы MR create/update                                                                                                                                                                                                                                                     |
| `VcsGithubClient`                   | `services/vcs-client/github/vcs-github-client.ts`                                                                           | Расширяется: новые методы PR create/update                                                                                                                                                                                                                                                     |
| `parseArgs`                         | `shared/common/parse-args.ts`                                                                                               | Парсинг CLI-аргументов                                                                                                                                                                                                                                                                         |
| `VcsMergeRequestByIidQuery`         | `services/vcs-client/abstract/vcs-client-merge-requests.ts`                                                                 | `VcsMergeRequestUpdateQuery` содержит поля `project` и `iid` (аналогично `ByIidQuery`), поэтому `ByIidQuery` не требуется для update. Может использоваться CLI `vcs-mr-edit` для опционального pre-check существования MR (даёт более читаемую ошибку `MR not found` вместо сырого 404 от API) |
| `VcsMergeRequest`                   | `services/vcs-client/entities/` (неявный тип — возвращается `getByIid`, `getList`; не оформлен как отдельный файл .type.ts) | Возвращаемый тип методов `create`, `update`, `getByIid`. **Минимальный контракт для CLI:** `{ webUrl: string, iid: string                                                                                                                                                                      | number, title: string }`. Адаптеры возвращают полный ответ провайдера (GitLab MR object / GitHub PR object); CLI использует только поля из минимального контракта. Полная типизация `VcsMergeRequest`— deferred до формализации типа в отдельном`.type.ts` |

## 3. Entity Surfaces

### `VcsMergeRequestCreateQuery`

- **Type:** Value Object
- **Purpose:** Параметры для создания нового Merge Request / Pull Request.
- **Public Properties:**
  - `project: string` — путь к проекту (group/repo или owner/repo)
  - `title: string` — заголовок MR
  - `description?: string` — описание в Markdown
  - `sourceBranch: string` — ветка-источник (то, что мерджим)
  - `targetBranch?: string` — целевая ветка (куда мерджим). Опционально на уровне VO; CLI всегда заполняет через каскад (см. FR-MR-11). Если не передан — адаптер использует default ветку провайдера (GitLab: `main`, GitHub: `base` repo default)
  - `draft?: boolean` — создать как draft/WIP (default: false)
  - `labels?: string[]` — список меток через запятую (GitLab) / массив (GitHub)
  - `assigneeIds?: (string | number)[]` — ID назначаемых пользователей
  - `reviewerIds?: (string | number)[]` — ID ревьюверов
  - `milestoneId?: string | number` — ID вехи

### `VcsMergeRequestUpdateQuery`

- **Type:** Value Object
- **Purpose:** Параметры для редактирования существующего Merge Request / Pull Request.
- **Public Properties:**
  - `project: string` — путь к проекту
  - `iid: string | number` — внутренний ID MR/PR
  - `title?: string` — новый заголовок
  - `description?: string` — новое описание
  - `draft?: boolean` — переключить draft/WIP статус
  - `addLabels?: string[]` — добавить метки (без удаления существующих)
  - `removeLabels?: string[]` — убрать метки
  - `assigneeIds?: (string | number)[]` — новые assignee
  - `reviewerIds?: (string | number)[]` — новые ревьюверы
  - `targetBranch?: string` — новая целевая ветка
  - `milestoneId?: string | number` — новая веха
- **Invariant:** Хотя бы одно опциональное поле должно быть передано (кроме `project` и `iid`). Валидация на уровне абстрактного порта `VcsClientMergeRequests.update` — адаптеры получают гарантированно непустой запрос.

### `VcsClientMergeRequests.create`

- **Type:** Port Method
- **Purpose:** Создать новый Merge Request / Pull Request.
- **Signature:** `create(query: VcsMergeRequestCreateQuery) → Promise<VcsMergeRequest>`
- **Returns:** Созданный MR/PR. Минимальный контракт возвращаемого объекта: `{ webUrl: string, iid: string | number, title: string }` — поля, гарантированно присутствующие у обоих провайдеров (GitLab: `web_url`, GitHub: `html_url` → оба мапятся в `webUrl`; GitLab: `iid`, GitHub: `number` → оба мапятся в `iid`).
- **SideEffect:** Network: POST-запрос к API провайдера.

### `VcsClientMergeRequests.update`

- **Type:** Port Method
- **Purpose:** Редактировать существующий Merge Request / Pull Request.
- **Signature:** `update(query: VcsMergeRequestUpdateQuery) → Promise<VcsMergeRequest>`
- **Returns:** Обновлённый MR/PR — тот же минимальный контракт `{ webUrl, iid, title }`.
- **SideEffect:** Network: PUT/PATCH-запрос к API провайдера.
- **Precondition:** Валидация на уровне порта: если ни одного опционального поля кроме `project`/`iid` не передано → `Error('At least one field to update is required')`. Адаптеры получают гарантированно непустой запрос.

### `VcsGitlabMergeRequests.create` (Adapter)

- **Type:** Adapter — implements `VcsClientMergeRequests.create`
- **Purpose:** GitLab: `POST /projects/:id/merge_requests` с маппингом полей:
  - `sourceBranch` → `source_branch`, `targetBranch` → `target_branch`, `description` → `description`
  - `draft` → поле `draft` в теле запроса (поддерживается GitLab API при создании)
  - `labels` → `labels` (строка через запятую), `assigneeIds` → `assignee_ids`, `reviewerIds` → `reviewer_ids`, `milestoneId` → `milestone_id`
- **Invariant:** При `draft: false` (default) поле `draft` НЕ передаётся в запросе — GitLab создаст обычный MR.

### `VcsGitlabMergeRequests.update` (Adapter)

- **Type:** Adapter — implements `VcsClientMergeRequests.update`
- **Purpose:** GitLab: `PUT /projects/:id/merge_requests/:iid` с маппингом:
  - `draft: true` → префикс `Draft: ` добавляется к `title` (или к существующему title если `title` не передан)
  - `draft: false` → префикс `Draft: ` / `WIP: ` убирается из `title`
  - **Если переданы и `draft`, и `title`:** `draft: true` → `title = "Draft: " + newTitle`; `draft: false` → `title = newTitle` (без префикса). Это интуитивное поведение: пользователь хочет и сменить заголовок, и установить draft-статус.
  - `addLabels` → `add_labels`, `removeLabels` → `remove_labels` (GitLab-специфичные поля)
- **Invariant:** Поле `draft` отсутствует в GitLab `PUT /merge_requests/:iid` API — управление только через title-префикс.

### `VcsGithubMergeRequests.create` (Adapter)

- **Type:** Adapter — implements `VcsClientMergeRequests.create`
- **Purpose:** GitHub: `POST /repos/:owner/:repo/pulls` с маппингом:
  - `sourceBranch` → `head`, `targetBranch` → `base`, `title` → `title`, `description` → `body`
  - `draft` → `draft` (булево поле, поддерживается GitHub API)
  - `labels` → `labels[]`, `milestoneId` → `milestone` (number), `assigneeIds` → `assignees[]`, `reviewerIds` → `reviewers[]`

### `VcsGithubMergeRequests.update` (Adapter)

- **Type:** Adapter — implements `VcsClientMergeRequests.update`
- **Purpose:** GitHub: `PATCH /repos/:owner/:repo/pulls/:number` с маппингом:
  - `title` → `title`, `description` → `body`, `targetBranch` → `base`, `draft` → `draft`
  - `addLabels` / `removeLabels` → преобразуются через `GET /pulls/:number` → compute new `labels[]` → `PATCH`

## 4. Requirements & Constraints

### 4.1 Functional Requirements

| ID                           | Требование                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API: MR Create**           |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-01                     | `VcsClientMergeRequests.create(query)` — порт: создать MR. `VcsMergeRequestCreateQuery` содержит: project, title, description?, sourceBranch, targetBranch, draft?, labels?, assigneeIds?, reviewerIds?, milestoneId?                                                                                                                                                                                                              |
| FR-MR-02                     | `VcsGitlabMergeRequests.create` — `POST /projects/:id/merge_requests` с параметрами: `source_branch`, `target_branch`, `title`, `description`, `draft` (булево поле), `labels`, `assignee_ids`, `reviewer_ids`, `milestone_id`                                                                                                                                                                                                     |
| FR-MR-03                     | `VcsGithubMergeRequests.create` — `POST /repos/:owner/:repo/pulls` с параметрами: `head` (sourceBranch), `base` (targetBranch), `title`, `body`, `draft`, `labels`, `assignees`, `reviewers`, `milestone`                                                                                                                                                                                                                          |
| FR-MR-04                     | `VcsMergeRequestCreateQuery.targetBranch` — опциональное поле на уровне VO. CLI всегда заполняет `targetBranch` через каскад (см. FR-MR-11). Для programmatic-потребителей: GitLab адаптер резолвит из `GET /projects/:id` → `default_branch`; GitHub адаптер из `GET /repos/:owner/:repo` → `default_branch`. При ошибке резолва → propagate API error                                                                            |
| **API: MR Edit**             |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-05                     | `VcsClientMergeRequests.update(query)` — порт: редактировать MR. `VcsMergeRequestUpdateQuery` содержит: project, iid + опциональные поля                                                                                                                                                                                                                                                                                           |
| FR-MR-06                     | `VcsGitlabMergeRequests.update` — `PUT /projects/:id/merge_requests/:iid` с параметрами: `title`, `description`, `add_labels`, `remove_labels`, `assignee_ids`, `reviewer_ids`, `milestone_id`. Draft через title-префикс (см. D-001)                                                                                                                                                                                              |
| FR-MR-07                     | `VcsGithubMergeRequests.update` — `PATCH /repos/:owner/:repo/pulls/:number` с параметрами: `title`, `body`, `draft`, `base`, `labels`                                                                                                                                                                                                                                                                                              |
| FR-MR-08                     | Draft ↔ Ready в GitLab: при `update({ draft: true })` → адаптер добавляет `Draft:` в title; `draft: false` → убирает `Draft:` / `WIP:`. При одновременной передаче `draft` и `title`: `draft: true` → `title = "Draft: " + newTitle` (если title уже не начинается с `Draft: ` / `WIP: ` — guard от дублирования); `draft: false` → `title = newTitle` (без префикса). Префикс применяется к ПЕРЕДАННОМУ title, не к существующему |
| FR-MR-09                     | Draft ↔ Ready в GitHub: через параметр `draft` в `PATCH /repos/:owner/:repo/pulls/:number` (нативное поле API). При одновременной передаче `draft` и `title` — оба применяются независимо                                                                                                                                                                                                                                          |
| **CLI: vcs-mr-create**       |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-10                     | `vcs-mr-create` — создать MR из текущей ветки. Использует `resolveVcsContext` для авто-детекта проекта и хоста. Обязательные параметры: `--title <text>`. Опциональные: `--description <text>`, `--target-branch <name>`, `--draft`, `--label <name>` (повторяемый), `--assignee <id>`, `--reviewer <id>`, `--milestone <id>`, `--dry-run`                                                                                         |
| FR-MR-10a                    | Отсутствует `--title` → stderr: `✖ --title is required`, exit 1                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-11                     | `vcs-mr-create` определяет sourceBranch из `git rev-parse --abbrev-ref HEAD`. targetBranch — каскад: (1) явный `--target-branch`, (2) `git remote show origin` (таймаут 5с) → HEAD branch, (3) fallback `main`. При ошибке/таймауте шага 2 — молчаливый fallback на `main` (не фатально, API вернёт понятную ошибку если ветка не та)                                                                                              |
| FR-MR-12                     | `vcs-mr-create` выводит URL созданного MR в stdout: `✓ MR !42 created: https://...`. `--dry-run`: `Would create MR: group/repo!42 host=gitlab.company.com  [DRY-RUN] no request sent`                                                                                                                                                                                                                                              |
| **CLI: vcs-mr-edit**         |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-13                     | `vcs-mr-edit` — редактировать существующий MR. Использует `resolveVcsContext`. Обязательные: `--ref <group/repo!iid>` (или `--project` + `--iid`). Опциональные: `--title`, `--description`, `--draft` / `--ready`, `--label`, `--unlabel`, `--target-branch`, `--assignee`, `--reviewer`, `--milestone`, `--dry-run`                                                                                                              |
| FR-MR-14                     | `--draft` и `--ready` — взаимоисключающие флаги для переключения статуса                                                                                                                                                                                                                                                                                                                                                           |
| FR-MR-15                     | `--label` (добавить) и `--unlabel` (убрать) — могут использоваться вместе, не заменяют весь набор меток                                                                                                                                                                                                                                                                                                                            |
| FR-MR-16                     | `vcs-mr-edit` выводит: `✓ MR !42 updated: https://...`. `--dry-run`: `Would update MR: group/repo!42 host=gitlab.company.com  [DRY-RUN] no request sent`                                                                                                                                                                                                                                                                           |
| **CLI: vcs-discussions**     |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-17                     | `vcs-discussions` — показать дискуссии MR. Использует `resolveVcsContext`. Обязательные: `--ref <group/repo!iid>` (или `--project` + `--iid`). Опциональные: `--all` (включить resolved), `--json` (машинный вывод)                                                                                                                                                                                                                |
| FR-MR-18                     | `vcs-discussions` по умолчанию показывает только незарезолвленные дискуссии. Формат вывода: `[shortId] author: body (file:line)` для line-комментариев; `[shortId] author: body` для общих дискуссий (без file:line); `(resolved)` для зарезолвленных (при `--all`); `(no text)` для пустого body; многострочный body — только первая строка + `...`. Многонотные треды: каждая нота на отдельной строке с отступом                |
| FR-MR-19                     | `vcs-discussions` использует существующий `VcsClientMergeDiscussions.getAll()` — **API не требует изменений**. `--dry-run`: `Would fetch discussions: group/repo!42 host=gitlab.company.com  [DRY-RUN] no request sent`                                                                                                                                                                                                            |
| FR-MR-19a                    | Пустой результат (0 дискуссий) → stdout: `No discussions found for group/repo!42`, exit 0. При `--json`: `[]`                                                                                                                                                                                                                                                                                                                      |
| FR-MR-19b                    | `--json` вывод: массив объектов `[{ id, shortId, author, body, file?, line?, resolved, notes: [{ author, body, createdAt }] }]`. Поля `file`/`line` отсутствуют для общих дискуссий. `notes` — массив всех заметок в треде (первая — открывающая, остальные — ответы)                                                                                                                                                              |
| **Shared**                   |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-20                     | Все CLI-команды используют `vcs-context-resolver.ts` для авто-детекта — без дублирования логики разрешения контекста                                                                                                                                                                                                                                                                                                               |
| FR-MR-21                     | Все CLI-команды поддерживают `--host` / `--vcs-source` для self-hosted инсталляций                                                                                                                                                                                                                                                                                                                                                 |
| FR-MR-22                     | Все CLI-команды поддерживают `--dry-run` — выводят что было бы сделано без вызова API в формате: `Would <operation>: <ref> host=<host>  [DRY-RUN] no request sent`. Формат консистентен с `vcs-approve --dry-run` (parent CLI spec §3.13)                                                                                                                                                                                          |
| FR-MR-22a                    | Интеграция в gennady.ts: три новых case в switch команд + три записи в help-таблицу (секция «Commands»). Синхронно обновить `cli/cmd/README.md` (таблица команд + use cases). Следовать NFC-23 из parent `cli.spec.md`. CLI-контракты для новых команд определены в этом scope (FR-MR-10–FR-MR-31); parent CLI spec НЕ содержит дублирующих FR-записей для этих команд                                                             |
| **Error Paths**              |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-23                     | Сетевые ошибки / таймаут (fetch) → stderr: `✖ Network error: <message>`, exit 1                                                                                                                                                                                                                                                                                                                                                    |
| FR-MR-24                     | API 401/403 (невалидный токен / нет прав) → stderr: `✖ API error [403]: <body>`, exit 1                                                                                                                                                                                                                                                                                                                                            |
| FR-MR-25                     | API 404 (проект/MR не найден) → stderr: `✖ Not found: group/repo!42`, exit 1                                                                                                                                                                                                                                                                                                                                                       |
| FR-MR-26                     | API 409/422 (конфликт / невалидные параметры) → stderr: `✖ GitLab API error [409]: <body>`, exit 1. Тело ответа провайдера транслируется как есть для диагностики                                                                                                                                                                                                                                                                  |
| FR-MR-26a                    | GitHub update: при использовании `addLabels`/`removeLabels` адаптер делает промежуточный `GET /pulls/:number` для получения текущих labels. При ошибке этого GET → stderr: `✖ Failed to fetch current labels: <message>`, exit 1                                                                                                                                                                                                   |
| FR-MR-27                     | Git не установлен / не в PATH → stderr: `✖ git не найден. Установите git и повторите.`, exit 1                                                                                                                                                                                                                                                                                                                                     |
| FR-MR-28                     | Не git-репозиторий → stderr: `✖ Не удалось определить текущую ветку: не найден git-репозиторий.`, exit 1                                                                                                                                                                                                                                                                                                                           |
| FR-MR-29                     | Detached HEAD → stderr: `✖ HEAD не указывает на ветку (detached HEAD). Укажите source branch явно.`, exit 1                                                                                                                                                                                                                                                                                                                        |
| FR-MR-30                     | `--ref` указывает на несуществующий MR → stderr: `✖ MR group/repo!42 не найден.`, exit 1                                                                                                                                                                                                                                                                                                                                           |
| FR-MR-30a                    | Некорректный формат `--ref` (нет `!`, пустой iid, нечисловой iid) → stderr: `✖ Invalid ref format. Expected: <group/repo>!<iid>`, exit 1                                                                                                                                                                                                                                                                                           |
| FR-MR-30b                    | Вызов `vcs-mr-edit` или `vcs-discussions` без `--ref` и без `--project`+`--iid` → stderr: `✖ Specify --ref <group/repo>!<iid> or --project and --iid`, exit 1                                                                                                                                                                                                                                                                      |
| FR-MR-31                     | Ни одного поля для update не передано → валидация на уровне абстрактного порта выбрасывает `Error('At least one field to update is required')`. CLI `vcs-mr-edit` ловит эту ошибку и выводит: `✖ At least one field to update is required`, exit 1                                                                                                                                                                                 |
| **Prerequisites (enablers)** |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-DEP-01                    | GitHub-реализация `getList` и `getByIid` — доделать из текущих stub-заглушек до рабочих: `GET /repos/:owner/:repo/pulls` (getList), `GET /repos/:owner/:repo/pulls/:number` (getByIid). GitHub CLI команды — deferred до расширения `vcs-context-resolver` (следующий scope)                                                                                                                                                       |

### 4.2 Non-Functional Constraints

- **NFC-01**: Zero runtime dependencies (fetch — built-in Node.js 22+)
- **NFC-02**: Все экспортируемые сущности покрыты JSDoc-контрактами (`@purpose`, `@param`, `@returns`, `@sideEffect`)
- **NFC-03**: File headers: `// @file:`, `// @consumers:`, `// @tasks:`
- **NFC-04**: Общий vcs-context-resolver — без копипасты логики авто-детекта между командами
- **NFC-05**: Именование CLI-команд: `vcs-<операция>` (консистентно с `vcs-approve`, `vcs-reply`, etc.)
- **NFC-06**: Именование query-типов: `VcsMergeRequest<Operation>Query` (консистентно с `VcsMergeRequestApproveQuery`, `VcsMergeRequestChangesQuery`)

### 4.3 Out-of-Scope

- Merge (мёрдж) MR — deferred (агент не мёрджит)
- Close/reopen MR — deferred (через `vcs-mr-edit` можно будет добавить при необходимости)
- Subscribe/unsubscribe — deferred
- MR rebase — deferred
- Issue CRUD — deferred (отдельный scope)
- GitHub Discussions, Inbox, Pipeline — deferred (существующий `vcs-github.task.spec.md`)
- Batch-операции (массовое создание/редактирование MR)

## 5. High-Level Architecture

```
services/vcs-client/
├── entities/
│   ├── vcs-merge-request-create-query.type.ts   (NEW)
│   └── vcs-merge-request-update-query.type.ts   (NEW)
├── abstract/
│   └── vcs-client-merge-requests.ts             (MODIFY: +create, +update)
├── gitlab/
│   └── vcs-gitlab-merge-requests.ts             (MODIFY: +create, +update impl)
└── github/
    └── vcs-github-merge-requests.ts             (MODIFY: +create, +update, +getList, +getByIid)

cli/cmd/
├── vcs-mr-create/                               (NEW dir)
│   ├── vcs-mr-create.cmd.ts
│   └── help.ts
├── vcs-mr-edit/                                 (NEW dir)
│   ├── vcs-mr-edit.cmd.ts
│   └── help.ts
├── vcs-discussions/                             (NEW dir)
│   ├── vcs-discussions.cmd.ts
│   └── help.ts
└── _shared/
    └── vcs-context-resolver.ts                  (REUSE — без изменений, CLI GitLab-only)
```

**Интеграция в gennady.ts:** добавить три новых case в switch команд + три записи в help-таблицу.

### 5.1 CLI Command Pattern (единый для всех VCS команд)

```
1. parseArgs(argv) — разбор CLI-аргументов
2. resolveVcsContext(args) — авто-детект проекта, хоста, токена
3. new VcsGitlabClient({ baseUrl, token }) — создание клиента
4. client.MergeRequests.<operation>(query) — вызов API (vcs-discussions: client.MergeDiscussions.getAll(query))
5. Вывод результата в stdout / ошибки в stderr
```

Все новые команды следуют этому паттерну (см. `vcs-approve.cmd.ts` как референс).

**Особенность `vcs-mr-create`:** `resolveVcsContext` используется для получения проекта и хоста; MR ещё не существует — iid не требуется. Команда передаёт `project` и `branch` в `VcsCliArgs`; resolver возвращает `VcsCliContext` без `iid` (поле опционально в `VcsCliContext`). Ошибка «MR не найден» из resolver'а НЕ является фатальной для create-команды.

## 6. Decision Log

### D-001 — Префикс `Draft:` для GitLab draft-статуса

- **Status:** active
- **Why:** GitLab API не имеет отдельного поля `draft` для MR update (в отличие от создания). Статус draft/WIP управляется через префикс `Draft:` или `WIP:` в начале `title`. При `create` — поле `draft` в теле запроса существует, но при `update` — только через `title`. Адаптер `update` маппит `draft: true` → добавляет `Draft: ` в начало title; `draft: false` → убирает. При одновременной передаче `draft` и `title`: `draft: true` → `title = "Draft: " + newTitle`; `draft: false` → `title = newTitle` (без префикса). Это интуитивное поведение: пользователь хочет и сменить заголовок, и установить draft-статус.
- **Risk accepted:** Если пользователь вручную поставил `Draft:` в title, а мы не знаем — логика «убрать префикс» всё равно сработает корректно (убираем и `Draft: `, и `WIP: `).
- **Rejected alternatives:** Отдельный эндпоинт `/merge_requests/:iid` с query-параметром `?draft=true` — такого нет в GitLab API. Отказ при одновременной передаче `draft` + `title` — нарушает принцип наименьшего удивления.

### D-002 — GitHub support: API yes, CLI deferred

- **Status:** active
- **Why:** API-адаптеры (create, update, getList, getByIid) реализуются для GitHub в этом scope. CLI-команды — GitLab-only (vcs-context-resolver parent FR-CTX-17 ограничивает GitLab). GitHub CLI — deferred до расширения resolver (следующий scope). FR-DEP-01 покрывает реализацию GitHub stub-методов для API.
- **Risk accepted:** GitHub API реализован, но не протестирован через CLI (только unit-тесты адаптеров). Полноценное CLI-тестирование — при добавлении GitHub CLI в следующем scope.
- **Rejected alternatives:** Реализовать GitHub CLI сейчас — требует изменения vcs-context-resolver, что противоречит parent CLI spec FR-CTX-17. Ждать полной реализации GitHub-провайдера — блокирует MR create/edit API.

### D-003 — `VcsMergeRequestCreateQuery.targetBranch` default-резолв

- **Status:** active
- **Why:** Большинство проектов используют `main` как целевую ветку. CLI применяет каскад: (1) явный `--target-branch`, (2) `git remote show origin | grep 'HEAD branch'` для авто-детекта дефолтной ветки, (3) fallback `main`. Каскад описан и в FR-MR-04, и в FR-MR-11 — без расхождений.
- **Risk accepted:** `git remote show origin` требует сетевого запроса к remote. При недоступности remote → fallback `main`. При ошибке GitLab/GitHub API (несуществующая целевая ветка) → понятная ошибка (FR-MR-26).
- **Rejected alternatives:** Всегда требовать `--target-branch` — неудобно для агента (дополнительный шаг). Только `main` без авто-детекта — сломается на проектах с `master`.

### D-004 — `vcs-discussions` CLI: новая команда, старый API

- **Status:** active
- **Why:** `VcsClientMergeDiscussions.getAll()` и `getList()` уже существуют и покрывают нужную функциональность. CLI-команда — тонкая обёртка. Никаких изменений в abstract-порт не требуется.
- **Risk accepted:** Формат вывода может измениться при добавлении GitHub Discussions (deferred).
- **Rejected alternatives:** Расширять `review-issues` для вывода сырого списка — смешивает домены (review-issues = XML-артефакт для AI, vcs-discussions = человекочитаемый вывод для агента).

## 7. Module Map

### 7.1 Modules

- **vcs-mr-client** — API-расширения: `create` + `update` на `VcsClientMergeRequests`, новые query-типы, GitLab + GitHub адаптеры
- **vcs-mr-cli** — CLI-команды: `vcs-mr-create`, `vcs-mr-edit`, `vcs-discussions`

### 7.2 Handoff to Task Scaffolding

- **Primary input:** `specs/vcs/vcs-mr-management/vcs-mr-management.spec.md`
- **Areas requiring decomposition:**
  1. API query types + abstract port changes (шаред-ядро, без провайдеров)
  2. GitLab adapter implementation (create + update)
  3. GitHub adapter implementation (create + update + getList + getByIid — см. FR-DEP-01)
  4. CLI `vcs-mr-create` command
  5. CLI `vcs-mr-edit` command
  6. CLI `vcs-discussions` command
  7. Registration in gennady.ts + help + README
- **Named abstractions:** `VcsMergeRequestCreateQuery`, `VcsMergeRequestUpdateQuery`, `VcsClientMergeRequests.create`, `VcsClientMergeRequests.update`
- **Open risks:**
  - GitHub CLI — deferred до расширения `vcs-context-resolver` (следующий scope). API-адаптеры реализованы, но CLI-команды работают только с GitLab
  - GitHub `getList` — может потребоваться пагинация для больших репо
  - Draft-статус GitLab через `title`-префикс — хрупкий контракт, может сломаться при смене GitLab API
  - `assigneeIds` / `reviewerIds` — требуют знания ID пользователей GitLab/GitHub; CLI может потребовать `--assignee @username` с резолвом username → ID
