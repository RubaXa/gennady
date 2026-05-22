# infra-npm-publish: Infrastructure Specification

## scope-type
infrastructure

## 1. Vision

Безопасная локальная публикация npm-пакета одной командой `npm run release`: интерактивный выбор версии (major/minor/patch), автоматический прогон проверок до изменений, git tag + commit + push, OTP и публикация в npm. Никакого ручного `npm version` / `npm publish` / `git push --tags`.

## 2. Tool Stack

### 2.1 Categories Covered

| Категория | Статус | Обоснование |
|-----------|--------|-------------|
| npm-publish-tool | включена | ядро скоупа — автоматизация релизного процесса |
| vcs | включена (mandatory) | git — теги, коммиты, push |
| package-management | включена (mandatory) | npm — registry, publish |
| git-hooks | включена (mandatory) | pre-publish проверки через release-it hooks |

linting, formatting, test-unit, type-check, bundler, ci — исключены: покрываются `infra-base`.

### 2.2 Tool Choices

| Category | Tool | Rationale |
|----------|------|-----------|
| npm-publish-tool | release-it | D-001 |
| vcs | git | D-002 |
| package-management | npm | D-003 |
| git-hooks | release-it hooks | D-004 |

## 3. Developer Workflow Example

```bash
# === Релиз ===
npm run release
# → Интерактивно: Select version (major / minor / patch)
# → release-it запускает before:init: npm run lint && npm test
# → Если проверки упали — стоп, ничего не изменено
# → Если ОК: поднимает версию в package.json
# → git commit + git tag vX.Y.Z + git push
# → Запрашивает OTP
# → npm publish
# → Готово
```

## 4. File Structure

```
.
├── .release-it.json          # конфиг release-it (создаётся)
├── package.json              # + "release": "release-it" в scripts
```

## 5. Effective Rules (for cascade)

| Rule | Category | Source |
|------|----------|--------|
| nodejs-npm-setup | infra | infra-base (D-003) |

## 6. Verification Commands

| Command Name | Invocation |
|--------------|------------|
| typecheck-command | `npm run type-check` |
| test-command | `npm test` |
| lint-command | `npm run lint` |
| format-command | `npm run format:check` |
| check-command | `npm run type-check && npm test && npm run lint && npm run format:check` |
| release-dry-run | `npx release-it --dry-run` |

## 7. Decision Log

### D-001 — Выбор release-it как npm-publish-tool
- **Status:** active
- **Recorded:** session Discovery, infra-npm-publish
- **Why:** Интерактивный bump (major/minor/patch), хуки до изменений (безопасно — при падении ничего не испорчено), OTP, git tag/push, публикация. При необходимости можно добавить CI позже (`--ci`).
- **Risk accepted:** release-it пока отсутствует в knowledge.xml как rule — дефолтное поведение release-it является достаточной дисциплиной.
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
- **Status:** active
- **Recorded:** session Discovery, infra-npm-publish
- **Why:** release-it предоставляет встроенные хуки (`before:init`). Запускаются до bump — при падении ничего не изменено, откат не нужен.
- **Rejected alternatives:** husky (избыточен — не нужны commit-hooks для этого скоупа), без хуков (риск публикации без проверок)

## 8. Scope Dependencies

- **Depends on:** infra-base (nodejs-npm-setup, npm scripts)
- **Provides rules to:** — (инфраструктурный leaf)

## 9. Bootstrap Requirements

| Requirement | Kind | Owner | Resolution |
|-------------|------|-------|------------|
| `release-it` | package | this-scope-task | `npm i -D release-it` |
| `.release-it.json` | file | this-scope-task | создать конфиг release-it в корне |
| `"release"` script в `package.json` | structural | this-scope-task | добавить `"release": "release-it"` в scripts |
| npm login | env | operator-action | оператор должен быть залогинен (`npm whoami`) |

## 10. Handoff

- **Setup tasks to scaffold:** установка `release-it`, создание `.release-it.json`, добавление npm script
- **Effective rules ready for cascade:** см. раздел 5
- **Verification Commands ready for cascade:** см. раздел 6
- **Bootstrap tickets ready for cascade:** см. раздел 9
- **Open risks:** взаимодействие с существующим `prepublishOnly` (двойной прогон lint — безопасно, избыточно; при необходимости можно убрать `lint` из `prepublishOnly`)
