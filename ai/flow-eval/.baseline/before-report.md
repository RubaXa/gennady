# REL-17 before-report — snapshot rc-baseline-1

> Бриф 0/5 — REL-17 + GAP-B-1 (Волна −1). Срез: тег `rc-baseline-1` → commit `227c03a83830124fe2aa22541dd5374beb8a53c6`.
> Полные данные (по code/file/severity, per-code counts) — `ai/flow-eval/.baseline/sdd-check-227c03a8.json`.
> Окружение — `ai/flow-eval/.baseline/environment.json`.

## Команда и результат

```
npm run build && node dist/gennady.js sdd-check --all .
```

- exit code: **1**
- итог: **198 error(s), 431 warning(s) across 212 file(s)**
- совпадает с измерением V-06-GAP (198 error / 431 warn, exit 1) — расхождений нет.

JSON-форма той же команды (`... --format json`), схема `gennady.sdd-check.findings.v1`:

- `ok: false`, `fileCount: 212`, `summary: { errors: 198, warnings: 431 }`, `findings.length: 629`
  (629 = 198 + 431 — сырые находки, до дедупликации по (code,file,severity)).

## Гистограмма по severity

| severity | count |
| -------- | ----- |
| error    | 198   |
| warn     | 431   |

## Гистограмма по code (per-code counts — сырые, НЕ дедуплицированные; хранится в `countsByCode` артефакта)

| code                             |   error |    warn |
| -------------------------------- | ------: | ------: |
| ERR_CLI_SDD_CHECK_READ_FAILED    |       4 |       0 |
| SDD_ANCHOR_UNBALANCED            |       3 |       0 |
| SDD_BDD_COVERAGE_ROW_UNPARSED    |       0 |     140 |
| SDD_BDD_MISSING_NEGATIVE         |       1 |       0 |
| SDD_BDD_REQUIREMENT_UNTRACED     |      37 |       0 |
| SDD_BDD_SCENARIO_UNTESTED        |       0 |      70 |
| SDD_BDD_TESTFILE_AMBIGUOUS       |       0 |       3 |
| SDD_BROKEN_SPEC_ANCHOR           |       0 |      11 |
| SDD_BROKEN_SPEC_REF              |       6 |       0 |
| SDD_DEP_UNRESOLVED               |      18 |       0 |
| SDD_DIAGRAM_CAPTION_MISSING      |       1 |      15 |
| SDD_DIAGRAM_INVALID              |       2 |       0 |
| SDD_DL_LEGACY_ID                 |       0 |       4 |
| SDD_DONE_WITH_ACTIVE_BLOCKER     |       1 |       0 |
| SDD_DONE_WITH_PLACEHOLDERS       |       0 |      11 |
| SDD_FABRICATED_DONE              |      44 |       0 |
| SDD_LANGUAGE_CALQUE              |       0 |       9 |
| SDD_LEGACY_TICKET_UNANCHORED     |       0 |      76 |
| SDD_MISSING_TASK_ID              |       0 |       1 |
| SDD_MODULE_DAG_CYCLE             |       1 |       0 |
| SDD_MODULE_NOT_IN_INDEX          |       0 |      11 |
| SDD_MODULE_NO_CALL_CHAIN         |       0 |      26 |
| SDD_MODULE_OVERSIZED             |       0 |       9 |
| SDD_PHASE_DEP_UNRESOLVED         |       2 |       0 |
| SDD_PHASE_SECTION_MISSING        |       1 |       0 |
| SDD_PHASE_SECTION_ORPHAN         |       4 |       0 |
| SDD_RESEARCH_DISPOSITION_MISSING |       6 |       0 |
| SDD_RESEARCH_UNREGISTERED        |       0 |       2 |
| SDD_RULES_CASCADE_UNRESOLVED     |       1 |       0 |
| SDD_SCOPE_DEP_UNDECLARED         |       0 |       3 |
| SDD_SECTION_OVERLAP              |       9 |       0 |
| SDD_SPEC_SECTION_MISSING         |       2 |       0 |
| SDD_STATUS_UNPARSEABLE           |       0 |       1 |
| SDD_TASK_ID_COLLISION            |       3 |       0 |
| SDD_TRACKER_MISSING_ROW          |       0 |      37 |
| SDD_TRACKER_ORPHAN_ROW           |       0 |       2 |
| SDD_TRACKER_STATUS_DRIFT         |       5 |       0 |
| SDD_VERIFICATION_TABLE_INVALID   |      47 |       0 |
| **sum**                          | **198** | **431** |

