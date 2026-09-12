# 34 — Трек RELEASE-PACKAGE: упаковка, публикация, тесты, версии

> Статус: ВЕРИФИЦИРОВАНО (B5 + V-B5, правки применены; + задачи D-8). Ждёт решений оператора (Q1–Q5 в §9).

## Как читать

Это чистовая версия трека RELEASE-PACKAGE после независимой перепроверки. Сырой двухчастный исходник (аналитик B5 + верификатор V-B5) сохранён без изменений в [`_raw/34-TRACK-RELEASE-PACKAGE.raw.md`](_raw/34-TRACK-RELEASE-PACKAGE.raw.md). Все 6 обязательных правок из «Правки к B5» (Часть II) применены в тексте ниже: 2 исправленных диапазона строк (`package.json` §1.4, §1.5), 1 уточнённая формулировка (`vite.config.ts` §2.1), 1 новый подраздел (`npm audit`, §3.4), 1 новая задача (REL-11), 1 факультативное усиление аргументации (§2.6). Дополнительно, по операторскому решению D-8 (2026-09-07), добавлены задачи REL-12…REL-14 из ветки `sdd-v2-inbox-transplant` — они требуют повторного вывода (re-derive) против текущего состояния RC, а не слепого cherry-pick (см. §7).

Где чистовой текст расходится с сырым источником — побеждает эта версия (Часть II верификатора учтена как финальная правка).

---

## 0. Источники и метод

Трек: RELEASE-PACKAGE. Источники: A1 §3.7 (инварианты P1–P6), A1 §1.3 строки #99–114 (коммиты пост-#5, packaging).

| Факт | Значение |
|---|---|
| MAIN | `origin/main` HEAD `8bb38477`, version `0.9.0-next.3`, путь `/Users/k.lebedev/Developer/gennady/.claude/worktrees/nice-panini-8aa14e` |
| RC | `codex/sdd-v2-rc52-followup` HEAD `11291af5`, version `0.8.4`, путь `.../scratchpad/rc-v6`, `node_modules` установлены |
| Метод | `diff <(git -C <main> show HEAD:<file>) <(git -C <rc> show HEAD:<file>)` построчно; read-only проверки — `test-topology.ts check`, `npm pack --dry-run --json`, `npm audit --json` |

Верификатор (V-B5) независимо подтвердил MAIN HEAD (`defe1058` на ветке `sdd-v2-audit-migration-3b23b1`, `origin/main` = `8bb38477`) и RC HEAD (`11291af5`) и признал документ фактологически прочным: подавляющее большинство утверждений подтверждено дословно, включая нетривиальные числа (`entryCount: 1190`, `104` тестовых/фикстурных пути, `unpackedSize: 3530954`, `unit=211 contract=16 local=51 external=8`). Найдено 2 ошибки в номерах строк, 1 неточная формулировка и 1 пробел (`npm audit` не выполнялся) — все учтены ниже.

---

## 1. `package.json`

### 1.1 version / bin / main / types / type / overrides

| Поле | MAIN (`package.json`) | RC (`package.json`) |
|---|---|---|
| `version` | `0.9.0-next.3` (L3) | `0.8.4` (L3) |
| `bin` | `./dist/gennady.js` (L20) | идентично (L20) |
| `main` | `dist/index.js` (L21) | идентично |
| `types` | `dist/index.d.ts` (L22) | идентично |
| `type` | `module` | идентично |
| `overrides` | отсутствует | отсутствует |

Совпадают. Различий по `bin`/`main`/`types`/`type`/`overrides` НЕТ.

### 1.2 `imports`

MAIN (L23-26):
```json
"imports": {
  "#snapshot-path-setup": "./snapshot-path.setup.ts",
  "#logger": "./services/logger/logger.ts"
}
```
RC (L23-27) добавляет `"#utils/*": "./utils/*"` — новый alias под RC-специфичную директорию `utils/` (её у main нет вообще, `git -C <main> ls-tree HEAD -- utils` пуст).

### 1.3 `exports` — ключевое расхождение (P2)

MAIN (`package.json:27-38`):
```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" },
  "./stack": { "types": "./dist/services/stack/plugin-api.d.ts", "import": "./dist/stack.js", "default": "./dist/stack.js" }
}
```

RC (`package.json:28-32`):
```json
"exports": {
  ".": "./services/agent-mon/index.ts",
  "./providers/claude": "./services/agent-mon/providers/claude/index.ts",
  "./providers/opencode": "./services/agent-mon/providers/opencode/index.ts"
}
```

