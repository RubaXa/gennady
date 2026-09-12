# RUNBOOK — процедуры flow-eval

> Концепции, объекты и правила качества — в [`EVAL-SPEC.md`](./EVAL-SPEC.md); этот файл только
> процедуры (что набрать в терминале, в каком порядке, с какими флагами). Ничего здесь не завязано на
> конкретный worktree — все пути относительны `$PWD` (корень чекаута gennady) или берутся из env.

## Предпосылки

### 0. Жёсткое правило модели (нарушение = фатально)

- **Единственная модель прогона eval — `llm-proxy/deepseek-v4-flash`** (ds4-flash от `llm-proxy`). Любое
  отступление — другой провайдер (в частности `provod`), другая модель — **ФАТАЛЬНОЕ НАРУШЕНИЕ**.
  Сравнимость журнала и всех A/B держится на одной и той же модели; смена модели обнуляет результаты.
- **Если `llm-proxy/deepseek-v4-flash` недоступен** — сделать **не более 5 попыток**, затем
  **ОСТАНОВИТЬСЯ и сообщить оператору**. НЕ переключать модель, НЕ импровизировать, НЕ «подобрать замену».

### 1. Сборка

Песочница получает **скопированный** `dist/**` (`materializeLocalCli` в `provision.ts`) — свежая сборка
обязательна перед КАЖДЫМ живым прогоном после правок кода:

```bash
npm run build
```

Если менялись директивы/шаблоны (`ai/kit/templates/**`, `templates.ts`) — ещё и:

```bash
npm run build:directives
```

### 2. LLM-proxy

Модель ходит не к провайдеру напрямую, а через LLM-proxy. Проверить, не печатая значения:

```bash
for name in LLM_PROXY_BASE_URL LLM_PROXY_API_KEY; do
  test -n "$(printenv "$name")" || { echo "$name is missing" >&2; exit 1; }
done
```

Если переменной нет — остановиться и сообщить оператору; значения нельзя выдумывать.

### 3. OpenCode HTTP-сервер

Харнесс не поднимает OpenCode сам — сервер должен уже слушать порт до запуска `sdd-flow-eval`.

```bash
OPENCODE_EVAL_PORT=4097   # ≥4097, никогда 4096 и никогда порт личного OpenCode Desktop оператора

if lsof -nP -iTCP:"$OPENCODE_EVAL_PORT" -sTCP:LISTEN | grep -q .; then
  echo "port $OPENCODE_EVAL_PORT is busy" >&2; exit 1
fi

OPENCODE_EVAL_LOG="$(mktemp "${TMPDIR:-/tmp}/opencode-flow-eval.XXXXXX.log")"
opencode serve --hostname 127.0.0.1 --port "$OPENCODE_EVAL_PORT" --log-level WARN \
  >"$OPENCODE_EVAL_LOG" 2>&1 &
OPENCODE_EVAL_SERVER_PID=$!

until curl --fail --silent --show-error "http://127.0.0.1:$OPENCODE_EVAL_PORT/health" >/dev/null; do
  kill -0 "$OPENCODE_EVAL_SERVER_PID" || { cat "$OPENCODE_EVAL_LOG" >&2; exit 1; }
  sleep 1
done
```

Не использовать `--pure`: сервер должен прочитать `~/.config/opencode/opencode.json`, где определён
провайдер `llm-proxy/deepseek-v4-flash`. Сервер и live runner должны работать в одной host/network-среде
(в Codex — из одной основной задачи с `sandbox_permissions: require_escalated`; не делегировать live
runner sandboxed-субагенту — его `127.0.0.1` может не видеть сервер основной задачи).

### 4. Юнит-тесты харнесса

```bash
npm run test:sdd-flow-eval
```

Фейк-бэкенд тесты (`ai/flow-eval/__tests__/*.test.ts` + `ai/flow-eval/scripts/__tests__/*.test.ts`) +
shell-селфтест `require-developer-repo.test.sh`. Нужен собранный `dist/` (шаг 1), живой сервер не нужен.

### 5. Правило `~/Developer/` для внешних репозиториев

