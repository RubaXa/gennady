# 33a — Слой правил «с нуля»: объяснение, микропримеры и дизайн перегрузки

> Статус: ОБЪЯСНЕНИЕ + ПРЕДЛОЖЕНИЕ. Пишется по D-24 («вопрос не понят в предложенной форме»). Читается независимо: ни один другой документ плана знать не нужно.
> Направление оператора, зафиксированное в D-24: должны быть **базовые правила, перегружаемые проектными**; механизм — через `gennady.yaml` **или** через соглашение (overlay-каталог); учесть, что `sdd-state` и логические развилки flow могут влиять на использование правил.
> Все `file:line` даны от корня соответствующего чекаута. MAIN = `…/worktrees/nice-panini-8aa14e` (v1, `origin/main`). RC = `…/scratchpad/rc-v6` (v2). Потребители: `cloud-ios` @ `origin/ap/CLOUDIOS-NOISSUE-swiftlint-exceptions-infra-base`, `messenger` (рабочее дерево).

---

## 1. Что такое правило и реестр

### 1.1 Правило — это файл

Правило — один XML-подобный файл в `ai/directives/{coding,testing,infra}`. Он несёт четыре обязательные секции. Их удобно читать как четыре вопроса.

| Секция | Вопрос | Кто читает |
|---|---|---|
| `<BeliefState>` | что мы считаем правдой (аксиомы) | phase-subagent, audit |
| `<AntiPatterns>` | что запрещено (пара `<Bad>`/`<Instead>`) | phase-subagent, audit |
| `<VerificationHooks>` | как это проверяется (команда + ожидание) | phase-subagent, audit |
| `<RewardCriteria>` | что считаем «хорошо» (плоский список ✅/❌) | audit, первый проход compliance |

Микропример — стек-агностичное правило из MAIN, `ai/directives/coding/baseline-rules.xml:9-15`:

```
<BeliefState>
  <Axiom id="AX_TELEOLOGICAL_NAMING">
    A name states a goal, not a pattern. Forbidden semantic-noise names: `Manager`, `Handler`,
    `Data`, `Info`, `Wrapper`, `Util`, `do…`, `process…`.
  </Axiom>
```

И его «как проверяем» — `baseline-rules.xml:74-79`:

```
<VerificationHooks>
  <Hook id="HOOK_PROJECT_GATE">
    <Purpose>The scope's own quality gate … passes on the changed files.</Purpose>
    <Command>&lt;sdd-path&gt; verify --wip &lt;target-files&gt;</Command>
    <Expected>Exit 0. If the scope has not declared its gate yet, that is the finding to fix first.</Expected>
```

Опционально файл несёт `<DependsOn>` — «это правило архитектурно расширяет вот эти». MAIN `ai/directives/coding/go-rules.xml:8-11`:

```
<DependsOn>
  - ai/directives/coding/baseline-rules.xml
  - ai/directives/testing/baseline-testing.xml
</DependsOn>
```

Важно: сам файл правила **не знает**, когда он включается. Он знает только «что требуется».

### 1.2 Реестр — это таблица активации

Реестр `ai/directives/knowledge.xml` несёт **другой** набор полей — не «что требуется», а «включается ли». Форма записи:

```
<Rule id="<rule-id>">
  <File>ai/directives/<category>/<rule>.xml</File>   <!-- где лежит файл -->
  <Triggers>…</Triggers>                             <!-- условие включения -->
  <SkipWhen>…</SkipWhen>                             <!-- контр-условие -->
  <CheckPhase>typecheck|test|lint|format</CheckPhase>
  <RequiresVerification>check-command</RequiresVerification>
</Rule>
```

Живой пример из RC, `ai/directives/knowledge.xml:6-14` (пять несущих строк):

```
<Rule id="typescript-rules">
  <File>ai/directives/coding/typescript-rules.xml</File>
  <Triggers>Target Files include source code files (not config)</Triggers>
  <SkipWhen>Config-only task; infra-setup task without code files</SkipWhen>
  <CheckPhase>typecheck</CheckPhase>
```

