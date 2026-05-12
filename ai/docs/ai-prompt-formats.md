<Module_ID id="PROMPT_FORMATS_RESEARCH_2026" />

# Prompt Formats

## Модуль 1. Главное различие: format of prompt vs format of output

- **Суть:** Самая частая ошибка в prompt engineering — путать формат, в котором удобно управлять моделью, с форматом, в котором удобно получать структурированный результат.
- **Ресерч:** [Large Language Models Might Not Care What You Are Saying: Prompt Format Beats Descriptions](https://aclanthology.org/2025.findings-emnlp.3/), [Rethinking the Role of Demonstrations: What Makes In-Context Learning Work?](https://aclanthology.org/2022.emnlp-main.759), [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172).

## Модуль 2. Markdown как рабочий базовый формат

- **Суть:** Для большинства prompts Markdown остается самым удобным human-readable форматом. Он легкий, быстро редактируется и хорошо работает на коротких и средних дистанциях.
- **Ресерч:** [Large Language Models Might Not Care What You Are Saying: Prompt Format Beats Descriptions](https://aclanthology.org/2025.findings-emnlp.3/).

## Модуль 3. XML-like как формат длинного протокола

- **Суть:** Для длинных, многодокументных и многослойных prompts обычно выигрывает не "чистый XML ради XML", а XML-like layout: парные теги как каркас, Markdown или plain text внутри секций.
- **Ресерч:** [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172), [Large Language Models Might Not Care What You Are Saying: Prompt Format Beats Descriptions](https://aclanthology.org/2025.findings-emnlp.3/).
- **Практические рекомендации вендоров:** [Anthropic: Use XML tags](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags).

## Модуль 4. Почему YAML — плохой default для prompt

- **Суть:** YAML не является "запрещенным" научно, но как основной формат промпта это почти всегда слабый инженерный выбор: неявные границы, хрупкость к отступам, слабая парность секций, плохая работа с длинными текстовыми блоками.
- **Ресерч:** [Evaluating the Impact of Input Format on LLM Performance: JSON vs. YAML vs. Text](https://doi.org/10.1109/FMLDS67896.2025.00072), [Large Language Models Might Not Care What You Are Saying: Prompt Format Beats Descriptions](https://aclanthology.org/2025.findings-emnlp.3/).

## Модуль 5. Почему JSON — плохой prompt-format, но хороший output-format

- **Суть:** JSON полезен там, где нужен schema-bound output или state data. Но как основной язык постановки задачи он обычно проигрывает Markdown и XML-like layout по читаемости и управляемости.
- **Ресерч:** [Evaluating the Impact of Input Format on LLM Performance: JSON vs. YAML vs. Text](https://doi.org/10.1109/FMLDS67896.2025.00072), [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172).
- **Практические рекомендации вендоров:** [Anthropic: Prompting best practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices).

---

### Общая картина

Форматы в prompt engineering лучше оценивать по четырем вопросам:

1. Насколько хорошо человек видит границы секций.
2. Насколько легко модели понять, где инструкция, где данные, где примеры.
3. Насколько формат устойчив на длинном контексте.
4. Подходит ли он для управления моделью или только для структурированного вывода.

Из этого следует практическое правило:

- `Markdown` — хороший базовый prompt-format.
- `XML-like` — хороший формат для длинных протоколов и многослойного контекста.
- `JSON` — хороший формат для output и state data.
- `YAML` — плохой default для prompts и обычно лишний риск.

Важно: это не значит, что YAML или JSON "не работают вообще". Это значит, что как **основной язык управления моделью** они обычно хуже альтернатив.

---

<Module_ID id="MOD_FORMATS_01_PROMPT_VS_OUTPUT_2026" />

# Модуль 1. Главное различие: format of prompt vs format of output

### Ключевая идея

Нужно различать два вопроса:

- в каком формате лучше **говорить с моделью**;
- в каком формате лучше **получать результат от модели**.

Это не одно и то же.

### Хорошая практическая развязка

```text
Prompt control layer:
- Markdown
- XML-like
- plain text sections

Output layer:
- JSON
- XML
- table
- bullets
- schema-bound blocks
```

### Почему это важно

Одна из самых частых ошибок выглядит так:

- человек берет JSON, потому что он строгий;
- затем начинает писать в JSON и задачу, и ограничения, и примеры, и длинный контекст;
- в результате prompt становится тяжелым, шумным и неудобным;
- при этом ожидание схемы output действительно полезно, но смешивается с постановкой задачи.

### Прямо подтверждается

- Формат prompt реально может влиять на поведение модели сильнее, чем кажется: [Tang et al., 2025](https://aclanthology.org/2025.findings-emnlp.3/).
- В ICL важны не только labels, но и формат последовательности и образец структуры: [Min et al., 2022](https://aclanthology.org/2022.emnlp-main.759).

### Не подтверждено / требует аккуратности

- Что один и тот же формат одинаково хорош и для управления моделью, и для результата.
- Что строгий машинный синтаксис автоматически является лучшим prompt-syntax.

---

<Module_ID id="MOD_FORMATS_02_MARKDOWN_2026" />

## Модуль 2. Markdown как рабочий базовый формат

### Суть метода

Markdown силен там, где prompt должен оставаться читаемым, редактируемым и быстрым в работе. Для обычных инженерных задач этого часто достаточно.

### Когда Markdown особенно хорош

- короткие и средние prompts;
- постановка задачи;
- списки правил;
- acceptance criteria;
- code review instructions;
- короткие примеры.

### Почему Markdown работает

- человеку легко читать;
- легко редактировать и поддерживать;
- заголовки, списки и fenced blocks уже создают понятную структуру;
- токен-шум обычно ниже, чем у XML и заметно ниже, чем у JSON/YAML при сложных блоках.

### Ограничение Markdown

У Markdown нет строгой парной границы секции. Заголовок открывает тему, но не закрывает ее формально. Для небольших prompts этого достаточно. Для длинных протоколов и сложной вложенности это уже слабое место.

### Прямо подтверждается

- Формат как таковой имеет значение, а не только словесное описание: [Tang et al., 2025](https://aclanthology.org/2025.findings-emnlp.3/).

### Косвенно подтверждается

- Для short-to-mid prompts Markdown часто дает лучший trade-off между читаемостью и управлением.

### Не подтверждено / требует аккуратности

- Что Markdown всегда лучше XML-like layout.
- Что Markdown достаточно для любой длинной or multi-document задачи.

---

<Module_ID id="MOD_FORMATS_03_XML_LIKE_2026" />

## Модуль 3. XML-like как формат длинного протокола

### Суть метода

Здесь важен не догматический "чистый XML", а практический XML-like layout:

- теги используются как каркас секций;
- внутри секций может лежать Markdown, plain text, code blocks или structured snippets;
- задача формулируется не в XML целиком, а в XML-like протоколе с удобным содержимым.

### Почему XML-like полезен

#### 1. Парность секций

Парные теги дают явную границу:

```xml
<task>
...
</task>
```

Это полезно и человеку, и модели: проще видеть, где секция началась и где закончилась.

#### 2. Снижение смешения секций

Когда в одном prompt есть:

- инструкции;
- документы;
- примеры;
- output contract;
- metadata;

парные блоки помогают реже смешивать эти роли между собой.

#### 3. Длинный контекст

На длинной дистанции важны якоря и навигация. XML-like layout часто выигрывает именно как система якорей, а не как "магический язык трансформеров".

### XML-like, а не pure XML

На практике сильная конструкция часто выглядит так:

```text
<task>
## Goal
Исправить генерацию review-summary.

## Done When
- пустой diff не создает findings
- тесты не ломаются
</task>

<context>
<code>
// relevant code
</code>
</context>

<output_contract>
Верни findings или patch summary.
</output_contract>
```

То есть:

- теги задают каркас;
- Markdown внутри делает содержимое удобным;
- это и есть XML-like prompt protocol.

### Прямо подтверждается

- Anthropic прямо рекомендует XML tags для разделения instructions, context, examples и variable input и пишет, что это reduces misinterpretation: [Anthropic: Use XML tags](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags).
- Для длинного контекста структура и layout действительно критичны: [Lost in the Middle](https://arxiv.org/abs/2307.03172), [Tang et al., 2025](https://aclanthology.org/2025.findings-emnlp.3/).

### Косвенно подтверждается

- Парные теги полезны как boundary markers.
- XML-like layout уменьшает inter-section interference, то есть смешение разных логических блоков prompt.

### Не подтверждено / требует аккуратности

- Что XML — единственный правильный формат.
- Что эффект XML объяснен как строго доказанный внутренний механизм attention.
- Что XML-like layout всегда превосходит Markdown на любой задаче.

### Практический вывод

Для длинных prompt-протоколов сильнее всего работает формула:

- XML-like снаружи;
- Markdown / plain text / code blocks внутри.

---

<Module_ID id="MOD_FORMATS_04_YAML_2026" />

## Модуль 4. Почему YAML — плохой default для prompt

### Короткий вывод

Если говорить инженерно, а не дипломатично: `YAML` как основной prompt-format почти всегда мусорный выбор.

Не потому, что он "запрещен наукой", а потому что он объединяет сразу несколько слабых свойств.

### Почему YAML плох для prompt-control

#### 1. Границы секций слабо выражены

YAML опирается на:

- отступы;
- двоеточия;
- списки;
- многострочные блоки.

Это удобно для конфигов, но плохо для длинного управляющего текста. У YAML нет сильной парной структуры, как у XML-like layout.

#### 2. Хрупкость к вложенности

Чем длиннее prompt и чем больше вложенных блоков, тем выше цена любой визуальной ошибки в структуре.

#### 3. Плохая работа с длинными текстовыми блоками

`|` и `>` в YAML решают многострочность технически, но делают prompt менее наглядным. В длинном промпте это хуже читается и хуже поддерживается, чем Markdown или XML-like секции.

#### 4. Плохое разделение ролей

YAML довольно быстро превращает prompt в смесь:

- config style;
- natural language;
- lists;
- examples;
- inline strings.

В результате задача, критерии и данные визуально сплющиваются.

### Что подтверждается

#### Прямо подтверждается:

- Различия между `JSON`, `YAML` и plain text по качеству возможны и зависят от задачи: [Narvekar et al., 2025](https://doi.org/10.1109/FMLDS67896.2025.00072).
- Формат prompt вообще имеет значение: [Tang et al., 2025](https://aclanthology.org/2025.findings-emnlp.3/).

#### Косвенно подтверждается:

- YAML слабее XML-like и Markdown там, где важны парные границы, длинный контекст и ясное разделение секций.

#### Не подтверждено / требует аккуратности

- Что YAML никогда не может сработать.
- Что проблема YAML доказана именно через positional encoding.

### Практический вывод

YAML можно терпеть как:

- короткий конфиг;
- machine-side settings;
- ancillary metadata.

Но YAML не стоит выбирать как основной язык prompt protocol.

---

<Module_ID id="MOD_FORMATS_05_JSON_2026" />

## Модуль 5. Почему JSON — плохой prompt-format, но хороший output-format

### Суть метода

JSON часто путают с "правильной структурой" вообще. Но у JSON две очень разные роли:

- как **prompt-control syntax** он обычно неудобен;
- как **output schema** он очень хорош.

### Почему JSON слаб как prompt-format

#### 1. Лишний синтаксический шум

Кавычки, запятые, скобки, экранирование и строковые литералы быстро делают длинный prompt тяжелым и плохо читаемым.

#### 2. Плохой natural-language ergonomics

JSON не предназначен как язык длинной постановки задачи. Он хорошо переносит данные, но хуже переносит reasoning-contract и длинные инструкции.

#### 3. В длинном контексте JSON плохо отделяет "управление" от "данных"

Если весь prompt превращен в JSON-объект, то человек начинает писать и цель, и ограничения, и документы, и примеры как поля одного контейнера. Формально это красиво, practically — слабый интерфейс.

### Почему JSON силен как output-format

#### 1. Модели хорошо натренированы на структурированный output

JSON естественен для:

- schema-bound answers;
- extraction;
- tool calling;
- state data;
- test results;
- task status.

#### 2. Вендоры прямо рекомендуют structured formats для state data

Anthropic отдельно пишет: use structured formats for state data such as test results or task status, and приводит JSON как пример: [Anthropic: Prompting best practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices).

### Прямо подтверждается

- Structured formats useful for state data: [Anthropic docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices).
- Формат влияет на качество prompt: [Tang et al., 2025](https://aclanthology.org/2025.findings-emnlp.3/), [Narvekar et al., 2025](https://doi.org/10.1109/FMLDS67896.2025.00072).

### Не подтверждено / требует аккуратности

- Что JSON плох вообще.
- Что JSON нельзя использовать в prompt ни в каком виде.

### Практический вывод

Правильная формула для JSON такая:

- не делай из него основной язык prompt-control;
- используй его как output contract, schema и state container.

---

## Практическая таблица выбора

```text
Задача                                      -> Формат по умолчанию
Короткий engineering prompt                 -> Markdown
Длинный протокол с несколькими секциями     -> XML-like
Многодокументный long-context prompt        -> XML-like
Schema-bound output                         -> JSON
State data / task status / test results     -> JSON
Компактный config-side metadata             -> YAML (только если реально нужно)
```

---

## Практический вывод

Если свести все к одной рабочей формуле для инженера:

1. Пиши prompt в `Markdown`, если задача обычная.
2. Переходи на `XML-like`, если context длинный, секций много, важны парные границы и многослойный протокол.
3. Не превращай `JSON` в основной язык постановки задачи.
4. Используй `JSON` для output-schema и state data.
5. Не выбирай `YAML` как default prompt-format, если только у тебя нет очень узкой технической причины.

Самый точный итог после fact-check такой:

- `Markdown` — базовый рабочий формат.
- `XML-like` — рабочий формат для длинных протоколов.
- `YAML` — слабый и обычно ненужный default для prompt-control.
- `JSON` — сильный формат для структурированного output, но слабый как основной language-of-control.
