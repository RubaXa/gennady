СВОДНЫЙ ОТЧЁТ — Пачка 2: «Пакет собирается и публикуется в правильном порядке»

СТАТУС: DONE, 7/7 задач (6 исходных + REL-2a по итогам верификации `V-BATCH-02.md`). REL-2 сам по себе не достигал заявленного критерия приёмки (тесты в тарболе); REL-2a добавляет вложенный `ai/.npmignore`, критерий теперь достигнут — см. «Состав пакета» ниже.

Рабочее дерево: `rc-w2` (git worktree gennady, remote `origin` = RubaXa/gennady).
Ветка: `lead/release-package`, создана от `origin/codex/sdd-v2-rc52-followup` (`git -C rc-w2 fetch origin codex/sdd-v2-rc52-followup && git -C rc-w2 switch -c lead/release-package origin/codex/sdd-v2-rc52-followup`).
Base branch head на момент старта и на момент завершения — не сдвинулся (`2acbe682...`, `test(v-01): apply verifier fixes`).

Коммиты (все локальные, **ничего не запушено**, по одному conventional-коммиту на задачу, каждый прошёл `pre-commit` целиком без `--no-verify`):

| SHA | Коммит |
|---|---|
| `2e9b3936` | chore(REL-2): restore .npmignore as defense-in-depth over files[] |
| `74a1ec83` | fix(REL-3): restore executableBin() chmod plugin in vite build |
| `2e62546c` | fix(REL-1): publish to npm before git commit/tag/push |
| `591ccb8c` | fix(REL-6): exact-pin yaml devDependency to 2.9.0 |
| `05501529` | fix(REL-8): widen lint to cover format and type-check before lint:contracts |
| `5445e147` | chore(REL-10): set version to 2.0.0-draft.1 per D-12 |
| `f16d7f17` | fix(package): nested ai/.npmignore keeps tests, fixtures and eval artefacts out of the tarball (REL-2a) |

Порядок исполнения выбран, чтобы REL-10 (версия) шёл последним — после него потребовалась перегенерация `ai/directives/**`, и делать это до остальных пяти задач означало бы лишний шум в их диффах. REL-2a добавлен 7-м коммитом после верификации пачки (`V-BATCH-02.md`), а не переоткрытием REL-2 — оба коммита независимы, REL-2a ничего не переписывает в REL-2.

---

## Черновик описания PR (простым языком)

**Что сделали.** Семь мелких, но жёстких вещей упаковки npm-пакета, которые в RC потерялись при отходе от main (плюс одна найденная в ходе верификации): порядок «сначала публикуем в npm, потом коммитим/тегаем/пушим» (а не наоборот — иначе неудачная публикация оставляет в git тег и коммит для версии, которой нет на npm); файл-фильтр `.npmignore` — корневая копия main-файла оказалась инертна: npm не применяет корневой `.npmignore`, когда в `package.json` объявлен `files[]`; реально тесты из тарбола исключает отдельный вложенный `ai/.npmignore` (REL-2a); восстановление прав на выполнение у собранного CLI-бинарника; точный пин версии `yaml` (не диапазон — она вшивается в сборку); проверка форматирования и типов перед публикацией (раньше публикация могла проскочить с неотформатированным кодом); и сама версия пакета — переставлена на `2.0.0-draft.1` по решению оператора D-12 («v2 = `2.0.0-draft.<N>`»).

**Зачем.** Без этих вещей критерий приёмки релиза: чистый пакет не выполняется: либо публикация может «зависнуть» наполовину (git продвинулся, npm — нет), либо в пакет утекают тесты, фикстуры и eval-артефакты, либо собранный бинарник не запускается напрямую, либо публикация проходит с красным форматированием.

**Что не доделали.** Ничего из заявленных 7 задач — REL-2a закрывает единственный незавершённый пункт (см. «Состав пакета» ниже: 0 тестовых/фикстурных/`.baseline`/eval-путей после REL-2a). Открытыми остаются два следствия вне скоупа этой пачки — см. раздел «Открытые следствия».

---

## Таблица «файл → что изменилось по смыслу»

