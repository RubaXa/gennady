# Task: TSK-98 — Директива `update-review.directive.xml`

## 1. Meta

- **Task-ID:** TSK-98 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** directives | **Dependencies:** TSK-94 (headChanged/newCommits в inbox-context), TSK-96 (`vcs-discussions --my --with-drafts` — директива ссылается на эти флаги)
- **Purpose:** Новая самостоятельная директива. Загружается когда `headChanged.kind != "none"` **И** моё ревью существует (мои треды непусты или я в `approvedBy`). Иначе — полный `arch-interrogation`.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-28 | **Runtime:** not-implemented | **Verification:** review

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** none (директива — XML)
- **Target Files:**
  - `ai/directives/agent-inbox/update-review.directive.xml` — новый файл:
    - `<Mission>`: проверка обновлений MR, поиск новых проблем в newCommits, сверка со старыми замечаниями
    - `<ExecutionPlan>`: STEP_0 (анализ newCommits + изменившихся файлов) → STEP_1 (сверка с моими замечаниями из `vcs-discussions --my --with-drafts`) → STEP_2 (решение)
    - `<DecisionRules>`: `changeset` = полный дифф MR `base..HEAD`. Файл замечания отсутствует в changeset → код удалён из MR → resolve. Файл в changeset, fix не найден → reply (НЕ resolve).
    - `<HaltConditions>`: vcs-discussions fails → do not post, signal error
  - `ai/skills/agent-inbox/SKILL.md` — шаг 4: добавить ветку `headChanged.kind != "none" → INCLUDE_ONCE update-review.directive.xml`
  - `ai/skills/agent-inbox-take/SKILL.md` — шаг 1 (скаут): учесть `headChanged`, выбрать директиву (arch-interrogation vs update-review)
- **Exit:** директива покрывает fast_forward и rewritten. SKILL.md загружает её при обновлениях. agent-inbox-take выбирает правильную директиву.

### P2 — test

- **Rules:** none
- **Target Files:** валидация через shell-команды:
  - `xmllint --noout ai/directives/agent-inbox/update-review.directive.xml`
  - `grep -q "update-review.directive.xml" ai/skills/agent-inbox/SKILL.md`
  - `grep -q "update-review" ai/skills/agent-inbox-take/SKILL.md`
- **Exit:** директива XML-валидна, оба SKILL.md ссылаются

## 4. BDD

- `headChanged: fast_forward`, но моего ревью нет (нет тредов, нет approve) → директива НЕ загружается → полный `arch-interrogation`
- `headChanged: fast_forward`, моё ревью есть → загружается update-review
- `headChanged: { kind: "rewritten" }` → полный пересмотр
- `headChanged: { kind: "none" }` → директива не загружается, skip
- Автор исправил, файл в changeset → re-verify fix в diff → 👍 + resolve
- Автор не исправил, файл в changeset → reply (не resolve)
- Файл замечания больше не входит в дифф MR → resolve с пометкой «код удалён из MR»
- Код замечания удалён → resolve с пометкой «code removed»
- Только форматирование → approve без анализа
- Все замечания исправлены, новых проблем нет → approve
- Моих замечаний нет, новые коммиты → только анализ на новые проблемы
- `vcs-discussions --my --with-drafts` упал → signal error, не постить
- `vcs-discussions --my --with-drafts` пуст (я не ревьюил этот MR) → proceed, только анализ newCommits

## 5. Verification

- `xmllint --noout ai/directives/agent-inbox/update-review.directive.xml` — pass
- `grep "update-review.directive.xml" ai/skills/agent-inbox/SKILL.md` — found
- `grep "update-review" ai/skills/agent-inbox-take/SKILL.md` — found

## 6. Dependencies / Open questions

- Самостоятельная директива — не ссылается на arch-interrogation, содержит собственную процедуру

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [update-review.directive.xml, SKILL.md, agent-inbox-take/SKILL.md]; decisions: [D50]; open: []

#### P2

- [ ] **Handoff →** artifacts: []; decisions: []; open: []
