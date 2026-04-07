# LDD-001: Tests Spec

BDD scenarios для проверки public contracts `LDD`.

## t1-runtime-setup

### Feature: config, frames and synthetic context

Scenario: `setup` replaces global config without log emission

- Given вызывают `LDD.setup(configA)`
- And затем вызывают `LDD.setup(configB)`
- When выполняется первая пользовательская emission
- Then используется именно `configB`
- And ни один вызов `setup` сам по себе не эмитит record

Scenario: `setup` accepts `output` or `outputs`, but not both

- Given создан `singleOutput` типа `LddOutput`
- And создан список `manyOutputs` типа `LddOutput[]`
- When вызывают `LDD.setup({ ..., output: singleOutput })`
- Then конфигурация считается валидной
- When вызывают `LDD.setup({ ..., outputs: manyOutputs })`
- Then конфигурация считается валидной
- When вызывают `LDD.setup({ ..., output: singleOutput, outputs: manyOutputs })`
- Then конфигурация отклоняется как невалидная

Scenario: ambient logging without active context creates synthetic root frame

- Given active frame отсутствует
- When вызывают `LDD.info().msg\`hello\``
- Then эмитится ровно одна record
- And запись содержит `contextStatus = 'synthetic'`
- And `parentFrameId` отсутствует
- And `depth = 1`

Scenario: root and child depth follow the 1-based contract

- Given `const root = LDD.scope('Import')`
- And `const child = root.scope('Parse')`
- Then `root.pathSegments = ['Import']`
- And `root.depth = 1`
- And `child.pathSegments = ['Import', 'Parse']`
- And `child.depth = 2`

Scenario: `undefined` remains the actual runtime result

- Given decorated function возвращает `undefined`
- When эмитится terminal success record
- Then запись содержит `returns = undefined`
- And runtime не пытается выводить отдельную semantics для `void`

## t2-scoped-logger

### Feature: `LDD.active`, `scope` and bound logger

Scenario: `LDD.scope(name)` returns logger but does not mutate ambient context by itself

- Given active frame отсутствует
- When вызывают `const log = LDD.scope('Import')`
- Then `log` содержит context `Import`
- And `LDD.active` остаётся `undefined`

Scenario: `scope -> scope -> scope` accumulates `pathSegments`

- Given `const root = LDD.scope('Import')`
- And `const parse = root.scope('Parse')`
- And `const normalize = parse.scope('Normalize')`
- When вызывают `normalize.info({ state: 'step' }).msg\`run\``
- Then payload содержит `pathSegments = ['Import', 'Parse', 'Normalize']`
- And `depth = 3`

Scenario: `LDD.scope(name, run)` activates context only for callback lifetime

- Given active frame отсутствует
- When выполняют `LDD.scope('Import', () => LDD.info().msg\`inside\`)`
- Then запись внутри callback использует `target = 'Import'`
- When после callback вызывают `LDD.info().msg\`outside\``
- Then используется synthetic root frame

Scenario: `LDD.active` is read-only

- Given прикладной код читает `LDD.active`
- When он пытается присвоить новое значение
- Then TypeScript отклоняет присваивание
- And runtime не даёт public setter

## t3-output-factories

### Feature: output factories and output routing

Scenario: `fromStdout` creates output from stream-like target

- Given есть `LikeStdout` target с методом `write(chunk)`
- When вызывают `LDD.output.fromStdout(target)`
- Then создаётся normalized `LddOutput`
- And вызов `write(entry)` приводит к записи presentation text, сформированного из `entry.record`, в target

Scenario: `fromConsole` routes entry by level

- Given есть `LikeConsole` target с методами `info`, `warn`, `error`
- When вызывают `LDD.output.fromConsole(target)`
- And затем `write(entry)` для `entry.level = 'warn'`
- Then используется `target.warn`
- And первым аргументом передаётся presentation text, сформированный из `entry.record`
- And `entry.record` передаётся как дополнительный аргумент

Scenario: `fromFile` creates output from file-like target or file config

- Given есть `LikeFile` target с методом `write(chunk)`
- When вызывают `LDD.output.fromFile(target)`
- Then создаётся normalized `LddOutput`
- Given есть `FileOutputConfig` с `path`
- When вызывают `LDD.output.fromFile(config)`
- Then создаётся normalized `LddOutput` для file-backed target

## t4-decorators

### Feature: automatic logging via decorators

Scenario: `@LDD.class` logs constructor