| Файл | Задача | Что изменилось по смыслу |
|---|---|---|
| `.npmignore` (новый) | REL-2 | Копия main-файла байт-в-байт: заявлен как второй, вычитающий фильтр поверх allowlist `files[]`. Инертен на практике — npm не применяет корневой `.npmignore`, когда `files[]` объявлен в `package.json`. Реальное вычитание делает `ai/.npmignore` (REL-2a). |
| `ai/.npmignore` (новый) | REL-2a | Вложенный `.npmignore` под `ai/**` — каталог, который `files[]` покрывает как `"ai/**/*"`. npm игнорирует корневой `.npmignore` при наличии `files[]`, но вложенный, под уже включённым каталогом, применяется как обычно. Вычитает `__tests__/`, `__mocks__/`, `__snapshots__/`, `*.test.*`, `*.spec.*`, `*.snap`, `fixtures/`, весь `ai/flow-eval/` (dev-only eval harness), `.baseline/`, `.results/`. `cpSync(ai → dist/ai)` в `scripts/prepare-publish-artifacts.ts` копирует дотфайлы, поэтому один файл вычитает и `dist/ai/**`-зеркало. |
| `vite.config.ts` | REL-3 | Добавлен Vite-плагин, восстанавливающий право на исполнение (`chmod 755`) у `dist/gennady.js` после сборки — Vite по умолчанию пишет 644. |
| `scripts/publish-next.ts` | REL-1 | Порядок операций внутри релизного скрипта развёрнут обратно к main: сначала `npm publish` (внутри — гейт `prepublishOnly`), git commit/tag/push — только если публикация прошла. |
| `package.json`, `package-lock.json` | REL-6 | `yaml` в devDependencies зафиксирован точной версией `2.9.0` вместо диапазона `^2.9.0` — она вшивается в сборку, дрейф версии между установками недопустим. |
| `package.json` | REL-8 | Скрипт `lint` снова прогоняет проверку форматирования и типов перед структурным линтом контрактов — раньше публикация могла пройти с неотформатированным/нетипизированным кодом. |
| `package.json`, `package-lock.json`, 17 файлов `ai/directives/sdd-v2/**/*.xml` | REL-10 | Версия пакета переставлена с `0.8.4` на `2.0.0-draft.1` (решение D-12). Директивы перегенерированы механически — версия печатается первой строкой каждого сгенерированного файла, без перегенерации сборка директив стала бы «протухшей». |

---

## Схема «было → стало»: порядок публикации (REL-1, ключевая правка пачки)

```mermaid
flowchart TB
  subgraph before["Было (RC, до правки) — git ПЕРЕД npm"]
    direction TB
    B1["git add / commit / tag"] --> B2["git push + push --tags"] --> B3["npm publish --tag next\n(prepublishOnly gate внутри)"]
    B3 -.->|"gate/publish упал → коммит и тег УЖЕ запушены\nдля версии, которой нет на npm"| BX(["phantom release"])
  end
  subgraph after["Стало (как на main, коммит 009ff59a) — npm ПЕРЕД git"]
    direction TB
    A1["npm publish --tag next\n(prepublishOnly gate внутри)"] -->|"успех"| A2["git add / commit / tag"] --> A3["git push + push --tags"]
    A1 -.->|"gate/publish упал → git НЕ тронут\ncatch: 'git checkout package.json package-lock.json'"| AX(["чистый откат, без phantom release"])
  end
```
Узлы: `scripts/publish-next.ts:257-282` (весь реордеренный `try{}`-блок), `:265` (`npm publish` — первый вызов после правки).

---

## Доказательства (по всей пачке, финальный срез ветки после всех 7 коммитов)

| Команда | Вывод (сжато) | Exit | Статус |
|---|---|---|---|
| `npm --prefix rc-w2 test` | `# tests 3566 # pass 3556 # fail 0 # cancelled 0 # skipped 10` | 0 | ВЫПОЛНЕНО |
| `npm --prefix rc-w2 run check` | `[sdd-verify] ✅ ALL PASS (5/5)` — type-check, test:coverage, lint, format, yagni | 0 | ВЫПОЛНЕНО |
| `npm --prefix rc-w2 run build` | `✓ built in 4.33s`; `dist/gennady.js` — `-rwxr-xr-x` (REL-3 подтверждён на финальном срезе) | 0 | ВЫПОЛНЕНО |
| `npm --prefix rc-w2 run gate:sdd-check-baseline` | `[sdd-check-zero-new-error] OK — no error outside the baseline (tag rc-baseline-1)` | 0 | ВЫПОЛНЕНО |
| `npm pack --dry-run --json --pack-destination <scratch> rc-w2` (после REL-2a) | `name gennady version 2.0.0-draft.1`, `entryCount 3039`, `unpackedSize 11232371` | 0 | ВЫПОЛНЕНО (команда), см. ниже состав пакета |

