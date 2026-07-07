# Task: TSK-104 — Документный конвейер в скиллах + пивот «ничего на диск»

## 1. Meta

- **Task-ID:** TSK-104 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** skills | **Dependencies:** TSK-103 (`--scaffold`/`--validate`)
- **Purpose:** Перевести конвейер разбора на документы: scaffold → оркестратор обогащает Context → validate(enriched) → диспатч сабагентов по task-файлам → validate(filled) → README/HISTORY → итог в чат. Правило «ничего на диск» переформулировать: артефакты конвейера живут в state-dir.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) AI-36, AI-08 | **Runtime:** not-implemented | **Verification:** review

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl

- **Rules:** none (скиллы — markdown). **Канон — `ai/skills/`; ту же правку скопировать в зеркало `.claude/skills/` (NFC-06/D56).**
- **Target Files:**
  - `ai/skills/agent-inbox-take/SKILL.md` — шаги конвейера ревью переписать на документы:
    1. `inbox-review-plan --path <worktree> --base <sha> --scaffold --ref <ref>` → пути болванок;
    2. **Оркестратор обогащает** `## Context` каждой болванки (то, что механика не знает: какие сущности важны, что уже обсуждено в prior threads, цель MR, на что смотреть) и ставит `status: enriched`. Минимальный контекст: по файлам дорожки, НЕ полное ревью;
    3. `inbox-review-plan --validate <dir> --stage enriched` — гейт перед диспатчем (пустой Context = стоп);
    4. Диспатч: каждому сабагенту — путь его task-файла + инструкция «прочитай Scope и Context, заполни Findings/Candidates/Verdict по схеме, поставь `status: filled`». Отчёты — GitLab-flavored markdown, диаграммы mermaid;
    5. `inbox-review-plan --validate <dir>` — детерминированный гейт. `{ok: false}` → вернуть КОНКРЕТНОМУ сабагенту его файл и список ошибок (точечный retry, не всё заново), максимум 1 повтор, после — эскалация оператору;
    6. Синтез: оркестратор читает все task-файлы (полные, с диска — не пересказы), пишет `README.md` (сборка состояния) и дописывает запись в `HISTORY.md` (дата, headSha, режим full/delta, итог, ссылки на task-файлы);
    7. Итог в чат — по-прежнему по golden-формату (виджет/ASCII): **содержимое md-файлов и mermaid в чат не вставлять** — файлы для GitLab/оркестрации, чат для оператора.
  - `ai/skills/agent-inbox/SKILL.md`:
    - правило 8 «Ничего на диск» → «В репозиторий оператора и произвольные пути — ничего. Рабочие артефакты конвейера (PLAN, task-документы, README, HISTORY) — только в `<state-dir>/agent-inbox/reports/…`, создаются `inbox-review-plan --scaffold`, чистятся `inbox --reset`. Итог оператору — в чат»;
    - таблица VCS-инструментов: строка `inbox-review-plan` — добавить `--scaffold` / `--validate` и краткое «болванки задач → оркестратор обогащает → агенты заполняют → validate»;
    - шаг 4: ссылка на документный конвейер в take (не дублировать процедуру);
    - при повторном заходе (`headChanged != none`): прочитать прошлые `README.md`/`HISTORY.md` из reports как вход дельта-анализа (инвариант 5 — «что нового» строится и из них).
  - `.claude/skills/agent-inbox/SKILL.md`, `.claude/skills/agent-inbox-take/SKILL.md` — та же правка (копия канона).
- **Exit:** конвейер полностью документный; ни один сабагент не получает задание «на словах» — только через task-файл; синтез читает файлы; правило 8 не противоречит артефактам.

### P2 — test

- **Rules:** none
- **Target Files:** проверки консистентности:
  - `grep -q 'scaffold' ai/skills/agent-inbox-take/SKILL.md`
  - `grep -q 'validate' ai/skills/agent-inbox-take/SKILL.md`
  - `grep -q 'reports' ai/skills/agent-inbox/SKILL.md`
  - `diff ai/skills/agent-inbox/SKILL.md .claude/skills/agent-inbox/SKILL.md` — идентичны
  - `diff ai/skills/agent-inbox-take/SKILL.md .claude/skills/agent-inbox-take/SKILL.md` — идентичны
- **Exit:** скиллы ссылаются на конвейер, зеркала синхронны, «Ничего на диск» в старой формулировке не встречается

## 4. BDD

- `review_needed`, fan_out → scaffold создал болванки → оркестратор заполнил Context каждой → validate(enriched) ok → сабагенты заполнили → validate ok → README+HISTORY → итог в чат
- Сабагент оставил `status: scaffolded` → validate(filled) вернул ошибку по его файлу → точечный retry этого сабагента с текстом ошибки
- Retry не помог (2-я ошибка валидации того же файла) → эскалация оператору с показом ошибок, конвейер не постит
- Повторный заход после финализации: оркестратор читает прошлый README/HISTORY → дельта-блок в чате опирается на них
- `mode: inline` → одна болванка, оркестратор сам и обогащает и заполняет (без диспатча), validate обязателен так же
- Итоговый чат-вывод не содержит fenced ` ```mermaid ` (mermaid остаётся в файлах)

## 5. Verification

- grep/diff-проверки из P2 — pass
- Правило 8: `grep -c 'Ничего на диск' ai/skills/agent-inbox/SKILL.md` → 0 (старая формулировка заменена)

## 6. Dependencies / Open questions

- Формат README/HISTORY несёт болванка (создаёт TSK-103) — скиллы формат НЕ дублируют, только процесс (lazy-принцип: формат в артефакте, процедура в скилле)
- Валидация структуры ≠ качество ревью: качество держат директивы + eval-набор (AI-32)

## 7. Execution Log

### Round 1

#### P1

- [ ] **Handoff →** artifacts: [agent-inbox-take/SKILL.md, agent-inbox/SKILL.md, зеркала]; decisions: [D57]; open: []

#### P2

- [ ] **Handoff →** artifacts: []; decisions: []; open: []