Тот же `id` в реестре, который написал **сам проект** — `cloud-ios/ai/directives/knowledge.xml:63-69` (Swift):

```
<Rule id="swift-rules">
  <File>ai/directives/coding/swift-rules.xml</File>
  <Triggers>Target Files include .swift · task adds a service, module or unit test</Triggers>
  <SkipWhen>Config-only task; change confined to Objective-C (use objc-rules)</SkipWhen>
  <CheckPhase>lint</CheckPhase>
```

Ещё в реестре один глобальный порядок фаз. У пакета — `RC/knowledge.xml:3` `<CheckPhaseOrder>typecheck test lint format</CheckPhaseOrder>`; у `cloud-ios` — свой, `:54` `<CheckPhaseOrder>lint build test</CheckPhaseOrder>` (нет `typecheck`, потому что типы проверяет сборка).

**Разделение обязанностей, которое стоит запомнить:** реестр решает «включается ли», файл правила решает «что требуется» и «что ещё обязательно прочитать».

### 1.3 Cascade Table в тикете — «какие правила у этого скоупа»

Когда скоуп нарезается на тикеты, scaffold один раз выписывает таблицу «тир × категория». Пример реальный, `cloud-ios/tasks/infra-base/README.md:15-19`:

```
| Tier | coding | testing | architecture | infra |
|---|---|---|---|---|
| traversed-scopes | — | — | — | — |
| infra-base (target) | swift-rules | xctest-rules | — | swiftlint-setup |
| task | swift-rules | xctest-rules | — | swiftlint-setup |
```

Тир `task` — это ручное решение оператора «подключить правило этому тикету, даже если `<Triggers>` его не поймали». Там же, `:23`, дословный разбор: у фазы с `Target Files` = только `CODEOWNERS` «вывод по `<Triggers>` даёт пустое множество», и оба правила подключены решением тикета.

### 1.4 Как правило попадает в фазу и как его читает воркер

В тикете правила живут **внутри блока фазы**, только ссылками. RC, `specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md:60-61`:

```
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
```

Пустой набор — легальная запись; там же `:177`:

```
- **Rules:** _(none — JSON-конфиг приложения, не покрыт триггером ни одного правила каскада)_
```

Phase-subagent читает **только** блок своей фазы и только перечисленные там правила. Он не обходит `<DependsOn>` в рантайме — поэтому список фазы обязан быть уже транзитивно замкнут. Это и проверяет единственный код правил в v2: `RC/shared/sdd/rules-cascade.ts:56-82`, `SDD_RULES_CASCADE_UNRESOLVED`.

Кто печатает эти ссылки: `RC/shared/sdd/task-authoring-literals.ts:81-91`:

```
export function loadRuleRegistry(repoRoot: string): RuleRegistryEntry[] {
  const projectRegistry = posix.join(repoRoot…, 'ai/directives/knowledge.xml');
  if (existsSync(projectRegistry)) return parseRuleRegistry(readFileSync(projectRegistry, 'utf-8'));
  return parseRuleRegistry(readFileSync(packageRegistry, 'utf-8'));
}
```

Читайте это буквально: **либо проектный реестр, либо пакетный. Слияния нет.** Это единственное место, где сегодня решается, «чьи правила знает CLI».

---

## 2. Что ломается сегодня — три сцены

### Сцена (a). Swift-проект получает правило TypeScript

`RC/ai/directives/knowledge.xml:9` объявляет у `typescript-rules` триггер `Target Files include source code files (not config)` — «любой исходник любого языка». Файлов правил для swift/python/go/rust в RC нет вообще.

Дальше `sdd-new` печатает кортежи «id + href» **механически из реестра** (`RC/cli/cmd/sdd-new/help.ts:92`, `sdd-new.types.ts:314`). То есть это не «модель может ошибиться в активации» — CLI детерминированно впишет `typescript-rules` в Swift-тикет.