**Состав пакета — есть ли лишнее (тесты/фикстуры/`.baseline`)?**

До REL-2a (после 6 исходных коммитов): да, лишнее было — **70 путей** тестового/фикстурного кода (`ai/**/__tests__/**`, `ai/**/*.test.ts`, `ai/**/fixtures/**`) и отдельно **8 путей** `ai/flow-eval/.baseline/**` (4 в `ai/`, 4 в зеркале `dist/ai/`) — оба числа перепроверены верификатором (`V-BATCH-02.md` §C) построчным пересчётом `npm pack --dry-run --json`. Причина — корневой `.npmignore` (REL-2) инертен: npm не применяет его, пока `package.json` содержит `files[]`; на `files[]`-паттерн `ai/**/*` это не влияет, поэтому весь `ai/**`, включая тесты и `.baseline`, уходил в тарбол без вычитания.

После REL-2a (7-й коммит, вложенный `ai/.npmignore`): `npm pack --dry-run --json` (`entryCount` 3217→3039, `unpackedSize` 12698537→11232371 байт) даёт **0** путей, содержащих `__tests__/`, `/fixtures/`, `.test.`, `.baseline/`, `.results/`, `flow-eval/` — все шесть категорий проверены прямым grep по списку файлов из JSON. `dist/gennady.js`, все 17 `ai/directives/**/*.xml`, 14 `ai/skills/**`, README остаются в пакете. Реальный (не dry-run) `npm pack` + распаковка тарбола + `node package/dist/gennady.js --version` → `2.0.0-draft.1`, exit 0 — пакет рабочий. Полная раскладка и команды — `R-REL-2a.md`.

Отдельно: `ai/.npmignore` намеренно не вычитает директории, названные `e2e/`, — `ai/kit/**/e2e/**/*.xml` содержит настоящий контент директив (72 файла: anti-pattern/axiom/definition/hook/pattern про e2e-тестирование), а не тестовый скаффолдинг; единственный реальный e2e-тестовый файл под `ai/` (`ai/inspector/e2e/inspector.spec.ts`) и так вычитается паттерном `*.spec.*`.

---

## Что не сделано / стопы

1. ~~**REL-2 (`.npmignore`) — критерий приёмки не достигнут буквально.**~~ **Закрыто REL-2a** (7-й коммит `f16d7f17`). Корневой `.npmignore` (REL-2) остался байт-в-байт копией main и инертен при `files[]` — это подтверждённое поведение npm, не брак содержимого файла. Реальное вычитание делает новый вложенный `ai/.npmignore`, который npm применяет несмотря на инертность корневого. `npm pack --dry-run` после REL-2a даёт 0 тестовых/фикстурных/`.baseline`/`.results`/`flow-eval`-путей — критерий приёмки REL-2 достигнут. Детали — `R-REL-2.md` (исходная находка) и `R-REL-2a.md` (фикс).
2. **REL-10 — открытая находка, не исправлена (вне скоупа задачи).** `scripts/publish-next.ts`'s `parseAndBumpNextVersion()` не распознаёт формат `X.Y.Z-draft.N` (регэксп принимает только `X.Y.Z`/`X.Y.Z-next.N`) — реальный `npm run publish-next` с версией `2.0.0-draft.1` упадёт в `calculatingVersion()` до git/npm side-effects. REL-1 (реордер publish-before-git) сам по себе корректен и не затронут этим — просто до его блока выполнение не дойдёт. Нужна отдельная задача/решение оператора. Детали — `R-REL-10.md` §4.
3. **Реальных публикаций не выполнялось нигде** — ни `npm publish`, ни `npm publish --dry-run` (требует логина к `registry.npmjs.org`, недоступного без интерактивной авторизации в этой сессии — не пытались), ни `git push`. Проверки — только `npm pack --dry-run`, `npm view gennady versions` (оба — read-only, реального изменения состояния registry не производят) и тестовые/build-команды. Публикация и пуш — прерогатива оператора/Lead.
4. **Задачи, которых не было в этой пачке и которые её не блокируют** (для контекста, из трека 34 — не входят в Пачку 2 по решению плана): REL-4 (bundle-smoke тесты), REL-5 (exports/files консистентность — прямо исключена из Пачки 2), REL-7/12/13/15 (тест-конкурентность и IPC-флейк — отдельная волна), REL-9 (CI — отменена решением D-54/REL-19), REL-11/14 (dependency-уязвимости), REL-16..19.

