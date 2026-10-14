ВЕРИФИКАЦИЯ — Пачка 9 «Поставляемая поверхность под замком, имена команд не путаются»

Дерево: `rc-v6`, ветка `lead/surface-locks`, база `origin/lead/kit-lint` = `61b86fb8` (подтверждено `git ls-remote --heads origin` → `61b86fb80fdc…` для `refs/heads/lead/kit-lint`). Диапазон `61b86fb8..041c507a`, 5 коммитов. Рабочее дерево чистое (`git status --porcelain` → 0 строк).

Метод: каждое утверждение отчётов → перезапущенная команда → вердикт. Both-way доказательства сделаны в **изолированной копии** дерева (`scratchpad/probe`, rsync без `node_modules`/`coverage`/`dist`, `node_modules` симлинком) — проверяемое дерево не мутировалось.

---

## A. Полнота диффа

`git diff --stat 61b86fb8..041c507a` → **15 файлов, +2181/−3**. Пофайловая сверка с таблицами:

| # | Файл из `git diff --name-only` | Коммит | Строка в таблице |
|---|---|---|---|
| 1 | `ai/directives/agent-inbox/golden-chat-output.example.md` | `041c507a` | есть (`R-BATCH-09`, `R-SO-5`) |
| 2 | `ai/kit/__tests__/directive-activation-announcement.test.ts` | `5e1d40e0` | есть (`R-LOCK-3`) |
| 3 | `ai/kit/__tests__/skills-home-path.test.ts` | `d5274a14` | есть (`R-LOCK-2`) |
| 4 | `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts` | `3feace46` | есть (`R-LOCK-1`) |
| 5 | `cli/cmd/help/__tests__/command-name-disambiguation.test.ts` | `9f61c159` | есть (`R-SO-14`) |
| 6–9 | `cli/cmd/{orient,sdd-migrate,sdd-sync,sync}/help.ts` | `9f61c159` | есть (`R-SO-14` — 4 отдельные строки; `R-BATCH-09` — одна групповая) |
| 10 | `shared/common/sync/__tests__/GOLDEN-MANIFEST.md` | `041c507a` | есть (`R-SO-5`) |
| 11–13 | `shared/common/sync/__tests__/deployed-surface.{directives,skills,tarball}.golden.txt` | `041c507a` | есть (`R-SO-5` — 3 отдельные строки) |
| 14 | `shared/common/sync/__tests__/deployed-surface.test.ts` | `041c507a` | есть (`R-SO-5`) |
| 15 | `specs/cli/cli.spec.md` | `9f61c159` | есть (`R-SO-14`) |

Ни одного файла без строки, ни одной строки без файла. Пофайловые суммы каждого из 5 коммитов совпадают со своим отчётом (32+1 / 46 / 38 / 140+1 / 1925+1). **ПОДТВЕРЖДЕНО.**

Зоны других пачек: `git diff --name-only … | grep -E 'ai/flow-eval/|cli/cmd/sync.*core|shared/sdd/check\.ts'` → пусто. **ПОДТВЕРЖДЕНО.**

`agent-inbox`: тронут ровно один файл, ровно одна строка — `ai/directives/agent-inbox/golden-chat-output.example.md:176`, три вхождения `/Users/k.lebedev/.gennady/agent-inbox/reports/group__proj-510…` → `~/.gennady/…`. Это ровно та утечка, которую `61-TASK-BOARD.md:94` называет поимённо и по которой та же строка доски снимает D-2 («устранение утечки в *поставляемой поверхности*, а не работа над agent-inbox; D-2 не нарушается»). **ПОДТВЕРЖДЕНО, D-2 соблюдён.**

---

## B. Существо и both-way каждого замка

Все пять тест-файлов сперва прогнаны в probe без правок — зелёные (17/17, 1/1, 1/1, 2/2). Затем внесены регрессы.