Для сравнения, MAIN этот триггер уже сузил — `MAIN/ai/directives/knowledge.xml:79-80`: `Target Files include .ts / .tsx source files`, `<SkipWhen>` «non-TypeScript language (see python-rules / go-rules)».

### Сцена (b). `gennady sync` перезаписывает проектный реестр

В MAIN реестр защищён — `MAIN/cli/cmd/sync/sync-core.ts:23-27`:

```
// `knowledge.xml` is the rule registry: a non-Node project rewrites it for its own stack…
export const PROJECT_OWNED_ENTRIES = new Set(['knowledge.xml']);
```

и `:239-241` даёт ему статус `preserved` — файл никогда не пишется поверх.

В RC этого нет: `knowledge.xml` — обычный файл зеркала, идёт как `updated` и перезаписывается; а файл правила проекта внутри пакетной категории **удаляется** (`RC/cli/cmd/sync/sync-core.ts:233-244`, `status: 'deleted'` + `deps.unlink`). Последствие описано в issue #24: `cloud-ios` терял свой пятиправильный Swift-реестр **трижды**, и каскад правил следующих тикетов шёл от пустого/чужого реестра. Под тем же ударом — проектный `messenger/ai/directives/coding/logging-rules.xml` (запись `logging-rules` в их реестре — `messenger/ai/directives/knowledge.xml:70-78`).

### Сцена (c). Baseline-правила из MAIN зовут команду, которой в v2 нет

`MAIN/ai/directives/coding/baseline-rules.xml:78` несёт `<Command>&lt;sdd-path&gt; verify --wip &lt;target-files&gt;</Command>`. В RC команды `verify` и флага `--wip` не существует (есть `sdd-verify`). Порт «как есть» поставит в ядро v2 два хука с мёртвой командой. Решение уже принято Lead'ом (L-8): при порте оба `<Command>` переписываются под `sdd-verify --task --phase`.

---

## 3. Три слоя, которые нужно развести

| Слой | Что в нём | Владелец |
|---|---|---|
| (i) **базовые языконезависимые** | `coding/baseline-rules.xml`, `testing/baseline-testing.xml` | пакет |
| (ii) **стековые** | per preset: `typescript-rules` (node), `go-rules` (golang), `python-rules`, `swift-rules` | пакет / пресет стека |
| (iii) **проектные и перегрузки** | `coding/logging-rules.xml`, `coding/swift-rules.xml`, отключения, правки `<Triggers>`/`<ActivationHint>` | проект |

Слой (i) уже написан и работает — в MAIN, коммит `5a237cd5`. Слой (ii) в MAIN есть текстом (`python-rules`, `go-rules`), в RC отсутствует целиком. Слой (iii) сегодня существует только у потребителей, и только потому, что они переписали реестр руками.

**Что значит «перегрузить» — два разных действия, и их полезно не путать.**

Пример 1 — проект **отключает** пакетное правило на части файлов. Он хочет, чтобы `typescript-rules` не активировалось на `.d.ts`:

```
<Rule id="typescript-rules">
  <SkipWhen>Config-only task; declaration-only change (*.d.ts) — see project ADR-14</SkipWhen>
</Rule>
```

Это правка **активационного поля**, файл правила не меняется. Ровно так `cloud-ios` уже перегрузил пакетное `git-setup`: оставил пакетный файл, но переписал `<ActivationHint>` — «Two deviations in this repository … Take the discipline, not the examples».

Пример 2 — проект **добавляет** своё правило:

```
<Rule id="logging-rules">
  <File>ai/directives/coding/logging-rules.xml</File>
  <Triggers>Target Files write to the log · task adds a new log call site</Triggers>
  <CheckPhase>lint</CheckPhase>
</Rule>
```

Первое действие требует, чтобы проект мог **изменить пакетную запись**. Второе — только чтобы он мог **добавить свою**. Механизмы ниже отличаются в основном ценой первого действия.