- Given класс аннотирован `@LDD.class('Slugify')`
- When создаётся экземпляр
- Then эмитится record с `target = 'Slugify#constructor'`
- And запись использует обычную модель `tid/frameId/parentFrameId`

Scenario: `@LDD.method` logs enter and success

- Given method аннотирован `@LDD.method()`
- When method завершается успешно
- Then первая automatic record содержит `prevState = 'idle'` и `state = 'invoked'`
- And terminal record содержит `state = 'returns'`

Scenario: `@LDD.fn` logs enter and error

- Given function аннотирована `@LDD.fn('decideStrategy')`
- When function бросает исключение
- Then эмитится ровно одна terminal `error` record
- And исходная ошибка повторно выбрасывается
- And previous frame восстанавливается в `finally`

Scenario: `redactArgs` and `redactReturn` apply only to their own data

- Given method использует `redactArgs` и `redactReturn`
- When method вызывают
- Then enter record содержит redacted arguments
- And success record содержит redacted return value
- And message interpolation всё равно использует global `redactMsgArg`

## t5-message-builder

### Feature: message builders

Scenario: `debug/info` require tagged-template `msg`

- Given `const builder = LDD.info({ state: 'transform' })`
- When пытаются вызвать `builder.msg('plain string')`
- Then бросается `TypeError`

Scenario: `info` may emit without calling `.msg`

- Given вызывают `LDD.info({ state: 'transform' })` без `.msg`
- When runtime доходит до flush point конца текущего synchronous turn
- Then эмитится ровно одна `info` record
- And `message` отсутствует или пустой

Scenario: every interpolation passes through `redactMsgArg`

- Given `redactMsgArg` всегда возвращает `'[redacted]'`
- When вызывают `LDD.info().msg\`User ${user} token ${token}\``
- Then итоговое message содержит `'[redacted]'` для обеих interpolation
- And static text не меняется

Scenario: `warn(...).msg` returns `returnValue`

- Given `const value = './'`
- When выполняют `return LDD.warn({ state: 'fallback', returnValue: value }).msg\`No path\``
- Then эмитится ровно одна `warn` record
- And expression возвращает `'./'`

Scenario: `warn(...)` may emit without `.msg`

- Given вызван `const builder = LDD.warn({ state: 'fallback', returnValue: './' })`
- When runtime доходит до flush point конца текущего synchronous turn без `.msg\`...\``
- Then эмитится ровно одна `warn` record
- And `message` отсутствует или пустой
- And builder сам по себе не превращается в `'./'`

Scenario: `redactMsgArg` may fail without breaking logging

- Given `redactMsgArg` бросает ошибку для одного значения
- When эмитится `LDD.info().msg\`Value ${value}\``
- Then message содержит `'<ldd:redact-failed>'`
- And запись всё равно эмитится

## t6-recursion-and-errors

### Feature: recursion and throw-compatible error

Scenario: recursive calls remain distinguishable

- Given существует decorated recursive function `factorial`
- When вызывают `factorial(3)`
- Then все records разделяют один `tid`
- And каждый вход получает unique `frameId`
- And каждый вложенный вход ссылается на caller через `parentFrameId`

Scenario: `throw LDD.error(...)` inside LDD boundary emits once

- Given method аннотирован `@LDD.method()`
- And внутри method выполняют `throw LDD.error({ state: 'validate', error: err })`
- When method падает
- Then эмитится ровно одна `error` record
- And message по умолчанию берётся из `err.message`
- And повторно выбрасывается тот же экземпляр ошибки

Scenario: `LDD.error(...)` itself does not emit before crossing LDD boundary

- Given создан `const prepared = LDD.error({ state: 'validate', error: err })`
- When prepared object ещё не выброшен через LDD-managed boundary
- Then `error` record не эмитится

Scenario: `throw LDD.error(...).msg\`...\`` overrides message

- Given method аннотирован `@LDD.method()`
- When внутри method выполняют `throw LDD.error({ state: 'validate', error: err }).msg\`Invalid input ${payload}\``
- Then эмитится ровно одна `error` record
- And итоговое message строится из tagged template
- And выбрасывается тот же экземпляр ошибки

Scenario: `LDD.error(...).msg\`...\`` overrides message but still does not emit immediately

- Given создан `const prepared = LDD.error({ state: 'validate', error: err }).msg\`Invalid input ${payload}\``
- When prepared object ещё не выброшен через LDD-managed boundary
- Then `error` record не эмитится
