# infra-token: Infrastructure Specification

<!--SECTION:SPEC_ID-->
INFRA-TOKEN
<!--/SECTION:SPEC_ID-->

<!--SECTION:SCOPE_TYPE-->
## scope-type
infrastructure
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision
Own the local development toolchain for the deterministic ASCII token normalizer: Node.js 22, npm, TypeScript, ESLint, Prettier, Vitest, and husky. The scope makes the `normalizeToken` contract verifiable locally with no network or persistent state; product decomposition beyond this contract belongs to separate product or library scopes.
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
```mermaid
flowchart LR
  edit[edit] --> tc[typecheck]
  tc --> lint[lint + format check]
  lint --> test[unit tests]
  test --> hook[pre-commit hook]
```
_Путь изменения от правки до pre-commit-проверки._
<!--/SECTION:OVERVIEW-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** [`infra-base`](../infra-base/infra-base.spec.md) — provides the Node.js 22 runtime and the installed local Gennady CLI.
- **Provides rules to:** none; no product or library scope is seeded in this bounded authoring.
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## Requirements & Constraints

### Requirements

### IT-REQ-1 [должен]
**Когда** на вход поступает непустая ASCII-строка, **нормализатор должен** убрать ведущие и хвостовые ASCII-пробелы, привести ASCII-буквы к нижнему регистру и заменить каждый непрерывный ряд пробелов, подчёркиваний или дефисов одним дефисом.

> Один и тот же ввод должен давать один и тот же канонический токен; иначе потребители CLI и библиотеки расходятся в написании.

### IT-REQ-2 [должен]
**Нормализатор должен** быть чистым и детерминированным: один и тот же ввод даёт один и тот же результат, без чтения и записи во время нормализации.

> Чистая функция делает результат воспроизводимым и исключает скрытые зависимости от сети, файлов или состояния процесса.

### IT-REQ-3 [должен · нештатная]
**Если** вход пустой или состоит только из пробелов, подчёркиваний и дефисов, **то нормализатор должен** выбросить `TypeError` без чтения и записи.

> Нормализованный токен не может быть пустым; явная ошибка не даёт молча создать невалидное имя.

### IT-REQ-4 [должен · нештатная]
**Если** вход содержит хотя бы один не-ASCII символ, **то нормализатор должен** выбросить `TypeError` без чтения и записи.

> Контракт ограничен ASCII; молчаливая трансляция не-ASCII ввода сделала бы результат зависимым от локали и среды.

### IT-REQ-5 [должен]
**Локальная среда разработки должна** устанавливаться через `npm ci` из закоммиченного `package-lock.json` на Node.js 22, предоставленном `infra-base`, с exact-pin версиями инструментов сборки.

> Единый lock-файл и один runtime дают одинаковый результат проверок на каждой машине без дрейфа транзитивных зависимостей.

### IT-REQ-6 [должен]
**Когда** разработчик делает коммит, **pre-commit hook должен** запускать `lint-staged` по индексированным файлам и блокировать коммит при ошибке форматирования, линтинга или типов.

> Ранний локальный барьер ловит дефекты до того, как они попадут в общую историю.

### IT-REQ-7 [должен]
**Когда** запускаются линтинг или проверка форматирования, **инструменты должны** исключать `node_modules/`, `dist/`, `coverage/` и `specs/`.

> Сгенерированные каталоги и agent-authored markdown создают ложные findings и шумят в диффах, не относящихся к изменению.

### IT-REQ-8 [должен]
**`.gitignore` должен** исключать `node_modules/`, `dist/`, `coverage/` и `.claude/tmp/`.

> Runtime-артефакты и общий scratch-каталог не должны попадать в историю проекта.

### IT-REQ-9 [должен]
**Когда** выполняется unit-набор, **он должен** проверять хотя бы примеры из таблицы Input/Outcome ниже и все три класса невалидного ввода.

> Примеры из контракта становятся исполняемым доказательством поведения, а не только текстом спецификации.

### Input/Outcome Examples