### LOCK-1 — `model:` пин (`20-ISSUES-VERDICTS.md` #9.5)
Код: `ai/kit/__tests__/stateless-sdd-flow-contract.test.ts:299-311`, корни `['ai/skills','ai/directives','ai/kit/templates']`, паттерн `/model:\s*["']?(?:sonnet|haiku|opus)["']?/`.
Вставлен пин в три места (шаблон `.hbs`, собранная директива, `SKILL.md`) → **красный**, `offenders` = ровно эти три пути:
`ai/skills/sdd-execute/SKILL.md`, `ai/directives/sdd-v2/execute.directive.xml`, `ai/kit/templates/sdd-v2/execute.directive.hbs`. На чистом дереве — зелёный. **ПОДТВЕРЖДЕНО both-way.**

### LOCK-2 — домашний путь скиллов (#11)
Код: `ai/kit/__tests__/skills-home-path.test.ts:31-45`, корни `['ai/directives','ai/skills']`, `~\/\.claude\//` и `\.claude\/skills\/sdd-execute\/scripts/`.
Вставлен `~/.claude/skills/sdd-execute/scripts/sdd` в `ai/directives/sdd-v2/critic.directive.xml` → **красный**, offender = ровно этот файл. Восстановление → зелёный. **ПОДТВЕРЖДЕНО both-way.**
Оговорка: приёмка доски (стр. 39) сформулирована как «contract-тест по `ai/**`», реально сканируются только `ai/directives` + `ai/skills` — `ai/kit/templates/**` и прочее под `ai/**` не покрыто. Обоснование `R-LOCK-2` (гейт `check:directives-fresh` не даёт `ai/directives` разойтись с шаблонами) — проза, а не тест. Неблокирующее.

### LOCK-3 — `DIRECTIVE ACTIVATED` (#16)
Код: `ai/kit/__tests__/directive-activation-announcement.test.ts:28-38`, только `ai/skills/**/SKILL.md`.
Вставлен `Announce: DIRECTIVE ACTIVATED: SddCritic` в `ai/skills/sdd-critic/SKILL.md` → **красный**, offender = ровно этот файл. Восстановление → зелёный. **ПОДТВЕРЖДЕНО both-way.**
**Расхождение с первоисточником.** `20-ISSUES-VERDICTS.md:272` требует: «Contract-тест по `ai/skills/**/SKILL.md` **и rendered `ai/directives/sdd-v2/**`**: `doesNotMatch(/DIRECTIVE ACTIVATED/)` в скиллах **и dispatch-шаблонах**». Половина про директивы не реализована; фраза сегодня живёт в `ai/directives/sdd-v2/router.directive.xml:130` и `ai/kit/axiom/process/ax-no-process-narration.xml:3` (определения аксиома — потребовался бы allow-list). `R-LOCK-3` §4 утверждает «нет отклонений» — это неточно. Приёмка колонки доски (стр. 40, только `SKILL.md`) выполнена, поэтому неблокирующее.

