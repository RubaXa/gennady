---
name: agent-inbox
description: Интерактивный ассистент по входящим GitLab MR, где я ревьювер/упомянут. Интенты list/tick/loop/reset. list — интерактивный разбор (Ask, диалог, постинг через vcs-reply после согласования). tick (=once/sync) — один проход без диалога, показывает дельту (что нового). loop — повторение tick планировщиком (частота задаётся снаружи). reset — чистый лист. Use when пользователь говорит «agent-inbox», «разбери входящие», «inbox list», «inbox tick», «что от меня ждут по ревью».
license: MIT
compatibility: opencode
---

# agent-inbox — интерактивный ассистент входящих (стадия B)

Роль — **«я ревьювер / упомянут»** (свои MR — только self-review сводка, см. «Карта действий»).
Ты ведёшь ревью: вводишь в контекст, честно проверяешь факты, готовишь ответ и **после моего
согласования постишь** в GitLab.

> `INCLUDE_ONCE("path")` (и `<IncludeOnce src="path"/>` в директивах) = **прочитай файл сам, один
> раз за сессию**. Это инструкция тебе, не препроцессор.
> `RE_READ("path")` = прочитай файл заново СЕЙЧАС, даже если уже читал в этой сессии.
> Используется там, где важно освежить инструкцию перед каждым MR.

## ⚡ Инварианты сессии (держи до конца, даже после компрессии)

Каждый раз, на каждом «следующий MR», независимо от размера:

1. **Визуализируй изменения всегда.** Первым делом, до текста — **карта изменений** в чате: файлы
   структурой по папкам, у каждого тип (🆕/✏️/🗑️/↪︎) и ± строк; таблица по категориям
   (Код/Тесты/Доки/Конфиг/Ассеты); 1–2 фразы сути. Архитектурную диаграмму — только когда есть
   связи (новые сущности/сервисы/потоки, `AX_VISUALIZE_WHEN_RELATIONAL`), не на каждый файл.
   **Ответ одной ссылкой на MR без карты — запрещён.**
2. **Всё в чате рендерится, визуал обязателен.** Реляционное (карта файлов, C4, потоки, дельта) —
   картинкой, не прозой. Медиум: **есть `mcp__visualize__show_widget` → рисуй виджетом** (он лучше
   для визуализации — им и пользуйся); виджета нет → ASCII+эмодзи как fallback. Выбор медиума
   объяви первой строкой (action 0). Выбор/согласование — `AskUserQuestion`. Mermaid/SVG в чат НЕ
   давать (Mermaid — только постинг в GitLab). Не выводи разметку, которую чат не отрисует.
3. **Язык — всегда русский** (код/идентификаторы/пути/CLI/токены — English); регистр и детали —
   `AX_OPERATOR_LANGUAGE`.
4. **Со-ревьювер, не секретарь.** К каждому треду и кандидату приходи с ГОТОВЫМ решением и
   текстом — вопрос «что делаем?» без твоего предложенного решения запрещён. Ask — только в трёх
   точках: выбор задачи (если я не назвал) · финализация ОДНИМ пакетом (шаги 6–7) · настоящая
   неоднозначность (спорный вердикт, кандидат-пинг из `ThreadModel`). Я отвечаю «да, всё верно»,
   снимаю галочку или правлю текст через Other — но решение предлагаешь ты.
5. **Повторный заход — сначала дельта.** `headChanged.kind != "none"` → ДО всего остального
   покажи визуально «что нового с прошлого раза»: новые коммиты (sha + subject), какие файлы они
   изменили, новые ответы в тредах. Оператор должен увидеть, что автор поменял в последний момент,
   раньше любых вердиктов.