---

## 4. Три механизма перегрузки — на примере одного проекта

Дальше всё показано на одном сквозном примере: Swift-проект (`cloud-ios`-подобный), которому нужны (1) базовые правила из пакета, (2) свои `swift-rules`, (3) отключение `typescript-rules`.

### (A) Реестр целиком принадлежит проекту

Как в MAIN сегодня. Пакет **seed'ит** `knowledge.xml`, если файла нет, и больше никогда его не трогает.

Файл проекта (что видно на диске):

```
<AiKnowledge ver="2.0">
  <Rules>
    <CheckPhaseOrder>lint build test</CheckPhaseOrder>
    <Coding><Rule id="swift-rules"><File>ai/directives/coding/swift-rules.xml</File>…</Rule></Coding>
    <Testing><Rule id="xctest-rules">…</Rule></Testing>
  </Rules>
```

- **`sync`**: видит расхождение, ставит статус `preserved`, файл не пишет (`MAIN/sync-core.ts:239-241`). Файлы правил пакета при этом продолжают приезжать на диск.
- **`sdd-new` / scaffold**: `loadRuleRegistry` находит проектный файл и читает **только его** (`task-authoring-literals.ts:81-91`). `typescript-rules` в тикеты не попадает никогда — записи нет.
- **`sdd-check`**: замыкание каскада работает как сейчас. Нужен один новый чек: каждый `<File>` реестра существует на диске, и каждый файл каскадной категории на диске либо зарегистрирован, либо достижим по `<DependsOn>`. Он ловит и висячую ссылку, и «файл есть, записи нет».
- **Плюсы**: ноль новой механики; ноль миграции; отключение правила = «не писать запись» (уже работает: `parseRuleRegistry` молча отбрасывает запись без `<File>`).
- **Минусы**: проект, тронувший реестр, **замораживает активационную семантику всех правил**. Пакет сузил `<Triggers>` у `typescript-rules` — проект этого не увидит. Базовые правила ядра, добавленные после того как проект написал свой реестр, **сами не подключатся**: файлы приедут, записи не появятся. Это ровно то, что противоречит формулировке D-24 «базовые правила, которые можно перегрузить проектными».
- **Миграция**: `cloud-ios` — нулевая (он уже так живёт). `messenger` — нулевая.
- **Детекция стека**: реестр в этой схеме от детекции не зависит; детекция нужна только чтобы пакет не раздавал swift-репозиторию файлы правил Go (сегодня `golang-setup.xml` физически лежит в iOS-репозитории).
- **Развилки flow**: никак не влияют. Набор правил — функция от реестра и `Target Files`, и только.

### (B) Слои по `id`

Пакетный реестр остаётся пакетным и обновляется. Проект объявляет **дельту**. Два подварианта — где лежит дельта.

**(B1) второй XML: `ai/directives/knowledge.local.xml`.**

```
<AiKnowledge ver="2.0">
  <Rules>
    <Rule id="typescript-rules"/>                                  <!-- пусто = подавление -->
    <Rule id="swift-rules"><File>ai/directives/coding/swift-rules.xml</File>…</Rule>
  </Rules>
```

**(B2) секция в `gennady.yaml`** — файле, который у проекта уже есть и который пакет вообще не синхронизирует:

```
rules:
  disable: [typescript-rules, svelte5-runes]
  override:
    git-setup: { activationHint: "Two deviations in this repository — take the discipline, not the examples" }
  add:
    - { id: logging-rules, file: ai/directives/coding/logging-rules.xml, triggers: "Target Files write to the log", checkPhase: lint }
```

Результат слияния, который увидит CLI (порядок «последний побеждает по `id`»):

```
пакет:   baseline-rules, typescript-rules, testing-common, node-test, git-setup
пресет:  (swift) swift-rules, xctest-rules, swiftlint-setup
проект:  −typescript-rules  −svelte5-runes  +logging-rules  ~git-setup(ActivationHint)
итог:    baseline-rules, testing-common, node-test, git-setup*, swift-rules, xctest-rules,
         swiftlint-setup, logging-rules
```

