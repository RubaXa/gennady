ВЕРИФИКАЦИЯ отчёта `_raw/reports/R-02-GAP-B-2.md` (GAP-B-2, D-54) — независимая проверка `plan-verifier`

Проверяемое дерево: `<SP>/rc-w2` (далее `<TREE>`), ветка `lead/GAP-B-2`, HEAD `85d2fed1`, `HEAD~1` = `48538019` — совпадает с брифом.
`<SP>` = `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad`.
Всё, что ниже — перезапущено мной. Дерево исполнителя не изменено: `git -C <TREE> status --porcelain` пусто до и после всех прогонов; временные worktree удалены (`git worktree list | grep -c probe-` → 0).

---

## A. Полнота таблицы файлов

| Утверждение отчёта | Команда/строка | Вердикт |
|---|---|---|
| 4 файла в диффе, 4 строки в таблице | `git -C <TREE> diff --stat 48538019 85d2fed1` → `ai/flow-eval/.baseline/README.md 39`, `ai/flow-eval/scripts/pre-push-gate.smoke.sh 72`, `package.json 3`, `scripts/git-hooks/pre-push 77`; `4 files changed, 174 insertions(+), 17 deletions(-)` | ПОДТВЕРЖДЕНО (число-в-число) |
| `pre-commit` НЕ тронут | `git diff --name-status 48538019 85d2fed1` → `M README.md`, `A pre-push-gate.smoke.sh`, `M package.json`, `A pre-push`; `scripts/git-hooks/pre-commit` отсутствует | ПОДТВЕРЖДЕНО |
| `sdd-check-zero-new-error.ts` НЕ тронут | там же — файла нет в диффе | ПОДТВЕРЖДЕНО |
| Оба новых файла исполняемые | `git ls-tree 85d2fed1` → `100755` у `pre-push` и у `pre-push-gate.smoke.sh`; на диске `-rwxr-xr-x` | ПОДТВЕРЖДЕНО |
| «`grep -rn "check:ci"` вне комментариев/README — 0» | `git grep -n check:ci 85d2fed1` → 4 попадания: `README.md:62,64` (историческое описание), `sdd-check-zero-new-error.ts:6` (комментарий-заголовок), `pre-push:5` (комментарий). В `package.json` — 0 | ПОДТВЕРЖДЕНО |
| Смоук не подхватывается топологией | `scripts/test-topology.ts:20` `const TEST_FILE = /\.test\.ts$/;` + `:151` — `.sh` физически не может попасть в discovery. Прецедент `ai/flow-eval/scripts/require-developer-repo.test.sh` существует | ПОДТВЕРЖДЕНО |

---

## B. Хук `scripts/git-hooks/pre-push`

- «Устаревший dist» определяется так (`:56-65`): нет `dist/gennady.js` → build; иначе `find cli shared services index.ts vite.config.ts package.json -type f -newer "$DIST_ENTRY"` непусто → build. Т.е. **сравнение mtime**, как и написано в отчёте. ПОДТВЕРЖДЕНО.
- Затем безусловно `npm run gate:sdd-check-baseline` (`:75`), при ненулевом коде — `fail()` → `exit 1` (`:49`). ПОДТВЕРЖДЕНО.
- **Прогон в дереве** (`bash scripts/git-hooks/pre-push < /dev/null`, cwd `<TREE>`):
  ```
  🔍 Pre-push: build (if stale) + sdd-check zero-new-error baseline gate
    dist is missing or stale — running: npm run build
  ✓ built in 2.94s
  [sdd-check-zero-new-error] OK — no error outside the baseline (baseline commit 227c03a8…, tag rc-baseline-1).
  ✅ Pre-push passed
  EXIT=0
  ```
  ПОДТВЕРЖДЕНО (у меня dist оказался stale — сработала ветка build; повторный прогон в п. «красный гейт» дал `dist is up to date — skipping npm run build`, т.е. обе ветки эвристики наблюдались).
