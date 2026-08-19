# Module: plugins/golang

## 1. Module Vision

`StackPlugin` для Go-репозиториев: детекция по `go.mod` в корне, скоуп по изменённым пакетам, гейты `generate → build → vet → fmt → lint → test`, фасет `fix` с материализацией кодогенерации. Термины (Gate, Scope, Capability, ENV_FAIL, VIOLATION, Run replica) — [stack.spec.md §2](../../stack.spec.md).

**Parent scope:** [`stack`](../../stack.spec.md) · **E2E-механизм:** [`stack/e2e`](../../e2e/e2e.spec.md) · **Доктрина E2E:** [`infra-e2e`](../../../infra-e2e/infra-e2e.spec.md)

Зачем отдельная спека: знание «что для Go считается находкой по коду, а что поломкой окружения» — предметное и **принадлежит мейнтейнеру стека**. Держать его в scope-спеке рядом с node значит смешивать зоны ответственности: правка про `golangci-lint` не должна проходить ревью у владельца npm-части и наоборот. Здесь же живёт список use case'ов, которые обязаны быть покрыты E2E-фикстурами, — то есть определение «плагин работает».

## 2. Capability Support

| Фасет          | Статус          | Комментарий                                                                          |
| -------------- | --------------- | ------------------------------------------------------------------------------------ |
| `verify`       | ✅ обязательный | `resolveScope` + `planGates`; §5, §6                                                 |
| `fix`          | ✅ реализован   | один fixer `generate` — материализация кодогенерации в реальном дереве (§7)          |
| `sandboxLinks` | ➖ не объявляет | Go-инструменты берутся из `PATH`; ignored-пути в реплику не копируются (D-STACK-012) |
| `testcov`      | ⛔ post-v1      | покрытие: `go test -coverprofile`; дизайн отложен (stack.spec §4.3)                  |
| `dbc-lint`     | ⛔ post-v1      | собственный DbC-линтер «Геннадии» сегодня умеет только `.ts`/`.tsx`                  |
| `directives`   | ⛔ post-v1      | per-stack директивы для агента (stack.spec §4.5)                                     |

## 3. Detection

Маркер — `<root>/go.mod`. Отсутствует → плагин не активен (`null`), никаких эвристик. Присутствует → детекция собирает факты и **никогда не отменяет себя** из-за их проблем: проблема становится диагностикой.

Собираемое: список модулей (корневой + вложенные), `go.work`, факт вендоринга (`vendor/modules.txt`), путь конфига golangci (dot- и non-dot-имена), цели `Makefile`, разрешённые бинари `go` / `gofmt` / `golangci-lint`. Процессы на этапе детекции — только version-probe.

| Диагностика               | Когда                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| `GOLANGCI_GO_TOO_OLD`     | `golangci-lint` собран более старым Go, чем требует модуль — version skew   |
| `GOLANGCI_CONFIG_MISSING` | в `Makefile` упомянут конфиг линтера, которого нет в чекауте                |
| `NESTED_MODULES`          | найдены вложенные `go.mod` — прогон покрывает корневой модуль (D-STACK-010) |

## 4. Scope Resolution

| Режим     | Что берётся                                                          | `note`                              |
| --------- | -------------------------------------------------------------------- | ----------------------------------- |
| `all`     | весь репозиторий, `./...`                                            | `whole repository (./...)`          |
| `files`   | явные цели → пакеты, содержащие эти файлы                            | `N file(s) from M target(s)`        |
| `changed` | `.go`-файлы, изменённые от базовой ветки, → их пакеты (по умолчанию) | `N Go file(s) changed vs <baseRef>` |

Базовая ветка: `origin/HEAD` предпочитается устаревшему `origin/master`. Пути от git берутся `--relative`, иначе при `--root=<subdir>` скоуп пустеет. Пустой скоуп — не ошибка: гейты репортятся как `skipped` с причиной, а прогон в целом даёт `ZERO_GATES` (exit 1) — «ничего не проверили» не является успехом.

## 5. Gates

Порядок фиксирован: **кодогенерация — пререквизит сборки**, поэтому `generate` стоит до `build` (D-STACK-011).

| Гейт       | argv                                       | Таймаут | Контракт вывода            | `envFail`                                       | Особенности                                                  |
| ---------- | ------------------------------------------ | ------- | -------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `generate` | `go generate <flags> <packages>`           | 5m      | drift реплики = FAIL       | module-fetch + `executable file not found`↦hint | `driftMeansFailure: true`; skip без `//go:generate` в скоупе |
| `build`    | `go build <flags> <packages>`              | 5m      | exit-код                   | panic + module-fetch                            | —                                                            |
| `vet`      | `go vet <flags> <packages>`                | 5m      | exit-код                   | panic + module-fetch                            | —                                                            |
| `fmt`      | `gofmt -l <files>`                         | 1m      | **exit 0 + stdout = FAIL** | —                                               | никогда `go fmt` (мутирует, D-STACK-005)                     |
| `lint`     | `golangci-lint run -c <config> <packages>` | 5m      | exit-код                   | `exit > 1` + panic + module-fetch               | конфиг ищется автоматически, передаётся через `-c`           |
| `test`     | `go test -timeout=<t> <flags> <packages>`  | 10m     | exit-код                   | module-fetch **без** panic-предиката            | `-timeout` рендерится из эффективного `timeoutMs`            |

