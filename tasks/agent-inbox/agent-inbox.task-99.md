# Task: TSK-99 — Self-review author + ReactionMatrix

## 1. Meta

- **Task-ID:** TSK-99 | **Status:** [x] DONE | **Scope:** agent-inbox | **Module:** directives | **Dependencies:** TSK-96 (vcs-discussions), TSK-98 (update-review — precedence rules)
- **Purpose:** Расширить `arch-interrogation` веткой `role=author`. Расширить `posting-rules` секцией `<ReactionMatrix>`. Обновить SKILL.md. **Приоритет директив:** при `role=author` + `headChanged != none` → сначала update-review (проверить что изменилось), затем AuthorMode (обновить сводку).
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-29, AI-30 | **Runtime:** not-implemented | **Verification:** review

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

## 3. Phases

### P1 — impl

- **Rules:** none (директивы — XML/Markdown)
- **Target Files:**
  - `ai/directives/agent-inbox/arch-interrogation.directive.xml` — добавить секцию `<AuthorMode>` (структура: `<Mission>`, `<ExecutionPlan>`, `<OutputFormat>`, `<HaltConditions>` — зеркалит TSK-98):
    - (1) секция поиска дефектов заменяется на readiness-for-review: полнота описания (≥3 предложения что/зачем/как), покрытие тестами (≥1 тест на изменённый файл), отсутствие отладочного кода (console.log, debugger, TODO без тикета)
    - (2) результат форматируется как сводка для ревьюеров: шапка+ссылка → readiness checklist → карта файлов → таблица «что проверил» → вердикт
    - (3) после разбора → сверка с ревьюверами через `vcs-discussions --json` (ВСЕ дискуссии, не `--my`). Согласен → 👍 + reply «согласен, исправлю». Не согласен → reply.
  - `ai/directives/agent-inbox/posting-rules.directive.xml` — добавить `<ReactionMatrix>` (ReactionMatrix — authority для role×situation; существующие правила — authority для формата):
    ```
    reviewer × fixed-in-code → 👍 + resolve (проверить diff: файл/строка в changeset → re-verify)
    reviewer × not-fixed → reply/repeat
    reviewer × peer-said-same → 👍 + resolve (дубликат)
    reviewer × peer-said-different → reply с позицией
    reviewer × all-fixed-no-new → approve
    author × reviewer-right → 👍 + reply «согласен, уже исправил в <sha>» (SHA уже в репозитории, агент не коммитит — NFC-01)
    author × reviewer-wrong → reply
    author × new-reviewer-comments → проверить, согласен/нет
    ```
  - `ai/skills/agent-inbox/SKILL.md` — карта действий `author`: загрузка arch-interrogation с `role=author`; шаг 5: ссылка на `<ReactionMatrix>`
  - `ai/skills/agent-inbox-take/SKILL.md` — шаг 1: при `myRole=author` выбрать AuthorMode. **Приоритет:** `role=author` + `headChanged != none` → update-review first, then AuthorMode
- **Exit:** arch-interrogation покрывает author-режим, posting-rules содержит ReactionMatrix, SKILL.md + agent-inbox-take обновлены.

### P2 — test

- **Rules:** none
- **Target Files:** валидация через shell-команды:
  - `xmllint --noout ai/directives/agent-inbox/arch-interrogation.directive.xml`
  - `xmllint --noout ai/directives/agent-inbox/posting-rules.directive.xml`
  - `grep -q "AuthorMode" ai/directives/agent-inbox/arch-interrogation.directive.xml`
  - `grep -q "ReactionMatrix" ai/directives/agent-inbox/posting-rules.directive.xml`
  - `grep -q "ReactionMatrix" ai/skills/agent-inbox/SKILL.md`
  - `grep -q "AuthorMode" ai/skills/agent-inbox-take/SKILL.md`
- **Exit:** директивы XML-валидны, SKILL.md ссылается на ReactionMatrix, agent-inbox-take ссылается на AuthorMode

## 4. BDD

- `myRole=author` → загружается arch-interrogation в AuthorMode → независимый разбор → сверка с ревьюверами
- Ревьювер прав, автор исправил → 👍 + reply «исправил в abc123»
- Ревьювер не прав → reply с объяснением
- Другой ревьювер сказал то же → 👍 + resolve
- Обновление, всё исправлено → отметить сводку актуальной, signal ready-for-review (автор не может сам approve)
- `vcs-discussions` пуст (нет ревьюверов) → proceed без сравнения, post summary
- Автор не согласен со всеми → reply каждому
- Два ревьювера, один прав, второй нет → 👍 первому + reply второму
- `role=author` + `headChanged: fast_forward` → update-review first, затем AuthorMode (обновить сводку)