- **Красная ветка, без правки дерева** (PATH-шим на `npm`, отдающий exit 1 и строку гейта): хук напечатал `NEW ERROR: ERR_STUB_CODE  some/file.ts`, затем баннер `❌ PRE-PUSH FAILED — gate: gate:sdd-check-baseline — new sdd-check error(s) outside ai/flow-eval/.baseline/sdd-check-227c03a8.json (see the NEW ERROR lines above: code + file)`, `EXIT=1`. ПОДТВЕРЖДЕНО.
- **Смоук** `bash ai/flow-eval/scripts/pre-push-gate.smoke.sh` (мутированная копия baseline в `$TMPDIR`, дерево не тронуто):
  ```
  removed from working copy: code=ERR_CLI_SDD_CHECK_READ_FAILED file=tasks/ai/directives/coding/typescript-rules.xml
  == 1/2: … (expect exit 1, named NEW ERROR) ==
  [sdd-check-zero-new-error] FAIL — 1 error(s) not present in the baseline (…/baseline-missing-one-error.json):
    NEW ERROR: ERR_CLI_SDD_CHECK_READ_FAILED  tasks/ai/directives/coding/typescript-rules.xml
  == 2/2: … (expect exit 0) ==
  [sdd-check-zero-new-error] OK — …
  SMOKE OK: …
  SMOKE_EXIT=0
  ```
  Вывод отчёта воспроизведён дословно. ПОДТВЕРЖДЕНО. Дополнительно прогнал смоук из другого cwd (`<TREE>/cli`) — несмотря на жёсткий `--root .` в `:55/:66`, результат тот же (exit 0); зависимости от cwd на практике нет.
- `git -C <TREE> status --porcelain` после всех прогонов — пусто. ПОДТВЕРЖДЕНО.

---

## C. `npm run prepare` / `core.hooksPath` — **ЗДЕСЬ БЛОКИРУЮЩЕЕ**

Новый рецепт: `"prepare": "[ -d .git ] && git config --worktree core.hooksPath scripts/git-hooks || true"`.

1. **Нужен ли fallback без `extensions.worktreeConfig`?** НЕТ. Факт: во временном `git init`-репозитории без расширения `git config --worktree core.hooksPath scripts/git-hooks` отработал exit 0 и записал значение (`--worktree` документированно вырождается в `--local`, когда расширение выключено); `git --version` = 2.39.5. В самом репозитории `git -C <TREE> config --get extensions.worktreeConfig` = `true`. **ОПРОВЕРГНУТА только опасение-часть**: fallback не требуется, свежий клон работает.

2. **rc-w2.** `git -C <TREE> config --get core.hooksPath` = `scripts/git-hooks`; `git -C <TREE> rev-parse --git-path hooks` = `scripts/git-hooks`; `.git/worktrees/rc-w2/config.worktree` содержит `hooksPath = scripts/git-hooks`. ПОДТВЕРЖДЕНО — **но не тем механизмом, который назван в отчёте** (см. п. 5).

3. **Главный клон и rc-v6 не затронуты.** `git -C /Users/k.lebedev/Developer/gennady config --get core.hooksPath` = `/Users/k.lebedev/Developer/gennady/scripts/git-hooks` (источник — `file:.git/config`, `--show-origin`); `.git/config.worktree` в главном клоне отсутствует; rc-v6 отдаёт тот же абсолютный путь. ПОДТВЕРЖДЕНО.

4. **Относительный hooksPath резолвится от корня worktree.** Факт: во временном worktree с `hooksPath = scripts/git-hooks` из cwd `<WT>/cli` команда `git rev-parse --git-path hooks` вернула `../scripts/git-hooks` — то есть `<WT>/scripts/git-hooks`, корень рабочего дерева, не cwd и не общий клон. ПОДТВЕРЖДЕНО.

