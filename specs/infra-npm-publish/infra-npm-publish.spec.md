# infra-npm-publish: Infrastructure Specification

<!--SECTION:SPEC_ID-->

INFRA-NPM-PUBLISH

<!--/SECTION:SPEC_ID-->

## scope-type

infrastructure

## 1. Vision

> **Current UV-27B contract (supersedes executable publication below):** текущий deliverable —
> reviewed main cutover, а npm publication запрещена до отдельного будущего design/ACK. Исторические
> D-001..D-005 и workflow ниже сохранены как provenance прежнего infra scope, но не являются
> исполняемым acceptance current track.

Пакетная структура и build/export остаются проверяемыми, однако все repository-owned registry
publication entrypoints обязаны остановиться одним `UV27B_NPM_PUBLICATION_DENIED` до version write,
build, npm whoami/view/publish, git commit/tag/push или registry access.

## 2. Tool Stack

### 2.1 Categories Covered

| Категория          | Статус               | Обоснование                                    |
| ------------------ | -------------------- | ---------------------------------------------- |
| npm-publish-tool   | включена             | ядро скоупа — автоматизация релизного процесса |
| vcs                | включена (mandatory) | git — теги, коммиты, push                      |
| package-management | включена (mandatory) | npm — registry, publish                        |
| git-hooks          | включена (mandatory) | pre-publish проверки через release-it hooks    |

linting, formatting, test-unit, type-check, bundler, ci — исключены: покрываются `infra-base`.

### 2.2 Tool Choices

| Category           | Tool             | Rationale |
| ------------------ | ---------------- | --------- |
| npm-publish-tool   | release-it       | D-001     |
| vcs                | git              | D-002     |
| package-management | npm              | D-003     |
| git-hooks          | release-it hooks | D-004     |

## 3. Developer Workflow Example

```bash
# Historical flow — DENIED in current track
npm run release
# → UV27B_NPM_PUBLICATION_DENIED before release-it side effects
```

Одинаковый deny вызывают `prepublishOnly`, `publish-next`, `publish-draft`, package `release` и
direct `release-it` через первый `before:init` hook. `pack-draft` остаётся локальным pack/install
инструментом и registry package не публикует.

## 4. File Structure

```
.
├── .release-it.json                  # конфиг release-it (создаётся)
├── package.json                      # + "release": "release-it" в scripts
│                                     # + "ai/**/*" в files
├── dist/
│   ├── gennady.js                    # бандл (vite build)
│   └── ai/                           # вся ai/ (prepare-publish-artifacts)
│       ├── directives/
│       │   ├── sdd/
│       │   ├── coding/
│       │   ├── testing/
│       │   ├── infra/
│       │   └── embedded rule prompts
│       ├── agents/
│       └── flow/
└── scripts/
    └── prepare-publish-artifacts.ts  # копирует ai/ → dist/ai/
```

## 5. Effective Rules (for cascade)

| Rule             | Category | Source             |
| ---------------- | -------- | ------------------ |
| nodejs-npm-setup | infra    | infra-base (D-003) |

## 6. Verification Commands

| Command Name      | Invocation                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| typecheck-command | `npm run type-check`                                                     |
| test-command      | `npm test`                                                               |
| lint-command      | `npm run lint`                                                           |
| format-command    | `npm run format:check`                                                   |
| check-command     | `npm run type-check && npm test && npm run lint && npm run format:check` |
| publication-lock  | `npm run audit:release-boundary`                                         |
| cutover-inspect   | `npm run release:boundary -- --candidate --json`                         |

## 7. Decision Log

### D-001 — Выбор release-it как npm-publish-tool

- **Status:** historical; executable publication superseded by D-006 for current track
- **Recorded:** session Discovery, infra-npm-publish
- **Why:** Интерактивный bump (major/minor/patch), хуки до изменений (безопасно — при падении ничего не испорчено), OTP, git tag/push, публикация. При необходимости можно добавить CI позже (`--ci`).
- **Risk accepted:** release-it пока не имеет embedded rule prompt — дефолтное поведение release-it является достаточной дисциплиной.
- **Rejected alternatives:** np (нет CI, нет хуков), bumpp + ручной npm publish (нет единого flow, нет OTP)

### D-002 — git как vcs

- **Status:** active
- **Recorded:** session Discovery, infra-npm-publish
- **Why:** Единственный VCS в проекте. Зафиксирован в infra-base.
- **Rejected alternatives:** —

### D-003 — npm как package-management

- **Status:** active
- **Recorded:** session Discovery, infra-npm-publish
- **Why:** Зафиксирован в infra-base (nodejs-npm-setup rule).
- **Rejected alternatives:** —