---

## Открытые следствия

Две вещи, которые эта пачка (включая REL-2a) не решает и оставляет оператору явным решением:

**(а) `scripts/publish-next.ts` не понимает формат версии `2.0.0-draft.N`.** `parseAndBumpNextVersion()` принимает только `X.Y.Z` или `X.Y.Z-next.N` — регэксп `publish-next.ts:47-58`, `^(\d+)\.(\d+)\.(\d+)(?:-next\.(\d+))?$`. Репро: `node --import tsx scripts/publish-next.ts --dry-run` → `[main] [starting → failed] publish-next failed { errorMessage: '[parseAndBumpNextVersion] Unsupported version format "2.0.0-draft.1". Expected "X.Y.Z" or "X.Y.Z-next.N".' }`, exit 1, падение до любых git/npm side-effects (REL-1 реордер не задет — до него выполнение не доходит). При этом в дереве уже есть отдельный канал, который формат `-draft.N` понимает: `scripts/publish-draft.ts` (`npm run publish-draft`, публикует с `--tag draft`) и `scripts/pack-draft.ts` — `node scripts/publish-draft.ts --dry-run` → exit 0 на текущей версии. Нужно решение оператора (addendum к D-12): либо (i) объявить `publish-draft` единственным каналом публикации v2-драфтов, а `publish-next` оставить линии v1/`next` (тогда правки кода не нужны — только зафиксировать решение в треке 34 и README/AGENTS), либо (ii) отдельная S-задача, которая учит `parseAndBumpNextVersion` принимать `-draft.N`.

**(б) Ничего не публиковалось.** Ни `npm publish`, ни `npm publish --dry-run` (требует логина к `registry.npmjs.org`), ни `git push` — ни в этой пачке, ни в REL-2a. Все проверки — read-only: `npm pack --dry-run`, `npm view gennady versions`, `publish-next --dry-run`, `publish-draft --dry-run`, тестовые/build-команды. Ветка `lead/release-package` (`f16d7f17`) существует только локально в `rc-w2`; на remote `origin` (`RubaXa/gennady`) её нет (`git ls-remote origin lead/release-package` → пусто). Публикация и пуш — прерогатива оператора/Lead, команда — в разделе «Команды пуша для Lead» ниже.

---

## Команды пуша для Lead

```
git -C rc-w2 push origin lead/release-package:lead/release-package
```
Перед пушем — убедиться, что `core.hooksPath` у Lead резолвится в его собственное дерево (тот же класс проблемы, что задокументирован в `R-02-GAP-B-2.md` §3 п.2), иначе push из другого worktree исполнит чужой `pre-push`.

---

## Ответ (10 строк)

SHA: REL-2=`2e9b3936`, REL-3=`74a1ec83`, REL-1=`2e62546c`, REL-6=`591ccb8c`, REL-8=`05501529`, REL-10=`5445e147`, REL-2a=`f16d7f17` (все локальные, не запушены).
`npm test`: 3566/3556/0 fail/0 cancelled, exit 0. `npm run check`: 5/5 ALL PASS, exit 0. `npm run build`: exit 0, `dist/gennady.js` — 755. `npm run gate:sdd-check-baseline`: OK, exit 0.
`npm pack --dry-run` до REL-2a: version `2.0.0-draft.1`, entryCount 3217, unpackedSize 12698537 (12,7 МБ / 12,11 МиБ), 70 тестовых/фикстурных путей + 8 `.baseline` путей.
`npm pack --dry-run` после REL-2a: entryCount 3039, unpackedSize 11232371 — 0 путей `__tests__/`, `/fixtures/`, `.test.`, `.baseline/`, `.results/`, `flow-eval/`; реальный `npm pack` + распаковка + `node dist/gennady.js --version` → `2.0.0-draft.1`, exit 0.
Стопы: все закрыты кодом этой пачки, кроме двух открытых следствий вне скоупа — см. «Открытые следствия»: (а) `publish-next.ts` не понимает `-draft.N` (`publish-draft`/`pack-draft` понимают, решение оператора нужно); (б) ничего не публиковалось/не пушилось.
Публикаций/пушей не выполнялось — только read-only проверки. Полные отчёты — `_raw/reports/R-REL-{1,2,2a,3,6,8,10}.md`.