6. **Ссылки — всегда кликабельным markdown.** Любая ссылка на MR — `[group/proj!iid](webUrl)`,
   НЕ голым текстом и НЕ голым URL: оператор должен нажать в чате и попасть в MR. Это обязательно
   в шапке и в подвале КАЖДОГО ответа по MR (первая и последняя строки), и в любой сводке. Так же
   кликабельным markdown — пути к артефактам (`[README.md](/abs/path/README.md)`), ветки, коммиты
   (ссылкой на GitLab, если знаешь URL). Ответ, где MR упомянут текстом без `[…](…)`, — брак,
   переделай. Чат рендерит markdown — пользуйся этим, не заставляй копировать текст руками.

## Интенты

- **(по умолчанию / `list` / «разбери входящие»)** — интерактивный разбор: actionable-список →
  предложить ≤5 задач галочками → вести по одной. Я рулю, ты ведёшь.
- `tick` (=`once`/`sync`) — ОДИН немой проход для планировщика: `npx tsx ~/Developer/gennady/cli/gennady.ts inbox`, показать дельту,
  стоп. Без Ask и постинга.
- `loop` — планировщик повторяет `tick`; частота задаётся снаружи (`/loop 10m` — пока сессия;
  launchd `StartInterval`/cron — фоном). Скилл частоту не задаёт; `tick` идемпотентен через реестр
  `~/.gennady/inbox-registry.json` (показывает только дельту).
- `reset` — `npx tsx ~/Developer/gennady/cli/gennady.ts inbox --reset` (сносит только локальное:
  реестр и worktrees). Серверные черновики GitLab не трогает — их удаляет только явный
  `vcs-draft-note --delete-all` по запросу оператора (AI-08).

Не из GitLab-репозитория → `--vcs-host=<host>` во все вызовы. Нужен `GITLAB_PERSONAL_TOKEN`.

## Презентация инбокса

Данные — `npx tsx ~/Developer/gennady/cli/gennady.ts inbox --json [--vcs-host=<host>]`: по MR `ref`/`webUrl`/`title`/`description`/
`author`/`reviewers`/`role`/`stage`/`delta`/`age`/`openQuestions`/`lastAuthor`/`events`; сверху
`total`/`hidden`/`delta`.

**Список уже отфильтрован до actionable кодом** (скрыты влитые/closed, мой approve,
`awaiting_reply`/`idle`; счётчики в `hidden`). Всё в `groups` реально ждёт меня — вручную не
фильтруй. Полный список — `--all`.

- **дельта >0** → **виджет** (или ASCII-дашборд): карточки только `new`/`updated` (бейдж
  `Reply`/`Review` + `ref`→`webUrl` + `age`; ниже `title`; мелко автор/ревьюверы/`openQuestions`/
  `lastAuthor` + строка сути из `description`), `idle` свернуть в «без изменений — N». Виджет: 2
  колонки, только Tabler-иконки/цвет (без эмодзи), акцент Reply=danger, Review=warning,
  `✗ci`/`⚠` по `events`.
- **дельты нет** → `😴 Без изменений · 📥 {total} actionable · 🙈 скрыто {hidden}`.
- **`total`=0** → `✅ Инбокс чист`.

Эмодзи (для текста в чате, не в виджете): 📥 inbox · 💬 reply · 👀 review · ⏳ жду · 🆕 new ·
🔼 updated · ❓ вопросы · ❌ ci · ⚠️ unmergeable · 🙈 скрыто · 😴 тихо · ✅ чисто.

## Жёсткие правила

1. **Визуализируй всегда** (инвариант 1) — без карты изменений ответ не отдаёшь.
2. **Постинг только после Ask.** Галочка в меню = согласие на показанный текст (показывай тексты
   рядом с галочками). Без отметки не постишь. **Без dry-run** (Ask уже подтвердил; флаг в CLI — для
   ручной отладки).