### D-004 — release-it hooks вместо husky

- **Status:** historical; `before:init` retained only as one deny integration point
- **Recorded:** session Discovery, infra-npm-publish
- **Why:** release-it предоставляет встроенные хуки (`before:init`). Запускаются до bump — при падении ничего не изменено, откат не нужен.
- **Rejected alternatives:** husky (избыточен — не нужны commit-hooks для этого скоупа), без хуков (риск публикации без проверок)

### D-005 — Публикация ai/ в npm-пакете

- **Status:** deferred package-content intent; no publication in current track
- **Recorded:** session Discovery, infra-npm-publish, refine (sync)
- **Why:** Команда `gennady sync` (scope `cli`) синхронизирует `ai/directives/` из npm-пакета в проект-потребитель. Чтобы это работало, `ai/` должна физически присутствовать в опубликованном пакете. В пакет включается **вся `ai/`** (directives, agents, flow) — фильтрация до `ai/directives/` и исключение конкретных файлов происходит на стороне команды `sync`. Два изменения: (1) `package.json#files` — добавить `"ai/**/*"`, чтобы npm включил всю директорию `ai/`; (2) `prepare-publish-artifacts.ts` — добавить копирование `ai/ → dist/ai/`.
- **Risk accepted:** В пакет попадают все поддиректории `ai/` — раздувание размера пакета. Смягчается тем, что XML/MD-файлы — это килобайты, не мегабайты.
- **Rejected alternatives:**
  - Копировать только `ai/directives/` в пакет — преждевременная оптимизация; если в будущем понадобятся `ai/agents/` или `ai/flow/`, придётся снова менять публикацию
  - Хранить директивы в отдельном npm-пакете `@gennady/directives` — два пакета вместо одного, сложнее распространение

### D-006 — Repository-owned npm publication is fail-closed DENY

- **Status:** active; implemented by UV-27B.
- **Decision:** единая exported denial function вызывается первой во всех supported publish paths.
  Она не читает registry/auth, не меняет package/version/git и возвращает stable
  `UV27B_NPM_PUBLICATION_DENIED`. Main cutover authorization не может открыть npm path.
- **Coverage:** causal tests запускают direct scripts и package commands с fake next binaries и
  доказывают отсутствие следующего child/mutation; config contract требует deny первым release-it
  hook. Local `pack-draft` намеренно не блокируется.
- **Threat boundary:** `npm publish --ignore-scripts` обходит repo lifecycle технически. Репозиторий
  не обещает перехват произвольной внешней команды с пользовательским token; вместо этого current
  cutover требует отсутствия npm auth env/embedded workflow authority. Credentials/OTP/protected
  publishing authority выдаются только будущим отдельным publication plan/ACK.

## 8. Scope Dependencies

- **Depends on:** infra-base (nodejs-npm-setup, npm scripts)
- **Provides rules to:** cli (публикация `ai/directives/` — потребляется командой `sync`)

## 9. Bootstrap Requirements

| Requirement                                       | Kind       | Owner           | Resolution                                                   |
| ------------------------------------------------- | ---------- | --------------- | ------------------------------------------------------------ |
| `release-it`                                      | package    | this-scope-task | `npm i -D release-it`                                        |
| `.release-it.json`                                | file       | this-scope-task | создать конфиг release-it в корне                            |
| `"release"` script в `package.json`               | structural | this-scope-task | добавить `"release": "release-it"` в scripts                 |
| npm login                                         | env        | deferred        | credentials обязаны отсутствовать в current cutover process  |
| `"ai/**/*"` в `package.json#files`                | structural | this-scope-task | добавить `"ai/**/*"` в массив `"files"`                      |
| `ai/ → dist/ai/` в `prepare-publish-artifacts.ts` | structural | this-scope-task | добавить `{ source: 'ai', target: 'dist/ai' }` в `copyPairs` |

## 10. Handoff

- **Setup tasks to scaffold:** установка `release-it`, создание `.release-it.json`, добавление npm script, добавление `ai/` в `package.json#files`, добавление копирования `ai/ → dist/ai/` в `prepare-publish-artifacts.ts`
- **Effective rules ready for cascade:** см. раздел 5
- **Verification Commands ready for cascade:** см. раздел 6
- **Bootstrap tickets ready for cascade:** см. раздел 9
- **Open risks:**
  - Intentional external `npm publish --ignore-scripts` не контролируется repo hook; current track
    полагается на отсутствие credentials/authority, а не на ложное обещание interception.
  - `files` glob `ai/**/*` включает ВСЕ поддиректории — при добавлении новых исключаемых категорий в sync, они всё равно попадут в пакет (фильтруются на стороне sync)
