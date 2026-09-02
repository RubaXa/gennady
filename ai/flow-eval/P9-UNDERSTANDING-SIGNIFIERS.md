# P9 understanding signifiers

Источник калибровки: bounded-срез worker-сессии
`ses_f9d940ebbffeF2hYqFMV8BH3gx` из P8.4. В срез вошли только счётчики
tool-вызовов и сообщения, содержащие понятия `scope`, `module`, `authoring`,
`sdd-new`, `sdd-check` и `sdd-log`; полный transcript не загружался.

## Scope и module

- Факт: в сообщении 14 worker рассматривал имя `fibonacci` для единственного
  модуля внутри scope `fibonacci` и создал путь с повтором scope.
- Fixture: `moduleEqualsScope` и `understandingSignifiers[scope-vs-module]` в
  `p9-misunderstood-cases.json`.
- Signifier: успешный `sdd-new module` теперь печатает, что module — одна
  связная ответственность внутри scope, показывает canonical path и для
  наблюдённого fibonacci-case приводит `nth, sequence`. Ошибочный повтор
  по-прежнему отклоняется до записи файла.

## Что заполнять

- Факт: начиная с сообщения 28 worker угадывал скрытую причину findings,
  создавал экспериментальные варианты секций и девять раз переписывал две
  спеки.
- Fixture: `repeatedSpecWrites`, `checkerShellFilter` и
  `understandingSignifiers[what-to-fill]`.
- Signifier: `sdd-check --format json` возвращает section-local `reason`,
  `next`, `example`, а authoring-блок явно называет режим записи
  `whole-document`: исправить названные секции и снова заменить документ
  целиком, без shell-фильтра и поиска реализации чекера.

## Граница authoring-complete

- Факт: в сообщении 60 worker счёл `0 errors` при оставшихся warnings готовым
  состоянием; следующий `sdd-log authoring-complete` отказал.
- Fixture: `understandingSignifiers[authoring-boundary]`.
- Signifier: authoring-вывод `sdd-check` различает exit-code самого чекера и
  готовность lifecycle. JSON возвращает `completion=blocked|ready` и правило
  `zero remaining findings`; чистый результат прямо называет следующий
  `sdd-log authoring-complete`.

Других системных непониманий в bounded-срезе не зафиксировано. Ошибки Mermaid
и языковые кальки были обычными адресными findings, а не отдельной проблемой
понимания инструмента.