38 distinct codes. Sum of the two columns reproduces the top-level 198/431 exactly (cross-checked programmatically against `countsByCode` in the JSON artifact).

## Гистограмма по file (top 15 by dedup'd (code,file,severity) row count — 172 files carry at least one finding)

| file                                             | error rows | warn rows | total rows |
| ------------------------------------------------ | ---------: | --------: | ---------: |
| tasks/cli/e2e/e2e.task-60.md                     |          5 |         1 |          6 |
| tasks/cli/sync-skills/cli-sync-skills.task-57.md |          4 |         2 |          6 |
| tasks/vcs/vcs-client/vcs-client.task-71.md       |          4 |         2 |          6 |
| tasks/agent-inbox/agent-inbox.task-158.md        |          1 |         4 |          5 |
| tasks/agent-inbox/agent-inbox.task-162.md        |          2 |         3 |          5 |
| tasks/agent-inbox/agent-inbox.task-164.md        |          2 |         3 |          5 |
| tasks/agent-inbox/agent-inbox.task-169.md        |          2 |         3 |          5 |
| tasks/cli/orient/orient.task-55.md               |          3 |         2 |          5 |
| tasks/cli/vcs-refactor/vcs-refactor.task-70.md   |          2 |         3 |          5 |
| tasks/mr-stats/mr-stats.task-138.md              |          3 |         2 |          5 |
| specs/agent-inbox/agent-inbox.spec.md            |          2 |         2 |          4 |
| specs/cli/sdd-verify/sdd-verify.spec.md          |          2 |         2 |          4 |
| specs/mr-stats/mr-stats.spec.md                  |          1 |         3 |          4 |
| tasks/agent-inbox/agent-inbox.task-159.md        |          2 |         2 |          4 |
| tasks/agent-inbox/agent-inbox.task-161.md        |          1 |         3 |          4 |

Full per-file listing (all 172 files, dedup'd by code/file/severity) is derivable from `sdd-check-227c03a8.json` (`findings` array) — not repeated here to keep this report bounded; see acceptance command in `README.md` for a one-liner that reproduces this exact table.

## Прочие гейты (exit-коды на срезе, до правок этой задачи)

Измерены на 227c03a8 ДО добавления нового гейта `gate:sdd-check-baseline`, чтобы задокументировать исходное состояние прочих гейтов (за исключением `npm run check`, который выполняется как часть обычной коммит-процедуры этой же задачи и повторно приведён в отчёте REL-17/GAP-B-1):

- `npm run build` — exit 0 (см. вывод сборки; использован для получения `dist/gennady.js`).
- `npm run test:topology` (`check` scripts/test-topology.ts) — печатает классификацию: `unit=213 contract=16 local=51 external=8`, `coverage observed=229 black-box=59` (после добавления теста этой задачи; до неё unit=212). Дизъюнктность/полнота подтверждены (гейт зелёный).

## Инварианты, подтверждённые при снятии среза

- Тег `rc-baseline-1` → `227c03a83830124fe2aa22541dd5374beb8a53c6` (неподвижен).
- `git status --porcelain=v1 --untracked-files=all` на срезе: пусто, кроме `.npm-ci-done` — предсуществующий untracked scratch-маркер (создан установкой зависимостей ДО начала этой задачи, не частью REL-17/GAP-B-1).
- Никаких правок v1-данных (`tasks/**`, `specs/**`) для «позеленения» прогона — baseline фиксирует КАК ЕСТЬ.