Эвалы на **своём внешнем репозитории** (round-trip/migration, см. «Внешний репозиторий» ниже) ожидают,
что этот репозиторий лежит под `$HOME/Developer/<repo>` (клон или git worktree) — `roundtrip-eval.sh`
и `migration-eval.sh` проверяют это через `ai/flow-eval/scripts/require-developer-repo.sh "$REPO"` в
начале каждой подкоманды и останавливаются с понятным сообщением до любых изменений, если это не так.
Почини симлинком, если репозиторий уже лежит в другом месте: `ln -s /путь/к/<repo> ~/Developer/<repo>`.

Рабочая копия самого eval-прогона (`$FX`/`$RT`, worktree-фикстура) при этом живёт ПОД
`$HOME/.gennady/eval/<repo>/**` — вне `~/Developer/` и вне репозитория gennady, это ожидаемо: гард
проверяет только исходный `REPO`. Перед тем как доверять такой фикстуре (перед ручным прогоном или
после долгой паузы), проверь E-16 гигиену:

```bash
ai/flow-eval/scripts/check-fixture-hygiene.sh "$FX"   # или "$RT"
```

Exit 0 (тихо) = `git status --porcelain` пуст (воспроизводима из base SHA) И в дереве нет файлов класса
секретов (`.netrc`, `.npmrc`, `.env*`, `credentials*`, `id_rsa*`, `*.pem`, `*.p12`, `*.keystore`,
`application_default_credentials.json`). Диагностика для оператора, не блокирующий автоматический бар —
найденный секретный файл может быть частью истории внешнего репозитория на нужном base-коммите.

## Живой прогон

### Бюджеты по фазам (GAP-E-2)

| Фаза                                                 | `--max-observations` | Почему                                                                             |
| ---------------------------------------------------- | -------------------: | ---------------------------------------------------------------------------------- |
| `task`                                               |                    6 | Маленькая инфра-задача (log-summary/rotate-logs/makefile) — короткий цикл.         |
| `spec-authoring` / `scaffold` / `execute` / `repair` |                   30 | Полный флоу-шаг с чтением директив/шаблонов и одной проверкой на выходе.           |
| `migration` / round-trip (внешний репозиторий)       |                40–60 | Самая дорогая фаза: чтение существующего кода + перенос в v2-формат + верификация. |

Это ПОЖЕЛАНИЕ (SHOULD, не MUST — A21): раннер не enforce-ит верхнюю границу бюджета (только
`maxObservations >= 1` целое, `runner.ts`), но исчерпанный бюджет автоматически даёт `outcome:
'budget-exhausted'`, а не честный `fail` — заниженный бюджет портит диагностику, а не только экономит.
`--observe-every-ms 90000` (не дефолтные 300000) и `--stuck-after 4` (не дефолтный 1) — рекомендация,
снижающая шанс ложного `stuck` на медленной, но реально прогрессирующей модели.

### Канонический прогон (один сценарий или весь `scenarios.json`)

```bash
SDD_EVAL_ROOT="$(node --import tsx ai/flow-eval/scripts/sandbox.ts prepare)"
npm run sdd-flow-eval -- \
  --scenario-file ai/flow-eval/scenarios.json \
  --directory "$SDD_EVAL_ROOT" \
  --gennady-root "$PWD" \
  --base-url "http://127.0.0.1:$OPENCODE_EVAL_PORT" \
  --model llm-proxy/deepseek-v4-flash \
  --judge-model llm-proxy/deepseek-v4-flash \
  --concurrency 1 \
  --observe-every-ms 90000 \
  --stuck-after 4 \
  --max-observations 30 \
  --keep
```

- `--concurrency 1` ВСЕГДА для батчей, содержащих `spec-authoring`/`scaffold`: каждый такой worker
  поднимает ещё и review-субагента, и несколько параллельных сессий перегружают один тест-сервер
  (выродившиеся прогоны: `obs=1`, «no messages», 0 спек). `task`/`execute`/`repair` терпят выше, но
  сценарии по умолчанию всё равно запускаются одним батчем — не смешивай без причины.
- Для проверки одной фазы передай отдельный JSON-файл с одним объектом из `scenarios.json` вместо
  всего файла.
- `--keep` оставляет песочницы (нужен для расследования / для цепочных прогонов ниже); без него
  `sandbox-lifecycle.ts` удаляет их в `finally` сразу после прогона.