| Input | Outcome |
|---|---|
| `"  Foo__BAR  "` | `"foo-bar"` |
| `""` | `TypeError` |

### Out-of-Scope
- Implementation of `normalizeToken`, CLI wiring, and package publication.
- Network services, persistence, telemetry, and CI hosting.
- Product/library decomposition, interface specs, tickets, and execution.

### Runtime & Constraints
- All tool commands run locally and offline against the committed lockfile.
- The normalizer performs no I/O on any input path.
- No operator approval has been recorded for this draft.
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:TOOL_STACK-->
## Tool Stack

### Categories Covered
Mandatory: `vcs`, `package-management`, `git-hooks`. Optional included: `type-check`, `linting`, `formatting`, `test-unit`. Excluded: `test-e2e` (pure in-process transformation with no live runtime; open operator confirmation), `ci` (local-only scope), `bundler` (ESM source consumed directly by Node.js), `docs`, and `monorepo-tool` (single package).

### Tool Choices
| Category | Tool | Rationale |
|---|---|---|
| vcs | git | IT-DL-1 |
| package-management | npm | IT-DL-2 |
| git-hooks | husky + lint-staged | IT-DL-3 |
| type-check | TypeScript (`tsc --noEmit`) | IT-DL-4 |
| linting | ESLint (flat config) | IT-DL-5 |
| formatting | Prettier | IT-DL-6 |
| test-unit | Vitest | IT-DL-7 |

### Integration Detail

- **git**
  - Версия/API: системный git; отдельная версия проектом не фиксируется.
  - Нужные методы: `git init`, `git add`, `git commit`.
  - Эскиз интеграции: локальный репозиторий с веткой `main`; hooks ставятся husky.
  - Ограничения: работа только локальная, без хостинга и CI.

- **npm**
  - Версия/API: npm из Node.js 22, предоставленного `infra-base`.
  - Нужные методы: `npm ci`, `npm install --save-exact`, `npm run`.
  - Эскиз интеграции: `package.json` с `"type": "module"` и коммитируемый `package-lock.json`.
  - Ограничения: один пакетный менеджер; yarn, pnpm и bun запрещены.

- **husky + lint-staged**
  - Версия/API: exact-pin в `devDependencies` при scaffold; в этом bounded authoring версия не заявляется без ресёрча.
  - Нужные методы: `husky init`, `lint-staged`.
  - Эскиз интеграции: `.husky/pre-commit` вызывает `npx lint-staged`.
  - Ограничения: проверяются только индексированные файлы; hook требует установки после `npm ci`.

- **TypeScript**
  - Версия/API: exact-pin в `devDependencies` при scaffold; в этом bounded authoring версия не заявляется без ресёрча.
  - Нужные методы: `tsc --noEmit`.
  - Эскиз интеграции: `tsconfig.json` со `strict: true`; проверка без эмита файлов.
  - Ограничения: проверка типов не заменяет unit-тесты.

- **ESLint**
  - Версия/API: exact-pin в `devDependencies` при scaffold; в этом bounded authoring версия не заявляется без ресёрча.
  - Нужные методы: `eslint .`, `eslint . --fix`.
  - Эскиз интеграции: `eslint.config.js` в flat-формате; ignores для `node_modules/`, `dist/`, `coverage/`, `specs/`.
  - Ограничения: без type-aware правил, чтобы pre-commit оставался быстрым.

- **Prettier**
  - Версия/API: exact-pin в `devDependencies` при scaffold; в этом bounded authoring версия не заявляется без ресёрча.
  - Нужные методы: `prettier --check .`, `prettier --write .`.
  - Эскиз интеграции: `.prettierrc` и `.prettierignore`.
  - Ограничения: `.prettierignore` исключает `specs/`, `node_modules/`, `dist/`, `coverage/`.

- **Vitest**
  - Версия/API: exact-pin в `devDependencies` при scaffold; в этом bounded authoring версия не заявляется без ресёрча.
  - Нужные методы: `vitest run`.
  - Эскиз интеграции: `vitest.config.ts` с ESM-конфигом; тесты в `test/`.
  - Ограничения: порог покрытия в этой спеке не объявлен, поэтому отдельная coverage-команда не добавляется.
