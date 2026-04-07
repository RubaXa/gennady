Ниже — новая спецификация, собранная с учётом исходного draft, прошлой версии и фидбека. Я сохраняю `webview-tag` и `iframe` как **обязательные first-class сущности**, а `WebContentsView` — как обязательную совместимую альтернативу для новых сценариев. Основой process-level мониторинга остаются `app.getAppMetrics()` и ручной mapping через `pid + creationTime`, а для OOPIF теперь фиксируется использование `WebFrameMain.osProcessId`.   ([Electron][1])

# Спецификация: активный мониторинг Electron App (Loading + Runtime)

## 0. Intent-plan

### Цель

Построить единую систему мониторинга Electron-приложения, которая:

* измеряет фазу загрузки от старта процесса до явного `app-ready`,
* ведёт непрерывный мониторинг CPU / Memory / EventLag,
* атрибутирует метрики к `main`, `window renderer`, `webview`, `iframe`,
* помогает ответить: какое окно самое тяжёлое, какой `webview` или `iframe` деградирует, есть ли утечки, страдает ли `main`.

### Приоритеты реализации

1. **Обязательная поддержка `webview-tag`**
2. **Обязательная поддержка `iframe`**
3. **Поддержка `BrowserWindow` renderer**
4. **Поддержка `WebContentsView`**
5. **Поддержка диагностического режима CDP / tracing**

### Ключевые решения

* **Source of truth для process-level CPU/Memory**: `app.getAppMetrics()` в `main`. `ProcessMetric` содержит `pid`, `type`, `cpu`, `memory`, `creationTime`; для уникальной идентификации процесса использовать `pid + creationTime`, так как PID может переиспользоваться.  ([Electron][1])
* **Привязка окна/guest к процессу**: через `webContents.getOSProcessId()` и `webContents.id`. Для `iframe` использовать `WebFrameMain` (`processId`, `routingId`, `frameToken`, `osProcessId`).  ([Electron][2])
* **Event loop lag**: в `main` — `monitorEventLoopDelay()`; в `renderer/preload` — web-based sampler (`longtask` + timer drift), потому что в sandboxed preload полноценный Node-доступ ограничен.   ([Node.js][3])
* **Preload не имеет отдельного OS PID**: preload всегда часть renderer-процесса. Его можно атрибутировать по времени, JS CPU profile и дельтам памяти, но не как отдельный системный процесс. 

---

## 1. Область действия

Система должна поддерживать две фазы:

### Phase A — Loading

Период от запуска процесса приложения до явного сигнала готовности UI/SPA.

### Phase B — Running

Непрерывный runtime-мониторинг после завершения загрузки.

---

## 2. Поддерживаемые сущности

### 2.1 Main process

Главный процесс Electron.

### 2.2 BrowserWindow renderer

Renderer top-level страницы внутри `BrowserWindow`.

### 2.3 `webview-tag` — first-class сущность

`<webview>` обязателен к поддержке в первой версии. Несмотря на то, что Electron рекомендует по возможности избегать `webview`, он по-прежнему запускает guest content в отдельном процессе и должен полноценно покрываться мониторингом. Для использования требуется `webPreferences.webviewTag: true`; Electron рекомендует использовать `will-attach-webview` для валидации или удаления preload у guest-контента.  ([Electron][4])

### 2.4 `iframe` — first-class сущность

Поддержка обязательна в первой версии:

* `same-origin iframe` — логическая сущность внутри renderer top-level страницы,
* `cross-origin iframe / OOPIF` — отдельная process-level сущность при вынесении в отдельный процесс. Для OOPIF использовать `WebFrameMain.fromId(processId, routingId)` и `frame.osProcessId`.   ([Electron][2])

### 2.5 `WebContentsView`

Поддерживается как современная альтернатива `BrowserView`; `BrowserView` deprecated и заменён `WebContentsView`. Метрики собираются через `view.webContents` по той же схеме, что и для окна/guest.  ([Electron][5])

### 2.6 Вспомогательные процессы

GPU, Utility, Zygote, Sandbox helper и прочие процессы Chromium учитываются в общей картине через `app.getAppMetrics()`.  ([Electron][1])

