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

## Шаг 2 — План ревью (МЕХАНИЧЕСКИ, без решений агентом)

**Этот шаг — жёсткий гейт.** Никакой инлайн-анализ без плана.

1. **Проверь `reviewPlanRequired`** из ответа `inbox-context` (поле уже в JSON):
   - `false` → план не нужен (`reply_needed` / `update-review` / `author`). Пропусти шаг 2, иди к шагу 3.
   - `true` → **HALT.** Не читай файлы, не анализируй. Сделай строго следующее:

2. **Вызови команду:**
   ```
   npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --path <worktree.path> --base <worktree.base>
   ```
   Дождись ответа. Получи `ReviewPlan { mode, tracks[{name, files, lineCount, focus, directive}] }`.

3. **Интерпретация — чисто механическая:**
   - `mode: "inline"` → **один** проход. Один трек. Читай директиву из `track.directive`, используй пробы из `track.focus`. Без сабагентов.
   - `mode: "fan_out"` → диспетчеризация. **Ровно по одному сабагенту на каждый трек** (≤5, как в плане). Каждому сабагенту передай:
     - `track.files` — список файлов именно этого трека
     - `track.focus` — какие пробы запускать
     - `track.directive` — какую директиву загрузить (`arch-interrogation` + `code-interrogation` ИЛИ только `code-interrogation`)
     - `path`, `diff_refs`, `base` (из worktree)
     - `ref`, `webUrl`
     - `prior_threads` / `my_drafts` / `my_login`

4. **Жди ВСЕХ сабагентов.** Собери выводы → шаг 4 (Синтез).

**Агент НЕ принимает решений:**
- Не считает файлы/строки вручную (это сделала команда)
- Не решает «инлайн или сабагенты» (это в `ReviewPlan.mode`)
- Не выбирает пробы (это в `ReviewTrack.focus`)
- Не выбирает директиву (это в `ReviewTrack.directive`)
- Не классифицирует файлы по дорожкам (это сделала команда)

---

## Шаг 3 — Сбор фактуры

**Сабагентам передать:**
- `arch-interrogation.directive.xml` + `code-interrogation.directive.xml` (прочитай ещё раз в сабагенте)
- `path` + `diff_refs` + `base` (из worktree)
- `ref` + `webUrl`
- список файлов дорожки
- `prior_threads` / `my_drafts` / `my_login` (если доступны)

**Security-сабагент:** ВСЕГДА отдельно, на ВЕСЬ дифф.
**Остальные:** свои файлы, свои призмы.

Жди ВСЕХ сабагентов.

---

## Шаг 4 — Синтез

Собери вывод сабагентов в ЕДИНЫЙ отчёт по структуре Golden Example:

1. Шапка + ссылка на MR
2. Scope-итог: размер, таблица категорий, карта файлов
3. C4-диаграмма (container diagram; медиум по action 0 — виджет при наличии, ASCII только fallback)
4. Flow-диаграммы (нетривиальные сценарии)
5. Разбор сущностей: [E1]..[EN] с вердиктами (✅⚠️❌), ролью, обоснованием
6. Связи и риски: [R-IDs], 🎯🧪💥🖐🚀📊
7. Итог: таблица вердиктов
8. Кандидаты в замечания: таблица ID/Файл/Строка/Проблема/Ось/Kind
9. Подвал + ссылка на MR

---

## СТОП-ЧЕК (перед выдачей в чат)

Пройди SelfCheck из `RE_READ("ai/directives/agent-inbox/arch-interrogation.directive.xml")` (пункты 0–6), плюс добавочные пункты конвейера:

| # | Секция | Есть? |
|---|--------|-------|
| 0c | Существующее обсуждение подгружено (vcs-discussions) или явно сказано «тредов нет» | □ |
| — | `reviewPlanRequired == true` → `inbox-review-plan` вызван, `ReviewPlan` загружен, треки диспетчеризованы | □ |
| — | План разбивки показан (трек → N файлов → сабагент/инлайн) | □ |

Если любой □ пуст → возврат. **Особенно жёстко:** если `reviewPlanRequired` был `true`, а план не загружен — это нарушение `H_NO_REVIEW_PLAN`, возврат к шагу 2.
