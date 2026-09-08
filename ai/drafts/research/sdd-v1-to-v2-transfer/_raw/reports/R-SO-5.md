ОТЧЁТ 61/SO-5 — deployed-surface golden + починка найденной утечки пути (Пачка 9)

СТАТУС: DONE

Рабочее дерево: `rc-v6`, ветка `lead/surface-locks`.

КОММИТЫ (локальные, НИЧЕГО не запушено):
- `041c507a` feat(SO-5): golden-snapshot the deployed surface and fix a dev-home path leak
- `550139ef` fix(so-5): exclude gitignored dist/** build output from the tarball golden — **БЛОКИРУЮЩАЯ правка по V-BATCH-09** (см. §5)

---

## 1. Файлы

| Путь | Тип | Смысловое изменение | Чем доказано |
|---|---|---|---|
| `ai/directives/agent-inbox/golden-chat-output.example.md` | правка (строка 176) | Найденная утечка вычищена: `/Users/k.lebedev/.gennady/agent-inbox/reports/...` → `~/.gennady/agent-inbox/reports/...` (3 вхождения в одной markdown-строке). | Четвёртый `it` `deployed-surface.test.ts` («ships no file … with a developer home-directory path leak») — до правки падал бы на этом файле, после правки зелёный (см. §3). |
| `shared/common/sync/__tests__/deployed-surface.test.ts` | новый (`041c507a`), правка (`550139ef`) | 4 `it`: (1) golden-список файлов `scanDirectives(ai/directives)`, (2) golden-список `scanSkills(ai/skills)`, (3) golden-список `npm pack --dry-run --json` **минус любой путь `dist/**` (правка `550139ef` — см. §5)**, (4) безусловный инвариант — ни один файл (после нормализации путей для directives/skills, сырые байты для tarball, **включая `dist/**`** — фильтр из it №3 на инвариант утечки не распространяется) не содержит `/Users/<имя>/` или `/home/<имя>/`. | `node --import tsx --test shared/common/sync/__tests__/deployed-surface.test.ts` — 4/4 (см. §3). |
| `shared/common/sync/__tests__/deployed-surface.directives.golden.txt` | новый | Заморожен список 104 путей, которые `sync` реально копирует потребителю. | Тот же прогон, `it` №1. |
| `shared/common/sync/__tests__/deployed-surface.skills.golden.txt` | новый | Заморожен список 13 путей, которые `sync-skills` копирует в `.claude/skills/`. | `it` №2. |
| `shared/common/sync/__tests__/deployed-surface.tarball.golden.txt` | новый (`041c507a`), перегенерирован (`550139ef`) | Заморожен список **1122** путей `npm pack --dry-run` минус `dist/**` (было 1636 путей включая 514 `dist/**`, из них 512 хеш-именованных чанков сборки — недетерминированных между прогонами `npm run build`; см. §5). | `it` №3. |
| `shared/common/sync/__tests__/GOLDEN-MANIFEST.md` | новый (`041c507a`), правка (`550139ef`) | Документирует конвенцию `UPDATE_SURFACE_GOLDEN=1`, владельцев намеренного дрейфа каждого golden-файла (по образцу `shared/sdd/__tests__/GOLDEN-MANIFEST.md`, тот же паттерн для `UPDATE_VERIFY_GOLDEN=1`); строка tarball теперь документирует исключение `dist/**`. | Не измеряется тестом — справочный документ рядом с golden. |

`git show --stat 041c507a`: 6 файлов, 1925 insertions(+), 1 deletion(-) — совпадает.
`git show --stat 550139ef`: 3 файла, 17 insertions(+), 520 deletions(-) — совпадает (чистое удаление 514 строк `dist/**` из golden минус несколько строк правок кода/манифеста).

**Отклонение от пути в доске/очереди (см. §4).** `61-TASK-BOARD.md:92` и `62-BATCH-QUEUE.md:145` называют путь `scripts/__tests__/deployed-surface.test.ts`; фактический путь — `shared/common/sync/__tests__/deployed-surface.test.ts`. Обоснование и решение — в §4.

---

## 2. Архитектура было / стало

### Было — деплой без снимка состава и без сканирования утечек

```mermaid
flowchart LR
  DIRS["ai/directives/** — 104 файла"]
  SKILLS["ai/skills/** — 13 файлов (после скана)"]
  SYNCCORE["cli/cmd/sync/sync-core.ts:76 scanDirectives"]
  SKILLSCORE["cli/cmd/sync-skills/sync-skills-core.ts:31 scanSkills"]
  PACK["npm pack --dry-run — 1636 файлов"]
  LEAK["ai/directives/agent-inbox/golden-chat-output.example.md:176 — /Users/k.lebedev/.gennady/... захардкожен"]
  DIRS --> SYNCCORE
  SKILLS --> SKILLSCORE
  SYNCCORE -->|"без golden"| CONSUMER["потребитель — состав может незаметно дрейфовать"]
  LEAK -.->|"деплоится как есть, без проверки"| CONSUMER
  style LEAK fill:#611,stroke:#f66,color:#fff
  style CONSUMER fill:#611,stroke:#f66,color:#fff
```

### Стало — три golden-снимка + один безусловный инвариант, утечка вычищена

```mermaid
flowchart LR
  DIRS["ai/directives/** (104)"]
  SKILLS["ai/skills/** (13)"]
  PACK["npm pack --dry-run --json, минус dist/** (1122 после 550139ef; было 1636 с 514 dist/**)"]
  SYNCCORE["scanDirectives — cli/cmd/sync/sync-core.ts:76"]
  SKILLSCORE["scanSkills — cli/cmd/sync-skills/sync-skills-core.ts:31"]
  NORM["normalize(..., SYNC_PATH_RULES/SYNC_SKILLS_PATH_RULES) — shared/common/sync/path-normalizer.ts:23,75,86"]
  TEST["shared/common/sync/__tests__/deployed-surface.test.ts"]
  G1["deployed-surface.directives.golden.txt (it №1, :94)"]
  G2["deployed-surface.skills.golden.txt (it №2, :103)"]
  G3["deployed-surface.tarball.golden.txt (it №3, :117-118, минус dist/**)"]
  LEAKFIX["golden-chat-output.example.md:176 — ~/.gennady/... (без реального пути автора)"]
  DIRS --> SYNCCORE --> TEST --> G1
  SKILLS --> SKILLSCORE --> TEST --> G2
  PACK --> TEST --> G3
  SYNCCORE -.->|"it №4 ТОЛЬКО, :129"| NORM
  SKILLSCORE -.->|"it №4 ТОЛЬКО, :139"| NORM
  NORM -.-> TEST
  LEAKFIX -.->|"сканируется 4-м it, DEV_HOME_LEAK regex"| TEST
  TEST -->|"assert.deepEqual(findLeaks(...), [])"| PASS["PASS"]
  style PASS fill:#163,stroke:#3a3,color:#fff
  style LEAKFIX fill:#163,stroke:#3a3,color:#fff
```

**Правка mermaid по V-BATCH-09 (см. §5).** Оригинал рисовал `DIRS --> SYNCCORE --> NORM --> TEST --> G1` (и симметрично для skills/G2) — это неверно: `normalize()` вызывается ТОЛЬКО внутри `it` №4 (:129 для directives, :139 для skills), сканирующего на утечки. Три golden-`it` (№1 :94, №2 :103, №3 :117-118) сравнивают сырой вывод `scanDirectives`/`scanSkills`/`packFiles()` без прохода через `normalize()`. Диаграмма выше рисует `NORM` как отдельную, пунктирную ветку, помеченную «it №4 ТОЛЬКО».

---

## 3. Доказательства (ПРИЁМКА: «golden (`UPDATE_SURFACE_GOLDEN=1`) + `npm pack --dry-run`»)

```
$ node --import tsx --test shared/common/sync/__tests__/deployed-surface.test.ts
✔ deployed surface (SO-5) > sync ships exactly the frozen ai/directives/** file list
✔ deployed surface (SO-5) > sync-skills ships exactly the frozen ai/skills/** file list
✔ deployed surface (SO-5) > npm pack --dry-run ships exactly the frozen tarball file list
✔ deployed surface (SO-5) > ships no file (directives ∪ skills ∪ tarball) with a developer home-directory path leak
# pass 4, # fail 0
```
exit 0. **ВЫПОЛНЕНО** (golden + `npm pack --dry-run` внутри теста + zero-leak).

**Доказательство исправления блокирующей находки V-BATCH-09 (см. §5)** — build больше не ломает golden:
```
$ npm run build                     # ✓ built in ~3-17s, exit 0, новые content-hash имена в dist/chunks/*
$ npm test                          # (сразу после build, тот же прогон, что ловил регресс раньше)
# tests 3616, pass 3606, fail 0, cancelled 0, skipped 10, exit 0
```
`ok 448 - deployed surface (SO-5)` внутри полного прогона — 4/4. **ВЫПОЛНЕНО** (build больше не красит golden).

Независимая проверка утечки после фикса — репо-wide grep на класс паттерна:
```
$ grep -rE '/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/' ai/directives ai/skills 2>/dev/null | grep -v '<user>'
(пусто)
```
0 совпадений вне плейсхолдера `<user>`. **ВЫПОЛНЕНО.**

---

## 4. Отклонения и открытые вопросы

**Путь теста — сознательное отклонение, не ошибка.** `61-TASK-BOARD.md:92` / `62-BATCH-QUEUE.md:145` / `32-TRACK-SYNC-OWNERSHIP.md:451` называют `scripts/__tests__/deployed-surface.test.ts`. Фактический тест лежит в `shared/common/sync/__tests__/deployed-surface.test.ts`. Причина: `scripts/test-topology.ts:19` — `TEST_ROOTS = ['ai','cli','services','shared']` — не включает `scripts/`. Тест по указанному в доске пути **не обнаруживался бы** ни `npm test`, ни `npm run test:topology`, ни pre-commit гейтом `npm run check` — золотой лок существовал бы, но никогда бы не запускался. Расположение рядом с `path-normalizer.ts` (тем же каталогом, что и его прямая зависимость) технически корректно и проходит `test-topology check` ровно в одном слое (`local`, из-за реального `spawnSync('npm', ['pack', ...])` — раздел `LOCAL_BOUNDARY_SIGNALS` `scripts/test-topology.ts:132`). Решение принято исполнителем как техническая правка очевидной ошибки пути в документах плана (не архитектурный выбор) — Lead может закрыть протоколом пункта 121 §«Кто снимает остановку» (техвопрос, ответ уже в коде инфраструктуры) либо потребовать физического переноса в `scripts/__tests__/` без изменения `TEST_ROOTS` (тогда лок перестанет исполняться в CI — не рекомендуется).

**`path-normalizer.ts` не изменён.** Бриф допускал правку «при необходимости»; она не потребовалась — найденная утечка была статичным примером в markdown-фикстуре (не проходит через `normalize()` при рендере, это уже готовый пример вывода чат-бота), а не паттерном, который нормализатор должен переписывать при каждой синхронизации. Общий класс утечек (любой `/Users/<имя>/` или `/home/<имя>/`) теперь ловится безусловным 4-м `it` в `deployed-surface.test.ts`, что и есть предохранитель от рецидива, требуемый брифом.

Координация с **T-9** (тот же golden-паттерн, `UPDATE_SURFACE_GOLDEN=1`) зафиксирована текстом в `GOLDEN-MANIFEST.md`; T-9 в этой пачке не выполнялась (не входит в Пачку 9) — при появлении T-9 её golden должен лечь в тот же `shared/common/sync/__tests__/` либо соседний каталог без дублирования `__tests__`, как требует `61-TASK-BOARD.md:273`.

## 5. БЛОКИРУЮЩАЯ правка по V-BATCH-09

**Находка верификатора (блокирующая).** `deployed-surface.tarball.golden.txt` заморозил 514 путей `dist/**` (512 — content-hash чанки сборки Vite: `dist/chunks/<name>-<hash>.js`), при том что `dist/` в `.gitignore` (`git check-ignore -v dist/chunks` → `.gitignore:11:dist`). Хеш в имени чанка (и сам список чанков) зависит от внутреннего разбиения Vite, не от содержимого репозитория — он меняется при каждом `npm run build` идентичного исходника. Заявленные в первой версии этого отчёта «3604 pass, 0 fail» / «ALL PASS (5/5)» не воспроизводились чистым повтором после сборки: `it` №3 падал детерминированно (`npm test` = exit 1, `npm run check` = exit 1) — как на дереве этого исполнителя, так и на любом свежем клоне без `dist/` вовсе.

**Правка.** Коммит `550139ef`: третий `it` теперь сравнивает `packFiles().filter(p => p !== 'dist' && !p.startsWith('dist/'))` с golden — сборочный вывод исключён из замороженного списка целиком, а не нормализован (плейсхолдер вместо хеша не решал бы проблему нестабильного КОЛИЧЕСТВА чанков между сборками, только имена). Четвёртый `it` (zero-leak) по-прежнему сканирует `packFiles()` без фильтра — `dist/**` при его наличии всё так же проверяется на утечки, просто не входит в замороженный список путей. Golden перегенерирован через `UPDATE_SURFACE_GOLDEN=1`: 1636 → 1122 строк, диффом ровно 514 удалённых строк `dist/**`, без единой прочей правки — `directives`/`skills` голdenы (104/13) не тронуты.

**Доказательство (перепроверено этим исполнителем):**
```
$ UPDATE_SURFACE_GOLDEN=1 node --import tsx --test shared/common/sync/__tests__/deployed-surface.test.ts
# pass 4, # fail 0  (golden перезаписан)
$ git diff --stat shared/common/sync/__tests__/deployed-surface.tarball.golden.txt
 1 file changed, 514 deletions(-)
$ npm run build            # ✓ built, новые хеши чанков
$ npm test                 # тот же прогон, что раньше ловил регресс
# tests 3616, pass 3606, fail 0, cancelled 0, skipped 10, exit 0
```
Build больше не красит golden — воспроизведено дважды (build→test давал зелёный результат оба раза в этой сессии).

Команда пуша для Lead: `git -C rc-v6 push origin lead/surface-locks` (единый push всей пачки 9, теперь 8 коммитов).