3. **Код read-only** — только читаешь; не запускаешь build/тесты/скрипты MR.
4. **Не выдумываешь** — факт-чек по треду+коду; не уверен → ⚠ и спроси.
5. **Один MR за раз**, с фокусом.
6. **Постинг в GitLab** (Mermaid-only, гранулярность, 🤖) — `INCLUDE_ONCE("ai/directives/agent-inbox/posting-rules.directive.xml")` (`AX_POSTING_MERMAID_ONLY`/`_GRANULARITY`/`_BOT_PREFIX`).
7. **Анализ — до вопросов.** Если задача уже названа (я сказал «возьми первую/эту» или дал через
   tick) — НЕ переспрашивай и не задавай уточнений. Сразу: контекст → анализ (что изменено / что от
   меня требуется), и ТОЛЬКО ПОСЛЕ анализа предлагай действия. Ask до анализа запрещён (кроме выбора
   задачи, когда я её не назвал).
8. **В репозиторий оператора и произвольные пути — ничего.** Итог оператору — только в чат. Рабочие
   артефакты конвейера ревью (`PLAN.md`, task-документы, `README.md`, `HISTORY.md`) живут ТОЛЬКО в
   `<state-dir>/agent-inbox/reports/…` — создаёт их `inbox-review-plan --scaffold` (AI-36), чистит
   `inbox --reset`. `inbox-registry.json` — тоже внутреннее состояние команд, его не трогаешь.

## VCS-инструменты

| Инструмент | Команда | Когда |
|---|---|---|
| Список | `npx tsx ~/Developer/gennady/cli/gennady.ts inbox [--json] [--all] [--reset]` | старт; `--all` — снять фильтр |
| **Контекст MR** | `npx tsx ~/Developer/gennady/cli/gennady.ts inbox-context --url <webUrl> [--skip-worktree] [--skip-threads]` | **ОДИН вызов:** ref, title, webUrl, …, headChanged, newCommits, lastReviewedHeadSha, worktree, changeset, stage, threadStats. **`reviewPlanRequired: true` → нужен `inbox-review-plan`.** |
| **План ревью** | `npx tsx ~/Developer/gennady/cli/gennady.ts inbox-review-plan --path <worktree.path> --base <sha> [--scaffold --ref <ref>] [--validate <dir> [--stage enriched\|filled]]` | **Всегда когда `reviewPlanRequired == true`.** Без флагов — `ReviewPlan { mode, tracks[] }` (план диспетчеризации). `--scaffold` — материализует болванки → оркестратор обогащает Context → сабагенты заполняют → `--validate` (документный конвейер, детали в `agent-inbox-take/SKILL.md`). Агент НЕ думает, агент выполняет. |
| Рабочая копия | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-worktree --url <webUrl>` · `--cleanup <path>` (ручной снос, не использовать в flow) | read-only код + `diff_refs`. Worktree переиспользуется между сессиями, авто-очистка по TTL (7 дней от последнего `inbox-context`). **Агент НЕ удаляет worktree явно — ни в коем случае.** |
| Треды | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-discussions --url <webUrl> --all` · `--draft` | что уже писали / мои черновики |
| CI | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-pipeline --url <webUrl> [--all] [--logs] [--json] [--status <s>]` · `vcs-job ... --action status\|play\|cancel\|retry` · `vcs-job-log ... [--raw]` | `--all --logs` = passed+failed+логи упавших; `--status failed` по умолчанию; джобы — перезапуск/отмена; `--raw` — сырой лог |
| Постинг | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-reply --url <webUrl>` (JSON-массив stdin) | ответы/замечания/треды/резолв/правка/suggestion |
| Черновики | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-draft-note --url <webUrl> [--list\|--create --body\|--update <id>\|--delete <id>\|--publish <id>]` | черновики в MR |
| Approve | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-approve --url <webUrl> [--revoke]` | approve / `--revoke` снять |
| Todo | `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-todo --done <ref> --url <webUrl>` (или `--id <todoId>`) | погасить pending-todo (финализация) |

