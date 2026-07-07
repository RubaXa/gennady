# agent-inbox-take — конвейер разбора одного MR

Запускается когда агент берёт MR в работу (`review_needed` или `reply_needed`).
Не пересказывает директивы — заставляет их читать.

---

## Шаг 0 — Обязательное чтение

Перед любым действием — прочитай эти файлы. Не по памяти, не «я знаю». Открой и прочитай:

1. **`ai/directives/agent-inbox/arch-interrogation.directive.xml`**
   - `<ExecutionPlan>` — STEP_0..STEP_5; STEP_5 action 0 = решение по транспорту ДО вывода
   - `<SelfCheck>` — пункты 0/0b/1..6; 0b = транспорт объявлен и виджет использован при наличии
   - `AX_CHANGESET_SCALE` — scope-итог: размер, категории, карта файлов
   - `AX_VISUAL_TRANSPORT` — виджет = медиум в чате при наличии; ASCII только fallback; Mermaid — только GitLab
   - `AX_VISUALIZE_WHEN_RELATIONAL` — когда рисовать диаграмму
   - `AX_REPORT_ASSEMBLY` — ЕДИНЫЙ отчёт, не кусками
   - `AX_ADVERSARIAL_DEFAULT` — вердикт unjustified пока не доказано обратное
   - `AX_PRIOR_DISCUSSION_AWARENESS` — не дублировать существующие треды

2. **`ai/directives/agent-inbox/code-interrogation.directive.xml`**
   - `<Probes>` — 9 проб: NAT/IDIOM/LIT/DEP/GLOBAL/TEST/SEC/BIZ/TYPO
   - `<ScopeGuard>` — не дублировать линтер

3. **`ai/directives/agent-inbox/golden-chat-output.example.md`**
   - Эталон структуры вывода в чат
   - ВСЕ секции обязательны

---

## Шаг 0a — Драфты и контекст обсуждений (ДО ревью)

Драфты — временный инструмент расследования, не перманентный артефакт. После ревью удаляются.

1. **Загрузить драфты и свои треды:**
   ```
   vcs-discussions --url <webUrl> --my --with-drafts --json
   ```
   → `my_drafts` = вектор для углубления расследования (о чём я уже думал, но ещё не постил)
   → `my_threads` = что я уже писал (для дедупликации)

2. **Передать сабагентам — через Context task-файла** (не отдельными полями): `prior_threads` +
   `my_drafts` + `my_login` войдут в обогащение `## Context` на шаге 2, вместе с `worktree.path`,
   `diff_refs`, `base`, `ref`, `webUrl` — сабагент получает ОДИН путь к файлу, всё остальное уже там.

3. **ПОСЛЕ ревью, ПЕРЕД постингом (шаг 4):**
   ```
   vcs-draft-note --url <webUrl> --delete-all    # драфты отслужили — удалить
   vcs-discussions --url <webUrl> --all --json    # ВСЕ дискуссии (не только --my)
   ```
   → Сверка на дубликаты (`AX_POSTING_NO_DUPLICATES`)
   → Применение `<ThreadModel>` + `ReactionMatrix` к чужим тредам (peer-said-same → 💯 БЕЗ resolve — владелец закроет сам; свой дубликат чужого → resolve СВОЙ; peer-said-different → reply)

---

## Шаг 1 — Скаут

**Ролевая развилка:**
- `myRole=author` → загрузить `arch-interrogation` в режиме `<AuthorMode>` (вместо adversarial interrogation). **Приоритет:** `role=author` + `headChanged != none` → сначала `update-review` (проверить что изменилось), затем `AuthorMode` (обновить сводку). `headChanged == none` → сразу `AuthorMode`.
- `myRole=reviewer` → стандартный adversarial-разбор через `arch-interrogation`.

1. `npx tsx ~/Developer/gennady/cli/gennady.ts inbox-context --url <webUrl> --vcs-host=<host>`
   **Сразу после:** прочитай содержимое worktree (`ls <path>`). Один запрос прав на всю директорию.
