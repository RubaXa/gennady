# Task: TSK-58 — ai/skills bootstrap (13 SDD-скилов)

## 1. Meta

- **Task-ID:** TSK-58
- **Status:** [ ] TODO
- **Purpose:** Скопировать 13 скилов из `~/.config/opencode/skills/` (12 скилов) + `~/.claude/skills/sdd-critic/` (1 скил) в `ai/skills/` репозитория gennady. Адаптировать пути во всех `.md` и `.prompt.md` файлах: заменить `~/.config/opencode/skills/<skillName>/` и `~/.claude/skills/<skillName>/` на литеральную строку `${SKILL_DIR}/` (эта переменная резолвится рантаймом Claude/OpenCode).

Примеры замен:

- `~/.config/opencode/skills/sdd-execute/scripts/verify.sh` → `${SKILL_DIR}/scripts/verify.sh`
- `~/.claude/skills/sdd-critic/SKILL.md` → `${SKILL_DIR}/SKILL.md`
- Если файл не содержит ни одного из этих паттернов — замена пропускается (копирование успешно).
- **Scope:** cli
- **Module:** sync-skills (bootstrap)
- **Dependencies:** TSK-57
- **Spec References:**
  - Module spec: [`sync-skills.spec.md`](../../../specs/cli/sync-skills/sync-skills.spec.md) §6 (ai/skills/ структура)
  - Bootstrap: [`cli.spec.md §8`](../../../specs/cli/cli.spec.md)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`
- **Deferred Runtime Scope:** None

## 2. Phases Overview

| ID  | Kind | Deps      | Status |
| --- | ---- | --------- | ------ | --- |
| -   | P1   | bootstrap | —      | [x] |

## 3. Phases

### P1 — bootstrap

- **Objective:** Скопировать и адаптировать 13 скилов в `ai/skills/`.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml) (только для файловых путей — не код)
- **Target Files:**
  - `ai/skills/alt-opinion/SKILL.md` (copy from `~/.config/opencode/skills/alt-opinion/SKILL.md`)
  - `ai/skills/alt-opinion/opinion.prompt.md` (copy)
  - `ai/skills/alt-opinion/synth.prompt.md` (copy)
  - `ai/skills/sdd-audit/SKILL.md` (copy from `~/.config/opencode/skills/sdd-audit/SKILL.md`)
  - `ai/skills/sdd-check/SKILL.md` (copy from `~/.config/opencode/skills/sdd-check/SKILL.md`)
  - `ai/skills/sdd-continue/SKILL.md` (copy from `~/.config/opencode/skills/sdd-continue/SKILL.md`)
  - `ai/skills/sdd-critic/SKILL.md` (copy from `~/.claude/skills/sdd-critic/SKILL.md`)
  - `ai/skills/sdd-discover/SKILL.md` (copy from `~/.config/opencode/skills/sdd-discover/SKILL.md`)
  - `ai/skills/sdd-execute/SKILL.md` (copy from `~/.config/opencode/skills/sdd-execute/SKILL.md`)
  - `ai/skills/sdd-execute/scripts/` (8 files — copy from `~/.config/opencode/skills/sdd-execute/scripts/`)
  - `ai/skills/sdd-execute-batch/SKILL.md` (copy from `~/.config/opencode/skills/sdd-execute-batch/SKILL.md`)
  - `ai/skills/sdd-fix/SKILL.md` (copy from `~/.config/opencode/skills/sdd-fix/SKILL.md`)
  - `ai/skills/sdd-infra/SKILL.md` (copy from `~/.config/opencode/skills/sdd-infra/SKILL.md`)
  - `ai/skills/sdd-module-decomposition/SKILL.md` (copy from `~/.config/opencode/skills/sdd-module-decomposition/SKILL.md`)
  - `ai/skills/sdd-scaffold/SKILL.md` (copy from `~/.config/opencode/skills/sdd-scaffold/SKILL.md`)
  - `ai/skills/sdd-setup/SKILL.md` (copy from `~/.config/opencode/skills/sdd-setup/SKILL.md`)
- **Inputs:** none
- **Exit:** Все 13 скилов присутствуют в `ai/skills/`. Пути `~/.config/opencode/skills/` и `~/.claude/skills/` заменены на `${SKILL_DIR}` во всех `.md` и `.prompt.md` файлах. Нет `.DS_Store`.

## 4. Acceptance Criteria (BDD)

**Feature:** ai/skills/ содержит 13 скилов, готовых к публикации в npm-пакете

**Scenario:** 12 скилов скопированы из OpenCode [`contract`]

- **Given** `~/.config/opencode/skills/` существует с 12 скилами
- **When** выполнено копирование
- **Then** `ai/skills/` содержит 12 директорий: alt-opinion, sdd-audit, sdd-check, sdd-continue, sdd-discover, sdd-execute, sdd-execute-batch, sdd-fix, sdd-infra, sdd-module-decomposition, sdd-scaffold, sdd-setup

**Scenario:** sdd-critic скопирован из Claude [`contract`]

- **Given** `~/.claude/skills/sdd-critic/SKILL.md` существует
- **When** выполнено копирование
- **Then** `ai/skills/sdd-critic/SKILL.md` существует

**Scenario:** sdd-execute содержит scripts/ [`contract`]

- **Given** `~/.config/opencode/skills/sdd-execute/scripts/` существует с 8 файлами
- **When** выполнено копирование
- **Then** `ai/skills/sdd-execute/scripts/` содержит все 8 файлов

**Scenario:** Пути адаптированы на ${SKILL_DIR} [`contract`]

- **Given** SKILL.md содержит `~/.config/opencode/skills/sdd-execute/scripts/`
- **When** применена адаптация путей
- **Then** заменено на `${SKILL_DIR}/scripts/` (и `~/.claude/skills/` → `${SKILL_DIR}/` для sdd-critic)

**Scenario:** Нет .DS_Store в ai/skills/ [`contract`]

- **Given** все файлы скопированы
- **When** рекурсивный поиск `.DS_Store`
- **Then** ни одного файла `.DS_Store` в `ai/skills/`

## 5. Verification

| Command           | Required by |
| ----------------- | ----------- | ------ |
| `ls ai/skills/\*/ | wc -l`      | manual |

## 6. Test Scenario Coverage

| Scenario             | Check                                              | Status                                  |
| -------------------- | -------------------------------------------------- | --------------------------------------- | --- |
| -                    | 12 скилов из OpenCode                              | `ls ai/skills/*/SKILL.md \| wc -l` → 13 | [x] |
| sdd-critic из Claude | `head -3 ai/skills/sdd-critic/SKILL.md`            | [x]                                     |
| sdd-execute scripts/ | `ls ai/skills/sdd-execute/scripts/ \| wc -l` → 9   | [x]                                     |
| Пути адаптированы    | `grep -r 'opencode/skills' ai/skills/` → 0 matches | [x]                                     |
| Нет .DS_Store        | `find ai/skills/ -name '.DS_Store'` → empty        | [x]                                     |

## 7. Execution Log

### Round 1 — 2026-05-31, initial

#### P1

- [x] `2026-05-31 12:00` ver `ls ai/skills/*/SKILL.md | wc -l` → 13 pass exit=0
- [x] `2026-05-31 12:00` ver `rg 'opencode/skills|claude/skills' ai/skills/` → 0 matches pass exit=0
- [x] `2026-05-31 12:00` ver `ls ai/skills/sdd-execute/scripts/ | wc -l` → 9 pass exit=0
- [x] `2026-05-31 12:00` ver `find ai/skills/ -name '.DS_Store'` → empty pass exit=0
- [x] `2026-05-31 12:00` DONE
      **Handoff →** artifacts: [ai/skills/ (13 directories, 24 files)]; decisions: []; open: []

#### Round close

- - [ ] TODO

### Round 2 — 2026-05-31, fix: lint-artifacts.sh dev-path normalization + PathNormalizer safety net

| Phase | Kind | Status | Target Files                                                                           | Deps |
| ----- | ---- | ------ | -------------------------------------------------------------------------------------- | ---- |
| P1    | fix  | [ ]    | ai/skills/sdd-execute/scripts/lint-artifacts.sh, shared/common/sync/path-normalizer.ts | —    |
| P2    | test | [ ]    | cli/**tests**/e2e/sync.e2e.test.ts                                                     | P1   |

- Fix: `GENNADY_CLI="$HOME/Developer/..."` -> `~/Developer/...` (tilde, covered by RULE_CLI_TILDE)
- Fix: `node --experimental-strip-types "$GENNADY_CLI" lint` -> `npx tsx "$GENNADY_CLI" lint` (matches RULE_CLI_TSX_FULL after normalize)
- Fix: Add `RULE_CLI_HOME` to PathNormalizer safety net for any remaining $HOME paths
- Test: e2e — verify lint-artifacts.sh does NOT contain `$HOME/Developer` after sync-skills