## 5. Verification

- `xmllint --noout` для обеих директив — pass
- `grep` проверки AuthorMode и ReactionMatrix — pass

## 6. Dependencies / Open questions

- `code-interrogation.directive.xml` — не требует изменений (батарея проверок применима независимо от роли)

## 7. Execution Log

### Round 1

#### P1

- [x] `2026-07-05T10:03:03Z` intro AuthorMode ← расширение arch-interrogation для role=author (AI-29)
- [x] `2026-07-05T10:03:03Z` intro ReactionMatrix ← расширение posting-rules для role×situation authority (AI-30)
- [x] `2026-07-05T10:03:03Z` ver /Users/k.lebedev/Developer/gennady/.claude/skills/sdd-execute/scripts/sdd verify ai/directives/agent-inbox/arch-interrogation.directive.xml ai/directives/agent-inbox/posting-rules.directive.xml ai/skills/agent-inbox/SKILL.md ai/skills/agent-inbox-take/SKILL.md → pass exit=0
- [x] `2026-07-05T10:03:03Z` ver grep -q "AuthorMode" ai/directives/agent-inbox/arch-interrogation.directive.xml → pass exit=0
- [x] `2026-07-05T10:03:03Z` ver grep -q "ReactionMatrix" ai/directives/agent-inbox/posting-rules.directive.xml → pass exit=0
- [x] `2026-07-05T10:03:03Z` ver grep -q "ReactionMatrix" ai/skills/agent-inbox/SKILL.md → pass exit=0
- [x] `2026-07-05T10:03:03Z` ver grep -q "AuthorMode" ai/skills/agent-inbox-take/SKILL.md → pass exit=0
- [x] `2026-07-05T10:03:03Z` insight xmllint fail (pre-existing: directives use unescaped &lt;/&gt; in text) → §5 Verification, P2 scope
- [x] `2026-07-05T10:03:03Z` DONE
      **Handoff →** artifacts: [arch-interrogation.directive.xml, posting-rules.directive.xml, SKILL.md, agent-inbox-take/SKILL.md]; decisions: [D50]; open: []

#### P2

- [x] `2026-07-05T10:21:57Z` discovery xmllint fail (pre-existing: unescaped `&lt;` `&gt;` in text content) → fixed both XMLs
- [x] `2026-07-05T10:21:57Z` tried prettier --write tasks/agent-inbox/agent-inbox.task-98.md → fixed format gate
- [x] `2026-07-05T10:21:57Z` ver /Users/k.lebedev/Developer/gennady/.claude/skills/sdd-execute/scripts/sdd verify ai/directives/agent-inbox/arch-interrogation.directive.xml ai/directives/agent-inbox/posting-rules.directive.xml ai/skills/agent-inbox/SKILL.md ai/skills/agent-inbox-take/SKILL.md → pass exit=0
- [x] `2026-07-05T10:21:57Z` ver xmllint --noout ai/directives/agent-inbox/arch-interrogation.directive.xml → pass exit=0
- [x] `2026-07-05T10:21:57Z` ver xmllint --noout ai/directives/agent-inbox/posting-rules.directive.xml → pass exit=0
- [x] `2026-07-05T10:21:57Z` ver grep -q "AuthorMode" ai/directives/agent-inbox/arch-interrogation.directive.xml → pass exit=0
- [x] `2026-07-05T10:21:57Z` ver grep -q "ReactionMatrix" ai/directives/agent-inbox/posting-rules.directive.xml → pass exit=0
- [x] `2026-07-05T10:21:57Z` ver grep -q "ReactionMatrix" ai/skills/agent-inbox/SKILL.md → pass exit=0
- [x] `2026-07-05T10:21:57Z` ver grep -q "AuthorMode" ai/skills/agent-inbox-take/SKILL.md → pass exit=0
- [x] `2026-07-05T10:21:57Z` DONE
      **Handoff →** artifacts: [arch-interrogation.directive.xml, posting-rules.directive.xml]; decisions: [D50]; open: []

#### Round close

- [x] `2026-07-15` Meta restored after stash-revert; completion evidenced by Round 1 Final Status: DONE
