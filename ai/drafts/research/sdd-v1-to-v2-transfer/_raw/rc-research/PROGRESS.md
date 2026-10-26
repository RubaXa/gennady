# PROGRESS — живой лог состояния (recovery anchor)

Назначение: пережить компрессию контекста. Если контекст сжат — прочитай ЭТОТ файл + 13-genetic-loop.md,
и продолжай отсюда. Перезаписывается по ходу (это состояние «где я сейчас», не история — история в 13).

Последнее обновление: 2026-09-02, прогон scaffold #3 идёт.

## Документы (роли): PROGRESS = состояние/recovery · 13-genetic-loop = метод+прогоны · LEARNINGS = дистиллят что сработало/нет/эффект · 14 = H-fewshot дизайн. Обновлять LEARNINGS после каждого значимого урока.

## Роль и метод
Claude ведёт eval-first генетический цикл САМ (не передаёт агенту). Методология: 13-genetic-loop.md.
Цель: базовые сценарии (authoring→scaffold→execute→цепочка) работают воспроизводимо (2/2 pass, flow чистый),
покрыть тестами, сохранить в спецификацию.

## Рабочее место
- worktree: `/Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup`
- ветка `codex/sdd-v2-rc52-followup`, HEAD `04ee52fd` (P9), дерево чистое, код НЕ менялся мной.
- scratchpad: `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady/03fc426d-e383-4254-ac40-6ef94427dfa4/scratchpad`

## Активные ресурсы (проверить при возобновлении)
- OpenCode eval server: порт **4098** (без --pure), лог `scratchpad/opencode-4098.log`. Desktop оператора 58656 — НЕ трогать.
  Проверить живость: `curl -4 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4098/`
- Фоновые задачи: scaffold-прогон #3 (Bash id `bl5jb0xdk`), лог `scratchpad/run3-scaffold.log`.
- scenario-файлы: `scratchpad/authoring-only.json`, `scratchpad/scaffold-only.json`.
- eval-roots: `scratchpad/last-eval-root.txt`, `scratchpad/last-scaffold-root.txt`.

## ФОКУС (коррекция оператора): ДОКАЗАТЬ что V2 flow работает. НЕ уходить в инфру тестов/коммитов.
Коммит M2.1 отложен (dist собран с M2.1, worker её использует — доказательству не мешает).
Выравнивание тестов/инфры/промптов + коммиты — ОТДЕЛЬНАЯ ФАЗА ПОСЛЕ доказательства базовой линии.
Факт: CLI холодный старт 0.12с — инструменты НЕ медленные (harness.test.ts 33с = npm install+десятки спавнов в фикстурах, тест-специфика). Костыль test-topology откачен.
M2.1 flow-правки в рабочем дереве (templates.ts + 2 xml), НЕ коммичены — норм.