**`-mod=vendor`** добавляется при вендоринге, но **не** при наличии `go.work` — комбинация отвергается тулчейном.

**Почему у `test` нет panic-предиката.** Паника в коде под тестом — genuine FAIL: это находка про код. Для `build`/`vet`/`lint` паника означает падение самого инструмента, то есть ENV_FAIL. Разная трактовка одного текста на разных гейтах — предметное знание стека, ровно то, для чего предикаты живут на гейте (D-STACK-004).

**Известное ограничение (находка ревью).** `lint` несёт `exit > 1` ↦ ENV_FAIL, что верно для самого `golangci-lint`, но наследуется при `overrideGates.lint.argv`: обёртка `[make, lint]` возвращает 2 на любом упавшем рецепте, и настоящая находка линтера превращается в ENV_FAIL с инструкцией «не правь код». Лечение — субтрактивная форма `envFail` и неунаследование exit-code-предикатов при подмене `argv`; закрывается в цикле реализации, покрывается фикстурой `go-make-lint-exit2`.

## 6. Fix Facet

Единственный fixer `generate`: та же команда, что у гейта, но в **реальном** дереве. Вызов — `gennady fix golang:generate`. Скипается с причиной при отсутствии тулчейна, пустом скоупе или отсутствии директив. Цикл: `verify` → `generate` FAIL со списком разошедшихся файлов → `fix` → коммит → `verify` зелёный.

Открытая недоработка (находка ревью): у fixer'а нет `envFail`, хотя он исполняет ту же команду, что гейт с тремя предикатами — отсутствующий генератор в `fix` сегодня даёт FAIL вместо ENV_FAIL с подсказкой. Закрывается в цикле; фикстура `go-fix-missing-tool`.

## 7. Use Cases to Test (E2E-матрица)

Механизм фикстур, схема `expect.yaml` и материализация — [`stack/e2e`](../../e2e/e2e.spec.md). Здесь — **что** обязано быть покрыто для Go. Столбец «Флаги» фиксирует покрытие CLI-поверхности (infra-e2e §7).

### 7.1 Базовая линия и находки по коду

| Фикстура         | Гейт / прогон  | Посаженный дефект        | Ожидание                            | Флаги                     |
| ---------------- | -------------- | ------------------------ | ----------------------------------- | ------------------------- |
| `go-clean-full`  | **весь план**  | нет (эталон)             | `pass`, exit 0                      | без флагов (главный путь) |
| `go-fmt-drift`   | `golang:fmt`   | неотформатированный файл | `fail`, файл в stdout               | `--only`                  |
| `go-vet-error`   | `golang:vet`   | unkeyed-поля в литерале  | `fail`                              | `--only`                  |
| `go-build-error` | `golang:build` | синтаксическая ошибка    | `fail`, не `env-fail`               | `--only`                  |
| `go-test-fail`   | `golang:test`  | падающий тест            | `fail`                              | `--only`                  |
| `go-test-panic`  | `golang:test`  | паника в коде под тестом | `fail`, не `env-fail`               | `--only`                  |
| `go-empty-scope` | весь план      | цель без `.go`-файлов    | все `skipped`, `ZERO_GATES`, exit 1 | позиционная цель          |

### 7.2 Окружение (ENV_FAIL)

| Фикстура                   | Гейт              | Дефект окружения                              | Ожидание                       |
| -------------------------- | ----------------- | --------------------------------------------- | ------------------------------ |
| `go-proxy-blocked`         | `golang:build`    | зависимость + `GOPROXY=http://127.0.0.1:1`    | `env-fail`                     |
| `go-generate-missing-tool` | `golang:generate` | директива зовёт отсутствующий бинарь          | `env-fail` + hint `go install` |
| `go-fix-missing-tool`      | fix               | то же, но через `gennady fix`                 | `env-fail` + hint (не `fail`)  |
| `go-lint-exit2`            | `golang:lint`     | линтер падает сам (exit 2, внутренняя ошибка) | `env-fail`                     |
| `go-make-lint-exit2`       | `golang:lint`     | `[make, lint]`, **настоящая** находка, exit 2 | **`fail`**, не `env-fail`      |

### 7.3 Кодогенерация