<!--/SECTION:TOOL_STACK-->

<!--SECTION:WORKFLOW_EXAMPLE-->
## Developer Workflow Example

```sh
# setup
npm ci

# daily flow
npm run typecheck
npm run lint
npm run format:check
npm test

# commit flow
git add src test
git commit -m "feat: normalize token"

# debug flow
npx vitest run test/normalize-token.test.ts
npx tsc --noEmit
```

A failing pre-commit hook stops the commit; the developer fixes the reported file and repeats the commit flow.
<!--/SECTION:WORKFLOW_EXAMPLE-->

<!--SECTION:FILE_STRUCTURE-->
## File Structure

```text
.
├── .husky/
│   └── pre-commit
├── .gitignore
├── .prettierignore
├── .prettierrc
├── eslint.config.js
├── package.json
├── package-lock.json
├── specs/
│   └── infra-token/
│       └── infra-token.spec.md
├── src/
│   └── index.ts
├── test/
│   └── normalize-token.test.ts
├── tsconfig.json
└── vitest.config.ts
```

| File | Mapping |
|---|---|
| `package.json` | npm manifest, `"type": "module"`, scripts and exact-pinned dev tools |
| `package-lock.json` | npm lockfile used by `npm ci` |
| `tsconfig.json` | TypeScript strict configuration for `tsc --noEmit` |
| `eslint.config.js` | ESLint flat configuration and ignores |
| `.prettierrc` | Prettier formatting options |
| `.prettierignore` | Prettier exclusions for `specs/`, `node_modules/`, `dist/`, `coverage/` |
| `.husky/pre-commit` | hook invoking `lint-staged` |
| `vitest.config.ts` | Vitest ESM configuration |
| `src/index.ts` | planned source entry for `normalizeToken`; not implemented by this draft |
| `test/normalize-token.test.ts` | planned unit tests for the Input/Outcome examples; not implemented by this draft |
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:EFFECTIVE_RULES-->
## Effective Rules (for cascade)
Three infra rules are activated — `nodejs-npm-setup`, `git-setup`, `eslint-setup`; the formatter ignores `specs/` and generated directories, and `.gitignore` covers `.claude/tmp/`.

<details>
<summary>Таблица правил</summary>

| Rule | Category | Source |
|---|---|---|
| nodejs-npm-setup | infra | [`ai/directives/infra/nodejs-npm-setup.xml`](../../ai/directives/infra/nodejs-npm-setup.xml) (IT-DL-2) |
| git-setup | infra | [`ai/directives/infra/git-setup.xml`](../../ai/directives/infra/git-setup.xml) (IT-DL-1) |
| eslint-setup | infra | [`ai/directives/infra/eslint-setup.xml`](../../ai/directives/infra/eslint-setup.xml) (IT-DL-5) |

</details>
<!--/SECTION:EFFECTIVE_RULES-->

<!--SECTION:VERIFICATION_COMMANDS-->
## Verification Commands

| Command Name | Invocation |
|---|---|
| typecheck-command | `npm run typecheck` (`tsc --noEmit`) |
| test-command | `npm test` (`vitest run`) |
| lint-command | `npm run lint` (`eslint .`) |
| format-command | `npm run format:check` (`prettier --check .`) |
| check-command | `npx gennady verify --phase full` |
| fix-command | `npm run fix` (`prettier --write . && eslint . --fix`) |

No `coverage-command` is declared because this scope sets no coverage threshold.
<!--/SECTION:VERIFICATION_COMMANDS-->

<!--SECTION:RESEARCH-->
## Research
Not applicable in this bounded authoring: no external research was run, so the registry is empty and no factual source is claimed for exact tool versions. Version selection and current-practice comparison are deferred to the scaffold research gate.
<!--/SECTION:RESEARCH-->

<!--SECTION:DECISION_LOG-->
## Decision Log
Nine decisions cover VCS, package manager, hooks, type-check, lint, format, tests, the e2e boundary, and ignore policy.

