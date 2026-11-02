# BF1: квалификация исходного состояния

Статус: IN PROGRESS, не GREEN и не окончательная приёмка.

- GitHub baseline: `6e19167e0c756b5e136dd3a9e5a597280c78c2e9`; product sources неизменны.
- Baseline build PASS4.41s. Общие node_modules подключены ссылкой; dependency install не делался.
- Первый запуск:13 tests,1 passed,12 failed. Три module-loading failures — пробел переноса test-only helper, не продуктовые находки.
- Повтор только не стартовавших suite после восстановления exact helper:8 tests,0 passed,8 failed,exit1,3.275s.
- В двух запусках17 unmet runtime assertions новых контрактов; это не17 отдельных багов.
- Один historical integrity test PASS; frozen record сохраняет исходные P1/P2 failures.
- После source fixes квалифицированная общая матрица598/598; дополнительные проверки и ограничения — green-progress.json. Полный unit/pre-commit, установленный candidate и GitLab replay впереди. Модельных вызовов0.

Exact импортированные test/harness hashes — `source-bindings.json`; компактные counters и SHA256 исходных TAP — `baseline.json`. Сырые TAP остаются локально; они содержат абсолютные пути и не публикуются как public evidence. `cost-report-input.json` различает пользовательский отчёт и наше измерение. `gitlab-tracking.json` фиксирует опубликованные ссылки.

[Общий Draft MR !23](https://gitlab.corp.mail.ru/mail-core/gennady/-/merge_requests/23) — единая точка плана и следующих результатов.