2. `git -C <path> diff --numstat <base>..HEAD` + `--name-status`
3. Разложи файлы по дорожкам: **security**(всегда) / **logic** / **ui** / **tests** / **docs** / **config**
4. **Транспорт (action 0):** проверь наличие виджета (`mcp__visualize__show_widget`); объяви первой строкой «чат, widget (инструмент найден)» или «чат, ASCII (виджет недоступен)». Выведи карту файлов + таблицу категорий; реляционную диаграмму — виджетом при наличии, ASCII только как fallback.
5. **Выбор директивы:** проверь `headChanged.kind` из ответа `inbox-context`:
   - `kind == "fast_forward"` И мои треды непусты (или я в `approvedBy`) → `INCLUDE_ONCE("ai/directives/agent-inbox/update-review.directive.xml")` — шаги 2–4 skip, сразу к синтезу по директиве.
   - Иначе → полный `arch-interrogation` + `code-interrogation` (текущее поведение).

---

## Шаг 2 — План ревью → болванки → обогащение (МЕХАНИЧЕСКИ, без решений агентом)

**Всегда документный конвейер.** Агент НИКОГДА не начинает анализ без материализованных task-файлов.
Ни один сабагент не получает задание «на словах» — только через файл (AI-36, D57).

1. **Проверь `reviewPlanRequired`** из ответа `inbox-context`:
   - `false` → план не нужен (`reply_needed` / `author`). Пропусти шаг 2, иди к шагу 3.
   - `true` → **HALT.** Не читай файлы, не анализируй. Определи `--base`:

2. **Выбери `--base`:**
   - `headChanged.kind == "fast_forward"` + `lastReviewedHeadSha` непуст → `--base <lastReviewedHeadSha>` (дельта-план: только изменившиеся файлы)
   - Иначе (первый ревью / `rewritten` / `none`) → `--base <worktree.base>` (полный план)

3. **Материализуй болванки:**
   ```
   npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --path <worktree.path> --base <выбранный base> --scaffold --ref <ref>
   ```
   → `{ scaffolded: true, dir, plan, tasks: [...] }` — пути `PLAN.md` и `tasks/*.task.md`. `mode: inline` даёт одну болванку `tasks/review.task.md`; `mode: fan_out` — по одной на трек (кроме треков с `"skip review"` в `focus` — для них файл не диспетчерится).

4. **Обогати `## Context` каждой болванки** (оркестратор, не механика): то, что код не знает — какие сущности важны в файлах ЭТОЙ дорожки, что уже обсуждалось в `prior_threads`/`my_drafts` (`my_login` — для дедупликации), цель MR, на что смотреть. Плюс факты для автономного заполнения без обратных вопросов: `worktree.path`, `diff_refs`, `base`, `ref`, `webUrl`. Минимальный контекст по файлам дорожки — **не** пересказ всего MR.
   - **Security-болванка:** несмотря на то что её `## Scope` содержит только security-classified файлы — в `## Context` явно допиши «смотри ВЕСЬ дифф, не только Scope» (контекст безопасности требует полной картины).
   - Поставь `status: enriched` во frontmatter каждого файла.

5. **Гейт перед диспатчем:**
   ```
   npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --validate <dir> --stage enriched
   ```
   `{ok: false}` (пустой `## Context` у кого-то из файлов) → допиши и повтори. Диспатч (шаг 3) — только после `{ok: true}`.

**Агент НЕ принимает решений:**
- Не считает файлы/строки вручную (это сделала команда)
- Не решает «инлайн или сабагенты» (это в `ReviewPlan.mode`)
- Не выбирает пробы (это в `ReviewTrack.focus`)
- Не выбирает директиву (это в `ReviewTrack.directive`)
- Не классифицирует файлы по дорожкам (это сделала команда)

---

## Шаг 3 — Диспатч по task-файлам