<details>
<summary>Полные записи Decision Log</summary>

- IT-DL-1 2026-10-23 — git is the VCS for the local scope (почему: обязательная категория и локальная история без хостинга; отвергнуто: внешний хостинг как избыточный; риск: нет удалённой резервной копии).
- IT-DL-2 2026-10-23 — npm is the single package manager (почему: идёт с Node.js 22 из infra-base и даёт один lockfile; отвергнуто: yarn, pnpm и bun как параллельные менеджеры; риск: нужна дисциплина `npm ci` и коммита lockfile).
- IT-DL-3 2026-10-23 — husky + lint-staged implement git hooks (почему: версионируемый pre-commit и проверка только staged files; отвергнуто: сырые `.git/hooks` без версионирования и lefthook как лишняя зависимость; риск: hook нужно установить после `npm ci`).
- IT-DL-4 2026-10-23 — TypeScript `tsc --noEmit` provides type-check (почему: явная проверка типов без эмита; отвергнуто: JSDoc-only без отдельного type-check; риск: дополнительный инструмент в цепочке).
- IT-DL-5 2026-10-23 — ESLint flat config provides linting (почему: машинно-читаемая диагностика и autofix; отвергнуто: tslint как устаревший; риск: конфиг требует обновления при мажорных версиях).
- IT-DL-6 2026-10-23 — Prettier provides formatting (почему: детерминированный формат и autofix; отвергнуто: стилевые правила ESLint вместо форматтера; риск: шум в диффах без явных ignores).
- IT-DL-7 2026-10-23 — Vitest provides unit tests (почему: быстрый ESM-native runner с одним конфигом; отвергнуто: Jest как более тяжёлая настройка и `node:test` с меньшим набором утверждений; риск: мажорные обновления требуют проверки).
- IT-DL-8 2026-10-23 — test-e2e is not included in the proposed stack (почему: чистая локальная функция без live runtime; отвергнуто: browser/e2e harness как несоразмерный; риск: нет end-to-end runtime proof — подтверждение оператора ожидается).
- IT-DL-9 2026-10-23 — lint, format and git ignores exclude generated and agent-authored paths (почему: `dist/`, `coverage/`, `specs/` и `.claude/tmp/` создают шум и ложные findings; отвергнуто: форматирование `specs/` и generated dirs; риск: markdown спецификаций не проходит Prettier).

</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
Outstanding: the scaffold owns the project manifest, tool configuration files, and hook installation; Node.js 22 comes from `infra-base`.

<details>
<summary>Таблица предусловий</summary>

| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |
|---|---|---|---|---|---|
| Node.js 22 runtime and npm | package | external-prereq-scope | provided by `infra-base` | — | .nvmrc, package.json |
| Project manifest with exact-pinned dev tools | package | this-scope-task | scaffold creates `package.json` and `package-lock.json` | — | package.json, package-lock.json |
| Git repository and husky pre-commit hook | tool | this-scope-task | scaffold initializes the repository and hook | — | .husky/pre-commit |
| Tool configuration files | file | this-scope-task | scaffold writes the config files listed in File Structure | — | tsconfig.json, eslint.config.js, .prettierrc, .prettierignore, vitest.config.ts |

</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff
- **Status:** pending-operator; Approval #1 has not been given.
- **Setup tasks to scaffold:** one proposed infra ticket for manifest, config files, and hooks; one proposed library ticket for the `normalizeToken` contract. No tickets have been created.
- **Effective rules ready for cascade:** see Effective Rules.
- **Verification Commands ready for cascade:** see Verification Commands.
- **Bootstrap tickets ready for cascade:** see Prerequisites.
- **Open risks:** `test-e2e` remains excluded pending operator confirmation; exact tool versions were not researched in this bounded authoring; no implementation, tests, or execution evidence exist yet.
- **Pivot Invalidation List:** not applicable — this is greenfield authoring, not pivot mode.
<!--/SECTION:HANDOFF-->