5. **ОПРОВЕРГНУТО: `npm run prepare` в worktree не делает ничего.** В связанном worktree `.git` — это **файл** (`gitdir: …`), поэтому `[ -d .git ]` ложно и вся команда вырождается в `|| true`.
   Факты (временный worktree от `85d2fed1`, создан от главного клона, удалён после `git worktree remove --force`):
   ```
   BEFORE hooksPath: /Users/k.lebedev/Developer/gennady/scripts/git-hooks
   --- npm run prepare ---
   > [ -d .git ] && git config --worktree core.hooksPath scripts/git-hooks || true
   AFTER hooksPath: /Users/k.lebedev/Developer/gennady/scripts/git-hooks
   AFTER config.worktree: (none)
   --- та же команда вручную ---
   MANUAL git-path hooks: scripts/git-hooks
   ```
   Проверка `[ -d .git ]` прямо в `<TREE>`: `NOT DIR`.
   Значит утверждение таблицы файлов отчёта — «ручной прогон `npm run prepare` в `rc-w2` → `.git/worktrees/rc-w2/config.worktree` получил `hooksPath`» — **неверно**: `config.worktree` в rc-w2 заполнила ручная команда `git config --worktree …` из §3 п.2 отчёта, а не `prepare`.
   Побочный факт (объясняет, почему в моём первом зонде новый worktree «уже» имел относительный путь): `git worktree add`, запущенный **из** rc-w2, копирует `config.worktree` текущего worktree в новый. От главного клона — не копирует.

6. **Следствие: критерий приёмки задачи не выполнен.** Строка `GAP-B-2` в `61-TASK-BOARD.md §1` требует дословно: «`git config core.hooksPath` == `scripts/git-hooks` (относительный) **в свежем worktree**» и «хуки должны исполняться в **любом** worktree, а не только в основном клоне». Фактически в свежем worktree после `npm ci`/`npm install` (которые и запускают `prepare`) значение остаётся абсолютным путём в главный клон — т.е. ровно та находка R-00, ради которой задача и заводилась, **не закрыта**. Закрыт только сам rc-w2, и то вручную.
   Минимальная правка (одна строка `package.json`): условие `[ -d .git ]` → `git rev-parse --git-dir >/dev/null 2>&1`, т.е.
   `"prepare": "git rev-parse --git-dir >/dev/null 2>&1 && git config --worktree core.hooksPath scripts/git-hooks || true"`.
   Отдельно стоит зафиксировать оператору (вне GAP-B-2): пока в общем `.git/config` лежит абсолютный `core.hooksPath`, каждый новый worktree наследует его до первого запуска `prepare`; полное лечение — стереть абсолютное значение из общего конфига, что требует правки главного клона и решения оператора.

---

## D. Числа отчёта — пересчитаны

- `npm --prefix <TREE> run check`: `[sdd-verify] ✅ ALL PASS (5/5)` — type-check 4.2s, test:coverage 47.1s, lint 2.9s, format 1.9s, yagni 0.8s; `CHECK_EXIT=0`. ПОДТВЕРЖДЕНО.
- `npm --prefix <TREE> test`: `# tests 3521 / # suites 585 / # pass 3511 / # fail 0 / # skipped 10 / # todo 0`, `TEST_EXIT=0`. ПОДТВЕРЖДЕНО дословно.
- Расхождение с V-01 (rc-v6, 3555 pass) объяснено и проверено арифметикой: ветки разные и **не пересекаются**. V-01 добавляет два новых тест-файла; прямой прогон в rc-v6
  `node --import tsx --test cli/cmd/sdd-verify/__tests__/parity-node.test.ts shared/sdd/__tests__/preset-node-golden.test.ts` даёт `# tests 44 / # suites 11 / # pass 44`.
  Итого `3511 + 44 = 3555` pass, `3521 + 44 = 3565` tests, `585 + 11 = 596` suites. ПОДТВЕРЖДЕНО.

---

## E. Mermaid «было/стало» и текст

Смысл обеих схем сверен с кодом и верен: `check:ci` действительно был недостижим (`.github/` в дереве нет — `ls -d <TREE>/.github` → not found), гейт действительно предпочитает собранный бинарь (`run-sdd-check-json.ts:40-43`, `const useBuilt = existsSync(distEntry)`), `pre-commit` действительно не изменён. Схемы читаемы без открытия файлов. НО **все пять `file:line`-якорей в подписях под схемами не совпадают с кодом**:

| В отчёте | Фактически |
|---|---|
| `scripts/git-hooks/pre-commit:63` (`npm run check`) | `pre-commit:72` (строка 63 — комментарий index-aware guard) |
| `pre-push:55-63` (build-if-stale) | `pre-push:56-72` (`find … -newer` — `:61`) |
| `pre-push:66` (`gate:sdd-check-baseline`) | `pre-push:75` |
| `sdd-check-zero-new-error.ts:74` (`main()`) | `:73` (`function main(): void`), вызов — `:103`; строка `NEW ERROR` — `:96` |
| `run-sdd-check-json.ts:35` (`existsSync(distEntry)`) | `:40-41` |