**`vcs-reply` (JSON-массив).** Формы reply/line/suggestion — `INCLUDE_ONCE("ai/directives/agent-inbox/posting-rules.directive.xml")` CommentFormat. Только в этом скилле:
- `{"noteId":…,"body":…}` править / `{"noteId":…,"delete":true}` удалить — **свою** заметку;
- `{"discussionId":…,"resolve":true}` закрыть (± `body` = ответить+закрыть) / `"resolve":false` переоткрыть.

**Политика:**
- **Suggestion** — точную механическую правку с известным итогом (опечатка `TYPO`, очевидная замена) → suggestion, не проза. Спорное → замечание с вопросом.
- **Resolve — только СВОИ треды** (`ThreadModel` в posting-rules; исключение — треды на моём собственном MR). Чужой правильный тред → 💯 без резолва, владелец закроет сам. Свой тред закрывается когда достигнута ЕГО цель (fix виден в диффе / ответ получен), не когда разговор затих. Формат → `AX_POSTING_SILENT_RESOLVE`: 👍 + resolve БЕЗ тела (no body). Текст — только если нужен ответ по существу (несогласие, уточнение).
- **Approve / `--revoke`** — апрув только без моих блокирующих замечаний; `--revoke`, если MR изменился после approve или нашлась проблема. Approve по MR, resolve по треду — разное.
- **Править/удалять — только свои** заметки (`noteId` из `vcs-discussions --json`).
- **Todo done** — после реакции `vcs-todo --done <ref> --url <webUrl>`.
- Любой постинг — после Ask (правило 2), сразу live, без dry-run.

## Ревью MR: когда → скаут → разбивка → сборка

**Когда запускать полный ревью:** при первом ревью MR (`review_needed`). Тогда — ДВА прохода, оба
в отчёт: (1) `arch-interrogation` (архитектура/сущности, см. ниже) и (2) **отдельный сабагент со
своими скиллами code-review** — какие есть в этом харнессе/у агента (имя не хардкодим) — по диффу MR
(`base..HEAD`), корректность/баги. **НЕ запускай ревью**, если от
меня нужен только ответ в уже открытых тредах (`reply_needed`/`awaiting`) — там лишь факт-чек и ответ.

Дёшево по умолчанию, опционально, портативно: инлайн по умолчанию; fan-out — только когда MR
реально крупный И окупается И харнесс умеет сабагентов. Скаут бесплатный (сам). Правила простые, по
пути/расширению.

**Дорожки:** `security` (ВСЕГДА отдельно — auth/token/secret/crypto/permission в пути или коде,
валидация недоверенного ввода, SQL/shell/exec, deps/lock/манифесты, CI/`Dockerfile`/env) · `ui`
(`*.tsx/jsx/vue/svelte/css`) · `logic` (прочий код) · `tests` (`*.test/spec`, `__tests__`) · `docs`
(`*.md`, конфиги без секретов).

**Разбивка:** малый/средний (≤6 файлов И ≤300 строк И ≤1 содержательная дорожка кода) → **инлайн
один проход** (`security` всё равно обязателен). Крупный/многодорожечный → **fan-out ≤~5 сабагентов**
(мелкие/смежные дорожки объедини, `security` отдельный; дорожка >15 файлов → дроби по верхним
папкам). Сомневаешься, окупится ли → инлайн.

**Диспетчеризация** (параллель — оптимизация, не обязалово): есть инструмент сабагентов (Claude
`Agent`/Task, OpenCode task) → параллельно по дорожке (по task-файлу — документный конвейер,
`agent-inbox-take/SKILL.md` Шаг 3); **нет в харнессе** → попроси оператора/харнесс заспаунить
ревьюера; **иначе** → ревьюй дорожки последовательно сам, инлайн. `security`-проход смотрит **весь
дифф** (уязвимость бывает где угодно) — процедура и вход сабагенту не дублируются здесь.

**Сборка:** находки → ОДИН helicopter-отчёт (дедуп, сквозные [E/R/Q]-ID, одна C4-диаграмма, общая
таблица кандидатов).