- **`sync`**: пакетный `knowledge.xml` становится обычным package-owned файлом и перезаписывается всегда. `knowledge.local.xml` (B1) — `preserved`. `gennady.yaml` (B2) синк не трогает вовсе — он вне `ai/directives/`.
- **`sdd-new` / scaffold**: `loadRuleRegistry` перестаёт быть «или-или» и возвращает merge. Обязательное условие: дедупликация `id` **до** `parseRuleRegistry` — сейчас он **бросает** на дубле (`task-authoring-literals.ts:70`), а при слоях дубль `id` становится нормой.
- **`sdd-check`**: тот же `<File>`-existence-чек, плюс новые находки «дельта ссылается на `id`, которого нет ни в одном слое» и «слой подавил правило, на которое ссылается `<DependsOn>` другого активного правила».
- **Плюсы**: пакет может обновлять `<Triggers>` своих правил у живого проекта; базовые правила ядра подключаются сами; дельта проекта короткая и читаемая — видно, что именно проект решил иначе.
- **Минусы**: новая механика (парсер слоёв + merge + статусы в `sync`); в B1 — два реестра в одном каталоге, и агент может записать правило не туда; в B2 — активационная семантика начинает жить в двух синтаксисах, и `<Triggers>` в YAML либо теряет выразительность, либо становится тем же XML другими буквами.
- **Миграция — главная цена.** У `cloud-ios` и `messenger` **уже** есть полный проектный `knowledge.xml`. В момент включения слоёв пакетный слой возвращается: `typescript-rules` снова становится активным в iOS-репозитории. Без явного миграционного шага (B) — регресс для обоих. Дешёвое лечение: считать существующий проектный `knowledge.xml` с непустым `<Rules>` признаком «legacy full-ownership» и в этом режиме вести себя как (A), пока проект не объявит `rules:`/`knowledge.local.xml`.
- **Детекция стека**: (B) — единственный вариант, в который пресет стека может **добавлять записи реестра**, а не только файлы. Это закрывает разрыв, который сегодня виден на `golang-setup`: файл доезжает до потребителя, а записи `<Rule id="golang-setup">` в реестре нет вообще — значит `<Triggers>` не могут его активировать никогда.
- **Развилки flow**: (B) — естественное место, где условие на `sdd-state` может стать полем записи (см. §4.4 ниже).

### (C) Overlay-каталог `ai/directives.local/`

Проект зеркалит пути пакета в отдельном корне; при совпадении пути побеждает overlay.

```
ai/directives/coding/typescript-rules.xml        ← пакет
ai/directives/knowledge.xml                      ← пакет
ai/directives.local/coding/swift-rules.xml       ← проект
ai/directives.local/knowledge.xml                ← проект (дельта или полный реестр)
```

- **`sync`**: тривиально — второй корень пакету неизвестен, он его не видит и не удаляет. Это самая честная защита от сцены (b).
- **`sdd-new` / scaffold**: **все** потребители путей должны научиться резолвить «сначала local, потом base». Сегодня таких потребителей много: `loadRuleRegistry`, `normalizeRulePath`, `getRuleDeps`, ссылки в тикетах (`../../../ai/directives/...` — путь **записан в закрытые тикеты**, и он указывает в базовый корень).
- **`sdd-check`**: ко всем чекам добавляется вопрос «какой из двух путей проверяем»; ссылки в старых тикетах становятся неоднозначными.
- **Плюсы**: один механизм для правил, реестра и всех остальных директив; не нужен merge XML внутри одного файла.
- **Минусы**: самый большой объём правок; двойное дерево путает агента (та же категория в двух местах); ломает свойство «агент открывает один файл и видит весь набор правил».
- **Миграция**: и `cloud-ios`, и `messenger` должны **переложить** свои файлы в новый корень и поправить пути в закрытых тикетах — самая дорогая из трёх.
- **Важная оговорка.** Трек SYNC уже пришёл к более дешёвой форме той же идеи: «подкаталог `ai/directives/`, которого пакет не поставляет, синк не трогает» — это **уже работает** в RC (непоставляемая категория репортится как `warnings` и остаётся на месте). Рекомендация трека SYNC: задокументировать соглашение `ai/directives/local/` **внутри** существующего корня и закрепить тестом, а второй корень `ai/directives.local/` не вводить. Тогда (C) даёт свою пользу без правки резолва путей.