---

## 3. Фазы жизненного цикла

## 3.1 Phase A: Loading

### App-level timeline

```text
P0  process entry / first synchronous code in main
P1  will-finish-launching
P2  ready
P3  BrowserWindow created
P4  did-start-loading
P5  dom-ready
P6  did-finish-load
P7  IPC "app-ready"
```

`will-finish-launching` и `ready` различаются по платформам: на Windows и Linux `will-finish-launching` эквивалентен `ready`, а на macOS это отдельная более ранняя точка жизненного цикла. `ready` наступает после первого тика event loop main-процесса. ([Electron][6])

### `webview` timeline

```text
W1  webview attached
W2  webview did-start-loading
W3  webview dom-ready
W4  webview did-finish-load
W5  IPC "webview-ready"
```

Host `webContents` должен слушать:

* `will-attach-webview`
* `did-attach-webview`

Оба события происходят на **host `webContents`**, не на `BrowserWindow`. `did-attach-webview` отдаёт guest `WebContents`.  ([Electron][7])

### `iframe` timeline

Для `iframe` события привязываются к frame navigation:

* `did-start-navigation`
* `will-frame-navigate`
* `did-frame-navigate`
* `frame dom-ready` через `WebFrameMain`
* optional app-defined `"iframe-ready"` через postMessage/IPC-bridge, если внутри frame есть контролируемый код. ([Electron][7])

### Маркер “готово”

`did-finish-load` не считается финальным признаком готовности приложения для SPA. Итоговый маркер готовности — только явный IPC `"app-ready"` / `"webview-ready"` / `"frame-ready"` от контролируемого клиентского кода. 

---

## 3.2 Phase B: Running

После завершения загрузки мониторинг переходит в непрерывный режим:

* периодический сбор process metrics,
* self-report из renderer/preload,
* оконная агрегация и вычисление percentile’ей,
* выявление самых тяжёлых сущностей,
* детект дрейфа, утечек и деградации.

---

## 4. Модель идентичности сущностей

```yaml
AppRun:
  key:
    - appRunId
    - appVersion
    - electronVersion
    - chromeVersion
    - platform
    - arch
    - startTs

Process:
  key:
    - pid
    - creationTime
    - type

Window:
  key:
    - windowId
    - webContentsId
    - osPid

WebView:
  key:
    - hostWindowId
    - guestWebContentsId
    - osPid

Frame:
  key:
    - frameToken
    - processId
    - routingId
    - osProcessId

JsContext:
  key:
    - process.contextId
    - executionContextId
```

Рекомендуемый минимум для корреляции: `windowId`, `webContentsId`, `pid`, `url`, `title`, `creationTime`. Для OOPIF нужен ещё `frameToken`.   ([Electron][2])

---

## 5. Архитектура сбора данных

## 5.1 Главный принцип

Система строится по двухслойной модели:

### Слой 1: process-level metrics

Собирается из `main` через `app.getAppMetrics()`:

* CPU
* process memory
* process type
* creationTime

### Слой 2: self-reported renderer metrics

Собирается из `renderer/preload` и передаётся в `main`:

* `process.getProcessMemoryInfo()`
* `process.getHeapStatistics()`
* `webFrame.getResourceUsage()`
* drift lag / longtask
* preload timing marks
* optional memory delta points

Это позволяет разделить:

* **системную картину по процессам**,
* **внутрипроцессную картину по heap/cache/lag**.  

## 5.2 IPC transport

Transport между `renderer/preload` и `main` должен использовать именованные каналы Electron IPC. Каналы — произвольные и двунаправленные. ([Electron][8])

Рекомендуемые каналы:

```text
metrics:context:get
metrics:sample
metrics:phase
metrics:preload-points
metrics:webview-ready
metrics:app-ready
metrics:iframe-ready
```

### Требования к transport

* сообщения должны быть батчируемыми,
* должны содержать `scope`, `scopeId`, `metric`, `value`, `unit`, `labels`,
* отправка не должна ломать приложение при недоступности получателя,
* ошибки репорта не должны падать в user-visible crash path.