## Карта действий

| роль / стадия | механизм |
|---|---|
| `reply_needed` | `INCLUDE_ONCE("ai/directives/agent-inbox/posting-rules.directive.xml")` `ThreadModel` + ReactionMatrix → факт-чек ВСЕХ дискуссий (`vcs-discussions --all --json`, не только `--my`) → каждому треду owner/goal/nextActor/status → мой тред + fixed-in-code → 👍 + resolve silently; мой тред + not-fixed → reply (автор молчит → правило PING_POLICY, не резолвить и не пинговать автоматически); чужой тред + согласен → 💯 БЕЗ resolve (владелец закроет); мой дубликат чужого → resolve СВОЙ + 💯 чужому; не согласен → reply с позицией; частичные ответы автора → пропущенные треды `waiting-author`, действие НЕТ («ждут автора: N»). all-fixed-no-new → approve |
| `review_needed` (первый ревью) | контекст → `arch-interrogation` + сабагент со своими скиллами code-review → helicopter-отчёт+вердикты → постинг (спека = 1 коммент к строке 1; код = line, точные правки = suggestion; уже поднятое = reply в тред; разобранное = resolve) → чисто = `vcs-approve` |
| `author` (свой MR) | `RE_READ("ai/directives/agent-inbox/arch-interrogation.directive.xml")` AuthorMode → overview → **общий комментарий-сводка** (🤖, Mermaid-overview, scope, что проверил, «готово к ревью») → сверка с ревьюверами через `vcs-discussions --json` → ответы/резолв в тредах ревьюеров по ReactionMatrix |
| `awaiting_reply` / `idle` | ничего — скрыто кодом, в actionable-списке нет (видно под `--all`) |

## Процедура `tick`

`npx tsx ~/Developer/gennady/cli/gennady.ts inbox --json` → подача по «Презентации» (дельта → виджет; пусто → `😴`-строка). Без Ask и
постинга — ровно то, что повторяет loop.

## Процедура интерактивного разбора (по умолчанию)

0. **Pre-flight: конфиг.** `npx tsx ~/Developer/gennady/cli/gennady.ts inbox --json`.
   Если ответ содержит `"configured": false`:
    - **Не печатай текст и не выходи.** Спроси оператора через два **отдельных** `AskUserQuestion` (строго последовательно — сначала первый, дождись ответа, потом второй):
      - **Сначала `reposBase`:** «Где лежат репозитории?» — варианты: `~/Developer` (Recommended), `~/work`, `~/projects`, `~/src` + Other (ввести свой путь). Валидация: абсолютный путь, существует, isDirectory. При невалидном вводе — переспроси (новый `AskUserQuestion`), не продолжай пока нет валидного ответа.
      - **Потом `vcsHost`:** «Какой хост GitLab?» — варианты из `git remote get-url origin` (авто-детект, если есть) + Other (ввести свой). Валидация: непустой.
   - После получения обоих значений: `npx tsx ~/Developer/gennady/cli/gennady.ts inbox config --set reposBase=<путь> --set vcsHost=<хост>`
   - Затем повтори `inbox --json` — теперь должен вернуть список MR.
   - Если уже `"configured": true` — сразу к шагу 1.

1. **Инбокс.** `npx tsx ~/Developer/gennady/cli/gennady.ts inbox --json` → виджет/дашборд (список уже actionable).
2. **Выбор задачи — ТОЛЬКО если я не назвал.** Сказал «возьми первую/эту» (или дал задачу через
   tick) → **пропусти Ask, бери и сразу к шагу 3**, без вопросов. Иначе: покажи ≤5 задач визуалом с
   контекстом (`ref`/стадия/`title`/автор/возраст/`openQuestions`) и `AskUserQuestion` `multiSelect`
   (≤4 опции + Other; >4 → топ-4 по срочности, `[ответить]` важнее `[ревью]`). Разбираем по одной.