ОПРОВЕРГНУТО (неблокирующее): стрелки соответствуют реальным вызовам, но номера строк надо поправить в отчёте — иначе следующий читатель ищет не там.

---

## F. Остаток REL-19

`ai/flow-eval/scripts/sdd-check-zero-new-error.ts:6` по-прежнему: `// @consumers: package.json "gate:sdd-check-baseline" / "check:ci" (CI-only by design — …)`. После GAP-B-2 это ложь в двух местах: `check:ci` не существует, «CI-only» опровергнуто самим переносом в `pre-push`. **Неблокирующее** — комментарий описателен, поведение не задето, файл был под прямым запретом брифа. Владелец правки — **REL-19** (её строка в §1 прямо говорит: «эта задача зачищает остальные упоминания»).
Попутно для REL-19: её критерий приёмки — `grep -rn "check:ci\|workflows/ci" --include=*.md --include=*.json .` = 0 попаданий — после GAP-B-2 **не выполняется**, потому что новый текст `ai/flow-eval/.baseline/README.md` (строки 62 и 64) намеренно упоминает `check:ci` как исторический факт. REL-19 придётся либо переформулировать эти два предложения, либо ослабить критерий. Это надо донести владельцу REL-19 до выдачи брифа.

---

## Совместимость `lead/V-01` и `lead/GAP-B-2`

`comm -12` над `git diff --name-only 48538019 0ff59e39` (30 файлов, все — `cli/cmd/sdd-verify/__tests__/**` и `shared/sdd/__tests__/**`) и `git diff --name-only 48538019 85d2fed1` (4 файла) → **пересечение пусто**. Обе ветки от одного и того же `48538019`. Пушить последовательно в любом порядке (в т.ч. обе в `codex/sdd-v2-rc52-followup`) можно без rebase-конфликтов. ПОДТВЕРЖДЕНО.
Оговорка по факту из C: тот, кто пушит, должен убедиться, что его собственный worktree резолвит `core.hooksPath` в своё дерево — сейчас `rc-v6` и любой свежий worktree резолвят его в **главный клон**, где файла `scripts/git-hooks/pre-push` из этой ветки может не быть; для rc-w2 это уже сделано вручную.

---

## Итог

**БЛОКИРУЮЩЕЕ — одно (C.5/C.6):** `npm run prepare` в новой редакции — no-op в любом связанном worktree (`.git` там файл, `[ -d .git ]` ложно), поэтому заявленный и требуемый доской критерий «относительный `core.hooksPath` в свежем worktree» не достигается; в rc-w2 конфиг выставлен ручной командой, а не `prepare`. Правка — одна строка `package.json` (условие `git rev-parse --git-dir` вместо `[ -d .git ]`) плюс переписать соответствующую ячейку таблицы файлов отчёта.

**НЕБЛОКИРУЮЩЕЕ:** (E) пять неверных `file:line` в подписях к mermaid; (F) устаревший заголовок `sdd-check-zero-new-error.ts:6` — владелец REL-19; (F) новый текст README ломает нынешний критерий приёмки REL-19 — предупредить владельца.

**ПОДТВЕРЖДЕНО:** состав диффа и таблица файлов (A целиком); поведение и оба исхода `pre-push` (B целиком, exit 0 / exit 1 с code+file); смоук-скрипт воспроизводится дословно; неприкосновенность главного клона и rc-v6; все числа §3 (5/5, 3521/3511/10) сошлись точно; арифметика 3511 + 44 = 3555 подтверждена прямым прогоном; ветки `lead/V-01` и `lead/GAP-B-2` по файлам не конфликтуют.

**Рекомендация Lead: вернуть исполнителю на одну правку** (`package.json` `prepare` + ячейка таблицы + номера строк в mermaid-подписях), затем пушить. Если оператор торопится — допустимо пушить как есть **при условии**, что правка `prepare` заводится немедленной follow-up-строкой, иначе GAP-B-2 закрывает задачу, не закрыв её собственную находку R-00. `lead/V-01` можно пушить независимо прямо сейчас.