---

## 6. Обязательные метрики

## 6.1 App summary

### `app.summary.cpu`

Источник: суммирование `ProcessMetric.cpu.percentCPUUsage` из `app.getAppMetrics()`. Первый сэмпл CPU после старта считать warm-up и не использовать как полноценный delta-based `current`. `idleWakeupsPerSecond` на Windows всегда 0.  ([Electron][1])

Формат:

```yaml
cpu:
  current: number
  avg: number
  min: number
  max: number
  idleWakeupsPerSecond: number
```

### `app.summary.memory`

Источник: суммирование `ProcessMetric.memory`.
Единицы: KB.
`privateBytes` — Windows-only.  ([Electron][1])

Формат:

```yaml
memory:
  workingSetSize: number
  peakWorkingSetSize: number
  privateBytes: number | null
```

### `app.summary.processCount`

Источник: `app.getAppMetrics().length`.

### `app.summary.heaviestWindow`

Выбирается по weighted score:

* основной критерий: `workingSetSize`,
* вторичный: `percentCPUUsage`,
* tertiary: `p95 eventLoopLag`.

---

## 6.2 Main process

### `app.processes.main.cpu`

Источники:

* основной: `app.getAppMetrics()` с `type === 'Browser'`,
* fallback/validation: `process.cpuUsage()` или `process.getCPUUsage()`.

Единицы не смешивать:

* `app.getAppMetrics().cpu.percentCPUUsage` — percent,
* `process.cpuUsage()` — microseconds.  

### `app.processes.main.memory`

Источники:

* `app.getAppMetrics().memory`,
* `process.getProcessMemoryInfo()`,
* optional `process.memoryUsage()`.

Хранить отдельно:

```yaml
memory:
  processMetric:
    workingSetSize: number
    peakWorkingSetSize: number
    privateBytes: number | null
  processMemoryInfo:
    private: number
    shared: number
    residentSet: number | null
  nodeMemoryUsage:
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
    arrayBuffers: number
```

`residentSet` отсутствует на macOS; там ориентироваться на `private`.  ([Electron][1])

### `app.processes.main.eventLoopDelay`

Источник: `monitorEventLoopDelay()` + optional `eventLoopUtilization()`. Гистограмма возвращается в наносекундах, в отчёте хранить миллисекунды.  ([Node.js][3])

Формат:

```yaml
eventLoopDelay:
  min: number
  max: number
  mean: number
  p50: number
  p95: number
  p99: number
  elu: number | null
```

---

## 6.3 GPU / Utility / Helpers

### GPU

Фильтр: `type === 'GPU'`.
Собирать CPU и process memory.

### Utility

Фильтр: `type === 'Utility'`.
Дополнительно хранить `name` / `serviceName` для распознавания назначения процесса. ([Electron][1])

### Zygote / Sandbox helper / прочие

Фильтр по `ProcessMetric.type`.
Нужны для полной картины, но не участвуют в расчёте `heaviestWindow`, если явно не привязаны к UI-сущности.

---

## 6.4 BrowserWindow renderer

### CPU

`BrowserWindow.getAllWindows()` → `win.webContents.getOSProcessId()` → join с `app.getAppMetrics()`. `getOSProcessId()` возвращает OS PID ассоциированного renderer-процесса.  ([Electron][7])

### Memory

Process memory берётся из `app.getAppMetrics()`.
Renderer-level memory — через self-report `process.getProcessMemoryInfo()`.

### Heap

Источник: `process.getHeapStatistics()` в renderer/preload → IPC. Это полезно для JS-leak диагностики, но не отделяет preload от page без дополнительной атрибуции. 

### Blink cache

Источник: `webFrame.getResourceUsage()` → IPC.
Хранить:

```yaml
blinkCache:
  images: { count, size, liveSize }
  scripts: { count, size, liveSize }
  cssStyleSheets: { count, size, liveSize }
  fonts: { count, size, liveSize }
  xslStyleSheets: { count, size, liveSize }
  other: { count, size, liveSize }
```

### Event loop lag

Для portability использовать:

1. drift sampler,
2. `PerformanceObserver(type='longtask')`,
3. optional `requestAnimationFrame` drift.

Примерная сводка:

```yaml
eventLoopLag:
  mean: number
  max: number
  p50: number
  p95: number
  p99: number
  longTask:
    count: number
    totalMs: number
    maxMs: number
```

Практика drift + longtask прямо зафиксирована в ресерче как рабочий portable baseline для renderer. 

### Loading timing

```yaml
timing:
  created_to_dom_ready_ms: number
  dom_ready_to_load_ms: number
  load_to_app_ready_ms: number
  preload_duration_ms: number | null
  total_ms: number
```

---

## 6.5 `webview-tag`

`webview` — обязательная first-class сущность.

### Discovery

* host `webContents.on('will-attach-webview', ...)`
* host `webContents.on('did-attach-webview', ...)`

`will-attach-webview` позволяет изменить `webPreferences` и параметры guest перед загрузкой; `did-attach-webview` отдаёт guest `WebContents`.  ([Electron][7])

### Идентичность

```yaml
webview:
  hostWindowId: number
  hostWebContentsId: number
  guestWebContentsId: number
  osPid: number
  chromiumPid: number
  src: string
```

### Метрики

Для каждого `webview` обязательно собирать:

* process CPU
* process memory
* renderer self-memory
* heap
* blinkCache
* eventLoopLag
* loading timing
* `webview-ready` IPC

### Ограничение preload/page

Preload guest `webview` и page-код guest работают в одном renderer-процессе; их нельзя разделить как отдельные OS-process memory/CPU counters. Для этого допустимы только:

* preload timing marks,
* delta measurements,
* optional CDP CPU/Heap attribution по URL скриптов. 

### Безопасность

Поскольку preload у `<webview>` выполняется с node integration, недоверенному контенту нельзя позволять создавать `webview` с произвольным preload. Валидация preload и параметров должна идти в `will-attach-webview`. ([Electron][9])

---

## 6.6 `iframe`

## same-origin iframe

Поддерживается как логическая сущность, но не как отдельный process-level объект.

Собирать:

```yaml
sameOriginIframes:
  count: number
  frames:
    - frameToken: string | null
      url: string
      name: string | null
```

CPU/Memory — часть renderer top-level окна.

## cross-origin iframe / OOPIF

Поддерживается как first-class сущность при условии отдельного процесса.

### Discovery

* слушать frame navigation events,
* по `frameProcessId` и `frameRoutingId` получать `WebFrameMain.fromId(...)`,
* брать из `WebFrameMain`:

  * `frameToken`
  * `processId`
  * `routingId`
  * `osProcessId`
  * `origin`
  * `url`

`WebFrameMain.osProcessId` — это OS PID процесса, владеющего frame.  ([Electron][2])

### Метрики

```yaml
crossOriginIframes:
  <frameToken>:
    frameToken: string
    processId: number
    routingId: number
    osPid: number
    origin: string
    url: string
    cpu:
      percentCPUUsage: number
      idleWakeupsPerSecond: number
    memory:
      workingSetSize: number
      peakWorkingSetSize: number
      privateBytes: number | null
```

### Ограничение

Не обещать `rendererMemory`, `heap`, `blinkCache`, `eventLoopLag` per-OOPIF без собственного агента внутри данного frame/process. Это отдельное ограничение модели и оно должно быть явно записано. 

### Условие process-level атрибуции

Отдельный CPU/Memory attribution для iframe допустим только если frame действительно живёт в отдельном процессе, например когда `frame.osProcessId !== mainFrame.osProcessId`. 

---

## 6.7 `WebContentsView`

Для `WebContentsView` применяется та же схема, что для окна:

* `view.webContents.getOSProcessId()`
* `view.webContents.id`
* join с `app.getAppMetrics()`
* optional renderer self-report

Внутри спецификации `WebContentsView` должен идти как штатная совместимая сущность, но не заменять поддержку `webview`. 

---

## 7. Preload attribution

### Что можно обещать