### 4.4 Стек и развилки flow: где живёт какое решение

Здесь три разных вопроса, и их полезно не смешивать.

**«Swift-репозиторий должен включить swift-правила» — где живёт это решение?** Проверено по коду: **каскаду `STACK=` не нужен**. `<Triggers>` у языковых правил написаны по расширениям Target Files — `MAIN/knowledge.xml:88` «Target Files include .py source files», `:98` «… .go source files», `cloud-ios/knowledge.xml:66` «… .swift». Активация выводится из фактов задачи, а не из стека. Три роли распределяются так:

| Решение | Где живёт | Почему там |
|---|---|---|
| включить правило на этой фазе | реестр, `<Triggers>`/`<SkipWhen>` | зависит от `Target Files`, не от стека |
| **доставить** файл правила в дерево | детекция стека (`detectStacks`), гейтирующая `extraSourceDirs` | иначе iOS-репозиторий получает `golang-setup.xml`, как сегодня |
| раскрыть `<RequiresVerification>check-command</RequiresVerification>` в команду | пресет стека / Verification Commands infra-спеки | у `cloud-ios` этот алиас **не резолвится**, и они записали это прозой прямо в реестр (`knowledge.xml:56-60`) |

**Что из `sdd-state` реально может влиять на правила.** `sdd-state` печатает машинно-читаемый снапшот (`RC/cli/cmd/sdd-state/sdd-state.types.ts:104-143`): `FLOW_VERSION=`, `PORTAL=`, блок `[READINESS]`, `READINESS=ready|provisional|not-ready`, `AUTHORING_READY=`, `EXECUTION_READY=`, `AUTHORING_SCOPE=`, `GATE_QUEUE=`. Строки `STACK=` там пока нет.

Развилки, которые содержательно меняют смысл правил:

1. `READINESS=provisional` — гейты проекта ещё заглушки; impl/test-фазы заблокированы, `bootstrap/scaffold` разрешены. Хук `HOOK_PROJECT_GATE` в этом состоянии проверяет **несуществующий** гейт. Правило формально активно, а его «как проверяем» неисполнимо.
2. `EXECUTION_READY=no` + непустой `GATE_QUEUE=` — исполняются только задачи-владельцы недостающих гейтов; `sdd-verify` даёт таким фазам профиль `setup`. Осмысленный набор здесь — infra-правила, а не coding.
3. `FLOW_VERSION=v1` — дерево ещё не миграровано, тикеты живут в `tasks/`, Cascade Table лежит в другом файле.

Отсюда — развилка дизайна, которую надо назвать явно: делать ли условие на состояние **машинным полем записи** (например `<ActiveWhen>readiness != not-ready</ActiveWhen>`) или оставить его прозой `<ActivationHint>`, а состояние пусть решает только «исполняется ли фаза вообще». Дешёвый и достаточный компромисс, который я предлагаю: состояние **не** влияет на состав правил; оно влияет ровно на один хук — гейт проекта, — и это выражается в самом baseline-правиле формулировкой `<Expected>`: «если скоуп ещё не объявил свой гейт, это и есть первая находка» (она уже написана так в `MAIN/baseline-rules.xml:79`). Никакого нового поля схемы не требуется. Вопрос вынесен оператору (Q3).

---

## 5. Рекомендация

