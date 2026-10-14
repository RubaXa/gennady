# E-14 — proposals для 19 PHASES_OVERVIEW repairs

Frozen input: `130f8091836216e5259786d61eaa996dd709d0e3`.

Это только operator-ACK artifact. До ACK тикеты не изменяются. Таблицы не синтезируют новые фазы:
они переносят существующие headings и подтверждённые execution-log факты. Пустой/неоднозначный
evidence остаётся незакрытым и проверяется человеком перед записью.

## TSK-23 — AltOpinion Core (types + parser + runner)

- Файл: `tasks/cli/alt-opinion/cli-alt-opinion.task-23.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | types  | —    | [x]    |
| P2  | runner | —    | [x]    |

## TSK-24 — AltOpinion CLI (cmd + prompts + registration)

- Файл: `tasks/cli/alt-opinion/cli-alt-opinion.task-24.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | cmd  | —    | [ ]    |

## TSK-25 — AltOpinion Tests (parser + runner + integration)

- Файл: `tasks/cli/alt-opinion/cli-alt-opinion.task-25.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | parser | —    | [ ]    |
| P2  | runner | —    | [ ]    |
| P3  | cli    | —    | [ ]    |

## TSK-26 — AltOpinion Telemetry

- Файл: `tasks/cli/alt-opinion/cli-alt-opinion.task-26.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind   | Deps | Status |
| --- | ------ | ---- | ------ |
| P1  | types  | —    | [x]    |
| P2  | runner | —    | [x]    |
| P3  | tests  | —    | [x]    |

## TSK-12 — Типы: LintError, LintOptions, LintReport, коды ошибок

- Файл: `tasks/cli/lint/cli-lint.task-12.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | types | —    | [x]    |

## TSK-13 — FileHeaderCheck

- Файл: `tasks/cli/lint/cli-lint.task-13.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind           | Deps | Status |
| --- | -------------- | ---- | ------ |
| P1  | implementation | —    | [ ]    |

## TSK-14 — AnchorCheck

- Файл: `tasks/cli/lint/cli-lint.task-14.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind           | Deps | Status |
| --- | -------------- | ---- | ------ |
| P1  | implementation | —    | [x]    |

## TSK-15 — DbcContractCheck

- Файл: `tasks/cli/lint/cli-lint.task-15.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind           | Deps | Status |
| --- | -------------- | ---- | ------ |
| P1  | implementation | —    | [x]    |

## TSK-16 — LintCommand + регистрация в gennady.ts

- Файл: `tasks/cli/lint/cli-lint.task-16.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | index | —    | [x]    |

## TSK-17 — Тесты: проверки + интеграционные

- Файл: `tasks/cli/lint/cli-lint.task-17.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | tests | —    | [x]    |

## TSK-18 — Интеграционные тесты CLI команды lint

- Файл: `tasks/cli/lint/cli-lint.task-18.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | tests | —    | [x]    |

## TSK-32 — LanguageCheck: проверка языка (English-only) в контрактах и хедерах

- Файл: `tasks/cli/lint/cli-lint.task-32.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | code  | —    | [x]    |
| P2  | tests | —    | [x]    |

## TSK-87 — tasks/cli/vcs-draft-note/vcs-draft-note.task-87.md

- Файл: `tasks/cli/vcs-draft-note/vcs-draft-note.task-87.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P2  | test | P1   | [ ]    |

## TSK-11 — DbcLinter: опция `content` для предварительно прочитанного файла

- Файл: `tasks/dbc/dbc-linter/dbc-linter.task-11.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind           | Deps | Status |
| --- | -------------- | ---- | ------ |
| P1  | types          | —    | [x]    |
| P2  | implementation | —    | [x]    |
| P3  | tests          | —    | [x]    |

## TSK-19 — Проверка контрактов для type alias (объектный литерал) и interface property (function-typed)

- Файл: `tasks/dbc/dbc-linter/dbc-linter.task-19.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind    | Deps | Status |
| --- | ------- | ---- | ------ |
| P1  | adapter | —    | [x]    |
| P2  | tests   | —    | [x]    |

## TSK-20 — Fix \_reorderTags: `*/` closing boundary + edge cases

- Файл: `tasks/dbc/dbc-linter/dbc-linter.task-20.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | fix   | —    | [x]    |
| P2  | tests | —    | [x]    |

## TSK-21 — Autofix: normalize multi-line + expand inlining + always-run formatting

- Файл: `tasks/dbc/dbc-linter/dbc-linter.task-21.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind  | Deps | Status |
| --- | ----- | ---- | ------ |
| P1  | fix   | —    | [x]    |
| P2  | tests | —    | [x]    |

## TSK-22 — vcs-client: file headers + DBC contracts

- Файл: `tasks/vcs/vcs-client/vcs-client.task-22.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | fix  | —    | [x]    |

## TSK-86 — tasks/vcs/vcs-client/vcs-client.task-86.md

- Файл: `tasks/vcs/vcs-client/vcs-client.task-86.md`
- Anchor dry-run: `PHASES_OVERVIEW_MISSING`
- Evidence: существующие phase headings; `Deps` только из буквального `Inputs`; `Status` только из phase execution-log `DONE`.

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P2  | test | P1   | [ ]    |