### SO-14 — восемь имён
Восемь имён перечислены в коде (`command-name-disambiguation.test.ts:32-42`): семь конкретных — `sync`, `sync-skills`, `sdd-sync`, `sdd-migrate`, `orient`, `sdd-orient`, `agents-rules` — плюс отложенное `sdd-rules` (`DEFERRED_NAME`). Доска (стр. 103) называет восьмёркой те же четыре `*sync*` + `orient`/`agents-orient`/`sdd-orient`/`sdd-rules`; подстановка `agents-rules` вместо будущего `agents-orient` корректна — переименование принадлежит T-10, не этой задаче.
Мастер-листинг: `cli/cmd/help/help.cmd.ts:31,34,40,42,49,51,53` — семь строк, описания различны; файл в диффе не менялся (подтверждено). Модуль-карта: `specs/cli/cli.spec.md` §9.1 (раздел `## 9. Module Map` / `### 9.1 Modules`), строки 2465,2466,2468,2469,2470,2471,2472; новые строки `sdd-sync` и `sdd-migrate` ссылаются на реально существующие `specs/cli/sdd-sync/sdd-sync.spec.md` и `specs/cli/sdd-migrate/sdd-migrate.spec.md`. **ПОДТВЕРЖДЕНО.**
Grep-замок both-way, три свойства:
- удалена строка `- [sdd-sync](…)` из `cli.spec.md` → красный: «cli.spec.md §9.1: missing a description line for: sdd-sync»;
- описанию `sdd-sync` подставлено описание `sync` в `help.cmd.ts` → красный: «two names share one description … [["sync","sdd-sync"]]»;
- добавлена строка `sdd-rules` в `help.cmd.ts` → красный: «sdd-rules is a deferred command (§3.1)».
Восстановление → зелёный. **ПОДТВЕРЖДЕНО both-way.**
Пробел: сами cross-ref строки «Not `X`…» в четырёх `help.ts` — содержательная часть SO-14 — **ничем не заперты**: замок читает `help.cmd.ts` и `cli.spec.md`, а не `cli/cmd/*/help.ts`. Удаление любой из четырёх фраз оставит тест зелёным. Неблокирующее, но `R-SO-14`/`R-BATCH-09` этого не оговаривают. Пункт `back-sync` из приёмки `32-TRACK-SYNC-OWNERSHIP.md:462` замком не покрыт — по доске он принадлежит T-B6-28 (стр. 178); остаток `back-sync` жив в `ai/directives/sdd-v2/reconcile.directive.xml:1` (keywords).

### SO-5 — golden поставляемой поверхности
Фиксируется **три списка путей** (не содержимое): `scanDirectives(ai/directives)` — 104 пути (то, что копирует `sync`); `scanSkills(ai/skills)` — 13 путей (`sync-skills`); `npm pack --dry-run --json` — 1636 путей. Счётчики файлов golden сверены: 104 / 13 / 1636. Четвёртый `it` — безусловный инвариант «нет `/Users/<имя>/` и `/home/<имя>/`» (regex `DEV_HOME_LEAK` с `(?!<)`, чтобы плейсхолдер `<user>` не считался утечкой), по нормализованному контенту для directives/skills и по сырым байтам для tarball.
Конвенция обновления: `UPDATE_SURFACE_GOLDEN=1` (`deployed-surface.test.ts:32`), задокументирована в `shared/common/sync/__tests__/GOLDEN-MANIFEST.md` по образцу `UPDATE_VERIFY_GOLDEN=1`; владельцы намеренного дрейфа расписаны по трём golden. **ПОДТВЕРЖДЕНО.**
Both-way утечки: в probe восстановлено дособытийное содержимое `git show 61b86fb8:ai/directives/agent-inbox/golden-chat-output.example.md` → четвёртый `it` **красный**, offenders = `sync:ai/directives/agent-inbox/golden-chat-output.example.md` и `tarball:…` (обе поверхности). На текущем дереве — зелёный; независимый `grep -rE '/Users/[…]/|/home/[…]/' ai/directives ai/skills | grep -v '<user>'` → пусто. **ПОДТВЕРЖДЕНО both-way.**
Расположение теста: обоснование верно. `scripts/test-topology.ts:19` — `TEST_ROOTS = ['ai','cli','services','shared']`, `scripts/` не входит; тест по пути из доски (`scripts/__tests__/deployed-surface.test.ts`) не обнаруживался бы ни одним раннером. **ПОДТВЕРЖДЕНО.**

---

## C. Регрессии — перезапуск

Перезапущено мной полностью, ничего не взято из отчётов на веру:
`npm test`; `npm run check` (дважды); `npm run test:coverage`; `npm run build`; `npm run gate:sdd-check-baseline`; `npm run test:topology`; `node --import tsx scripts/test-topology.ts list`; изолированные прогоны всех пяти тест-файлов пачки; `npm pack --dry-run --json` с построчной сверкой против golden; репо-wide grep на класс утечки; `git merge-tree` против PR #31.