**Сейчас (в релиз): механизм (A) плюс полный слой (i)+(ii) от пакета. Целевое: механизм (B2) — дельта в `gennady.yaml`.**

Обоснование по уже принятым решениям:

- **D-22** («минимальный набор владения — гейт релиза; хэш-модель — целевая архитектура после релиза»). (A) — это ровно порт `f74c8c1d`: `PROJECT_OWNED_ENTRIES` + статус `preserved`, плюс отключение зеркального удаления проектного файла внутри пакетной категории. Ноль новых модулей, ноль миграции.
- **D-25** («baseline + go-rules переносятся; python-rules — при первом реальном python-проекте»). Слой (i) и половина слоя (ii) переносятся из MAIN как есть; `<Triggers>` у `typescript-rules` сужается до `.ts/.tsx` (в MAIN такой `<SkipWhen>` уже написан — `knowledge.xml:80`). Именно это, а не механизм владения, устраняет сцену (a).
- **D-13..D-16** (публичный `verify` только `--plan --json`; порядок стеков anystack → golang → python → swift). Значит `<Command>` baseline-хуков переписывается под `sdd-verify` сразу (L-8), а стековые правила появляются в том же порядке, что и пресеты. Реестр при этом ждать пресетов не обязан: активация идёт по расширениям.
- **Верифицированный анализ 33-TRACK-RULES.md §4.6**: рекомендация R-A′ сейчас / R-B как целевое. Главный довод против немедленного R-B — обязательный миграционный шаг, без которого R-B **регрессирует** для обоих живых потребителей.

**Честная оговорка, которую нужно проговорить.** Механизм (A) буквально **не** даёт того, что сформулировано в D-24: при (A) базовые правила не «перегружаются проектными» — проект забирает реестр целиком, и новые базовые правила пакета к нему сами не подключатся. (A) даёт максимальную власть перегрузки ценой того, что перегружается **всё сразу**. Поэтому предложение из двух шагов, а не из одного:

- **Шаг 1 (релиз).** (A) + baseline/go в пакетном seed'е + `<File>`-existence/unregistered-чек + гейтирование доставки файлов правил детекцией стека. Плюс одна маленькая, но важная вещь: пакет обязан печатать при `sync` строку вида «реестр сохранён как проектный; N новых пакетных записей не подключено: baseline-rules, baseline-testing, go-rules» — тогда замораживание становится **видимым**, а не тихим.
- **Шаг 2 (следующий срез, после релиза).** (B2): секция `rules:` в `gennady.yaml` как слой дельты, `loadRuleRegistry` возвращает merge, дедупликация `id` до `parseRuleRegistry`. Совместимость даром: проект с непустым `<Rules>` в своём `knowledge.xml` остаётся в режиме (A), пока не объявит `rules:`. `cloud-ios` и `messenger` не мигрируют вообще, а новый проект сразу живёт по (B2).

**Почему `gennady.yaml`, а не второй XML.** Файл уже существует и уже принадлежит проекту: `MAIN/gennady.yaml:1-11` держит `stack.node.skipGates`/`overrideGates`, `cloud-ios/gennady.yaml:13-14` — `stack: use: [anystack]` и десяток `extraGates`. Это один и тот же жанр решения — «чем этот репозиторий отличается от дефолта пакета». Второй XML рядом с первым добавляет риск «агент записал правило не туда»; YAML такого риска не создаёт, потому что лежит в другом месте и имеет другой синтаксис.

### «Как это связано с `knowledge.xml`»

Прямой ответ, одной цепочкой:

