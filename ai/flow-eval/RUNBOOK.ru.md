# Интеллектуальный SDD-харнесс: инструкция оператору и следующему агенту

## Назначение

Харнесс проверяет, может ли реальная модель пройти одну из фаз SDD как обычный разработчик:

- `spec-authoring` — создать спецификации и остановиться перед Approval #1;
- `scaffold` — создать реальные задачи и остановиться перед Approval #2;
- `execute` — выполнить утверждённую задачу и подтвердить результат receipt-проверками.

Это не unit-тест директив и не поиск заранее заданной ошибки. Модель получает рабочий репозиторий,
следует собранному SDD-flow, а внешний наблюдатель проверяет её прогресс по ограниченному хвосту сессии
и изменениям файлов.

## Из чего он состоит

| Компонент        | Ответственность                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `cli.ts`         | Читает сценарии, создаёт изолированные окружения и запускает пакет                                           |
| `provision.ts`   | Делает отдельный временный Git-репозиторий для каждого сценария и копирует туда текущую сборку SDD           |
| `runner.ts`      | Создаёт worker-сессию OpenCode и ограничивает параллелизм и бюджет наблюдений                                |
| `observer.ts`    | Раз в пять минут читает только ограниченный хвост, статус, события и diff; обнаруживает отсутствие прогресса |
| `judge.ts`       | В отдельной сессии оценивает конечные артефакты и состояние                                                  |
| `evidence.ts`    | Собирает ограниченные доказательства, включая tracked и untracked-файлы                                      |
| `scenarios.json` | Три эталонных сценария: authoring, scaffold и execute                                                        |

Харнесс не запускает `codex` и не запускает программу OpenCode самостоятельно. Он подключается через
`@opencode-ai/sdk` к уже работающему HTTP-серверу OpenCode. Исходный checkout не используется как
песочница и не должен изменяться во время eval.

## Подготовка

Все команды репозитория выполнять только в авторитетном worktree:

```text
/Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup
```

Перед живым прогоном:

```bash
git status --short
npm run build
npm run test:sdd-flow-eval
```

Продолжать можно только при чистом рабочем дереве, успешной сборке и зелёном тесте харнесса.

До запуска убедиться, что окружение содержит адрес и ключ `llm-proxy`, не печатая их значения:

```bash
for name in LLM_PROXY_BASE_URL LLM_PROXY_API_KEY
do
  test -n "$(printenv "$name")" || { echo "$name is missing" >&2; exit 1; }
done
```

Если хотя бы одной переменной нет, остановиться и сообщить оператору: значения нельзя выдумывать.
Переменные `OPENCODE_INTEGRATION`, `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME` и
`OPENCODE_SERVER_TOKEN` для flow-eval не требуются. Харнесс подключается к этому локальному серверу
без пароля.

Выбрать свободный порт `4097` или выше, исключив `4096` и порт личного OpenCode Desktop оператора
`58656`. Перед запуском проверить выбранный порт через `lsof`:

```bash
OPENCODE_EVAL_PORT=4097
if lsof -nP -iTCP:"$OPENCODE_EVAL_PORT" -sTCP:LISTEN | grep -q .; then
  echo "port $OPENCODE_EVAL_PORT is busy" >&2
  exit 1
fi
```

В отдельном терминале запустить собственный сервер с WARN-логом. Не использовать `--pure`: сервер
должен прочитать `~/.config/opencode/opencode.json`, где определён провайдер
`llm-proxy/deepseek-v4-flash`.

```bash
OPENCODE_EVAL_LOG="$(mktemp "${TMPDIR:-/tmp}/opencode-flow-eval.XXXXXX.log")"
opencode serve --hostname 127.0.0.1 --port "$OPENCODE_EVAL_PORT" --log-level WARN \
  >"$OPENCODE_EVAL_LOG" 2>&1 &
OPENCODE_EVAL_SERVER_PID=$!
```

Дождаться готовности. Перед передачей запуска runner проверить `/health` и PID слушателя, чтобы
подтвердить, что отвечает именно только что запущенный сервер:

```bash
until curl --fail --silent --show-error \
  "http://127.0.0.1:$OPENCODE_EVAL_PORT/health" >/dev/null
do
  kill -0 "$OPENCODE_EVAL_SERVER_PID" || { cat "$OPENCODE_EVAL_LOG" >&2; exit 1; }
  sleep 1
done
lsof -nP -a -p "$OPENCODE_EVAL_SERVER_PID" \
  -iTCP:"$OPENCODE_EVAL_PORT" -sTCP:LISTEN
```

После eval остановить только сохранённый PID собственного сервера:

```bash
kill "$OPENCODE_EVAL_SERVER_PID"
```

Сервер и live runner должны работать в одной host/network-среде. В Codex их нужно запускать из одной
основной задачи; оба live-процесса запускать с `sandbox_permissions: require_escalated`, чтобы им был
доступен один локальный HTTP transport. Не делегировать live runner sandboxed-субагенту: его
`127.0.0.1` может не видеть сервер основной задачи и завершиться `fetch failed` до создания worker.

## Живой прогон

Команда запуска всех трёх подготовленных фаз:

```bash
SDD_EVAL_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/sdd-flow-eval-root.XXXXXX")"
npm run sdd-flow-eval -- \
  --scenario-file ./ai/flow-eval/scenarios.json \
  --directory "$SDD_EVAL_ROOT" \
  --gennady-root /Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup \
  --base-url "http://127.0.0.1:$OPENCODE_EVAL_PORT" \
  --model llm-proxy/deepseek-v4-flash \
  --judge-model llm-proxy/deepseek-v4-flash \
  --concurrency 3 \
  --observe-every-ms 300000 \
  --stuck-after 1 \
  --max-observations 6
```

Для проверки одной фазы передать отдельный JSON-файл, содержащий ровно один объект из
`scenarios.json`. Не запускать весь пакет, если оператор выделил бюджет только на один authoring-прогон.

Каждый сценарий получает собственный временный Git-репозиторий. `--directory` задаёт только общий
каталог для этих песочниц; сценарии не работают в одном каталоге.

## Как читать наблюдение

Раз в пять минут печатается одна строка:

```text
fibonacci-library: status=running progress=true artifact=changed artifact-wait=0 tools=4 repeat=0 stuck=false tail=...
```

- `progress=true` — хвост, статус, события или файлы изменились;
- `artifact=changed` — изменились именно артефакты репозитория;
- `artifact=none` — модель пока ничего не создала;
- `artifact-wait=N` — столько наблюдений подряд diff не менялся;
- `repeat=N` — столько полностью одинаковых наблюдений подряд;
- `stuck=true` — достигнут порог отсутствия прогресса, worker будет остановлен;
- `tail` — последняя ограниченная реплика или краткое описание вызова инструмента.

Названия сессий в OpenCode:

- worker: `sdd-eval:<scenario-id>`;
- независимая оценка: `sdd-eval-judge`.

Полный transcript загружать не нужно. Для расследования достаточно последних сообщений worker и его
дочерних сессий, итогового diff, статуса и событий, уже ограниченных наблюдателем.

## Критерии результата

- `pass` — требуемые артефакты созданы, механические проверки пройдены, модель остановилась на
  правильной границе фазы;
- `fail` — артефакты неверны, модель ушла в другую фазу, зациклилась или исчерпала бюджет;
- `inconclusive` — доказательств недостаточно; это не считается успехом.

Вердикт judge не отменяет проверку фактов. Если judge противоречит реальному diff или не увидел
untracked-файлы, это дефект харнесса, а не дефект SDD-flow.

## Правило остановки и отчёта

1. Не исправлять flow во время живого прогона.
2. Не перезапускать автоматически после `fail` или `inconclusive`.
3. При отсутствии изменений два наблюдения подряд проверить хвост; при `stuck=true` доверить остановку
   харнессу.
4. После результата остановить только собственный сервер OpenCode по сохранённому
   `OPENCODE_EVAL_SERVER_PID`; не трогать Desktop-инстанс оператора.
5. В отчёте указать: сценарий, модель, worker-сессию, временную песочницу, хронологию по наблюдениям,
   итоговый diff, вердикт judge и собственный причинный вывод.
6. Отдельно отметить, что было доказано, а что осталось непроверенным.

## Цепочные прогоны и симуляция approval

Канонический `scenarios.json` гоняет каждую фазу на СВОЕЙ фикстуре (authoring/scaffold/execute
независимы) — approval между ними не нужен. Но чтобы проверить **сквозной greenfield** (одна фикстура
проходит authoring → scaffold → execute), фазы «сцепляют» на одной песочнице:

1. Прогнать authoring (свой JSON с одним `spec-authoring`-сценарием) на свежем `--directory`.
2. Найти песочницу: `ls -d "$SDD_EVAL_ROOT"/sdd-flow-eval-*`.
3. **Симулировать полное approval оператора** (eval headless, UI нет — правим файлы):
   `ai/flow-eval/operator-approve.sh <sandbox>` — переводит портал `specs/README.md` `🚧`→`✅` И
   записи Decision Log в спеках `Status:`/`Operator decision:` `pending`→`approved`. Оба нужны: одного
   портала мало, judge читает и Decision Log.
4. Прогнать scaffold на ТОЙ ЖЕ песочнице (`directory` сценария = путь песочницы), затем approval #2
   тем же скриптом, затем execute.

Переиспользуемая песочница держит свой `dist` с момента провижна (идемпотентный skip не перезальёт
его). Менял код между фазами — либо `npm run build` и подложи свежий `dist` в песочницу, либо начни с
новой песочницы.

## Грабли (проверено на практике)

- **Пересборка обязательна перед прогоном:** `npm run build` после правок кода; `npm run build:directives`
  после правок скелетов/шаблонов (`ai/kit/templates/**`, `templates.ts`). Без этого песочница получит
  старый код/директивы.
- **Батчи авторинга — последовательно** (`--concurrency 1`, прогоны по одному): каждый authoring-worker
  поднимает review-субагента, и несколько параллельных сценариев множат сессии на один тест-сервер →
  перегрузка и вырожденные прогоны (`obs=1`, «no messages», 0 спек). Scaffold/execute терпят выше.
- **Измеряй двумя измерениями:** вердикт judge (стохастичен) И механику (`gennady sdd-check --all .`,
  для execute — `gennady sdd-verify --task <ticket> --phase <P>`). Механика — источник истины.

Добавить свой eval: [`WRITING-EVALS.ru.md`](./WRITING-EVALS.ru.md).