| Команда | Заявлено | Получено |
|---|---|---|
| `npm test` | 3614 / 3604 pass / 0 fail, exit 0 | **3614 / 3603 pass / 1 fail / 10 skip, exit 1** — ОПРОВЕРГНУТО |
| `npm run check` | ALL PASS (5/5) | **⛔ остановлен на `test:coverage`, exit 1** — ОПРОВЕРГНУТО (чистый повтор) |
| `npm run test:coverage` | — | exit 1, fail 1 (+3 cancelled — известная флакость вне диффа) |
| изолированно `deployed-surface.test.ts` | 4/4 | **3 pass / 1 fail** — детерминированно |
| `npm run build` | ok | ✓ built in 4.74s, exit 0 — ПОДТВЕРЖДЕНО |
| `npm run gate:sdd-check-baseline` | no error outside baseline | «OK — no error outside the baseline (`227c03a8`, tag `rc-baseline-1`)» — ПОДТВЕРЖДЕНО |
| `npm run test:topology` | unit=216 contract=22 local=52 external=8 | точное совпадение; `coverage observed=238 black-box=60` — ПОДТВЕРЖДЕНО |

### Блокирующее — `deployed-surface.tarball.golden.txt` не воспроизводим

Падает `it` №3. Причина: golden замораживает **514 путей `dist/**`**, из них **512 — `dist/chunks/*` с content-hash в имени**, а `dist/` **в `.gitignore`** (`git check-ignore -v dist/chunks` → `.gitignore:11:dist`). Следствия:
- фактический `npm pack --dry-run` даёт сейчас 1697 путей против 1636 в golden; вся дельта — 61 файл `dist/chunks/*`, ни одного пропавшего;
- `mtime` показывает механизм: golden записан 18:45:59, коммит SO-5 в 18:47:56, `npm run build` из того же отчёта — 18:54:10; собственный build исполнителя сгенерировал новые хеши и обрушил собственный golden, после чего сюита не перезапускалась;
- на свежем клоне (`dist/` отсутствует) тест падает тем же `it` — воспроизведено в probe, где `dist` исключён: `it` №1 и №2 зелёные, `it` №3 красный. То есть `it` №1/№2 детерминированы, а `it` №3 — нет по построению.

Правка: убрать `dist/**` из третьего golden (замораживать список без `dist/`, а факт присутствия сборки проверять структурно) либо снять `it` №3. Пока этого нет, ветка красит `npm test`, `npm run test:coverage` и `npm run check` у любого, кто соберёт проект.

Примечание: первый мой прогон `npm run check` показал ALL PASS — он шёл параллельно с моим собственным `npm pack --dry-run`; чистый повторный прогон падает. Достоверен повтор.

### Пересечение с `lead/specs-match-code` (PR #31)
Обе ветки от `61b86fb8` (`git merge-base 61b86fb8 4471eb7d` = `61b86fb8`). Пересечение множеств изменённых файлов (`comm -12`) — **пусто**: #31 трогает `cli/cmd/sdd-check/help.ts`, `specs/cli/sdd-check/…`, `reconcile.directive.*`; пачка 9 — `cli/cmd/{orient,sdd-migrate,sdd-sync,sync}/help.ts` и `specs/cli/cli.spec.md`. Ни `help.ts`, ни `cli.spec.md` не общие. `git merge-tree --write-tree 041c507a 4471eb7d` → exit 0, дерево `33b3cb7f`, 0 конфликтов. **Порядок мержа безразличен.**

---

## D. Сводный отчёт-черновик PR

