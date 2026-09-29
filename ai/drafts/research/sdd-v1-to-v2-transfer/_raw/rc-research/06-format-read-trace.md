# Верификация гипотезы: «агент теряется на чтении форматов в SDD v2 authoring»

Эмпирика: трейсы worker-агентов из песочниц eval-прогонов final17–final20 (задача Fibonacci, scale=function, deepseek-v4-flash). Источник: opencode.db (`part`-таблица), `/Users/k.lebedev/.local/share/opencode/opencode.db`.

## Вердикт: **Confirmed (с уточнением)** — избыточное чтение подтверждено числами во всех 4 прогонах; но форматы — лишь ~23% объёма чтения, главный пожиратель — фронт-лоадинг самих директив (~66–70%).

## 1. Трейсы

| Прогон | Сессия | Длит. | Tool-calls | Чтений | Format-файлов | До первой мутации | Итог |
|---|---|---|---|---|---|---|---|
| final17 (`ses_f9f7fbbf0ffe…`) | 05:03–05:18 | 14.8 мин | 48 | 30 | **10** | 9.0 мин чистого чтения | спека НЕ заполнена (`<scope-name>` placeholder) |
| final18 (`ses_f9f6d851bffe…`) | 05:23–05:36 | 13.4 мин | 41 | 27 | **10** | 5.3 мин | НЕ заполнена; judge FAIL, «observation budget exceeded» — бюджет съеден чтением |
| final19 (`ses_f9f549c20ffe…`) | 05:50–05:59 | 8.3 мин | 54 | 30 | **10** | 3.8 мин | library-спека заполнена; module-спека — голый скелет; judge FAIL |
| final20 (`ses_f9f420152ffe…`) | 06:10–06:24 | 13.3 мин | 58 | 28 | **10** | 5.5 мин | единственный полный артефакт |

Повторные чтения: `scope.directive.xml` ×2 и `module.directive.xml` ×2 в каждом прогоне (продолжение после обрезки 50K+ файлов), `specs/README.md` ×2, в final20 `fibonacci.spec.md` ×3. Массового перечитывания одного файла нет — проблема в **ширине**, не в повторах.

## 2. Классификация чтений (final18; остальные ±3%)

| Категория | Чтений | Объём (chars) | Доля |
|---|---|---|---|
| (a) директивы/router/skill | 8 | 205 937 | **70%** |
| (b) format-файлы | 10 | 68 003 | **23%** |
| (c) скелет/своя спека | 3 | 15 089 | 5% |
| (d) brief задачи | 1 | 498 | 0.2% |
| (e) прочее (package.json, scripts, tsconfig) | 5 | 3 282 | 1% |
| node_modules / археология | 0 | 0 | — |

Набор форматов **идентичен во всех 4 прогонах** (10 из 24 доступных): library-spec-structure, requirement-entry-format, module-spec-structure, module-map-update, entity-inventory-format, entity-surface-format, dbc-contracts, portal-structure, diagram-vocabulary, module-diagram-ladder.example.md. Читаются фиксированной пачкой **до** `sdd-new` (до появления скелета) — порядок задан текстом директив, а не потребностью.

## 3. Что реально понадобилось

Скелет `sdd-new library` **байт-в-байт равен телу** `formats/library-spec-structure.xml` (сверено в песочнице final18); то же для module. CLI печатает **манифест заполнения** (таблица Section/Required/Fold/Fill, ~9.5K chars) — читать формат структуры после `sdd-new` незачем в принципе.

- **Дублируются скелетом целиком**: library-spec-structure (6.1K), module-spec-structure (10.4K), requirement-entry-format (7.0K — оба worked-примера вшиты в скелет), caption-правила diagram-vocabulary ≈ **37K = 54% формат-объёма**.
- **Реально нужны** (скелет ссылается по contract-ID без содержимого): entity-inventory (3.4K), entity-surface (3.7K), dbc-contracts (9.9K) ≈ 17K — конвертировались в артефакт только в final20; в 17/18/19 module-спека осталась пустой → ретроспективно 10/10 форматов в final17/18 прочитаны зря.
- **Не нужны для этой задачи**: module-diagram-ladder.example.md (10.2K), portal-structure (1.9K), module-map-update (1.6K, single-module scope).

## 4. Откуда импульс

Не из CLI — `sdd-new` форматы читать **не велит**. Источник — READ_AND_USE в директивах, по требованию per-step, единого списка нет:
- `scope.directive.xml:553-555`: «Content guidance per READ_AND_USE_DIRECTIVE the matching format …/library-spec-structure.xml» — велит читать формат до/вместо опоры на скелет.
- `module.directive.xml:495, 533, 570, 594, 672, 677, 691`: READ_AND_USE(module-map-update / entity-inventory / entity-surface / dbc-contracts / module-spec-structure / diagram-vocabulary / pivot-formats) — с императивом «first».
- Определение: `router.directive.xml:216-217`.

Дешёвая модель **сплющивает «по требованию» в «всё сразу»**: читает scope + module директивы целиком на старте (module.directive в final18 прочитан за 8 минут до появления модуля) и пакетно исполняет все READ_AND_USE. Плюс самодеятельная разведка каталога: `ls -R ai/directives/sdd-v2/formats`, glob `formats/*`.

## 5. Рекомендации

**Поглотить скелетом** (удалить READ_AND_USE): library/module-spec-structure (уже = скелет), requirement-entry-format, module-map-update, caption-правила diagram-vocabulary. **Ссылкой ИЗ скелета** (лениво, при заполнении секции): entity-inventory-format, entity-surface-format, dbc-contracts — добавить путь в скелет и убрать «first»-императивы из module.directive. **Убрать из потока**: module-diagram-ladder.example.md, portal-structure. Главный резерв — не форматы, а 150K+ chars фронт-лоадинга директив (module + interview-protocol 31.5K + review-lifecycle 11.4K до первого артефакта).
