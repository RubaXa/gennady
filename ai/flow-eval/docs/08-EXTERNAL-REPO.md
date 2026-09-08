# Eval на своём внешнем репозитории (round-trip)

Дополнение к [`06-NEW-EVAL.md`](./06-NEW-EVAL.md), которое описывает встроенные фикстуры
(`FIXTURE_FILES`, живут внутри временной директории, создаются `provision.ts` с нуля). Здесь — другой
паттерн: сценарий работает на **реальном внешнем репозитории** (не в gennady), уже лежащем на диске как
git worktree. Предпосылка: репозиторий — под `$HOME/Developer/<repo>` (см.
[03-SETUP.md](./03-SETUP.md#4-правило-developer-для-внешних-репозиториев)).

Живой пример — `ai/flow-eval/scripts/roundtrip-eval.sh` (round-trip для `cloud-ios`). Ниже — ключевые
шаги без копипаста всего скрипта.

## 1. Модель паттерна

Вместо `fixture: 'some-id'` сценарий получает готовый `directory` — путь к git worktree целевого репо:

```json
{
  "id": "RT-cloud-ios-IB-script",
  "phase": "execute",
  "mode": "canonical-execute",
  "directory": "/Users/k.lebedev/.gennady/eval/cloud-ios/rt-regen",
  "intent": "...",
  "acceptance": "...",
  "completion": {
    "artifact": "Tools/check-swiftlint-exceptions.sh",
    "ticket": "specs/infra-base/infra-base.task.IB-script.md",
    "spec": "specs/infra-base/infra-base.spec.md"
  }
}
```

`provisionScenarioDirectories` (`provision.ts`) НЕ создаёт новый git-репозиторий для сценария с
готовым `directory` — но всё равно кладёт туда свежий CLI (`materializeLocalCli`): дистрибутив,
`ai/**` и bin-shim из текущего `--gennady-root`. Это значит, что песочница внешнего репо запускает
именно ту сборку gennady, что собрана прямо сейчас, а не ту, что была установлена в репозитории ранее.

## 2. Шаги prep/execute/grade

### prep — подготовить golden и «открыть» тикет

1. Создать git worktree целевого репо от фиксированной базовой ревизии:
   ```bash
   git -C "$REPO" worktree add -q -b "$BR" "$RT" "$RTBASE"
   ```
2. Вынести golden (эталонный артефакт + тесты + оригинальный тикет) в `$RT/golden/` — worker НЕ должен
   их читать:
   ```bash
   cp "$RT/$GUARD" "$RT/golden/check-swiftlint-exceptions.sh"
   ```
3. Удалить сам артефакт, который сценарий должен regenerate:
   ```bash
   rm -f "$RT/$GUARD"
   ```
4. Сбросить тикет в TODO и очистить Execution Log, оставив forward-spec секции нетронутыми:
   ```bash
   python3 ai/flow-eval/scripts/reset-ticket.py "$RT/$TICKET"
   ```
5. Закоммитить подготовленное состояние — worker должен стартовать с чистого git-статуса.

### execute — прогнать сценарий на этой же песочнице

1. Пересобрать gennady (`npm run build`) — свежий `dist` для `materializeLocalCli`.
2. Сформировать JSON с одним сценарием (`directory` = путь prep-worktree, `completion` = таргеты).
3. Запустить харнесс как обычно, передав этот JSON через `--scenario-file`.
4. Прогнать детерминированный **completion gate** поверх той же песочницы (не полагаться только на
   judge):
   ```bash
   python3 ai/flow-eval/scripts/session-metrics.py gate --fixture "$RT"
   ```
   Подробности метрик — [05-METRICS.md](./05-METRICS.md).

### grade — сравнить с golden

`roundtrip-grade.sh` сравнивает регенерированный артефакт с golden-эталоном **по сумме факторов**
(поведенческий бенч + соответствие требованиям + формат), не байт-в-байт — это осознанный выбор:
модель не обязана воспроизвести оригинал дословно, она обязана воспроизвести его поведение и
требования.

## 3. Свежий gennady в песочнице

`materializeLocalCli` копирует `dist/**`, `ai/**`, `package.json` и bin-shim из `--gennady-root` в
`node_modules/gennady` внутри целевого репо БЕЗУСЛОВНО — даже если песочница переиспользуется между
фазами/прогонами. Следствие: если между `prep` и `execute` менялся код gennady, `npm run build`
обязателен ПЕРЕД `execute` — иначе worker будет работать со старой версией CLI, а результат — вводить в
заблуждение.

## 4. Отличие от встроенных фикстур

| Аспект                  | Встроенная фикстура (`FIXTURE_FILES`)           | Внешний репозиторий (round-trip)                    |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Кто создаёт репозиторий | `provision.ts` (git init + baseline commit)     | Оператор/скрипт, ЗАРАНЕЕ, как git worktree          |
| Расположение            | временный каталог под `--directory`             | `$HOME/Developer/<repo>` + отдельный eval-worktree  |
| Golden                  | нет отдельного golden — судит `sdd-check`/judge | Явный golden-каталог, скрытый от worker             |
| completion-таргеты      | опционально                                     | практически всегда (артефакт может быть «заброшен») |
| Пересборка gennady      | подхватывается автоматически при провижне       | нужно явно `npm run build` перед `execute`          |

## 5. Гард `~/Developer/`

`roundtrip-eval.sh` и `migration-eval.sh` вызывают `require-developer-repo.sh "$REPO"` в начале каждой
подкоманды. Если целевой репозиторий не под `~/Developer/`, скрипт останавливается с понятной ошибкой,
не тронув файловую систему. Не обходить эту проверку переносом кода мимо скрипта — она защищает от
рассинхрона путей между этим прогоном и остальными eval-инструментами на машине (см.
[03-SETUP.md](./03-SETUP.md#4-правило-developer-для-внешних-репозиториев)).