- `--results-dir <DIR>` переопределяет постоянный каталог результатов (по умолчанию
  `<gennady-root>/ai/flow-eval/results`, GAP-E-6); `--artifacts-dir <DIR>` — транзиентный батч-каталог
  (по умолчанию `<gennady-root>/ai/flow-eval/.results`).

### Как читать наблюдение

Раз в `--observe-every-ms` печатается одна строка на сценарий:

```text
fibonacci-library: status=running progress=true artifact=changed artifact-wait=0 tools=4 repeat=0 stuck=false tail=...
```

`progress` — что-то изменилось (хвост/статус/события/файлы); `artifact=changed|none` — менялись ли
именно артефакты репозитория; `artifact-wait=N`/`repeat=N` — сколько наблюдений подряд без
изменений/полностью одинаковых; `stuck=true` — наблюдатель сам остановил worker (`abort`).

### Цепочные прогоны и симуляция approval

Канонический `scenarios.json` гоняет каждую фазу на СВОЕЙ фикстуре независимо. Чтобы проверить
**сквозной greenfield** (одна фикстура проходит `authoring → scaffold → execute`), фазы «сцепляют» на
одной песочнице — нужен `--keep` на каждом шаге:

1. Прогнать authoring (свой JSON с одним `spec-authoring`-сценарием) на свежем `--directory`, с `--keep`.
2. Найти песочницу: `ls -d "$SDD_EVAL_ROOT"/sdd-flow-eval-*`.
3. Симулировать полное approval оператора (eval headless, UI нет):
   `ai/flow-eval/operator-approve.sh <sandbox>` — переводит портал `specs/README.md` `🚧`→`✅` И записи
   Decision Log в спеках `Status:`/`Operator decision:` `pending`→`approved`. Оба нужны — judge читает и
   портал, и Decision Log.
4. Прогнать scaffold на ТОЙ ЖЕ песочнице (сценарий с `"directory": "<sandbox>"` вместо `fixture`),
   approval #2 тем же скриптом, затем execute.

Переиспользуемая песочница держит свой `dist` с момента провижна. Менял код между фазами — либо
`npm run build` и подложи свежий `dist` вручную, либо начни с новой песочницы.

### Завершение

```bash
node --import tsx ai/flow-eval/scripts/sandbox.ts clean
kill "$OPENCODE_EVAL_SERVER_PID"
```

Останавливать только сохранённый PID собственного сервера — никогда порт 4096 или личный OpenCode
Desktop оператора.

## Внешний репозиторий (round-trip / migration)

Дополнение к встроенным фикстурам: сценарий получает готовый `directory` — путь к git worktree целевого
репозитория — вместо `fixture`. `provisionScenarioDirectories` не создаёт новый git-репозиторий, но
всё равно кладёт туда свежий CLI (`materializeLocalCli`) — `npm run build` перед `execute` обязателен,
если между `prep` и `execute` менялся код gennady.

### Round-trip (`roundtrip-eval.sh`)

```bash
ai/flow-eval/scripts/roundtrip-eval.sh prep [runid]      # worktree от базовой ревизии + golden + reset-ticket.py
ai/flow-eval/scripts/roundtrip-eval.sh execute [runid]   # прогон сценария на этой же песочнице
ai/flow-eval/scripts/roundtrip-eval.sh grade [runid]     # roundtrip-grade.sh: сравнение с golden
ai/flow-eval/scripts/roundtrip-eval.sh status [runid]
```

`prep` выносит golden (эталонный артефакт + тесты + оригинальный тикет) в `$RT/golden/` — worker их не
читает — удаляет сам артефакт, который сценарий должен regenerate, и сбрасывает тикет в TODO
(`reset-ticket.py`, форвард-спека не трогается). `grade` (`roundtrip-grade.sh`) сравнивает
регенерированный артефакт с golden по сумме факторов (поведенческий бенч + требования + формат), не
байт-в-байт — модель обязана воспроизвести поведение и требования, не оригинал дословно.

### Миграция (`migration-eval.sh`)

```bash
ai/flow-eval/scripts/migration-eval.sh run [runid]      # reset fixture, прогон до конца, SUMMARY
ai/flow-eval/scripts/migration-eval.sh status [runid]
ai/flow-eval/scripts/migration-eval.sh grade [runid]
```

