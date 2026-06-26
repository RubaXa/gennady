# ТЗ: расширение VCS-инструментов для agent-inbox

> Передаётся агенту-исполнителю (SDD). Это **требования**, не реализация. Оформить как
> задачи/тикеты через обычный SDD-флоу (`sdd-continue` → `sdd-scaffold` → `sdd-execute`).
> Затрагиваемые скоупы: `vcs` (порт `vcs-client` + GitLab-адаптер), `cli` (команды),
> `agent-inbox` (SKILL.md + директивы).

## Контекст и цель

`agent-inbox` ведёт ревью входящих/исходящих GitLab MR. Текущий VCS-инструментарий:
`inbox`, `vcs-worktree`, `review-issues`, `vcs-reply` (reply/line/discussion/resolve),
`vcs-approve`. Порт `vcs-client` уже умеет: `approve`, `resolveDiscussion`, `addNote`,
`createDiscussion`, `getChanges` (диф по API), `getFileContent`, `getByIid`, `listDraftNotes`.

Цель — закрыть дыры жизненного цикла ревью, чтобы он работал без ручных обходов: возможность
**отозвать approve**, **погасить todo**, **править/удалять свой коммент**, и — приоритет —
**предлагать точные правки apply-able suggestion-блоками** (особенно опечатки).

## Общие требования (для всех инструментов)

- **Язык:** operator-facing вывод и help — русский; код, идентификаторы, флаги, статус-токены — English (см. `AX_OPERATOR_LANGUAGE`).
- **Токен:** только ENV `GITLAB_PERSONAL_TOKEN`; не логировать, не коммитить.
- **Контекст MR:** переиспользовать `_shared/vcs-context-resolver.ts` (как `vcs-approve`/`vcs-reply`): `--project`/`--iid`/`--ref`/`--vcs-source`.
- **Постинг — без dry-run-шага во флоу** (флаг в CLI можно оставить для ручной отладки, как сейчас).
- **Тесты:** каждый новый метод порта — unit на GitLab-адаптер (mock graphql/REST: успех + ошибка); каждая CLI-команда/новый item — unit (валидация ввода, dry-run, live, ошибка).
- **Архитектура:** методы порта — в `services/vcs-client/abstract/*`, реализация — в `services/vcs-client/gitlab/*`, query-типы — в `services/vcs-client/entities/*` (как `vcs-resolve-discussion-query.type.ts`).

---

## TOOL-1 — Отзыв approve (unapprove) · Tier 1

**Зачем:** approve сейчас в одну сторону. Нужно откатить: MR изменился после моего approve, либо
коллега нашёл проблему. Без этого ревьюер не может снять своё одобрение.

- **Порт:** `MergeRequests.unapprove(query: VcsMergeRequestApproveQuery): Promise<void>` (переиспользовать тип запроса от `approve`).
- **GitLab-адаптер:** REST `POST /projects/:id/merge_requests/:iid/unapprove` (симметрично текущему `approve`). Если approve реализован через GraphQL — использовать `mergeRequestUnapprove`.
- **CLI:** флаг на существующей команде — `vcs-approve --revoke` (синоним `--unapprove`). Рекомендуется флаг, а не отдельная команда: симметрия и обнаружимость.
- **Acceptance:**
  - `vcs-approve --revoke --project P --iid N` снимает мой approve, печатает подтверждение по-русски.
  - dry-run печатает «would unapprove …», API не вызывает.
  - ошибка транспорта/прав пробрасывается с понятным сообщением.

---

## TOOL-2 — Todo done (закрытие) · Tier 1

**Зачем:** pending-todo в GitLab не гаснет сам (из-за этого влитые MR прежде утекали в inbox —
мы лечим фильтрами). Авторитетное закрытие = погасить todo после реакции. Убирает зависимость от
стадийных эвристик и чистит todo-список GitLab.

- **Данные (предусловие):** `getActionable` должен донести идентификатор(ы) todo по каждому MR.
  Добавить в GraphQL-запрос `currentUser.todos.nodes { id }` и в `VcsActionableMr` поле
  `todoIds: string[]` (пусто для MR из connection-источников reviewRequested/authored — у них нет todo).