**Каждому сабагенту — ровно один вход:** путь его task-файла + инструкция «прочитай `## Scope` и
`## Context`, загрузи директиву из `track.directive` (см. `## Scope`), прогони пробы из `focus`,
заполни `## Findings` / `## Candidates` / `## Verdict` по схеме файла, поставь `status: filled`».
Отчёт — GitLab-flavored markdown, диаграммы — mermaid (в файле; в чат их не выводить, см. Шаг 4).

`mode: inline` → сабагентов нет, сам заполняешь единственную болванку `tasks/review.task.md`.

Жди ВСЕХ сабагентов.

**Гейт после заполнения:**
```
npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --validate <dir>
```
`{ok: false}` → ошибки привязаны к конкретному файлу (`errors[].file`). Верни КОНКРЕТНОМУ сабагенту
его файл + список ЕГО ошибок (точечный retry, не весь конвейер заново), максимум 1 повтор. Тот же
файл падает второй раз → эскалация оператору (показать ошибки), конвейер не постит.

---

## Шаг 4 — Синтез

Прочитай ВСЕ task-файлы дорожки **целиком, с диска** (не пересказы сабагентов в контексте сессии —
он мог сжаться). Собери ЕДИНЫЙ отчёт по структуре Golden Example и запиши в `README.md` того же
report-dir (сборка состояния конвейера):

1. Шапка + ссылка на MR
2. Scope-итог: размер, таблица категорий, карта файлов
3. C4-диаграмма (container diagram; медиум по action 0 — виджет при наличии, ASCII только fallback)
4. Flow-диаграммы (нетривиальные сценарии)
5. Разбор сущностей: [E1]..[EN] с вердиктами (✅⚠️❌), ролью, обоснованием
6. Связи и риски: [R-IDs], 🎯🧪💥🖐🚀📊
7. Итог: таблица вердиктов
8. Кандидаты в замечания: таблица ID/Файл/Строка/Проблема/Ось/Kind
9. Подвал + ссылка на MR

Допиши запись в `HISTORY.md` (append-only: дата, `headSha`, режим full/delta, итог, ссылки на
task-файлы этого визита).

**Итог оператору — в чат**, по-прежнему по golden-формату (виджет/ASCII, транспорт по action 0):
содержимое md-файлов и mermaid **в чат не вставлять** — файлы для GitLab/оркестрации, чат для
оператора (правило 8 `agent-inbox/SKILL.md`).

**После синтеза — очистка и сверка (см. Шаг 0a п.3):**
- `vcs-draft-note --delete-all` — драфты удалены
- `vcs-discussions --all --json` — загружены ВСЕ дискуссии
- `AX_POSTING_NO_DUPLICATES`: вычеркнуть кандидатов, уже покрытых существующими тредами
- `<ThreadModel>` + `ReactionMatrix`: каждому треду owner/goal/nextActor/status; действие для чужих — 👍/💯/reply (resolve — только своих тредов; `waiting-author` → без действия, в сводку «ждут автора»)

---

## СТОП-ЧЕК (перед выдачей в чат)

Пройди SelfCheck из `RE_READ("ai/directives/agent-inbox/arch-interrogation.directive.xml")` (пункты 0–6), плюс добавочные пункты конвейера:

| # | Секция | Есть? |
|---|--------|-------|
| 0c | Существующее обсуждение подгружено (vcs-discussions) или явно сказано «тредов нет» | □ |
| — | `reviewPlanRequired == true` → `inbox-review-plan --scaffold` вызван с правильным `--base` (полный = worktree.base, дельта = lastReviewedHeadSha), болванки материализованы | □ |
| — | План разбивки показан (трек → N файлов → сабагент/инлайн) | □ |
| — | `--validate --stage enriched` прошёл ДО диспатча, `--validate` (filled) прошёл ДО синтеза | □ |
| — | Синтез (README.md/HISTORY.md) собран из task-файлов с диска, не из пересказов сабагентов | □ |

Если любой □ пуст → возврат. **Особенно жёстко:** если `reviewPlanRequired` был `true`, а болванки не материализованы — это нарушение `H_NO_REVIEW_PLAN`, возврат к шагу 2.
