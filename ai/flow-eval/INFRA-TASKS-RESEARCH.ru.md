# Инфра-задачи из реального стека: ресёрч под eval-фикстуры

Зачем: исходные проблемы флоу были связаны с инфраструктурой (тяжёлая установка зависимостей,
тулчейн). Нужен класс eval-задач **без тяжёлой Node-установки** — банальные вещи, которые люди реально
пишут на bash/Makefile в репозиториях. Каждая такая задача детерминирована (вход→выход), значит имеет
**объективные критерии успеха** (golden-проверки), а не самооценку.

## Что реально пишут (из ресёрча)

**Makefile — стандартные цели** (конвенция, повсеместно): `all`, `build`, `test`, `clean`, `install`,
`format`, `check` (lint+syntax), `help` (awk-снип, документирует цели), `.PHONY`. Источники:
[Makefile Conventions (GNU make)](http://www.chiark.greenend.org.uk/doc/make-doc/make.html/Makefile-Conventions.html),
[Task Runners for Common Coding Tasks — Ham Vocke](https://hamvocke.com/blog/task-runners/),
[Bash or Make? — DEV](https://dev.to/kingyou/which-one-should-you-choose-bash-or-make-2ig0).

**Bash — production-скрипты** (шебанг + strict mode + функции + cleanup; хранят в `bin/`): бэкап,
health-check (exit codes), disk-space alert, **лог-саммари** (nginx access log → счётчики, top IP/URL),
**лог-ротация/очистка** (gzip старых, удаление `*.log`/`*.tar.gz` старше N дней), SSL-check, new-file
alert. Источники:
[Bash Script Real-World Examples — Command in Line](https://www.commandinline.com/bash-script-real-world-examples/),
[Automating File Cleanup — Reliable Penguin](https://blogs.reliablepenguin.com/2025/02/03/automating-file-cleanup-removing-old-files-with-a-bash-script),
[Automated Log Rotation & Cleanup — CoddyKit](https://www.coddykit.com/courses/linux_bash/automated-log-rotation-cleanup-8327040),
[10 Log Management Scripts — hashnode](https://linux-series.hashnode.dev/10-log-management-scripts-every-devops-engineer-needs).

## Кандидаты в инфра-evals (детерминированные, без npm-install)

### E-infra-1 — Лог-саммари (bash + awk)

Задача: по образцу access-лога написать `bin/log-summary.sh`, выводящий: всего запросов, число 5xx,
top-3 IP. Критерии успеха (golden):

- прогон на фиксированном логе → **точный ожидаемый вывод** (счётчики/топ совпадают);
- **strict mode** `set -euo pipefail`; на пустом/отсутствующем файле — понятный ненулевой код и
  сообщение (устойчивость = R6);
- shebang + исполняемость; идемпотентно (повторный прогон = тот же вывод).

### E-infra-2 — Ротация/очистка логов (bash)

Задача: `bin/rotate-logs.sh <dir> <keep-days>` — gzip логов, удалить архивы старше N дней. Критерии:

- golden: подготовленное дерево файлов → после прогона **ровно нужные** загзипованы/удалены/оставлены;
- **безопасность**: работает только внутри переданного каталога (нет путей вне dir, нет `rm -rf /`);
- идемпотентность; strict mode; выход 0 при успехе.

### E-infra-3 — Makefile стандартных целей

Задача: `Makefile` для крошечного проекта с `build/test/clean/help`, все `.PHONY`. Критерии:

- `make help` перечисляет цели (непустой вывод);
- `make test` запускает предоставленный тест и он зелёный; `make clean` удаляет артефакты (проверяемо);
- `make build` детерминирован; цели идемпотентны; нет тяжёлой установки.

## Как это ложится на quality-rules

Каждый инфра-eval = фикстура + **свой golden-набор** (это R2 для инфра-домена) + enterprise-пол
(strict mode, безопасность путей, идемпотентность = R6-класс). R1/R3 для bash — синтаксис-чек
(`bash -n`, `shellcheck` если есть) вместо sdd-check. То есть у КАЖДОГО eval — свои критерии успеха,
но по общей рубрике «объективно + воспроизводимо в обе стороны».