- **Порт:** `Inbox.markTodoDone(query: { todoId: string }): Promise<void>` (точечно) — и/или
  `Inbox.markDoneForMr(query: { project, iid }): Promise<void>` (закрыть все todo по MR).
- **GitLab-адаптер:** GraphQL `todoMarkDone(input: { id })`. Для `markDoneForMr` — сперва найти todo по MR в `getActionable`/свежем запросе, затем `todoMarkDone` по каждому.
- **CLI:** `vcs-todo --done <ref>` (закрыть todo(s) по MR) — или `--id <todoId>`.
- **Интеграция со скиллом:** добавить в финализацию (шаг «Закрыть») необязательный шаг — после
  того как по MR всё отвечено/заапрувлено, предложить погасить todo. Дополняет, не заменяет
  текущий actionable-фильтр.
- **Acceptance:**
  - `getActionable` возвращает `todoIds` (≥0) по todo-источникам; connection-источники — `[]`.
  - `vcs-todo --done <ref>` гасит todo, печатает результат; нет todo → внятное сообщение, не ошибка.
  - dry-run / ошибка — как в общих требованиях.

---

## TOOL-3 — Править / удалять свой коммент · Tier 2

**Зачем:** опечатка в своём комменте, ретракт неверного замечания, апдейт после ответа автора.
Сейчас можно только добавлять.

- **Данные (предусловие):** артефакт `review-issues` должен нести `noteId` у каждой реплики
  (сейчас есть `uid`/`role`, нет id). Без id нельзя адресовать правку.
- **Порт:** `MergeDiscussions.updateNote(query: { project, iid, noteId, body }): Promise<void>`;
  `MergeDiscussions.deleteNote(query: { project, iid, noteId, discussionId? }): Promise<void>`.
- **GitLab-адаптер:** REST `PUT /projects/:id/merge_requests/:iid/notes/:note_id` (или
  `.../discussions/:discussion_id/notes/:note_id` для реплики в треде); `DELETE` — те же пути.
- **CLI:** расширить `vcs-reply` JSON-item: `{ "noteId": "...", "body": "..." }` = правка;
  `{ "noteId": "...", "delete": true }` = удаление.
- **Guard (обязателен):** править/удалять **только свои** заметки — проверять `author == getCurrentUser().login`; чужую заметку трогать отказываться с явной ошибкой.
- **Acceptance:**
  - правка своей заметки меняет тело; удаление — убирает; чужая → отказ с понятным сообщением.
  - `review-issues --all` отдаёт `noteId` по каждой реплике.
  - dry-run / ошибка — как в общих требованиях.

---

## TOOL-4 — Suggestion-блоки (apply-able правки) · Tier 2 · ПРИОРИТЕТ

**Зачем:** когда ревьюер предлагает **конкретную точную правку и знает итоговый текст** (опечатка,
очевидная мелочь, переименование), это должно прийти не прозой, а **apply-able suggestion** —
автор жмёт «Apply suggestion» в GitLab. Это две части: формат постинга и поведение ревью.

### 4a. Формат постинга (`vcs-reply` + posting-rules)

- **Синтаксис GitLab:** в line-комментарии тело содержит блок:

  ````
  ```suggestion:-0+0
  исправленная строка
  ```
  ````

  `:-0+0` — диапазон: сколько строк выше/ниже закомментированной заменить. Одна строка = `-0+0`;
  замена 3 строк начиная с текущей = `-0+2`; захват строки выше = `-1+0`.