## Позиция в цикле (СТАТУС)
- [x] authoring — ЗАКРЫТ: 2/2 pass воспроизводимо (прогон #1 RCv5 `04ee52fd`, прогон #2 Claude). Оба чистые.
- [!] scaffold M2.1 ПОДТВЕРЖДЕНА 2/2 pass (#6, #7, нагрузка 45→30). КОРЕНЬ блокера НАЙДЕН:
  harness.test.ts (33с, spawnит CLI) под coverage переваливал --test-timeout=30000 → ложный «not ok» при # fail 0.
  ФИКС применён: test-topology.ts:258 → под coverage --test-timeout=90000 (обычные прогоны строгие 30с).
  **M2.1 сейчас В STASH «m2.1-hold»** (3 файла: templates.ts + task-ticket-structure.xml + scaffold.directive.xml).
  Порядок: (1) коммичу инфра-фикс test-topology (идёт, ba0v65fdz); (2) git stash pop → вернуть M2.1;
  (3) build:directives (xml под templates.ts); (4) коммит M2.1.
  ВОССТАНОВЛЕНИЕ ПОСЛЕ КОМПРЕССИИ: если M2.1 «пропала» из дерева — она в `git stash list` (m2.1-hold), сделать pop.
- ИНФРА-ДЕФЕКТ (кандидат в фикс/тест): test:coverage не чистит coverage/tmp перед прогоном (накапливается мусор). coverage В gitignore (стр.12) — git ок, но тест физически читает файлы.
- [~] scaffold (история) — 1 pass / 2 fail до M2.1. Диагноз (analyst): worker САМ открывает 757стр форматов (readiness 251, spec-structure 347, task-ticket 159) вне read-path, т.к. скелет не говорит откуда брать `Readiness Gates` и `Coverage`.
  - **M2.1 ПРИМЕНЕНА** (templates.ts:1284): Readiness Gates signifier — «значение из секции ## Prerequisites уже материализованной спеки, format docs не нужны». Понятность, не запрет.
  - dist ПЕРЕСОБИРАЕТСЯ (Bash id `bwqipi3av`, лог `build-m2.log`) — ОБЯЗАТЕЛЬНО: worker берёт скелет из собранного dist (provision.ts:552), иначе прогон = старый код.
  - После сборки → прогон #6 scaffold, замер нагрузки (было 45 tools; цель ~28). M2.2 (coverage ladder-алиас) — следующим ходом, если #5-тип budget-fail не ушёл.
  - templates.ts dirty (не коммичу до улучшения).
- [x] execute — 2/2 pass ✅ (src/slugify.ts+тесты, audit 0 findings).
- БАЗОВАЯ ЛИНИЯ V2 ПО ФАЗАМ ДОКАЗАНА (authoring 2/2, scaffold 2/2, execute 2/2).
- [~] полная greenfield-цепочка (оператор выбрал: ручная сначала, потом chain-режим). МЕХАНИЗМ REUSE УЖЕ ЕСТЬ (provision.ts: scenario с полем `directory` без `fixture` → использует готовую песочницу, НЕ re-provision). Правка cli НЕ нужна.
  Цепочка одной задачи (fibonacci): authoring → scaffold на его песочнице → execute на ней.
  ШАГ 1 authoring — pass ✅ (спеки в песочнице, путь в chain-sandbox.txt).
  БАГ provision: не идемпотентен — при reuse повторно копировал node_modules gennady → cp EINVAL на symlink (mermaid/marked).
  ФИКС применён (provision.ts materializeLocalCli): `if (existsSync(packageTarget/dist) && existsSync(binTarget)) return;` — пропуск установки при reuse. Исходник, без сборки.
  ШАГ 2 scaffold — FAIL (застрял на границе фаз, остановлен вручную во избежание жжения бюджета).
  НАХОДКА: worker в scaffold встал — next-подсказка AUTHORING_SCOPE_NEXT направила НАЗАД в authoring
  («fibonacci must first be approved in portal»), хотя authoring завершён. Portal-«approved» не передан authoring→scaffold в reuse.
  ВЫВОД: фазы по отдельности 2/2, но СКВОЗНОЙ переход authoring→scaffold ломается. Прямое подтверждение H-attention + H-adaptive-cli.
  Ресёрчи: H-attention готов (15), H-adaptive-cli идёт (agent a5bfaefdc72448fd7).
  ДАЛЬШЕ (после ресёрча adaptive-cli): решить фикс перехода фаз (детерминированное определение фазы CLI + мягкий намёк + передача portal-approved), затем повтор цепочки.
  Server 4098 жив для будущих A/B.
  ФИКС ПРИМЕНЁН: project-feasibility.ts parseSpec распознаёт «No external bootstrap required.» как валидную пустую декларацию (+ тест 11/11). dist пересобран с фиксом ✓.
  ПЕРЕЗАПУЩЕН свежий полный chain2 (authoring→scaffold→execute) для доказательства end-to-end: chain2-1 authoring ИДЁТ (chain2-1-authoring.log, Monitor baxs0f5ei, chain2-root.txt).
  Правки в дереве (не закоммичены): M2.1 (templates.ts+2xml) + provision idempotency + project-feasibility bootstrap-fix + 2 теста.

## ВАЖНО про правку templates.ts / скелетов — ДВА build:
- `npm --prefix <wt> run build` → dist (worker в песочнице берёт скелет отсюда) — ПЕРЕД прогоном.
- `npm --prefix <wt> run build:directives` → пересобирает ai/directives/sdd-v2/*.xml (templates.ts инлайнится в scaffold.directive/task-ticket-structure). БЕЗ этого freshness-тест в pre-commit падает («build is not stale»). Делать ПЕРЕД коммитом, добавить пересобранные .xml в коммит.
- Коммит через git -C с pre-commit (НЕ --no-verify). Красный гейт = чинить причину.
- ПЕРЕД коммитом: (1) `npm run build:directives` + добавить .xml; (2) почистить coverage/tmp; (3) ОСТАНОВИТЬ фоновый opencode server (kill) — pre-commit гоняет test:coverage, где harness.test.ts ~33с; работающий server ест CPU → тест переваливает timeout → ложный «not ok» при # fail 0. harness.test.ts изолированно = зелёный. После коммита поднять server заново для прогонов.
- Диагностика ложного fail: если тест «not ok» при `# fail 0` — это timeout/env/интерференция, НЕ логическая ошибка. Прогнать тест изолированно (sh -c 'cd wt && node --import tsx --test <file>').

## АВТОНОМНЫЙ НОЧНОЙ ПЛАН (оператор спит, работать самому; НЕ жечь токены)
Метод контроля: на КАЖДЫЙ прогон — Monitor следит за хвостом (эмитит наблюдения + вердикт + алерт застоя),
не пассивно ждать. Ловить цикл рано (stuck/repeat/artifact-wait) → не тратить полный бюджет впустую.
Разбор — grep/sed/песочница, НЕ полный transcript. Глубокий анализ → analyst-подагент (экономия контекста).

Waterfall гипотез (одна мутация → 1 прогон → замер → фикс/откат → дальше):
1. scaffold M2.1 (Readiness signifier) — прогон #6 ИДЁТ (Monitor `b23jx9haz`, лог run6-scaffold-m2.log).
   Замер: нагрузка (было 45 tools, pass#3=24) + verdict.
2. Если нагрузка ↓ и pass → воспроизвести (ещё 1 прогон, 2/2) → scaffold locked.
   Если coverage-археология осталась → M2.2 (templates.ts:1337 coverage → ladder-алиас, привести к check.ts:785).
   Если остаточные BLOCKER → M1 (sdd-check normalize auto-fix остаточных инструкций в заполненной секции).
   Если M2.1 не помог → откатить templates.ts:1284, другая гипотеза.
3. scaffold 2/2 → execute (slugify-toolchain): извлечь scenario, 2 прогона.
4. execute 2/2 → полная greenfield-цепочка с нуля (authoring→scaffold→execute).
5. Всё фиксировать в 13-genetic-loop.md + сюда. Утром — сводный отчёт оператору.

## Гипотеза H-attention (оператор): напоминание фазы против разреженного внимания
При перетекании фаз (authoring→scaffold→execute) модель из-за sparse/sliding-window attention теряет,
в какой фазе она и какой инструкции следует (наблюдаемо: chain-2b worker на scaffold полез в scope-authoring директиву).
Нужно точечно НАПОМИНАТЬ фазу/инструкцию (переякоривание внимания, не пересказ).
Ресёрч запущен (agent `a78bc41fa70df19da`) — методики (recency-позиция/structured header/recitation/re-inject) + дизайн A/B.
Применить к flow после базовой линии. Связь: текущий chain-2b scaffold тонет — вероятная иллюстрация.

## Гипотеза H-fewshot (оператор, на проверку A/B генетическим тестом)
Вместо длинной прозы-инструкций → сжатый псевдокод/псевдо-флоу + few-shot траектории
(вызов команды → результат → правильная обработка → следующее действие) + контрастные «как НЕправильно»
(демонстрация, не запрет). Ожидание: короче промпт, меньше tool-вызовов, точнее флоу.
Ресёрч запущен (agent `a1dbcaeca6291e7cb`) — подтвердить литературой + дизайн A/B теста (проза vs псевдокод+few-shot,
прогнать на дешёвой модели, сравнить fitness). Применить ПОСЛЕ закрытия scaffold/execute базовой линии.

Анти-марафон (жёстко): 1 прогон на непроверенную мутацию; если гипотеза не улучшает после 1-2 прогонов —
зафиксировать «не работает», СЛЕДУЮЩАЯ гипотеза, не долбить одно; если ветка застряла (3+ гипотезы без
прогресса) — стоп, зафиксировать состояние, ждать оператора. Коммит только на подтверждённое улучшение.
Пересборка dist ОБЯЗАТЕЛЬНА после каждой правки кода перед прогоном.
- [ ] полная greenfield-цепочка с нуля — впереди.
- [ ] финал: покрыть тестами/scenarios, сохранить материалы в спецификацию SDD.

## Команда запуска прогона (шаблон)
```
node --import tsx <worktree>/ai/flow-eval/cli.ts \
  --scenario-file <scratchpad>/<phase>-only.json \
  --directory $(mktemp -d /private/tmp/gen-eval-root.XXXXXX) \
  --gennady-root <worktree> --base-url http://127.0.0.1:4098 \
  --model llm-proxy/deepseek-v4-flash --judge-model llm-proxy/deepseek-v4-flash \
  --concurrency 1 --observe-every-ms 300000 --stuck-after 1 --max-observations 6
```
Извлечь одиночный сценарий: node -e фильтр scenarios.json по phase/id → <phase>-only.json.

## Правила (напоминание себе)
- Отчитываться оператору ~каждые 10 минут.
- Коммит только на положительный результат; полный pre-commit при коммите, не на каждую мутацию.
- Одна мутация за прогон; застой (неск. мутаций без улучшения) → стоп + синхронизация.
- fitness = pass + чистота flow (программирование python/node -e/tsc = провал даже при pass).
- Обновлять этот файл при каждом значимом шаге.

---
## Сессия N+1 — снятие остаточных зажимов авторинга (цель: предсказуемость, не оптимизация)

Класс зажима «скелет печатает плейсхолдер в ОПЦИОНАЛЬНОЙ секции → проверка отвергает пустую форму».
Ранее закрыты: bootstrap (оба парсера), MODULE_MAP (`<module>`).

### Гипотеза #1 — RESEARCH-плейсхолдер (broken-link класс) — ПОДТВЕРЖДЕНА, ЗАКРЫТА
- Пробовал: воспроизвёл на chain11 (реальный слип SDD_RESEARCH_REF_BROKEN на неизменённой RESEARCH-строке
  скелета `[<yyyy-mm-dd>-<slug>](./research/<…>.research.md)`).
- Причина: cli/cmd/sdd-check/sdd-check.cmd.ts резолвил плейсхолдер-target через existsSync как реальную ссылку.
- Фикс: shared/sdd/check.ts экспортирует `targetIsScaffoldPlaceholder` (грамматика PLACEHOLDER);
  sdd-check.cmd.ts пропускает `<...>`-targets в checkResearchRefs И checkSpecLinks (весь broken-link класс).
- Показал прогон: chain11 real artifact 1 error → 0 errors. Unit: sdd-check 79/79 (новый кейс + реальные
  broken-ref всё ещё ловятся — нет false-negative). tsc чист.
- Лок: cli/cmd/sdd-check/__tests__/sdd-check.cmd.test.ts «does NOT flag the untouched RESEARCH skeleton placeholder row».

### Побочное наблюдение (warn, не блокирует) — тот же «шаблон=формат» класс
- RESEARCH-скелет (templates.ts) сам печатает «ресёрчили/ресёрчей» → SDD_LANGUAGE_CALQUE warn на своём же тексте.
- INTER_MODULE_DEPENDENCIES диаграмма без дефолтной caption → SDD_DIAGRAM_CAPTION_MISSING warn.
  Кандидаты на правку скелета (warn-level), не блокируют approval.

### Следующее (гипотезы, отдельные — последовательно)
- caption→семантика: checkDiagramCaptions declaredIds = только эта спека; родительский REQ (реально существующий) отвергается.
- детерминизм скелета: предзаполнить родительскую ссылку/portal-регистрацию (убрать worker-вычисляемые слипы).

### Гипотеза #2 — caption→семантика (cross-scope REQ) — ПОДТВЕРЖДЕНА, ЗАКРЫТА
- Пробовал: chain10 реальный слип SDD_DIAGRAM_CAPTION_REQ_UNKNOWN на `FIB-REQ-2` в модуле nth (акроним NTH).
- Подтвердил: модуль структурно трассирует к родительским FIB-REQ-* (vision «Родительские требования FIB-REQ-1…6»,
  «Сужает FIB-REQ-3,4,5»). Caption с родительским REQ семантически валиден; проверка байт-строга (только `### <ID>` этой спеки).
- Фикс (pure, без FS): checkDiagramCaptions флагает undeclared REQ ТОЛЬКО если его акроним ∈ акронимы этой спеки;
  чужой акроним = кросс-скоуп трассировка → допускается. shared/sdd/check.ts.
- Показал прогон: chain10 real 2 errors → 1 error (caption ушла; осталась настоящая `../../` link = гипотеза #3).
  Unit: check-diagram-captions 12/12 (новый cross-scope кейс + свой опечатанный IC-REQ-9 всё ещё ловится).
- Лок: shared/sdd/__tests__/check-diagram-captions.test.ts «cross-scope parent requirement → allowed».

### Гипотеза #3 — родительская ссылка модуля (детерминизм скелета) — КОРЕНЬ = БАГ СКЕЛЕТА, ЗАКРЫТА
- Пробовал: chain10 SDD_BROKEN_SPEC_LINK на `../../fibonacci.spec.md`.
- НАШёл: скелет MODULE_VISION (templates.ts:989 + партиал → директива module-spec-structure.xml)
  инструктировал `ссылка на ../../<scope>.spec.md`. Для ПЛОСКОГО модуля specs/<scope>/<module>/ верно `../` (один).
  `../../` = два уровня = мимо. Воркер chain10 честно followed скелет → битая ссылка. Это НЕ нондетерминизм — баг шаблона.
- Фикс: templates.ts MODULE_SKELETON → `../<scope>.spec.md` (+ заметка про глубину --module, БЕЗ бэктиков —
  они рвут TS template-literal под --experimental-strip-types, как ранее с coverage-подсказкой). build:directives
  перегенерил module-spec-structure.xml (партиал sdd-skeleton-module регистрируется из TEMPLATES.module.skeleton).
- Показал: директива теперь `../<scope>.spec.md`. tsc чист, dist+directives пересобраны.
- Лок: shared/sdd/__tests__/templates.test.ts «module skeleton points backlink at ../<scope>, not ../../».
- Примечание: chain10 существующий артефакт уже содержит старый `../../` (скелет-фикс влияет на БУДУЩИЕ прогоны).

### Портал-orphan (chain11b) — НЕ зажим, воркер-вариативность
- chain8/9/10 воркер регистрировал скоуп в портале (я флипал 🚧→✅); только chain11b пропустил. 1/4 — воркер-слип,
  не детерминированный баг скелета. Остаётся в воркер-слое (few-shot/скелет-подсказки), не «снятие зажима».

### Побочно (warn, не блокирует): скелет RESEARCH печатает «ресёрчили/ресёрчей» → SDD_LANGUAGE_CALQUE на своём тексте.
Кандидат на мелкую правку скелета (сменить на «исследовали/исследований»), warn-only.

### Замер предсказуемости после снятия 3 зажимов (пачка 3, сигнал не статистика)
- chain12a: pass, sdd-check ✅ clean (0 err)
- chain12b: pass, sdd-check ✅ clean (0 err)
- chain12c: pass, 1 err — НОВАЯ форма SDD_DIAGRAM_INVALID (worker написал невалидный mermaid:
  `nth[validate and compute F(n)]` — скобки в тексте узла без кавычек; известный mermaid-готча).
- Результат: 2/3 чисто (67%) vs прежние 1/4 (25%). НИ ОДИН из 3 снятых слипов (research/caption/../../)
  не вернулся — фиксы держатся. Остаточные формы (mermaid-синтаксис, кальки, portal-orphan) — worker-качество,
  не детерминированные зажимы. Кандидаты на few-shot/скелет-примеры (отдельная гипотеза), не «снятие зажима».

### Форма #4 — невалидный mermaid (chain12c) — ПОПРАВКА ПОДХОДА оператором
- СНАЧАЛА (неверно): добавил в директиву diagram-vocabulary правило «как строить mermaid». Оператор поправил:
  НЕ пихать в промпт инструкции «как строить схемы» — модель и так умеет. При синтаксической ошибке ВАЛИДАТОР
  должен, как компилятор, дать точную ошибку (строка + топ-причины перепроверить), и модель сама починит
  (оператор много раз видел self-fix без примеров). Фикс — в ОШИБКЕ инструмента, не в директиве.
- Откатил: diagram-vocabulary.hbs (правило убрано), build:directives, check:directives-fresh ✓.
- Правильный фикс: shared/sdd/mermaid-check.ts — сообщение SDD_DIAGRAM_INVALID теперь = raw mermaid parse error
  (строка+near, уже был) + MERMAID_TOP_CAUSES (топ-4 причины перепроверить: кавычки для меток со спецсимволами,
  один оператор на строку, объявлять узел до ссылки, не использовать reserved как id). Строка finding уже точная.
- Показал: на сломанной диаграмме chain12c ошибка теперь = line 6 + «Parse error on line 2: near …» + топ-причины.
- Лок: shared/sdd/__tests__/mermaid-check.test.ts (сообщение содержит «Топ причин перепроверить» + «двойных кавычках»).
- Урок (записать в LEARNINGS): помощь/энфорс на уровне ИНСТРУМЕНТА (ошибка валидатора), не промпта. Диагностика ошибки
  должна быть самодостаточной для self-fix; не считать модель незнающей и не дублировать инструкции в директивы.

### chain13-батч — ВЫРОЖДЕН (инфраструктура, не качество)
- 3 параллельных авторинга × review-субагенты = ~6 конкурентных сессий на одном :4098 → перегрузка:
  obs=1, «no messages», specs 1/1/0, вердиктов нет. Ошибки `<ACR>`-плейсхолдеров = из пустых фикстур (воркер не отработал).
- Вывод: батчи авторинга гонять ПОСЛЕДОВАТЕЛЬНО (или ≤2), иначе тест-сервер деградирует. chain14 — последовательно.

### Подтверждение #1 (mermaid) — последовательный батч chain15a/b/c
- Все 3 прогона: pass, sdd-check ✅ clean, DIAGRAM_INVALID ни в одном логе (0/3).
- Совокупный чистый streak авторинга после фиксов: chain12a,b + chain14a,b,c + chain15a,b,c = 8/9 (единственный не-clean — chain12c mermaid, форма больше не рецидивирует).
- Оговорка: ни один воркер не написал битый mermaid → путь «self-fix по улучшенной ошибке» не триггернулся. Доказано: улучшенный текст ошибки (unit-lock mermaid-check.test) + 0 рецидивов. Прямое доказательство self-fix требует инъекции битого mermaid + fix-прогон (точечно, искусственно).
- Батчи гнать ПОСЛЕДОВАТЕЛЬНО (параллель перегружает :4098). Для скорости фидбэка можно --observe-every-ms 60000.

### Подтверждение #1 (mermaid) — ДОКАЗАНО поведенчески (broken-specs фикстура + repair-фаза)
- Новый durable-ассет: fixture `broken-specs` (валидные по структуре спеки + 1 инъектированная невалидная
  mermaid-метка `calc[compute F(n)]`) + phase `repair` / mode `fix-to-clean` (prompt: run sdd-check, fix each
  error по тексту находки, до clean).
- Прогон repair (broken-specs-repair): worker прочитал SDD_DIAGRAM_INVALID + топ-причины → починил РОВНО по
  причине #1: `calc[compute F(n)]` → `calc["compute F(n)"]` → sdd-check ✅ clean. tools=17. Финал: «Согласно
  тексту ошибки». Ни одной инструкции «как писать mermaid» в промпте.
- Вывод: хорошая ошибка инструмента ⇒ агент self-fix. Подтверждает принцип «энфорс/помощь на уровне
  инструмента, не промпта». Ассет переиспользуем для A/B «старая vs новая ошибка → tool-calls/токены на починку».