1. `knowledge.xml` — это **таблица активации**, единственное место, где сказано «правило с таким `id` включается при таких условиях и лежит вот здесь».
2. «Базовые правила» из D-24 — это записи в этой таблице (`baseline-rules`, `baseline-testing`) плюс их файлы. Файлы приезжают синком; **работают они только если про них есть запись**.
3. «Перегрузить проектными» — это изменить или дополнить **записи** этой таблицы. Значит вопрос «через `gennady.yaml` или через overlay-каталог» — это и есть вопрос «где лежит проектная дельта таблицы».
4. Поэтому «владение `knowledge.xml`» — не бюрократия, а выбор из трёх: проект забирает таблицу целиком (A), проект объявляет дельту (B), проект кладёт свою копию рядом в другом корне (C).
5. И ещё один жёсткий факт, из-за которого это блокер релиза, а не тема на будущее: `loadRuleRegistry` сегодня читает «проектный ИЛИ пакетный», а `sync` в v2 проектный **перезаписывает**. То есть без решения по владению каскад правил у потребителя обнуляется при первом же обновлении пакета — это уже происходило трижды у `cloud-ios`.

---

## 6. Вопросы оператору

### Q-1. Где лежит проектная дельта правил?

- **(a) Нигде: проект забирает реестр целиком** (механизм A, как в MAIN). Проект пишет и правит `knowledge.xml` руками; пакет его никогда не трогает. Последствие: `cloud-ios` и `messenger` продолжают работать без единой правки, но новые базовые правила пакета к ним сами не подключатся — только с уведомлением при `sync`.
- **(b) В `gennady.yaml`, секция `rules: {disable, override, add}`** (механизм B2). Последствие: базовые правила пакета обновляются сами; `cloud-ios`/`messenger` не мигрируют, пока не объявят `rules:` — но появляется новый модуль слияния и вторая нотация активационных полей.
- **(c) Во втором XML `ai/directives/knowledge.local.xml`** (механизм B1). Последствие: одна нотация вместо двух, зато два реестра в одном каталоге и риск, что агент запишет правило не в тот файл.
- **(d) В overlay-каталоге** (механизм C). Последствие: самая простая защита от `sync`, но нужно переложить файлы у обоих потребителей и поправить пути правил в уже закрытых тикетах.

### Q-2. Что делать с проектом, у которого реестр уже написан, когда включатся слои?

- **(a) Автоматически распознавать «legacy full-ownership»**: непустой `<Rules>` в проектном `knowledge.xml` = режим (A), слои не применяются. Последствие: у `cloud-ios` и `messenger` не меняется ничего и никогда, пока они сами не захотят.
- **(b) Явный миграционный шаг** (`gennady sdd-migrate rules`): показать diff, превратить проектный реестр в дельту. Последствие: оба потребителя получают обновляемые базовые правила, но обязаны один раз выполнить шаг и проверить результат; пропуск шага = `typescript-rules` снова активен в iOS-репозитории.
- **(c) Слои только для новых проектов** (opt-in флагом в `gennady.yaml`). Последствие: ноль риска для живых потребителей, но два режима поведения в пакете навсегда.

### Q-3. Влияет ли состояние flow (`sdd-state`) на состав правил?

- **(a) Нет.** Состав правил — функция реестра и `Target Files`; `READINESS`/`GATE_QUEUE` влияют только на то, исполняется ли фаза. Последствие: ничего не добавляется в схему; `cloud-ios` в состоянии `provisional` увидит активный `HOOK_PROJECT_GATE` с неисполнимой командой — и это будет первой находкой, как и написано в `<Expected>`.
- **(b) Да, машинным полем** (`<ActiveWhen>`) — правило можно объявить неактивным при `READINESS=not-ready` или при определённом `STACK=`. Последствие: набор правил становится честнее, но добавляется поле схемы, которое обязаны читать и `sdd-new`, и `sdd-check`, и аудит; у обоих потребителей реестры придётся дополнить.
- **(c) Частично: только гейт-хук**. Состав правил не зависит от состояния, но `<VerificationHooks>`, чья команда не резолвится в текущем состоянии, помечается как «отложенный», а не «проваленный». Последствие: `cloud-ios` (у которого `check-command` не резолвится вовсе) перестаёт получать шум на каждой фазе; цена — одно новое понятие в аудите.