| Фикстура               | Гейт                  | Состояние                                     | Ожидание                               |
| ---------------------- | --------------------- | --------------------------------------------- | -------------------------------------- |
| `go-generate-ok`       | `golang:generate`     | директива есть, сгенерированное **совпадает** | `pass` (нет drift'а)                   |
| `go-generate-none`     | `golang:generate`     | директив в скоупе нет                         | `skipped` с причиной                   |
| `go-generate-stale`    | `golang:generate`     | закоммиченный сгенерированный файл разошёлся  | `fail` + список файлов + `gennady fix` |
| `go-generate-ignored`  | `golang:generate`     | сгенерированное в `.gitignore`                | `pass`; `fix` материализует            |
| `go-generate-fix-loop` | verify → fix → verify | stale → `fix` → повтор                        | `fail` → мутация → `pass`              |

### 7.4 Контракт «гейт наблюдает» и реплика прогона

| Фикстура           | Гейт              | Состояние                                  | Ожидание                               |
| ------------------ | ----------------- | ------------------------------------------ | -------------------------------------- |
| `go-mutating-gate` | extra             | гейт пишет файл, без `driftMeansFailure`   | `violation` + список файлов            |
| `go-sandbox-drift` | extra             | `driftMeansFailure: true`, гейт пишет файл | `fail` + drift-список                  |
| `go-dirty-tree`    | весь план         | незакоммиченные правки + untracked         | гейты видят правки; дерево не изменено |
| `go-hang`          | extra             | скрипт спит дольше `timeout: 2s`           | `timeout` + note «не правь код»        |
| `go-no-commits`    | `golang:generate` | git-репозиторий без коммитов               | `env-fail` (реплике нужен HEAD)        |

### 7.5 Конфиг стека: skip, override, extra, requires, envFail

| Фикстура                     | Что объявлено                                 | Ожидание                                             | Флаги                  |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------- | ---------------------- |
| `go-skip-gates`              | `skipGates: [test]`                           | `test` — `skipped` с источником в причине            | без флагов             |
| `go-skip-lifted-by-only`     | `skipGates: [test]` + `--only=golang:test`    | `test` **исполняется** (адресный вызов снимает skip) | `--only`               |
| `go-skip-cli-wins`           | `--only=golang:test --skip=golang:test`       | `skipped` (CLI `--skip` побеждает)                   | `--only` + `--skip`    |
| `go-override-argv`           | `overrideGates.test.argv: [make, test]`       | исполняется обёртка; планировочный skip снят         | `--plan`               |
| `go-override-env-timeout`    | `overrideGates.test: {env, timeout}`          | `-timeout` в argv равен эффективному                 | `--plan --json`        |
| `go-extra-gate`              | `extraGates` с `outputMeansFailure: true`     | `fail` по непустому stdout при exit 0                | без флагов             |
| `go-extra-requires-missing`  | `requires` с падающей командой                | `env-fail` быстро, argv гейта не вызван              | без флагов             |
| `go-extra-requires-ok`       | `requires` проходит                           | argv вызван, `pass`                                  | без флагов             |
| `go-envfail-rules`           | `envFail` с `exitCodeMatches`/`stderrMatches` | `env-fail` + hint правила                            | `--json`               |
| `go-envfail-hint-precedence` | правило конфига и предикат плагина совпадают  | hint конфига в выводе                                | `--json --full-output` |
| `go-gate-fixer`              | гейт с вложенным `fixer`                      | `gennady fix golang:<id>` мутирует дерево            | —                      |
| `go-plan-describe`           | гейт с правилами, `--plan --json`             | отрендеренные описания правил, без `null`            | `--plan --json`        |
| `go-root-subdir`             | прогон из подкаталога с `--root`              | скоуп не пуст, пути относительные                    | `--all --root`         |

## 8. Inter-Module Dependencies

- **Depends on:** [`stack`](../../stack.spec.md) (типы, раннер, реестр), `shared/common/exec` (probe-вызовы), git (скоуп и реплика)
- **Sibling:** [`plugins/node`](../node/node.spec.md) — независимая зона ответственности; общее только в scope-спеке
- **Verified by:** [`stack/e2e`](../../e2e/e2e.spec.md) по матрице §7
- **External:** `go` (обязателен, кроме гейта `fmt`), `gofmt`, `golangci-lint` (опционален — без него `lint` скипается с причиной)

## 9. Handoff to Task Scaffolding

- **Implementation files (существуют):** `golang-plugin.ts`, `golang-detect.logic.ts`, `golang-scope.logic.ts`, `golang-plan.logic.ts`
- **Изменения по находкам ревью (цикл реализации):** субтрактивная форма `envFail` и неунаследование exit-code-предикатов при `override.argv` (§5); `envFail` у fixer'а `generate` (§6); `requires` на гейте; `fixer` как поле гейта
- **Fixture files to be created:** `services/stack/__tests__/e2e/fixtures/go-*` по §7 (28 фикстур)
- **Open risks:**
  - **версия `golangci-lint`** меняет коды выхода и формулировки между мажорами — фикстуры утверждают вердикт, но не текст линтера; версия в CI пиннится (infra-e2e §6)
  - **`go-proxy-blocked`** в средах с прозрачным прокси может вернуть иной текст — фикстура утверждает только `env-fail`
  - **`go-hang`** зависит от таймингов; разрыв 2s против 10s, при флаке разрыв увеличивается, фикстура не отключается
  - холодный `GOCACHE` умножает время прогона Go-фикстур