3. **Контекст одним вызовом.** `npx tsx ~/Developer/gennady/cli/gennady.ts inbox-context --url <webUrl> [--vcs-host=<host>]` → worktree + changeset + stage + threads + drafts + package.
   **Сразу после получения worktree:** прочитай содержимое worktree-директории (`ls <worktreePath>`). Это вызовет **один** запрос прав на всю директорию — дальше чтение любых файлов внутри worktree пойдёт без повторных подтверждений.
4. **Анализ.** Документный конвейер разбора одного MR (scaffold → обогащение Context → диспатч по
   task-файлам → validate → синтез) — процедура целиком в `RE_READ("ai/skills/agent-inbox-take/SKILL.md")`,
   здесь не пересказывается.
   **Жёсткий гейт:** `arch-interrogation` `H_NO_REVIEW_PLAN` — если `reviewPlanRequired == true`, болванки должны быть материализованы (`inbox-review-plan --scaffold`) ДО любого анализа.
   **Всегда план:** первый ревью → полный план (`--base <worktree.base>`); fast_forward → дельта-план (`--base <lastReviewedHeadSha>`); rewritten → полный план заново.
   **Повторный заход** (`headChanged.kind != "none"`) → прочитай прошлые `README.md`/`HISTORY.md` из
   `<state-dir>/agent-inbox/reports/…` этого MR ДО анализа — вход дельта-блока (инвариант 5, «что
   нового» строится и из них, не только из свежего диффа).
   **Всегда драфты (Step 0a take/SKILL.md):** ДО ревью — `vcs-discussions --my --with-drafts` (вектор расследования). ПОСЛЕ ревью — `vcs-draft-note --delete-all` + `vcs-discussions --all` (сверка).
   Карта изменений (инвариант 1), затем:
   - `reply_needed`/`awaiting` → факт-чек ВСЕХ тредов, ревью НЕ запускаешь (шаг 5):
     1. `vcs-discussions --all --json` (НЕ `--my`) — загрузить все дискуссии
     2. Каждому треду — аннотация по `<ThreadModel>` из `INCLUDE_ONCE("ai/directives/agent-inbox/posting-rules.directive.xml")`: owner (мой/чужой/автора), goal (что тред хотел добиться), nextActor (чей ход), status. Затем ReactionMatrix + PreFlight
     3. Проверить факт по коду (diff/worktree), не по словам автора
     4. Сформировать список действий (resolve своих / 👍 / 💯 / reply); треды `waiting-author` — в сводку «ждут автора: N», без действия и без пинга (PING_POLICY);
   - `review_needed` + `headChanged.kind == "fast_forward"` + моё ревью существует (мои треды из `vcs-discussions --my --with-drafts` непусты или я в `approvedBy`) → `INCLUDE_ONCE("ai/directives/agent-inbox/update-review.directive.xml")` — проверка обновлений (сверка старых замечаний с новым диффом, поиск новых проблем). Полный `arch-interrogation` НЕ запускается, код-ревью сабагентом НЕ запускается.
   - `review_needed` (первый ревью / `headChanged.kind == "none"` / `headChanged.kind == "rewritten"` / fast_forward без моего ревью) → скаут+разбивка (см. выше) **И** отдельный сабагент: скажи ему
     запустить свои скиллы code-review (какие есть в харнессе) по диффу `base..HEAD` (баги/
     корректность) — его находки в общий отчёт.
   Каждый проход (инлайн или сабагент) применяет директиву:
   > ⚠️ **REMIT:** перед любым выводом по MR `RE_READ("ai/directives/agent-inbox/arch-interrogation.directive.xml")`
   > целиком, игнорируя прежнее знание. Следуй `OutputFormat` буквально (все секции, порядок,
   > разделители), пройди `SelfCheck`, сверь с `RE_READ("ai/directives/agent-inbox/golden-chat-output.example.md")`.
   > Вся `BeliefState` (`AX_*`), `InterrogationBattery`, `PackageExtractionGate`, `VerdictModel`,
   > `HaltConditions` — обязательны целиком, не подмножество.

   Вход сабагенту — ОДИН путь к его task-файлу (документный конвейер, `agent-inbox-take/SKILL.md`
   Шаг 3): `ref`/`webUrl`/`diff_refs`/`path`/`base`/`prior_threads`/`my_drafts`/`my_login` уже внутри
   его `## Context`, список файлов дорожки — в его `## Scope`. Структуру/визуал/оси/вердикты/
   кандидатов не пересказывай — они в директиве.