Разница качественная, не косметическая:
- В RC `exports["."]` указывает на **исходный `.ts`-файл** (`services/agent-mon/index.ts`), а не на `dist/*.js` — нет условий `types`/`import`/`default` вообще (строка — не объект). Консьюмер, ставящий пакет из registry, получит сырой TypeScript без loader'а — падёт `ERR_UNKNOWN_FILE_EXTENSION` в чистом Node (RC не использует `--experimental-strip-types` для потребителя пакета).
- `./stack` subpath в RC **отсутствует полностью** — вместо стека (gate-runner/stack-config/plugin-api) RC экспортирует `./providers/claude` и `./providers/opencode` — сущности из **другого продукта** (`services/agent-mon` — не существует на main вовсе: `git -C <main> ls-tree HEAD -- services/agent-mon` пуст). RC развивался по другой архитектурной ветке (agent-mon/inbox/flow-eval), не по стек-плагин системе main (PR #5).
- `main`/`types` (dist/index.js, dist/index.d.ts) в RC при этом остаются нетронутыми (те же значения, что в main) — т.е. `main`/`types` и `exports["."]` в RC указывают на РАЗНЫЕ файлы (dist vs source) — внутреннее противоречие пакета.

### 1.4 `files[]` и `.npmignore` (P1)

MAIN (`package.json:39-50`):
```json
"files": [
  "dist/**/*", "README.md", "docs/**/*", "ai/**/*",
  "cli/cmd/orient/README.md",
  "services/agent-run/engines/opencode/readonly.config.json",
  "plugins/*/plugin.json", "plugins/*/*.ts",
  "plugins/*/directives/**/*", "plugins/*/skills/**/*"
]
```
RC (`package.json:33-38`):
```json
"files": ["dist/**/*", "README.md", "ai/**/*", "cli/cmd/orient/README.md"]
```
Потеряны: `docs/**/*`, `services/agent-run/engines/opencode/readonly.config.json` (прямая ссылка — но копируется в `dist/chunks/` через `prepare-publish-artifacts.ts`, см. §2), все `plugins/*/…` паттерны. **Проверено отдельно:** `git -C <rc> ls-tree -r HEAD -- plugins` и `git -C <rc> ls-tree -r HEAD -- services/stack` оба пусты — в RC каталогов `plugins/{golang,node,anystack}` и `services/stack/**` **нет вообще**, это не "не аллоулистится", а "физически не перенесено/не существует в дереве RC". (Более раннее ошибочное наблюдение о наличии `plugins/` в RC было артефактом неверно нацеленного `npm --prefix … pack` — см. предупреждение в §3.2.)

`.npmignore`: MAIN имеет файл (subtractive guard: `*.test.*`, `__tests__/`, `fixtures/`, `e2e/`, coverage, `.map`). **RC не имеет `.npmignore` вообще** (`git -C <rc> show HEAD:.npmignore` → `fatal: path '.npmignore' does not exist in 'HEAD'`). Единственный барьер от протечки тестов в тарбол в RC — allowlist `files[]`; поскольку `files` включает `"ai/**/*"` без подчистки, **весь `ai/**` уходит в тарбол целиком, включая `__tests__/`, `fixtures/`, `e2e/`** (подтверждено `npm pack --dry-run`, см. §3.2).

### 1.5 Скрипты (`scripts`)

Построчный diff (`package.json` scripts-блок):

| Скрипт | MAIN (L51-71) | RC (L39-83) |
|---|---|---|
| `prepare` | нет | `[ -d .git ] && git config core.hooksPath scripts/git-hooks \|\| true` (см. §2 git-hooks) |
| `test` | `node --import tsx --test --experimental-test-module-mocks --test-concurrency=1` | `node --import tsx scripts/test-topology.ts deterministic` (внутри `--test-concurrency=6`, см. §2/§4) |
| `test:coverage` | нет | `scripts/test-topology.ts coverage` |
| `test:topology` | нет | `scripts/test-topology.ts check` |
| `test:cli-e2e` | `GENNADY_E2E=1 … cli/__tests__/e2e/*.test.ts` | переименован в `test:e2e` (та же команда) |
| `test:stack-e2e` | `node --import tsx scripts/stack-e2e.ts` | **отсутствует** (нет `services/stack/**`, нет `scripts/stack-e2e.ts`) |
| `test:config-e2e` | `scripts/stack-e2e.ts --suite=config` | **отсутствует** |
| `test:smoke` | `GENNADY_SMOKE=1 … bundle-smoke.e2e.test.ts publish-contents.e2e.test.ts` | **отсутствует**; сами тестовые файлы отсутствуют в дереве RC (`git -C <rc> ls-tree HEAD -- cli/__tests__/e2e` не содержит ни `bundle-smoke.e2e.test.ts`, ни `publish-contents.e2e.test.ts`) |
| `test:integration` | нет | новый, `--test-concurrency=2`, agent-inbox/mr-stats |
| `test:sdd-flow-eval`, `sdd-flow-eval` | нет | новые (flow-eval продукт) |
| `inspector*`, `inbox-serve:*` | нет | новые (RC-специфичные продукты) |
| `inspector:e2e`, `test:e2e:review-flow` | нет | `playwright test …` — новая зависимость на Playwright |
| `build:directives`, `check:directives-fresh`, `check:directive-budgets`, `audit:axioms`, `audit:contracts`, `audit:halts`, `audit:sdd-templates` | нет | новые, для `ai/kit/**` (директив-компилятор, которого нет на main) |
| `prepublishOnly` | `npm run lint && npm run test:smoke && npm run test:cli-e2e && CONFIG_E2E_STRICT=1 npm run test:config-e2e && STACK_E2E_STRICT=1 npm run test:stack-e2e && npm run build:publish` | `npm run lint && npm run test:e2e && npm run build:publish` — **не гоняет ни test:smoke, ни stack/config e2e** (их нет) |
| `postpublish` | `scripts/cleanup-publish-artifacts.ts` | идентично |
| `publish-next` | `scripts/publish-next.ts` | тот же путь, но **иная логика внутри** (см. §2, P4 регрессия) |
| `publish-draft`, `pack-draft` | нет | новые RC-only dev-скрипты (публикация/паковка в локальный `~/Developer/gennady-todomvc` для дог-фудинга) |
| `format` | `prettier --write .` | `prettier --check . --cache --cache-strategy content` (check, не write; закешировано) |
| `format:check` | `prettier --check .` | нет (слит в `format`) |
| `format:fix` | нет | `prettier --write` (замена write-варианта) |
| `lint` | `npm run format && npm run type-check && npm run lint:contracts` | `npm run lint:contracts` (**не гоняет format, не гоняет type-check!**) |
| `lint:fix` | нет | `tsx cli/gennady.ts lint --autofix` |
| `lint:contracts` | `tsx cli/gennady.ts lint --autofix cli/ shared/ services/ plugins/` (autofix встроен, включает `plugins/`) | `tsx cli/gennady.ts lint cli/ shared/ services/` (без autofix, без `plugins/`) |
| `check` | нет | `tsx cli/gennady.ts sdd-verify --profile full` — **новая семантика**: имя `check` в RC = полный sdd-verify-профиль, а не npm/tsc check |
| `fix` | нет | `npm run format:fix -- . && npm run lint:fix -- cli/ shared/ services/` |
| `yagni` | нет | `tsx cli/gennady.ts yagni` |
| `release` | `release-it` | идентично |

### 1.6 `devDependencies`/`dependencies`

Ключевые точки:

- `yaml`: MAIN `"2.9.0"` (exact-pin, P6 инвариант — "runtime deps stay ink react tree-sitter tree-sitter-typescript", yaml пиннится точно, т.к. бандлится в dist). RC: `"^2.9.0"` (caret, не exact-pinned) — **P6 нарушен**: точный пин потерян.
- `c8`: отсутствует на MAIN; RC добавляет `^12.0.0` (для `test-topology.ts coverage`).
- `@playwright/cli` / `@playwright/test`: отсутствуют на MAIN; RC добавляет (`^0.1.17` / `^1.61.1`) — новая тяжёлая e2e-зависимость (browsers), которой нет в offline-CI main (у RC и вовсе нет CI, см. §2).
- `@opencode-ai/sdk`: отсутствует на MAIN; RC добавляет `^1.17.18`.
- `picocolors`: отсутствует **в обоих** package.json (не найдено ни на main, ни в RC).
- RC добавляет большой блок фронтенд-стека (`tailwindcss`, `@tailwindcss/vite`, `@vitejs/plugin-react`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@fontsource/*`, `eslint`, `handlebars`, `marked`, `grammy`) — все для RC-специфичных продуктов (inbox-dashboard, inspector, telegram-бот), которых на main нет.
- `dependencies`: RC добавляет `jsdom` (`^29.1.1`), `mermaid` (`^11.16.0`), `dompurify` (`^3.4.12`), `react-dom` (`^19.2.7`, отсутствует на main — main тянет только `react`). `react` версия чуть разошлась (`^19.2.6` main vs `^19.2.7` RC).
- `overrides`: отсутствует в обоих (см. также §7 D-8 — REL-14 вводит `overrides` в отдельной ветке-источнике).

---

## 2. Конфиги сборки/публикации

### 2.1 `vite.config.ts`

Diff (`git -C <main> show HEAD:vite.config.ts` vs RC):

- **`executableBin()` Vite-plugin (chmod 755 на `closeBundle`) — в RC ОТСУТСТВУЕТ.** MAIN:
  ```ts
  function executableBin(): Plugin {
    return { name: 'gennady:executable-bin', closeBundle() { chmodSync(resolve(__dirname, 'dist/gennady.js'), 0o755); } };
  }
  export default defineConfig({ plugins: [executableBin()], … })
  ```
  В RC `plugins: [executableBin()]` нет, импорт `chmodSync`/`type Plugin` удалён. Это прямая регрессия исходного бага, который чинил `5c5a1f6a` (main: "chore(infra): keep executable bit on dist/gennady.js after vite build") — Vite по умолчанию пишет 644, `npm link`/прямой запуск `dist/gennady.js` получит `permission denied`.
- **Alias `gennady/stack` → `services/stack/plugin-api.ts` — в RC ОТСУТСТВУЕТ** (естественно: `services/stack/**` в RC не существует вовсе — см. §5 P2).
- **Entry `stack`** (`resolve(__dirname, 'services/stack/plugin-api.ts')`) в `build.lib.entry` — отсутствует в RC. RC **добавляет** `build.lib.fileName: (_, name) => (name === 'cli' ? 'gennady.js' : 'index.js')`, но **не удаляет** идентичную MAIN-функции `rollupOptions.output.entryFileNames` — оба поля сосуществуют в файле (второе для двух оставшихся entries фактически дублирует первое, вероятный мёртвый код/источник путаницы, а не замена одного механизма другим). Практический результат сборки не меняется: двух-entry сборка (`cli`, `index`), третьего `stack`-entry нет.
- RC **добавляет** внешние (`external`) `mermaid`, `jsdom` — RC-специфичная причина (смешанный CJS/ESM в mermaid/jsdom ломает Node-загрузку при бандлинге).
- RC **добавляет** `emptyOutDir: false` — иначе полная пересборка стирала бы `dist/inbox-serve` (соседний билд SPA-дашборда под тем же `dist/`), которого у main нет.

### 2.2 `tsconfig.json`

- `lib`: MAIN `["ES2022"]`; RC `["ES2022", "DOM"]` (нужен DOM для agent-mon/inbox-фронтенда).
- `paths`: MAIN добавляет `"gennady": ["./index.ts"]` и `"gennady/stack": ["./services/stack/plugin-api.ts"]` — **в RC оба алиаса отсутствуют** (стека нет). RC добавляет `"#utils/*": ["./utils/*"]`.
- `include`: MAIN включает `"plugins/**/*"` — RC его не имеет (закономерно: каталога `plugins/` в дереве RC нет вовсе, см. §1.4).
- `exclude`: MAIN исключает `**/__tests__/e2e/fixtures/**` и `plugins/*/e2e/fixtures/**`; RC исключает только `cli/__tests__/e2e/fixtures/**` (уже нет stack/plugins e2e fixtures, которые надо было бы исключать).

`tsconfig.types.json`: тривиальное отличие — MAIN исключает `assistant/**/*` (каталог `assistant/` есть только на main, `dist/assistant` виден на диске у main — устаревший build-артефакт), в RC этой строки исключения нет, т.к. каталога `assistant/` там нет.

### 2.3 `scripts/publish-next.ts` — P4 регрессия (порядок publish-before-git)

MAIN (`scripts/publish-next.ts:258-279`, коммит `009ff59a` "fix(release): npm publish before any git commit/tag/push"):
```
logger.info('[packageFilesUpdated → npmPublishing] Publishing package to npm with next tag');
run('npm', ['publish', '--tag', 'next']);
logger.info('[npmPublishing → gitCommitTagging] Creating git commit and tag', { tag });
run('git', ['add', 'package.json', 'package-lock.json']);
run('git', ['commit', …]); run('git', ['tag', tag]);
run('git', ['push']); run('git', ['push', '--tags']);
```
Порядок: **`npm publish` (гейт `prepublishOnly` внутри) ПЕРВЫМ; commit/tag/push только при успехе.** Ошибка сообщения (catch) явно объясняет откат: "если npm publish упал — git-коммита не было, откатывай `git checkout package.json package-lock.json`; если упал git-шаг ПОСЛЕ npm publish — пакет уже на npm, дозаверши commit/tag/push руками".

RC (`scripts/publish-next.ts`, тот же файл):
```
logger.info('[packageFilesUpdated → gitCommitTagging] Creating git commit and tag', { tag });
run('git', ['add', 'package.json', 'package-lock.json']);
run('git', ['commit', …]); run('git', ['tag', tag]);
run('git', ['push']); run('git', ['push', '--tags']);
logger.info('[gitPushing → npmPublishing] Publishing package to npm with next tag');
run('npm', ['publish', '--tag', 'next']);
```
**Порядок инвертирован обратно к до-`009ff59a` состоянию**: git commit/tag/push идёт ПЕРЕД `npm publish`. Если prepublishOnly-гейт красный (или npm publish упадёт по любой причине — сеть, 2FA, конфликт версии), в репозитории уже будет закоммичен, затегован и **запушен** бамп версии, для которого на npm ничего нет — ровно тот "phantom release" баг, который чинил main. Сообщение об ошибке в catch также деградировало: RC — просто `'Release stopped. You may need to rollback commit/tag manually.'` (без пошаговой инструкции отката, без разделения "до/после publish").

### 2.4 `scripts/prepare-publish-artifacts.ts`

Единственное отличие — RC добавляет копирование `readonly.config.json` в дистрибутив:
```ts
{
  source: path.join(projectRoot, 'services/agent-run/engines/opencode/readonly.config.json'),
  target: path.join(projectRoot, 'dist/chunks/readonly.config.json'),
},
```
Это соответствует другому решению P5 в RC (см. §5 P5) — вместо `files[]`-ссылки на исходный json main копирует его физически в `dist/chunks/`.

### 2.5 `scripts/cleanup-publish-artifacts.ts`

Идентичен побайтово (diff пуст).

### 2.6 `scripts/test-topology.ts` (только в RC)

Файл на 360 строк, отсутствует на main. Назначение — единый раннер для 4 "test layers" (`unit`/`contract`/`local`/`external`) с авто-классификацией по эвристикам (импорт `child_process`/сеть, `createGitFixture`, суффиксы `.integration.`/`.blackbox.`/`.e2e.`), плюс `coverage`-режим через `c8`.

**Ключевая деталь (конфликт с P3, см. §4):** `OUTER_TEST_CONCURRENCY = 6` (`scripts/test-topology.ts:24`), используется в `node --test --test-concurrency=${OUTER_TEST_CONCURRENCY}` (`runNodeTests`, строка 265). Т.е. `npm test` (→ `test-topology.ts deterministic`) в RC **гоняет юнит-тесты с конкурентностью 6**, а не `--test-concurrency=1`, как того требует main (P3, коммит `8358bf8b` "test: run the unit suite serially" — "Node test-runner IPC deserialisation crash ~50% под параллелью"). Файл содержит явный комментарий-обоснование на строках 21-23, рационализирующий выбор `6` через bounded outer concurrency для subprocess-heavy suites (несколько fixture-CLI пересекаются в `sdd-verify`) — т.е. это не гипотеза аналитика, а прямо задокументированное авторское намерение в самом RC-коде.

Команда read-only проверки (не мутирует состояние, дискавери тестов только читает файлы):
```
$ node --import tsx <rc>/scripts/test-topology.ts check
unit=211 contract=16 local=51 external=8
coverage observed=227[unit+contract] black-box=59[local+external]
```
Выполнилась успешно (`PROJECT_ROOT = resolve(import.meta.dirname, '..')` — путь считается от расположения самого скрипта, не от cwd, поэтому работает из любого рабочего каталога).

### 2.7 `scripts/git-hooks/pre-commit` (только в RC)

Новый sh-хук (79 строк), устанавливается через `"prepare": "[ -d .git ] && git config core.hooksPath scripts/git-hooks || true"`. Гейт verify-only (не мутирует), с "index-aware guard" (`git status --porcelain` сверяет working tree == index — отклоняет коммит, если есть unstaged/untracked изменения, которые гейт мог бы не проверить). Затем гоняет `npm run check` (=`sdd-verify --profile full`), `check:directives-fresh`, `audit:axioms`, `audit:contracts`, `audit:halts`, `check:directive-budgets`. Жёсткое сообщение (по-русски) запрещает `--no-verify` в любой форме. На MAIN аналога нет — там нет ни `scripts/git-hooks/`, ни `prepare`-скрипта, ни `.git-hooks-path`-конфига.

Побочный эффект зафиксирован и НЕ вызван этим аудитом: `git -C <rc> config --get core.hooksPath` → `/Users/k.lebedev/Developer/gennady/scripts/git-hooks`; `.git/config` (общий на все worktree) имеет mtime `Sep 6 21:33`, что раньше маркера `.npm-ci-done` (`Sep 6 22:36`) — конфиг был выставлен более ранней подготовкой окружения (`npm ci` → `prepare`), не текущим read-only аудитом.

### 2.8 `.release-it.json`, `.npmrc`, `.nvmrc`

Все три файла **побайтово идентичны** между main и RC (diff пуст).

### 2.9 CI (`.github/workflows/`)

MAIN: `.github/workflows/ci.yml` присутствует (см. A1 §1.2 — добавлен в PR #5, jobs: `unit`, `packaging`, `*-e2e`).
RC: `git -C <rc> ls-tree -r --name-only HEAD -- .github/workflows` → **пусто**. **В RC нет ни одного workflow — CI отсутствует полностью.** Ни prepublishOnly-гейт, ни pre-commit хук не запускаются автоматически на push/PR; вся защита держится на локальном git-хуке (§2.7), который можно обойти вне зафиксированной среды (клон без `npm ci`/`prepare`).

### 2.10 `.gitignore` / `.prettierignore`

`.gitignore`: RC добавляет `.codex-agent-status/`, `e2e/**/test-results/`, `playwright-report/`, `test-results/`, `.sdd-session.md`, `.tmp-*/`, `ai/flow-eval/.results/` (все — под RC-специфичные продукты: playwright e2e, flow-eval). RC **убирает** строку MAIN `!**/e2e/fixtures/**/.gennadyrc` (исключение из игнора для `.gennadyrc` внутри e2e-фикстур стек-плагинов) — логично, раз `services/stack/__tests__/e2e/` в RC не существует.

`.prettierignore`: MAIN игнорирует `**/__tests__/e2e/fixtures/**`, `plugins/*/e2e/fixtures/**`, `plugins/*/skills/**` — все относятся к стек-плагинам, которых в RC нет. RC добавляет `ai/kit/` (директив-компилятор) и `e2e/inbox-serve/test-results/`, `ai/inspector/web/trace.json` — RC-специфичные артефакты.

### 2.11 `.editorconfig`, `.prettierrc.json`

Побайтово идентичны (diff пуст) — не источник расхождений.

---

## 3. Read-only проверки, выполненные в RC

### 3.1 `node --import tsx scripts/test-topology.ts check`

```
unit=211 contract=16 local=51 external=8
coverage observed=227[unit+contract] black-box=59[local+external]
```
Выполнилось без мутаций (только discovery + классификация файлов; сам тест-ран не запускался — команда `check`, не `deterministic`/`coverage`/`unit`).

### 3.2 `npm pack --dry-run --json` (пакетный спек = путь RC, а не `--prefix`)

⚠️ Важный методологический нюанс: `npm --prefix <rc> pack --dry-run --json` **не паковал RC** — `--prefix` не меняет проект, который паковит `npm pack` без явного package-spec; команда упаковала пакет из **текущей cwd bash-сессии** (MAIN worktree). Корректная команда — передать путь RC как package-spec:
```
$ npm pack --dry-run --json --pack-destination /tmp <rc>
```
Результат (для RC, версия из package.json подтверждена `0.8.4`):
```
name gennady version 0.8.4
filename gennady-0.8.4.tgz
unpackedSize 3530954   # ~3.53 MB
entryCount 1190
```
Разбивка `entryCount` по топ-уровню: `ai` — 1186 файлов, `cli` — 2, `README.md` — 1, `package.json` — 1 (т.е. `dist/**/*` дал 0 записей — `dist/` не собран, см. §3.3).

**104 из 1190 записей — тестовые/фикстурные пути**, попавшие в тарбол исключительно потому, что `files: ["ai/**/*", …]` не подрезается `.npmignore` (которого в RC нет). Примеры реально запакованных путей:
```
ai/flow-eval/__tests__/harness.test.ts
ai/flow-eval/__tests__/fixtures/p9-misunderstood-cases.json
ai/kit/__tests__/skeleton-package-binding.e2e.test.ts
ai/inspector/e2e/inspector.spec.ts
ai/kit/anti-pattern/e2e/AP_E2E_CSS_LOCATOR.xml   (не тест, но живёт в /e2e/ директории вперемешку)
```
Это прямое нарушение P1 ("`.npmignore` subtracts tests/fixtures/e2e/coverage/maps") — RC течёт test-код в публикуемый пакет.

Для контраста: тот же прогон для MAIN (package-spec = путь MAIN) даёт `version 0.9.0-next.3`, `entryCount 621`, `unpackedSize 6669016`, разбивка `dist=502, ai=101, plugins=12, cli=2, README.md=1, docs=1, package.json=1, services=1`. (Более ранняя цифра "entryCount: 614" была артефактом ошибочно нацеленной команды `npm --prefix <rc> pack`, запущенной из другого cwd — иллюстрация методологической ловушки выше, не заявляемый факт про MAIN.)

### 3.3 `ls -la <rc>/dist`

```
ls: <rc>/dist: No such file or directory
```
**`dist/` не собран в RC** (`npm run build` не выполнялся в этом чекауте). Соответственно нельзя проверить exec-bit на `dist/gennady.js` эмпирически в RC; но поскольку `vite.config.ts` в RC не содержит `executableBin()`-плагина (см. §2.1), при сборке экзек-бит НЕ будет восстановлен (Vite по умолчанию пишет 644).

Побочная находка (не запрошена явно, но релевантна для контраста): **MAIN worktree на диске уже содержит устаревший `dist/`** (собран `Aug 12`, до HEAD-коммитов от `Sep 3`) — `dist/gennady.js` имеет права `-rwxr-xr-x` (755), что подтверждает: chmod-плагин `closeBundle` в MAIN исторически отрабатывал корректно.

### 3.4 `npm audit` в RC

Пробел исходного B5: чек-лист аудита предполагал `npm audit`, но команда не выполнялась. Верификация выполнила её отдельно — команда сработала **онлайн** (не offline-fail), формулировка задания "если офлайн упадёт — сказать об этом" неприменима, зафиксирован реальный результат:

```
$ npm --prefix "$RC" audit --json
# metadata.vulnerabilities: {info:0, low:1, moderate:3, high:7, critical:0, total:11}
# keys: browserslist, dompurify, esbuild, ip-address, mermaid, nanoid,
#       postcss, release-it, undici, vite, ws
# dompurify: severity=moderate, isDirect=true, fixAvailable=true
# vite: severity=high, isDirect=true, fixAvailable=true

$ npm --prefix "$MAIN" audit --json
# {info:0, low:1, moderate:1, high:1, critical:0, total:3}
# keys: esbuild, release-it, undici
```

RC: **11 уязвимостей** (1 low / 3 moderate / 7 high / 0 critical) — `browserslist`, `dompurify`\*, `esbuild`, `ip-address`, `mermaid`\*, `nanoid`, `postcss`, `release-it`, `undici`, `vite`\*, `ws` (`*` = прямая, `isDirect: true`, зависимость). MAIN: **3 уязвимости** (`esbuild`, `release-it`, `undici`) — тот же поднабор, что и в RC (общий корень), RC добавляет 8 новых через frontend/mermaid/playwright-стек. Все 11 в RC имеют `fixAvailable: true`, в т.ч. прямая moderate XSS в `dompurify` и прямая high в `vite`.

Это отдельная задача, не покрытая исходным списком REL-1..10 — см. REL-11 в §7.

---

## 4. Конфликты (RC vs MAIN, а не просто "отсутствует")

1. **Тест-конкурентность.** MAIN: `--test-concurrency=1` (P3, фикс от IPC-краша ~50% под параллелью, `8358bf8b`). RC: `OUTER_TEST_CONCURRENCY = 6` в `scripts/test-topology.ts:24`, зашито в `runNodeTests`. Это не "RC ещё не сделал", а **осознанное иное архитектурное решение** (RC использует другой набор тест-слоёв/группировку файлов, возможно не бьющую в тот же IPC-баг, либо баг не воспроизведён в RC-топологии). Слияние без решения: либо портировать `--test-concurrency=1` в `test-topology.ts` (рискует замедлить CI RC вдвое-more), либо доказать, что RC-топология не подвержена крашу IPC (нужен прогон `npm test` под нагрузкой — не выполнялся в рамках read-only аудита). См. также §7 D-8/REL-13 — существует ветка с фиксом самого триггера IPC-краша, что открывает третий путь (Q5, §9).
2. **`check` — разная семантика одного и того же имени скрипта.** MAIN: скрипта `check` нет вообще (ближайший — `type-check` = `tsc --noEmit`). RC: `check` = `tsx cli/gennady.ts sdd-verify --profile full` — полный gate-раннер продукта (verify стек + rules + tests), вызывается из pre-commit хука. Если портировать RC-хуки/скрипты на main "как есть", `npm run check` в контексте main не будет существовать (`sdd-verify` — RC-only команда CLI), хук сломается сразу.
3. **`lint` перестал гонять `format`+`type-check`.** MAIN: `lint = format && type-check && lint:contracts`. RC: `lint = lint:contracts` **только**. Значит `prepublishOnly` (`lint && test:e2e && build:publish`) в RC **не проверяет форматирование и типы перед публикацией** — регрессия относительно main (там `prepublishOnly` транзитивно гоняет `format`+`type-check` через `lint`).
4. **Публикуемый экспорт product-несовместим.** RC `exports["."]` указывает на исходник другого продукта (`services/agent-mon/index.ts`), при этом `main`/`types` полей package.json по-прежнему указывают на `dist/index.js`/`dist/index.d.ts` — сборка (`vite.config.ts`) вообще не производит `services/agent-mon` entry в `dist`. **Пакет в текущем виде не собирается в консистентный экспортируемый артефакт** — это не просто "не портировано", это несогласованное состояние, которое надо явно решить (какой продукт — CLI+stack или agent-mon — является публикуемой единицей `gennady`).

---

## 5. Вердикт по инвариантам P1–P6 (main, A1 §3.7) применительно к RC

| # | Инвариант (кратко) | Статус в RC | Детали |
|---|---|---|---|
| **P1** | Тарбол = allowlist (`dist/**`, `README.md`, `docs/**`, `ai/**`, orient README, `readonly.config.json`, `plugins/*/…`) МИНУС `.npmignore` (тесты/фикстуры/e2e/coverage/maps) | **Отсутствует / нарушен** | `files` короче (нет `docs/**`, `plugins/*/…`, прямой ссылки на `readonly.config.json`); `.npmignore` отсутствует физически → 104 тестовых/e2e-файла реально попадают в `npm pack --dry-run` (§3.2). Локирующие тесты (`bundle-smoke.e2e.test.ts`, `publish-contents.e2e.test.ts`) **отсутствуют в дереве RC**. |
| **P2** | `exports`: `.`→dist/index.js(+d.ts), `./stack`→dist/stack.js(+plugin-api.d.ts), `types/import/default`; `gennady/stack` alias в vite+tsconfig; `bin` chmod 755 в `closeBundle`; `entryFileNames` единый источник | **Иное / отсутствует** | `exports["."]` в RC = source `.ts` другого продукта, без условий; `./stack` subpath отсутствует вовсе (стека нет); vite alias `gennady/stack` и `stack`-entry отсутствуют; `executableBin()`-плагин (chmod 755) **удалён** из `vite.config.ts` — регрессия relative к `5c5a1f6a`; RC добавляет `lib.fileName` для 2 (не 3) entries, не удаляя старую `entryFileNames`-функцию (см. §2.1). |
| **P3** | `prepublishOnly` = lint→test:smoke→test:cli-e2e→config-e2e(strict)→stack-e2e(strict)→build:publish; `postpublish` cleanup; `--test-concurrency=1` | **Иное, частично конфликтует** | RC `prepublishOnly` = `lint && test:e2e && build:publish` — короче, без smoke/config-e2e/stack-e2e (их нет как продуктов); `lint` в RC не гоняет format/type-check (см. §4.3) — доп. регрессия; `postpublish` идентичен; **тест-конкурентность = 6, не 1** (§4.1) — прямой конфликт с фиксом `8358bf8b`. |
| **P4** | `publish-next.ts`: `npm publish` (с гейтом внутри) ПЕРВЫМ, git commit/tag/push только при успехе; prerelease-линия `0.9.0-next.N` > latest `0.8.4` | **Регрессия (нарушен)** | RC инвертировал порядок обратно: git add/commit/tag/push идёт ДО `npm publish` — ровно баг, зафиксированный main-коммитом `009ff59a` (см. §2.3, полный diff). Version-стратегия: RC `0.8.4` **ниже** актуальной main prerelease-линии `0.9.0-next.3` — публикация RC "как есть" под тегом `next`/`latest` создаст ниже-по-семверу релиз, если не поднять базу версии сначала (см. §6 "стратегия версии"). |
| **P5** | Бандл должен стартовать с `data:`-инлайненного `readonly.config.json`, материализуемого во временный файл | **Иначе реализован, не покрыт тестом** | RC не инлайнит `data:` URL; вместо этого резолвит `readonly.config.json` через `dirname(fileURLToPath(import.meta.url))` (реальный файл рядом с чанком), и `prepare-publish-artifacts.ts` копирует исходный json в `dist/chunks/readonly.config.json` (см. §2.4). Функционально может работать (при условии, что vite кладёт скомпилированный `opencode-engine` чанк в `dist/chunks/`), но: (а) это не то же самое решение, что описывает P5 буквально; (б) `bundle-smoke.e2e.test.ts` — единственный локирующий тест инварианта — в RC отсутствует, т.е. поведение **не верифицировано никаким тестом**. |
| **P6** | `yaml@2.9.0` — exact-pinned devDependency, бандлится в dist; runtime deps остаются `ink react tree-sitter tree-sitter-typescript` | **Частично нарушен** | RC: `"yaml": "^2.9.0"` — caret, не exact pin (нарушение). Runtime `dependencies` в RC расширены (`jsdom`, `mermaid`, `dompurify`, `react-dom` добавлены сверх `ink/react/tree-sitter/tree-sitter-typescript`) — согласуется с тем, что RC — другой продукт, но означает, что "closed list" инвариант P6 в его текущей формулировке для RC неприменим без пересмотра. |

**Итог:** ни один из P1–P6 не выполняется в RC в исходной main-формулировке. P1, P2, P3, P4, P6 — прямые регрессии/расхождения; P5 — иное (потенциально рабочее) решение, но непротестированное. P4 — единственный, где RC **откатил уже сделанный на main фикс** (не "не успел портировать", а буквально вернул старое поведение).

---

## 6. Что нужно портировать в RC до релиза как 0.9.x

- **Exports-поверхность.** Решить продуктовый вопрос сначала (см. §9 Q1). Если стек-плагины (`services/stack/**`, `plugins/{golang,node,anystack}`) переносятся в RC — портировать `exports["./stack"]`, vite `gennady/stack` alias + `stack` entry, tsconfig `paths`/`include`. Если НЕ переносятся — `exports["."]` в RC всё равно должен указывать на `dist/*.js` (не на source `.ts`), с условиями `types/import/default`, консистентно с `main`/`types`.
- **`publish-next.ts` — porting порядка publish-before-git** (P4) — минимальный, изолированный, высокоценный фикс: скопировать блок `try{}` из main `scripts/publish-next.ts:255-285` в RC один-в-один (файл идентичен по остальному содержимому — см. §2.3).
- **`.npmignore`** — скопировать файл main целиком (нет RC-специфичных исключений, которые бы конфликтовали — `.npmignore` работает поверх любого `files[]`).
- **Bundle smoke test** — портировать `cli/__tests__/e2e/bundle-smoke.e2e.test.ts` и `publish-contents.e2e.test.ts` (адаптировав под текущий RC `files[]`/`exports`), включить обратно в `prepublishOnly` под именами `test:smoke`.
- **`executableBin()` vite-plugin** (chmod 755 `closeBundle`) — портировать напрямую, независим от остальной vite-конфигурации, риск регрессии нулевой.
- **Сериализация юнит-тестов** — либо портировать `--test-concurrency=1` в `test-topology.ts` (`OUTER_TEST_CONCURRENCY = 1`, с оценкой влияния на время прогона всех layers), либо явно задокументировать/подтвердить прогоном под нагрузкой, что RC-топология не подвержена IPC-крашу main, либо (по D-8, см. §7) портировать фикс самого триггера краша и пересмотреть, нужна ли сериализация вообще — это конфликт, требующий операторского решения, не механического порта.
- **`yaml` exact pin** — `"yaml": "2.9.0"` вместо `"^2.9.0"`.
- **`lint` должен снова покрывать `format`+`type-check`** перед `lint:contracts`, либо `prepublishOnly` должен явно добавить `format:check`+`type-check` отдельными шагами, если `lint` сознательно сужен.
- **CI** — портировать `.github/workflows/ci.yml` (или создать RC-эквивалент, покрывающий: unit/coverage через `test-topology.ts`, `test:e2e`, `test:integration`, `pre-commit`-гейты `audit:*`/`check:directives-fresh`) — сейчас у RC нет вообще никакой автоматической проверки на push/PR, вся защита — локальный git-хук, который не работает в CI-раннере без `npm ci`+`prepare`.
- **Dependency-уязвимости** (новое, из V-B5 §3.4) — 11 находок `npm audit` в RC против 3 в MAIN, часть можно закрыть точечно через `overrides` (см. §7 D-8/REL-14), остальное — апгрейдом прямых зависимостей (`dompurify`, `vite`, `mermaid`).

### Стратегия версии (RC `0.8.4` vs main `0.9.0-next.3`)

RC version — `0.8.4` (стабильный релиз ниже даже старой prerelease-базы main). Main уже прошёл цепочку `0.8.4-next.1…10 → 0.9.0-next.0(rebase, `580eb5d7`) → phantom next.1/2/3 (`b90a802f/6256ee28/b5dd081f`) → reset to next.0 (`b2fbb234`) → next.1(`b1a43fd7`) → next.2(`0c2307fc`) → next.3(`c7051379`, текущий HEAD)`. Если RC становится основой 0.9.x, версию **нельзя** просто взять из RC `package.json` — нужно either (а) смёржить RC поверх main (тогда версия main и её история "next.N" сохраняется), либо (б) если RC замёрживается КАК основа, а main — донор пакующей инфраструктуры, то RC должен явно поднять версию выше `0.9.0-next.3`, иначе `npm publish --tag next` создаст семверно-меньший релиз, который npm либо отклонит (если `next.3` уже опубликован под тем же именем), либо тихо создаст out-of-order историю тегов.

---

## 7. Операторское решение D-8 (2026-09-07): задачи из ветки `sdd-v2-inbox-transplant`

Отдельно от B5/V-B5, оператор указал на ветку `sdd-v2-inbox-transplant` (не влита ни в main, ни в текущий RC `11291af5`) как источник трёх дополнительных коммитов, релевантных этому треку. Ветка не была предметом read-only аудита B5/V-B5 — её содержимое принимается со слов оператора и должно быть перепроверено при выполнении задач ниже.

- **`35a31942`** — явный root, протянутый через 8 SDD-команд; параллельно из тестов убирается `process.chdir`. Замена global-mutable `process.chdir()` на явно передаваемый параметр root устраняет источник кросс-тестовой интерференции: `process.chdir` — процесс-глобальное состояние, и при параллельном запуске тестов (`node --test --test-concurrency > 1`) параллельные test-файлы, каждый из которых временно меняет cwd, гоняются в одном процессе и могут гонять друг друга за текущую директорию. Это напрямую релевантно конфликту §4.1 (тест-конкурентность). **Текущий RC (`11291af5`) всё ещё содержит 9 тестовых файлов с `process.chdir`** — коммит не влит.
- **`51195c48`** — фикс IPC-флейка `node --test` **в точке триггера**, а не обходом (сериализацией). Относится к тому же конфликту §4.1/§2.6: RC `test-topology.ts` использует `OUTER_TEST_CONCURRENCY = 6`, main использует `--test-concurrency=1` (фикс от кросс-того же класса краша, `8358bf8b`). Если `51195c48` действительно устраняет первопричину IPC-деериализационного краша (а не просто снижает его вероятность), это меняет расклад операторского решения по тест-конкурентности — см. Q5 в §9.
- **`package.json` `overrides` для `undici`/`esbuild`** — на момент коммита в этой ветке `npm audit` возвращал 0 уязвимостей. Это точечно закрывает 2 из 11 находок §3.4 (`undici`, `esbuild` присутствуют в списке RC `11291af5`), но не закрывает остальные 9 (в т.ч. прямые `dompurify`/`vite`/`mermaid`) — `overrides` не является полной заменой REL-11, только его частью.

**Важно:** ни один из трёх коммитов не был read-only-верифицирован против текущего дерева RC `11291af5` (в отличие от всего остального в этом документе). Ветка `sdd-v2-inbox-transplant` могла разойтись с `11291af5` по неизвестному числу коммитов между её base и текущим RC HEAD. Поэтому задачи REL-12…REL-14 в §8 явно помечены как требующие **повторного вывода (re-derive)** — взять намерение и диф коммита, применить заново к текущему состоянию RC, а не `git cherry-pick` вслепую (велика вероятность конфликтов: `test-topology.ts` могла эволюционировать, тестовые файлы с `process.chdir` могли измениться, `package.json`-структура зависимостей — тоже).

---

## 8. Список задач (id, цель, файлы, тесты, размер)

| id | Цель | Файлы | Тесты | Размер |
|---|---|---|---|---|
| REL-1 | Вернуть publish-before-git порядок в RC `publish-next.ts` | `scripts/publish-next.ts` | ручной (нет автотеста ни на main, ни в RC — "none (manual)" в A1 P4) | S |
| REL-2 | Добавить `.npmignore` в RC (копия main) | `.npmignore` (new) | `npm pack --dry-run` — проверить исчезновение test/fixture путей | S |
| REL-3 | Портировать `executableBin()` chmod-plugin в RC `vite.config.ts` | `vite.config.ts` | ручная проверка `ls -la dist/gennady.js` после build | S |
| REL-4 | Портировать/адаптировать `bundle-smoke.e2e.test.ts` + `publish-contents.e2e.test.ts` под RC `files`/`exports`; включить как `test:smoke` в `prepublishOnly` | `cli/__tests__/e2e/bundle-smoke.e2e.test.ts` (new), `cli/__tests__/e2e/publish-contents.e2e.test.ts` (new), `package.json` (scripts) | сами эти файлы — тесты | M |
| REL-5 | Решить продуктовый вопрос exports (`.`/`./stack` vs agent-mon providers) и привести `exports`/`main`/`types`/vite entries/tsconfig paths к консистентному виду | `package.json`, `vite.config.ts`, `tsconfig.json` | `npm run build && node dist/index.js` smoke; type-check консьюмера | L (зависит от операторского решения Q1) |
| REL-6 | Пофиксить `yaml` pin (`^2.9.0`→`2.9.0`) | `package.json` | build:publish smoke (пакет собирается с ровно этой версией) | S |
| REL-7 | Разобраться с тест-конкурентностью: либо `OUTER_TEST_CONCURRENCY=1` в `test-topology.ts`, либо доказать безопасность 6 прогоном под нагрузкой (`for i in 1..5; do npm test; done` замер флейков) | `scripts/test-topology.ts` | существующий прогон `npm test` × N повторов | M |
| REL-8 | Вернуть `lint` = `format(:check) && type-check && lint:contracts`, либо явно расширить `prepublishOnly` этими шагами | `package.json` (scripts) | `npm run prepublishOnly` (dry, без реальной публикации) должен красным падать на неотформатированном/нетипизированном коде — регрессионный тест-кейс вручную | S |
| REL-9 | Добавить `.github/workflows/ci.yml` в RC (portировать job'ы `unit`/`packaging`/`*-e2e` из main, адаптировав команды под `test-topology.ts`) | `.github/workflows/ci.yml` (new) | сам CI-прогон на PR | M |
| REL-10 | Решить версионную стратегию (см. §6) до первого `publish-next` из RC-ветки | `package.json` (version) | `npm view gennady versions` сверка перед публикацией (ручной шаг) | S (операторское решение, не код) |
| REL-11 | Устранить/зафиксировать dependency-уязвимости RC (`npm audit`, 11 шт.: `browserslist`, `dompurify`\*, `esbuild`, `ip-address`, `mermaid`\*, `nanoid`, `postcss`, `release-it`, `undici`, `vite`\*, `ws`; \*=direct; в т.ч. прямая moderate XSS в `dompurify` и прямая high в `vite`, все с `fixAvailable: true`) | `package.json`, `package-lock.json` (RC) | повторный `npm audit --json` показывает 0 high/critical | S-M |
| REL-12 | Re-derive `35a31942` против текущего RC `11291af5`: явный root через SDD-команды, убрать `process.chdir` из тестов (сейчас 9 файлов). **Не cherry-pick вслепую** — перепроверить диф против текущего состояния `cli/cmd/sdd-*` и тестовых файлов | 8 SDD-command файлов (`cli/cmd/sdd-*`), 9 тестовых файлов с `process.chdir` (перечень — см. `grep -rl process.chdir` в RC) | существующие юнит/контракт-тесты соответствующих команд; ручная проверка отсутствия `process.chdir` (`grep -r process.chdir` → 0) | M |
| REL-13 | Re-derive `51195c48` против текущего RC `11291af5`: фикс IPC-флейка `node --test` в точке триггера (не обход сериализацией). Связано с REL-7/Q5 — может снять необходимость форсировать `--test-concurrency=1` | `scripts/test-topology.ts` и/или узел(-ы) триггера краша (уточнить при re-derive) | прогон `npm test` × N (10+) под текущей конкурентностью после фикса — 0 флейков | M |
| REL-14 | Re-derive `overrides` для `undici`/`esbuild` из `sdd-v2-inbox-transplant` в текущий RC `package.json`. Закрывает 2 из 11 находок REL-11, не заменяет REL-11 целиком | `package.json`, `package-lock.json` | `npm audit --json` — `undici`/`esbuild` отсутствуют среди уязвимостей после апдейта | S |
| REL-15 *(id жил только на доске — строка дозаведена по V-61 §6)* | Аналитическая задача: причина IPC-краша `node --test` — связан ли он с agent-mon (которого не должно быть в v2) или agent-inbox (должен быть исключён из общих тестов v2); решение по REL-7/12/13 принимается **после** её результата | `scripts/test-topology.ts`; тесты agent-mon/agent-inbox | диагностика + отчёт с воспроизведением краша | M (D-10, D-30) |
| REL-16 *(строка дозаведена по V-61 §6)* | Docs-проход A5: `README`, `ai/skills/README.md`, guides описывают **только v2**; grep-замок анти-v1 расширен на docs | `README.md`, `ai/skills/README.md`, `guides/**`, grep-гейт в `npm run check` | `grep`-гейт = 0 v1-упоминаний в docs | S (A5, A14) |
| **REL-17** *(новая — 06 §5.1 п.1, **D-38**)* | **Заморозить baseline RC.** Срез = **тег `rc-baseline-1` на `227c03a8`** (operator-approved SHA); `git status --porcelain=v1 --untracked-files=all` пуст на срезе; зафиксированы Node/npm/OS + hash lockfile; before-отчёт — гистограммы `sdd-check --all .` по `code/file/severity` и exit-коды всех гейтов. Все доказательства плана ссылаются на SHA тега. **RC продолжает WIP в той же ветке** (цель 5.4 сохраняется); при сдвиге HEAD baseline пересобирается **отдельной задачей с явным OK оператора** | тег `rc-baseline-1`; `_raw/baseline/rc-baseline-1/**` | `git tag --list rc-baseline-1` непуст; `git rev-parse rc-baseline-1` = `227c03a8`; `git status --porcelain=v1 --untracked-files=all` пуст на теге | S — **Волна −1**, критерий **A18**; push тега — только с явным разрешением оператора |
| **GAP-B-1** *(новая — 06 §5.1 п.1a, потерянный MUST первоисточника, найден **V-06**; парная к REL-17)* | **Версионированный baseline находок** корневого прогона `sdd-check --all .` по `code/file/severity` (стартовая точка — измеренные **198 error / 431 warn** на `227c03a8`, exit 1) + предикат **zero-new-error** в CI. **Любое изменение baseline — отдельное operator-approved решение.** Общий count непригоден как критерий (`evidence-audit:346`) — остаток перечисляется по `code/file/severity` | новый `_raw/baseline/rc-baseline-1/findings.json`; скрипт-предикат + гейт в `npm run check`/CI | «прогон на теге даёт ровно baseline»; «error кода/файла, которого нет в baseline → exit 1» (обязателен негативный тест) | S — **Волна −1**; критерии **A18/A1/A13**; **заменяет отменённую `B2-21` как предпосылку `E-07`** (D-39) |
| **REL-18** *(новая — 06 §5.1 п.2)* | **RC evidence pack на одном чистом коммите**: команды, окружение, exit-коды и raw logs для `type-check`, `format` (**check-only**), `lint`, `audit:sdd-templates`, `build`, `test`; migration dry-run **дважды** (второй — no-op). **Full suite исполняется вне restricted sandbox — `EPERM`-падения не считаются product failure и не смешиваются с ним** (`sdd-v2-rc-hardening-plan:312`) | `_raw/baseline/rc-evidence-pack/**`; `package.json` (scripts) | сами прогоны + сверка «второй dry-run = no-op»; локальные `dist`/`coverage` и прежние receipts как evidence **не используются** | M — Волна 5; критерии **A18/A9** (правка 61) |
| **REL-19** *(новая — **D-54**)* | Удалить `.github/workflows/ci.yml` и все ссылки на CI в README/доках/скриптах (`check:ci`); зафиксировать, что качество держится **pre-commit + pre-push + `npm run check`** (см. примечание D-54 ниже). Владелец удаления `check:ci` из `package.json` — **`GAP-B-2`** (доска `61`); эта задача зачищает остальные упоминания и сам workflow-файл | `.github/workflows/ci.yml` (удаление), `README.md`, доки, этот документ (§6/§9 CI-пункты помечены историческими) | `ls .github/workflows` пусто/нет каталога; `grep -rn "check:ci\|workflows/ci" --include=*.md --include=*.json .` = 0 | S — Волна 0; зависит от **GAP-B-2** (доска `61`); критерий **A9** |

**Примечание D-54 (CI и жёсткие проверки):**
- В репозитории нет работающего CI; `.github/workflows/ci.yml` удаляется (**REL-19**), не портируется — §6 «CI — портировать…» и Q3 ниже сохранены как **исторический анализ**, решение по ним отменено D-54.
- Жёсткие проверки живут в **pre-commit + pre-push** git-хуках и `npm run check`, не в CI.
- Гейт zero-new-error (`GAP-B-1`) переезжает из `check:ci` в `scripts/git-hooks/pre-push` задачей **GAP-B-2** (доска `61`); `check:ci` удаляется.
- `core.hooksPath` обязан быть относительным (`scripts/git-hooks`), чтобы хуки исполнялись в любом worktree — находка `_raw/reports/R-00-REL-17-GAP-B-1.md` §«НАЙДЕНО ПОПУТНО».
- **Не снято этой правкой:** задача `REL-9` (D-11, ниже) по-прежнему требует создать `.github/workflows/ci.yml` — прямое противоречие с D-54/`REL-19`, см. `61-TASK-BOARD.md` §2.2 п.16.

---

## 9. Операторские решения (2–4 варианта каждое)

**Q1. Что публикуется под именем `gennady` — CLI+stack (как на main) или agent-mon/inbox-продукт (как в RC)?**
- (a) RC поглощает main-архитектуру: стек-плагины (`services/stack`, `plugins/*`) переносятся в RC, `exports["./stack"]` возвращается как на main; agent-mon остаётся внутренним/непубличным модулем.
- (b) main-архитектура отбрасывается: `gennady` = agent-mon/inbox продукт, `exports["."]` фиксируется на собранный `dist/`-выход agent-mon (не на source `.ts`), стек-инварианты (P2 `./stack`, P6 частично) считаются N/A и вычёркиваются из чек-листа релиза.
- (c) Оба сосуществуют как разные npm-пакеты (`gennady` и `gennady-stack` или scoped `@gennady/stack`) — экспортные поверхности разводятся физически.
- (d) Отложить релиз 0.9.x до отдельного ADR по продуктовой стратегии; в данном release-package треке зафиксировать только "не готово: P2 blocked on product decision".

**Q2. Тест-конкурентность юнит-тестов — 1 или 6?**
- (a) Принудительно `--test-concurrency=1` везде (безопасно, но потенциально сильно медленнее — main зафиксировал реальный IPC-краш ~50% под параллелью).
- (b) Оставить 6, но сначала прогнать offline-гейт N раз подряд (напр. 10×) в CI и в локальном окружении, замерить flake-rate; принять 6, если flake=0.
- (c) Промежуточное значение (напр. 2-3), эмпирически подобранное по времени/стабильности.
- (d) Разделить: `unit`-layer (изолированные, без subprocess) — высокая конкурентность; `local`/`external` (спавнят git/npm/CLI) — принудительно 1.

**Q3. CI для RC — портировать main workflow один-в-один или писать заново под RC-топологию?**
- (a) Скопировать `.github/workflows/ci.yml` из main, адаптировав job-команды под `npm run test:topology`/`test:coverage`/`test:e2e`/`test:integration` вместо `test:smoke`/`test:cli-e2e`/`test:stack-e2e`/`test:config-e2e`.
- (b) Написать новый workflow с нуля вокруг `scripts/test-topology.ts` как единой точки входа (unit/coverage/check в одном job).
- (c) Временно ограничиться локальным `scripts/git-hooks/pre-commit` (уже есть) + ручной прогон перед релизом, отложить CI до отдельной инфраструктурной задачи.

**Q4. Версионная стратегия релиза.**
- (a) Смёржить RC поверх main (main как база), тем самым унаследовав `0.9.0-next.3` как текущую точку — RC-фичи (agent-mon/inbox/flow-eval/test-topology) накатываются как новые коммиты поверх main.
- (b) Смёржить main поверх RC (RC как база), явно подняв версию RC выше `0.9.0-next.3` перед первым публичным `publish-next` (напр. `0.9.0-next.4` или пересчитать линию заново по образцу main-фикса `580eb5d7`/`b2fbb234`).
- (c) Обнулить обе истории и начать `1.0.0-next.0` как явный сигнал "несовместимая архитектурная развилка слита".

**Q5. Тест-конкурентность (§4.1/§7) — форсировать `=1`, или сначала портировать фикс триггера IPC-флейка (D-8, `51195c48`)?**
Ветка `sdd-v2-inbox-transplant` содержит коммит, который (по заявлению оператора) чинит IPC-краш `node --test` в точке триггера, а не обходит его сериализацией — это отдельный, третий путь относительно вариантов Q2 (a)/(b)/(c)/(d), не сводящийся к ним напрямую.
- (a) Re-derive `51195c48` в текущий RC первым (REL-13), затем повторно оценить — можно ли при устранённом триггере оставить `OUTER_TEST_CONCURRENCY = 6` (или даже поднять), не проводя отдельно многократный flake-прогон из Q2(b) — фикс триггера сам по себе считается достаточным доказательством.
- (b) Re-derive `51195c48` (REL-13) **и** дополнительно прогнать flake-тест как в Q2(b) — не доверять фиксу триггера без эмпирического подтверждения на текущей RC-топологии (211/16/51/8 тестов могла отличаться от топологии на момент `51195c48`).
- (c) Форсировать `--test-concurrency=1` (Q2a) независимо от наличия фикса триггера — не полагаться на re-derive непроверенного коммита из непроверенной ветки для релизного гейта; отложить `51195c48` до отдельной задачи вне release-трека.
- (d) Портировать и `35a31942` (REL-12, устраняет `process.chdir`-интерференцию), и `51195c48` (REL-13) вместе, как связанную пару — по гипотезе §7, оставшиеся 9 файлов с `process.chdir` могут быть независимым (или дополнительным) источником флейков под параллелью, не покрываемым одним лишь `51195c48`.

---

## Итог верификации

B5 (аналитик) — фактологически прочный документ по независимой оценке V-B5: подавляющее большинство точечных утверждений (diff-содержимое, `npm pack --dry-run` цифры, порядок операций в `publish-next.ts`, отсутствие `.npmignore`/CI в RC, идентичность `.release-it.json`/`.npmrc`/`.nvmrc`) подтверждено дословно, включая нетривиальные числа (`entryCount: 1190`, `104` тестовых/фикстурных пути, `unpackedSize: 3530954`, `unit=211 contract=16 local=51 external=8`, mtime `.git/config` Sep 6 21:33:32 vs `.npm-ci-done` Sep 6 22:36:11).

Найдено верификатором и применено в этом чистовике:
1. 2 ошибки в номерах строк для MAIN `package.json` (§1.4: `39-50`, не `39-46`; §1.5: scripts-блок `L51-71`, не `L47-71`) — исправлены.
2. 1 неточная формулировка в §2.1 (`vite.config.ts`): RC **добавляет** `lib.fileName`, не заменяя идентичную `entryFileNames` — переформулировано.
3. 1 существенный пробел: `npm audit` не выполнялся в B5 — выполнен верификатором (§3.4), дал 11 уязвимостей в RC vs 3 в MAIN — добавлена задача REL-11.
4. Факультативное усиление §2.6 (авторский комментарий про `OUTER_TEST_CONCURRENCY = 6` в самом файле RC) — добавлено.
5. Новые RC-коммиты `95329c19`, `3d5f66a7` (потомки `11291af5`) подтверждены как не затрагивающие packaging (только `ai/flow-eval/**`) — фиксация RC-снапшота на `11291af5` для этого трека остаётся корректной.

Дополнительно, по операторскому решению D-8, добавлены задачи REL-12…REL-14 из непроверенной аудитом ветки `sdd-v2-inbox-transplant` — они явно помечены как требующие повторного вывода (re-derive) против текущего RC, а не механического cherry-pick (§7), и добавлен Q5 — реальный операторский выбор, который D-8 открывает поверх уже существующего конфликта тест-конкурентности (§4.1, Q2).

Задачи REL-1..10 и операторские решения Q1-Q4 из исходного B5 прошли проверку без содержательных нареканий. Итоговый список задач трека: **REL-1…REL-14**. Операторские решения: **Q1…Q5**. Блокеров, специфичных для этого трека, за пределами уже перечисленных P1/P2/P4-регрессий (§5) не выявлено.