`GEN_ROOT` по умолчанию — корень чекаута, из которого запущен скрипт (три уровня вверх от
`ai/flow-eval/scripts/`); `REPO`/`SCENARIO`/`BASE`/`BASEURL`/`MODEL`/`MAX_OBS` переопределяются env
(GAP-E-4). `SCENARIO` по умолчанию — репозиторный шаблон
`ai/flow-eval/scenarios/migration-cloud-ios.scenario.json` (плейсхолдер `__FX__` подставляется на
`$FX` при рендере), не путь чужой сессии — работает на свежем чекауте без переменных окружения.

### Детерминированные метрики сессии (обе внешние процедуры)

```bash
python3 ai/flow-eval/scripts/session-metrics.py record --run <runid> --session <session> --fixture <dir> [--bench-out <file>] [--ticket <file>] [--spec <file>] [--guard <file>]
python3 ai/flow-eval/scripts/session-metrics.py gate --fixture <dir> [--ticket <file>] [--spec <file>] [--guard <file>]       # COMPLETION GATE: RED/GREEN
python3 ai/flow-eval/scripts/session-metrics.py compare <run_before> <run_after>   # non-regression
python3 ai/flow-eval/scripts/session-telemetry.py <session|фрагмент>       # обзервабилити, ничего не решает
```

`record` пишет одну JSON-строку в `ai/flow-eval/results/metrics-ledger.jsonl` (постоянно, D-62). `gate`/`compare`
опираются на `state_metrics()` в `session-metrics.py`, чьи пути по умолчанию — infra-base/cloud-ios
round-trip фикстура; `--ticket`/`--spec`/`--guard` (E-03) переопределяют эти пути под ЛЮБУЮ фикстуру
(включая встроенные `scenarios.json`-фикстуры без единого тикета — для них `ticket_status`/`round_closed`/
`*_receipt` останутся `?`/`false`, что верно отражает «не применимо», а не дефект).

### Host-setup для SwiftLint-бенча (одноразово, только для round-trip cloud-ios)

`roundtrip-grade.sh` для cloud-ios гоняет реальный SwiftLint 0.65.1 (`<cloud-ios>/Tools/tests/probes.sh`), которому
нужен SourceKit из **Swift 6.2** toolchain — расхождение с Command Line Tools вызывает `SIGBUS`.
Без полного Xcode, без sudo:

```bash
curl -fL -o /tmp/swift-6.2.pkg \
  https://download.swift.org/swift-6.2-release/xcode/swift-6.2-RELEASE/swift-6.2-RELEASE-osx.pkg
pkgutil --expand-full /tmp/swift-6.2.pkg /tmp/swift-6.2-expand
mv /tmp/swift-6.2-expand/swift-6.2-RELEASE-osx-package.pkg/Payload \
   "$HOME/Library/Developer/Toolchains/swift-6.2-RELEASE.xctoolchain"
rm -f /tmp/swift-6.2.pkg
```

Затем rpath-шим, чтобы SwiftLint нашёл эту SourceKit без реального Xcode (симлинки, `@rpath`, переживает
SIP):

```bash
TC="$HOME/Library/Developer/Toolchains/swift-6.2-RELEASE.xctoolchain"
ln -sfn ../../sourcekitdInProc.framework "$TC/usr/lib/swift-6.2/macosx/sourcekitdInProc.framework"
mkdir -p /Applications/Xcode_26.5.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2
ln -sfn "$TC/usr/lib/swift-6.2/macosx" \
   /Applications/Xcode_26.5.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-6.2/macosx
```

Реальный блокер после этого — `TMPDIR` c завершающим слэшем (macOS-дефолт `/var/folders/…/T/`) даёт
двойной слэш в путях проб → `SIGBUS` в CoreFoundation 10/10; без слэша — 0/10. Запускай бенч с
`TMPDIR` без завершающего слэша (`export TMPDIR=/tmp`). Референсный результат на этом хосте: оригинал
Артура — 80/82, стабильно. Процедура host-specific (записана на конкретной машине автора) — на другом
хосте пути (`/Applications/Xcode_26.5.app`, версия toolchain) может понадобиться подставить свои.
