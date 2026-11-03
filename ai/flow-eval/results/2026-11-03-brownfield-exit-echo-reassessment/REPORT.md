# Отдельная офлайн-переоценка E3: exit-echo v2

**Распознаватель исправлен и квалифицирован без новых модельных прогонов.**
На тех же сохранённых входах E3 v3 получает отдельный **PROVEN**;
старый E3 v2 с неверной командой остаётся **NOT PROVEN**.
Первичные raw, judge, метрики и их прежние флаги не изменены.

| Сохранённая попытка     | Raw proof / confirmation | Новая proof / confirmation | Причина                                                                                           |
| ----------------------- | ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------- |
| E3 v2, policy-censored  | false / NOT PROVEN       | false / NOT PROVEN         | Правильный proposal CLI не вызван, canonical pending отсутствует; judge FAIL сохранён             |
| E3 v3, completed-worker | false / NOT PROVEN       | **true / PROVEN**          | Actual CLI + exit0, canonical pending, judge PASS и границы подтверждены; wrapper теперь доказуем |

`confirmationAccepted:true` означает, что **оценщик принял доказательство**.
Это не operator verdict: запись REG-DL-1 по-прежнему pending-operator,
самопринятия или предоставления lint-исключения не было. Продуктовые артефакты
попытки не переписывались. Full trajectory остаётся NOT PROVEN: лишний ls/find
не превращён в ожидаемую траекторию. Общего выигрыша модели не заявляем.

## Что принимает новая версия

Только bare-команда существующего CLI либо один точный завершающий суффикс
`; echo EXIT:$?` / `; echo "EXIT:$?"`. Это не общий shell parser.

Для wrapper обязательны:

- полный host SDK capture, единственный результат с теми же session/call/message
  ID и точной command; роль assistant, tool bash, status completed;
- точные startedAt/finishedAt, согласованные с SDK; lint завершился до proposal;
- tool exit и SDK shell exit 0, metadata.truncated=false;
- полный одинаковый state.output/metadata.output до 64 КиБ;
- ровно один финальный `EXIT:N`, с завершённой строкой, N в 0..255;
  без терминальных переписываний, обрыва, повторов или постороннего хвоста;
- actual lint exit1 для точного source/owning-spec, затем scoped proposal exit0.

Запрещены дополнительный shell-код, redirects/pipelines, статический echo EXIT:0,
нерасширяемая single-quote строка, подстановка команд, Unicode-разделители,
подмена ID/команды/времени, обрезанный или противоречивый вывод. Прямая правка
модуля и операторский deviation-verdict не могут дать доказательство.
Недостаточные данные означают NOT PROVEN, а не автоматически дефект продукта.
Bare-команды сохраняют прежний критерий exit из trusted trajectory event.

Persistence, judge, write boundary, runtime integrity, trace completeness и
cleanup проверяются отдельно прежним acceptance-контрактом. Сам факт CLI exit0
не доказывает pending и не принимает решение за оператора.

## RED → GREEN и воспроизводимость

Исходный RED уже зафиксирован primary E3 v3: raw recognizer=false при actual
pending и judge PASS. Старый критерий/выход сохранены в исходном каталоге.
Новая версия использует полный SDK stdout, которого не было в прежнем вызове
matcher. На том же capture получен GREEN; без capture wrapper остаётся unknown.
Второй причинный контроль — прежний censored E3 v2 — не становится зелёным.

`reassessment.json` — отдельная версия оценки, modelCalls=0,
newPrimaryAttempts=0. Входы ссылаются на exact SHA двух прежних raw records,
private primary и compressed/body capture. Приватные и публично нормализованные
входы дали одинаковый результат. Source hashes и frozen source оценщика
зафиксированы отдельно; активный runner передаёт полный capture и помечает
measurement revision. Ни judge, ни очистка, ни полномочия не переопределяются.

Публичная projection не является новым raw: SDK identities хешированы
(равенства и коллизии сохраняются), реальный workspace-root заменён на
`<workspace>`, полные **синтетические** lint/proposal diagnostics сохранены,
прочие outputs явно withheld. Сообщения агента и private source/diff Octavius
не публикуются. В offline replay не вызываются shell-команды из capture.

Независимый adversarial review не нашёл блокеров: проверены SDK binding,
дубликаты, completeness, exit, порядок и shell composition. Положительные и
отрицательные unit-контроли дополнены recorded replay двух настоящих captures,
проверками tamper/privacy/неизменности старых raw.

Это **исправление измерителя**, а не новая попытка модели или A/B.
Новых LLM-eval вызовов и токенов0. Прежние затраты E3 v3 (12744 primary,
4435 judge,6955 reflection) не потрачены повторно и не менялись.
Никакого merge/npm/CI eval/BF4 в этом этапе нет; PR #132 остаётся Draft.