* `preload_duration_ms`
* `preload_memory_delta`
* `preload_cpu_js_attribution` в диагностическом режиме
* `preload_contextId`

### Что нельзя обещать

* отдельный process-level CPU/Memory для preload,
* точный RSS/working set “только preload”.

### Минимальная стратегия

В preload снимать точки:

* `t0` — до тяжёлой инициализации,
* `t1` — после preload init,
* `t2` — после `dom-ready` или близкого прикладного рубежа.

Репортировать:

* `process.getProcessMemoryInfo()`
* `process.getHeapStatistics()`
* optional `process.memoryUsage()`
* `process.contextId`

Эта стратегия уже оформлена в ресерче как рабочий baseline. 

---

## 8. Диагностический режим

В дополнение к always-on мониторингу система должна поддерживать **on-demand diagnostic mode**:

### CDP mode

Через `webContents.debugger`:

* `Performance.getMetrics`
* `Profiler.start/stop`
* Runtime context inspection

### Tracing mode

Через `contentTracing`/CDP Tracing:

* memory dump,
* timeline,
* deeper CPU attribution.

Эти режимы включаются только по запросу или по feature flag, потому что увеличивают overhead и могут влиять на стабильность инструментирования. Для `webview` это особенно важно. 

---

## 9. Sampling policy

### Always-on production profile

```yaml
sampling:
  processMetricsIntervalMs: 1000
  rendererLagTickMs: 20
  rendererLagReportMs: 1000
  longTaskReportMs: 1000
  rendererMemoryIntervalMs: 5000
  heapIntervalMs: 5000
  blinkCacheIntervalMs: 5000
  aggregationWindowSamples: 60
```

Это соответствует практическим рекомендациям из ресерчей: `app.getAppMetrics()` раз в 1–5 секунд, `main` event loop lag раз в секунду, drift-lag в renderer с тиком 20–50 мс и репортом раз в 1 секунду.  

### Loading profile

Во время загрузки:

* писать event-based timestamps,
* CPU/memory snapshots брать на P0/P2/P3/P5/P6/P7,
* первый CPU sample не включать в агрегированную статистику.

---

## 10. Формат хранения

Рекомендуемый формат — **structured events**.

```yaml
event:
  ts: string
  appRunId: string
  phase: loading | running
  scope: app | process | main | window | webview | frame | context
  scopeId: string
  metric: string
  value: number | string | object
  unit: ms | kb | bytes | percent | count | ratio
  labels:
    processType: string | null
    windowId: number | null
    webContentsId: number | null
    frameToken: string | null
    url: string | null
    origin: string | null
```

Этот формат хорошо переносится в structured logs / ClickHouse / BigQuery / OTel-style pipelines. Основа этой схемы уже есть в memory research. 

---

## 11. Итоговый YAML-вид отчёта

```yaml
app:
  phase: "running"
  sampling:
    processMetricsIntervalMs: 1000
    rendererLagTickMs: 20
    rendererLagReportMs: 1000
    aggregationWindowSamples: 60

  summary:
    cpu:
      current: 0
      avg: 0
      min: 0
      max: 0
      idleWakeupsPerSecond: 0
    memory:
      workingSetSize: 0
      peakWorkingSetSize: 0
      privateBytes: null
    processCount: 0
    heaviestWindow: null

  processes:
    main:
      pid: 0
      creationTime: 0
      cpu: {}
      memory: {}
      eventLoopDelay: {}

    gpu:
      pid: 0
      creationTime: 0
      cpu: {}
      memory: {}

    utility: []

    windows:
      "<window-id>":
        webContentsId: 0
        pid: 0
        creationTime: 0
        cpu: {}
        memory: {}
        rendererMemory: {}
        heap: {}
        blinkCache: {}
        eventLoopLag: {}
        timing: {}

        webviews:
          "<guest-webContentsId>":
            pid: 0
            creationTime: 0
            src: ""
            cpu: {}
            memory: {}
            rendererMemory: {}
            heap: {}
            blinkCache: {}
            eventLoopLag: {}
            timing: {}

        sameOriginIframes:
          count: 0
          frames: []

        crossOriginIframes:
          "<frameToken>":
            frameToken: ""
            processId: 0
            routingId: 0
            osPid: 0
            origin: ""
            url: ""
            cpu: {}
            memory: {}

    webContentsViews: []

    zygoteAndHelpers: []
```