- **CLI:** у line-item `vcs-reply` добавить необязательное поле `suggestion` (строка/массив строк
  заменяющего текста) и `suggestionRange?: { above: number, below: number }` (default `0/0`) —
  команда сама собирает корректный ` ```suggestion:-A+B `-блок. Либо: разрешить готовый блок
  в `body` и задокументировать синтаксис. Рекомендуется структурированное поле `suggestion`
  (меньше шансов ошибиться в разметке).
- **Позиция:** как у обычного line-комментария (`newPath`, `newLine`/`oldLine`, sha из `diff_refs`).
- **posting-rules.directive.xml:** задокументировать формат suggestion и правило «точная правка → suggestion, не проза».
- **Acceptance:**
  - line-item с `suggestion` постит валидный suggestion-блок с правильным `:-A+B` под диапазон;
  - в GitLab у комментария появляется «Apply suggestion»;
  - многострочный диапазон считается корректно; dry-run печатает итоговый блок.

### 4b. Поведение ревью (code-interrogation + SKILL.md)

- **Опечатки искать обязательно.** Добавить в `code-interrogation.directive.xml` пробу `TYPO`:
  отдельный проход по изменённым строкам — орфография/опечатки в идентификаторах (в рамках стиля
  проекта), строках, комментариях, доках. Каждая найденная опечатка → кандидат-замечание **вида
  suggestion** (с точным исправлением), а не прозой.
- **Правило «точная правка → suggestion».** Любой кандидат, где правка механическая и итог
  известен точно (опечатка, очевидная замена, мелкий рефактор в одну строку), оформляется
  suggestion-блоком. Прозой остаётся только то, что требует обсуждения/решения автора.
- **Не шуметь.** Suggestion — для бесспорных правок; спорное — обычное замечание с вопросом.
- **Acceptance (директива/скилл):** в кандидатах появляется `kind: suggestion`; SKILL.md шаг 7
  (меню действий) умеет постить выбранные suggestion-кандидаты через `vcs-reply` line+suggestion.

---

## TOOL-5 — CLI над `getChanges` / `getFileContent` · Tier 3 (дёшево)

**Зачем:** быстрый просмотр без поднятия worktree (когда клона нет/не нужен полный код). Методы
порта **уже есть** — нужна только CLI-обёртка.

- **CLI:** `vcs-diff --ref <ref>` — печатает unified diff (через `getChanges`);
  `vcs-cat --ref <ref> --path <file>` — содержимое файла на head MR (через `getFileContent`).
- **Acceptance:** оба печатают результат/`null`-случай внятно; ошибки пробрасываются.

---

## TOOL-6 — Pipeline / CI-статус · Tier 3

**Зачем:** событие `ci_failed` говорит «красный», но не _почему_. Для автор-флоу и решения
«можно ли апрувить» нужен статус и упавшие джобы.

- **Порт:** `MergeRequests.getPipeline(query: { project, iid }): Promise<{ status, jobs: {name,status}[] }>`.
- **GitLab-адаптер:** GraphQL `mergeRequest.headPipeline { status jobs { nodes { name status } } }`.
- **CLI:** `vcs-pipeline --ref <ref>` — статус + список упавших джобов.
- **Acceptance:** показывает статус и упавшие джобы; нет пайплайна → внятное сообщение.

---

## Вне скоупа (позже)

- Полный автор-цикл: merge, rebase, draft↔ready, добавление/снятие ревьюеров.
- GitHub (только GitLab сейчас).
- Применение suggestion **со стороны ревьюера** (Apply жмёт автор; нам нужно только корректно их _постить_).

## Сводка приоритетов

| ID     | Инструмент                                                             | Tier          | Новый метод порта? |
| ------ | ---------------------------------------------------------------------- | ------------- | ------------------ |
| TOOL-1 | unapprove (`vcs-approve --revoke`)                                     | 1             | да                 |
| TOOL-2 | todo done (`vcs-todo --done`) + `todoIds` в getActionable              | 1             | да                 |
| TOOL-3 | edit/delete своей заметки (`vcs-reply`) + `noteId` в review-issues     | 2             | да                 |
| TOOL-4 | suggestion-блоки + проба `TYPO` + правило «точная правка → suggestion» | 2 (приоритет) | нет (расширение)   |
| TOOL-5 | `vcs-diff` / `vcs-cat` (CLI над getChanges/getFileContent)             | 3             | нет                |
| TOOL-6 | `vcs-pipeline` (CI-статус)                                             | 3             | да                 |