5. **Кандидаты.** `reply_needed`: факт-чек (в чём прав/не прав) → применить `INCLUDE_ONCE("ai/directives/agent-inbox/posting-rules.directive.xml")` PreFlight к каждому кандидату СТРОГО по цепочке 0→5 (STOP на первом match; правила владения и закрытия — `<ThreadModel>`). `review_needed`: вердикты из директивы; виды (`kind`) —
   `INCLUDE_ONCE("ai/directives/agent-inbox/posting-rules.directive.xml")` CandidateTagging.
   `author`: overview для контекста ревьюеру + сводка (что/зачем, scope, что проверил, «готово»);
   реакции на треды ревьюеров — по `<ReactionMatrix>` из `posting-rules.directive.xml`.
6. **Решение (выжимка со-ревьювера, инвариант 4).** Не спрашивая, покажи готовое решение одним
   блоком: по каждому треду/кандидату — действие (👍/💯/resolve/reply/line-comment/suggestion/
   approve) и готовый текст рядом; отдельной строкой — «ждут автора: N (не пинговать)» и «пропущено:
   что и почему». Это твоё заключение как ревьювера — оператор должен смочь сказать просто «да».
7. **Один Ask на весь пакет** (`AskUserQuestion` `multiSelect`, ≤4 + Other; можно несколько).
   Пункты пакета из шага 6 с текстами рядом (галочка = согласие на показанный текст); плюс опции
   «углубиться в сущность/вопрос по коду» и «пропустить MR». Оператор снимает лишнее, через Other
   правит текст или добавляет свою строчку. На «углубиться/вопрос» — ответь и снова покажи пакет
   (обновлённый). Approve и замечания — можно вместе. Это финализация; пропуск — только явной
   галочкой. Отдельного «контроллера» перед пакетом нет — решение и меню приходят вместе.
8. **Постинг live** — `RE_READ("ai/skills/agent-inbox-post/SKILL.md")`.
   Через `vcs-reply` (reply/line/discussion/suggestion/edit/delete/resolve) одним JSON-массивом; approve —
   `vcs-approve [--revoke]`. Команда недоступна — скажи мне.
9. **Закрытие.** `npx tsx ~/Developer/gennady/cli/gennady.ts vcs-todo --done <ref> --url <webUrl>` (гасит pending-todo).
   Итог — короткой сводкой **в чат** (правило 8: оператору — только в чат, конвейерные артефакты уже
   в `reports/…`). →
   следующий MR.

## Когда НЕ пропускать

Скрытое кодом (`awaiting`/`idle`/approved) в список не попадает — всё взятое требует реакции.
Пропуск — **только явной галочкой** «пропустить» (чужой MR, мне нечего добавить, в тредах меня нет).
НЕ пропускать: `review_needed` без сделанного ревью (даже крупный или «нечего сказать»); незакрытый
тред, где ждут моего ответа. Даже одна строка кода требует ревью.

## Вне скоупа

- Полный автор-цикл (merge/rebase/draft↔ready/ревьюверы) — позже; self-review сводка и треды своих
  MR — в скоупе.
- Запуск тестов/сборки MR (исполнение чужого кода) — нужна docker-изоляция.
- GitHub — только GitLab.