---

## 12. Ограничения модели

1. **Preload не имеет отдельного OS PID**.
2. **Same-origin iframe не имеет отдельного process-level CPU/Memory**.
3. **Per-OOPIF heap/blink/eventLoop нельзя обещать без агента внутри frame**.
4. **`privateBytes` доступен только на Windows**.
5. **`residentSet` из `process.getProcessMemoryInfo()` отсутствует на macOS**.
6. **CPU из `app.getAppMetrics()` — delta-based; первый sample нужно считать warm-up**.
7. **`webview` поддерживается обязательно, но требует повышенного внимания к security и preload validation**.   ([Electron][9])

---

## 13. Критерии приёмки

Спецификация считается принятой, если выполнены все пункты ниже.

### 13.1 Функциональные

* Есть явное разделение на **Phase A (Loading)** и **Phase B (Running)**.
* `webview-tag` описан как **обязательная first-class сущность**.
* `iframe` описан как **обязательная first-class сущность** с разделением на `same-origin` и `cross-origin/OOPIF`.
* `WebContentsView` описан как поддерживаемая альтернатива.
* Для `main`, `window`, `webview`, `iframe` определены:

  * идентичность,
  * источники метрик,
  * ограничения,
  * места вызова API.

### 13.2 Технические

* Source of truth для process-level CPU/Memory зафиксирован как `app.getAppMetrics()`.
* Везде, где нужен process mapping, используется `pid + creationTime`.
* Для окна и `webview` зафиксирован mapping через `webContents.getOSProcessId()`.
* Для OOPIF зафиксирован mapping через `WebFrameMain.fromId(...)` и `frame.osProcessId`.
* Разделены `MemoryInfo` из `app.getAppMetrics()` и `process.getProcessMemoryInfo()`.

### 13.3 Метрики

* Описаны CPU, Memory, EventLag, Heap, Blink cache.
* Для renderer/preload зафиксирована fallback-цепочка для lag:

  * drift,
  * `longtask`,
  * optional richer instrumentation.
* Зафиксировано, что `did-finish-load` не равен `app-ready` для SPA.
* Зафиксировано, что preload нельзя измерять как отдельный OS-процесс.

### 13.4 Эксплуатационные

* Есть sampling policy для always-on режима.
* Есть отдельный diagnostic mode.
* Есть structured output format.
* Ошибки сбора метрик не должны приводить к crash приложения.

### 13.5 Границы обещаний

* Спецификация не обещает невозможные данные:

  * отдельный RSS только для preload,
  * per-OOPIF heap/cache/lag без агента,
  * отдельные process metrics для same-origin iframe.

Если хотите, следующим сообщением я превращу это в ещё более “документный” вариант: в стиле вашего исходного markdown, без пояснений и уже с финальным блоком YAML/таблиц для прямой вставки в репозиторий.

[1]: https://electronjs.org/docs/latest/api/structures/process-metric?utm_source=chatgpt.com "ProcessMetric Object"
[2]: https://electronjs.org/docs/latest/api/web-frame-main "webFrameMain | Electron"
[3]: https://nodejs.org/api/perf_hooks.html?utm_source=chatgpt.com "Performance measurement APIs | Node.js v25.9.0 ..."
[4]: https://electronjs.org/docs/latest/api/webview-tag?utm_source=chatgpt.com "`<webview>` Tag"
[5]: https://electronjs.org/docs/latest/breaking-changes?utm_source=chatgpt.com "Breaking Changes"
[6]: https://electronjs.org/docs/latest/api/app "app | Electron"
[7]: https://electronjs.org/docs/latest/api/web-contents "webContents | Electron"
[8]: https://electronjs.org/docs/latest/tutorial/ipc?utm_source=chatgpt.com "Inter-Process Communication"
[9]: https://electronjs.org/docs/latest/api/browser-window "BrowserWindow | Electron"