Понятен без кодов: раздел «Что это и зачем (простыми словами)» объясняет три замка, спутанные имена и деплой-golden человеческим языком. База указана явно и верна. Отклонения (путь SO-5, нетронутый `path-normalizer.ts`, отсутствие cross-ref у `sync-skills`/`agents-rules`) перечислены. Неточности:
1. «`npm test` … 3604 pass, 0 fail» и «`check` ALL PASS» — опровергнуто (см. C); эти же числа стоят внутри узла `PASS` mermaid-схемы «стало».
2. Mermaid «стало» в `R-BATCH-09`: `SRC["ai/skills, ai/directives, ai/kit/templates"]` ведёт стрелками в L1, L2 **и** L3 — реальные корни у LOCK-2 это `ai/directives`+`ai/skills`, у LOCK-3 только `ai/skills/**/SKILL.md`. Стрелка ≠ вызову. (Схемы в `R-LOCK-2`/`R-LOCK-3` корректны и корни называют точно.)
3. Mermaid в `R-SO-5`: цепочка `DIRS → SYNCCORE → NORM → TEST → G1`; `normalize()` на golden-пути (`it` №1, `deployed-surface.test.ts:95-98`) не вызывается — он только в `it` №4 (`:117,124`).
4. Mermaid в `R-SO-14`: `H1 --> MAP --> LOCK`; `help.ts` не питает `cli.spec.md`, а лок читает `help.cmd.ts` + `cli.spec.md` и ни один из четырёх `help.ts` не читает.
5. «все новые файлы — ровно в одном слое (`contract`×3, `contract`×1, `local`×1)» — фактически `contract`×3, **`unit`**×1 (`cli/cmd/help/__tests__/command-name-disambiguation.test.ts`), `local`×1. Классификация действительно однослойная, но подпись неверна.

---

## Итог

**Блокирующее (1).**
- `shared/common/sync/__tests__/deployed-surface.tarball.golden.txt` заморозил 514 путей `dist/**` (512 хеш-именованных чанков) из gitignored-каталога → `it` №3 падает детерминированно на текущем дереве и на любом свежем клоне; `npm test` = exit 1, `npm run check` = exit 1. Заявленные «3604 pass / 0 fail» и «ALL PASS (5/5)» на состоянии `041c507a` не воспроизводятся.

**Неблокирующее (6).**
- LOCK-3 не покрывает rendered `ai/directives/sdd-v2/**`, хотя `20-ISSUES-VERDICTS.md:272` требует; `R-LOCK-3` заявляет «нет отклонений».
- Cross-ref строки в четырёх `cli/cmd/*/help.ts` — содержание SO-14 — не заперты ни одним тестом.
- LOCK-2 сканирует `ai/directives`+`ai/skills`, а приёмка доски говорит `ai/**`.
- Подпись слоёв в `R-BATCH-09` (`contract`×1 вместо `unit`×1).
- Три mermaid-неточности (пп. 2–4 раздела D) + числа в узле `PASS`.
- `back-sync` в `reconcile.directive.xml:1` не покрыт — по доске принадлежит T-B6-28, но `32-TRACK-SYNC-OWNERSHIP.md:462` вписывает его в приёмку SO-14.

**Подтверждено.** Полнота диффа (15/15) и непересечение с зонами других пачек; D-2 соблюдён (одна строка в agent-inbox, санкционирована доской). Both-way всех трёх замков с точными списками нарушителей. Both-way SO-14 по трём свойствам; восемь имён перечислены и разведены; цели ссылок §9.1 существуют. Both-way инварианта утечки SO-5; golden 104/13 воспроизводимы; конвенция `UPDATE_SURFACE_GOLDEN=1` задокументирована; обоснование расположения теста верно (`TEST_ROOTS` не содержит `scripts/`). `build`, `gate:sdd-check-baseline`, `test:topology` (216/22/52/8) — точно как заявлено. Конфликтов с PR #31 нет.

**Рекомендация: ВЕРНУТЬ на правку** — починить третий golden (исключить `dist/**`), перезапустить `npm test` + `npm run check` на итоговом состоянии, поправить пять неточностей отчётов; затем PR без повторной полной верификации (достаточно предъявить зелёный `npm test`/`check`). Порядок мержа относительно PR #31 — **любой**: общих файлов нет, `merge-tree` чист.
