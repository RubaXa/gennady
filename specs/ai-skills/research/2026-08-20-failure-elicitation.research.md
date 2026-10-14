# Research: выявление нештатных ситуаций в интервью и формат записи требований

<!--SECTION:STATUS-->

## Status

proposed · 2026-08-20 · объектив «академия и стандарты» собран; объектив «лидеры рынка и готовые инструменты» собирается отдельно и будет дописан в OPTIONS/EVIDENCE этого же документа.

<!--/SECTION:STATUS-->

<!--SECTION:PROBLEM-->

## Problem

Процесс требований, который ведёт ИИ-агент в диалоге с одним человеком, систематически не выходит за happy path: спецификации получаются оптимистичными, нештатные ситуации (отказ зависимости, невалидный ввод, лимиты, конкурентность, частичный сбой) не описаны, и это становится основным источником багов и кривого поведения функционала.

Нужны переносимые механики, отвечающие на три вопроса: (1) как механически порождать вопросы про отказы, не полагаясь на память и воображение агента; (2) как ограничить объём интервью — цель не «супер-архитектор», а базовый минимум, которым спокойно пользуется инженер среднего звена, без ада бесконечных вопросов; (3в) в каком формате записывать полученные требования, чтобы запись была удобна и человеку, и машине, и естественно ложилась на ход интервью.

<!--/SECTION:PROBLEM-->

<!--SECTION:CRITERIA-->

## Criteria

Свежесть данных: 2026-08-20 (дата обращения ко всем источникам EVIDENCE).

| Критерий                                 | Вес     | Комментарий                                                                                                                        |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Механическая порождаемость вопросов      | высокий | Метод должен давать вопрос из формулы, а не из вдохновения агента — иначе воспроизводимости нет                                    |
| Цена в раундах вопросов                  | высокий | Базовый минимум для инженера среднего звена; бесконечное интервью — известная причина отказа от подобных инструментов              |
| Работоспособность в формате 1:1          | высокий | Все найденные методы спроектированы под воркшоп на 5+ человек; нужна часть, которая переносится на диалог агента с одним человеком |
| Пригодность записи для машинной проверки | средний | Требование должно быть проверяемо линтером и связываемо с тестами                                                                  |
| Читаемость записи человеком              | средний | Жёсткие шаблоны критикуют за «robotic» язык; нужен баланс                                                                          |

Вывод агента из сводки методов (не из источника): ни один найденный метод не документирует применение к интервью ИИ-агента с одним человеком — все компрессии до 3–7 вопросов в этом документе являются авторским синтезом, а не практикой из источников.

<!--/SECTION:CRITERIA-->

<!--SECTION:OPTIONS-->

## Options

### Академические подходы и стандарты

**HAZOP + guide words (IEC 61882).** Семь основных guide words: NO/NONE, MORE, LESS, AS WELL AS, PART OF, REVERSE, OTHER THAN; для последовательных процессов добавляются EARLY, LATE, BEFORE, AFTER. Порождающая формула жёстко механическая: **узел + параметр + guide word = утверждение об отклонении**. Артефакт — worksheet «Deviation → Cause → Consequence → Safeguard → Action».
За: единственный из найденных методов с истинно механической генерацией — не зависит ни от воображения, ни от домена.
Против: команда от 5 человек и дни фасилитации в оригинале; комбинаторный взрыв (до 35 комбинаций на узел с 5 параметрами).
Софтверная адаптация SHARD (Omission, Commission, Early, Late, Value) применяет guide words к потокам данных между функциями — подтверждено только вторично (первичная статья McDermid & Pumfrey платная, прямо не прочитана).

**EARS (Easy Approach to Requirements Syntax).** Пять шаблонов + комбинированный: `The <system> shall <response>` (ubiquitous); `WHEN <trigger> the <system> shall <response>` (event-driven); `IF <trigger>, THEN the <system> shall <response>` (**unwanted behaviour**); `WHILE <state> the <system> shall <response>` (state-driven); `WHERE <feature> the <system> shall <response>` (optional feature).
Ключевая находка: отдельный синтаксис для нежелательного поведения введён авторами намеренно — они называют «omission (missing requirements, particularly requirements to handle unwanted behaviour)» одной из восьми проблем естественного языка в спецификациях, и дали этой категории собственный шаблон, чтобы упущения можно было выявлять на протяжении всего жизненного цикла.
Против (оговорка самих авторов): «claim that omissions have been eliminated needs to be treated with caution… there is no evidence that other missing requirements have been captured» — EARS не порождает содержание про нехэппи-путь, а даёт категорию, куда его положить.
Практическая эвристика ревью (Terzakis, Intel): считать «ubiquitous» дефолтно подозрительной категорией и искать пропущенные else-ветки; пример из туториала — «If a boot disk is detected, the software shall boot from it» помечается вопросом «а что если диска нет?».

**FMEA / FMECA.** Фиксированная цепочка вопросов на каждую функцию: функция → способ отказа → эффект (локальный и системный) → Severity → причина → текущие меры предотвращения → Occurrence → меры обнаружения → Detection → RPN = S×O×D → действия → переоценка. FMECA добавляет матрицу критичности отдельно от Detection.
За: строгий per-item скрипт, по сути одноместный (воркшоп даёт разнообразие точек зрения, а не саму механику).
Против: метод «снизу вверх» плохо ловит каскадные отказы (это зона Fault Tree Analysis); слабо покрывает человеческий и организационный фактор; RPN как произведение ординальных шкал даёт математически некорректные инверсии ранжирования; фиксация на порогах RPN «негативно меняет поведение команды».

**SEI Quality Attribute Scenarios / ATAM / ADD.** Сценарий из шести частей: source, stimulus, artifact, environment, response, response measure. Генерация не произвольна: для набора атрибутов существуют «general scenarios» — шаблоны стимулов и реакций, превращаемые в конкретные вопросы. ATAM элиситирует сценарии трёх типов: use-case, growth и **exploratory** (стресс-условия, разрыв неявных допущений) — последний и есть прямой механизм выхода за happy path. Два механизма: utility tree (сверху вниз, приоритизация важность×риск) и фасилитируемый брейнсторминг сценариев (снизу вверх).
За: превращает расплывчатое «должно быть надёжным» в фальсифицируемое измеримое утверждение — в отчёте SEI такие расплывчатые формулировки прямо названы «untenable… they have no operational meaning: they are not refutable».
Против: воркшоповая машина консенсуса (2–3 архитектора, 4–5 оценщиков, 5–10 стейкхолдеров, обученная команда) не переносится; переносится только чек-лист категорий и форма записи.

**Pre-mortem (Klein, HBR 2007).** Протокол: (1) фасилитатор объявляет проект **уже провалившимся** — как факт, не как возможность; (2) тихая индивидуальная запись причин, включая те, что обычно подавляются; (3) раунд-робин по одной причине без дискуссии на этапе генерации (подавляет анкоринг и групповое мышление); (4) руководитель усиливает план по сведённому списку.
Механизм: prospective hindsight — восприятие исхода как уже случившегося повышает точность выявления причинно-следственных факторов примерно на 30% (Mitchell, Russo & Pennington, 1989). По собственному блогу Klein, pre-mortem сильнее прочих техник снижает избыточную уверенность участников.
Против: даёт причины, а не структурированную таксономию отказов — кто-то отдельно должен перевести причины в требования. Оговорка из вторичного источника: эффект доказан для генерации причин и снижения overconfidence в лаборатории, не как прямое улучшение реального риск-менеджмента.

**Specification by Example / Example Mapping / BDD.** Adzic, «key examples»: выбирать малое число простых проверяемых сценариев вместо исчерпывающей комбинаторики; четыре эвристики, включая **фокус на граничных условиях** — пороги, где поведение меняется ($24.99 / $25 / $50). Количественная иллюстрация: около сорока примеров через группировку против примерно восьмидесяти тысяч через комбинаторику; «пять примеров дают командам 90% ценности».
Example Mapping (Wynne): четыре карточки — story (жёлтая), rule (синяя), example (зелёная), question (красная, откладывается, но не блокирует); три роли-перспективы, где **роль тестера структурно занимает место охотника за граничными случаями** («что происходит, когда…?»); тайм-бокс ~25 минут на элемент бэклога; встроенные сигналы — много красных карточек означает слишком много неопределённости, много синих означает слишком крупную историю.
Против: нет forcing function уровня guide words или таксономии FMEA — обнаружение граничных случаев зависит от того, задаст ли человек в роли тестера свой вопрос.
Оговорка: трактовка, будто Given/When/Then у Дана Норта институционализирует граничные случаи как обязательный результат разговора, — по памяти модели, первичным текстом не подтверждена.

**ISO/IEC 25010 (как чек-лист полноты).** Редакция 2011: 8 характеристик и 31 подхарактеристика. Редакция 2023: 9 характеристик — Usability переименована в Interaction Capability (добавлены inclusivity, self-descriptiveness, engagement, assistance), Portability в Flexibility (добавлена scalability), выделена отдельная Safety. Применение — обход характеристик как контрольного списка «покрыт ли аспект требованиями».
Против (критика arc42): «полное отсутствие конкретных примеров применения модели к практическим системам», структурное перекрытие категорий (testability логически относится и к maintainability, и к reliability, но помещена только в одну), абстрактные существительные вместо actionable-формулировок, излишняя сложность для усвоения в реальных проектах.

### Лидеры рынка и готовые инструменты

**GitHub Spec Kit — команда `/clarify`.** Таксономия из 8 категорий, каждая размечается статусом Clear / Partial / Missing для построения coverage map, по которой приоритизируются вопросы. Одна из категорий дословно: «Edge Cases & Failure Handling: Negative scenarios; Rate limiting / throttling; Conflict resolution (e.g., concurrent edits)». Жёсткий бюджет: «up to 5 highly targeted clarification questions». Процессный гейт: выполняется до `/plan`, пропуск разрешён, но «must warn that downstream rework risk increases».
За: единственный найденный механизм, который одновременно гарантирует покрытие категории отказов и явно ограничивает цену диалога — прямой ответ на риск бесконечного интервью.
Также в Spec Kit: шаблон спеки несёт секцию `### Edge Cases` с императивным HTML-комментарием «ACTION REQUIRED» и готовыми вопросами «What happens when [boundary condition]? How does system handle [error scenario]?»; механизм `[NEEDS CLARIFICATION: …]` прямо в тексте требования; команда `/checklist` с метафорой «checklists are UNIT TESTS FOR REQUIREMENTS WRITING… NOT for verification/testing»; команда `/analyze`, где конфликт с project constitution — единственная категория, автоматически маркируемая CRITICAL, остальное совещательно.

**BMAD-Method.** Шаблон спеки фичи несёт раздел «I/O & Edge-Case Matrix» с колонками Scenario / Input-State / Expected Output / Error Handling и обязательными строками-примерами HAPPY_PATH и ERROR_CASE; инструкция шаблона: «If no meaningful I/O scenarios exist, DELETE THIS ENTIRE SECTION. Do not write "N/A" or "None"» — то есть пропуск возможен только осознанным удалением, оставляющим след. Раздел заморожен после согласования (`frozen-after-approval`). Отдельный ревью-пасс «Edge Case Hunter»: «You are a pure path tracer… Report ONLY paths and conditions that lack handling», выход строго JSON. PRD-шаблон: опциональное поле «Edge case (optional): one real failure mode and what the user does next» плюс обязательная секция Non-Goals. PRD Quality Rubric (LLM-судья в отдельном контексте, вердикты strong/adequate/thin/broken) явно флагит формулировки вида «system handles X gracefully», «reasonable performance» как красные флаги без операционализации. PRFAQ Coach требует категорий «Edge cases», «The hard question the team hopes nobody asks», «Risk», с запретом «Don't generate softball questions»; каждый гэп форсирует решение «launch blocker, fast-follow или accepted trade-off».
Против: PRFAQ-протокол в исходном виде — 6–10 вопросов на категорию в двух стадиях; это тот самый объём, на который жалуются пользователи.

**AWS Kiro.** Трёхфазный процесс Requirements → Design → Tasks с явными approval-гейтами между фазами; `requirements.md` использует EARS-формат (`WHEN [условие] THE SYSTEM SHALL [поведение]`) и, по документации, включает «edge cases and error handling»; `design.md` включает «error handling and testing strategy». Есть режим Quick Spec без гейтов: «instead of approving each phase before the next begins, you answer clarifying questions up front».
Против: контент-уровневого принуждения (обязательная секция, которую нельзя не заполнить) в открытой документации не найдено — детального шаблона файла нет, только иллюстративные примеры. Подтверждает EARS как рабочий формат записи требований у крупного вендора.

**AWS Operational Readiness Review.** Дословно шаблон таблицы: «Please construct a failure model listing soft and hard failure modes for each of your components and dependencies» с колонками Component/Dependency, Failure Type, Service Impact, Customer Impact, и требованием «address an outage of your service in its largest blast radius unit». Другие пункты: «What is the retry and back-off strategy for each of your dependencies?», RTO с вопросом «Have you practiced it? Do you have a runbook?», авто-роллбэк деплоя (No = High Risk), gameday для проверки алармов. Названный антипаттерн: «You launch a workload without knowing if you can operate it». Механизм: бинарные Yes/No с меткой риска, находки без митигации обязаны попасть в backlog и закрыться до запуска. Источник вопросов — постмортемы (Correction of Errors).

**Google SRE.** Launch Coordination Checklist: «How to detect when backends die, and what to do when they die»; «Load balancing, rate-limiting, timeout, retry and error handling behavior»; «Graceful degradation, how to avoid accidentally overrunning third-party services»; «Spare capacity, 10x growth, growth alerts»; «Monitoring the monitoring». PRR — гейт передачи сервиса под операционную ответственность SRE, пример вопроса: «Do updates to the service impact an unreasonably large percentage of the system at once?». Механизм: отдельная роль Launch Coordination Engineer и формальный sign-off.

**STRIDE / Microsoft SDL.** Threat modeling — практика №3 из 10 в актуальной редакции SDL, «occurs during the design phase, before development begins». Ключевые вопросы дословно: «What if this feature were abused by an attacker instead of being used as intended?», «What happens to assets and users if attackers compromise the system?», «What happens to the system if individual components I rely on become unavailable?». Компактная рамка Шостака: «What are we working on? What can go wrong? What are we going to do about it? Did we do a good enough job?» с оговоркой «STRIDE may miss important design flaws that only thinking like an attacker will catch». Формального слова «gate» на странице практики нет (упоминание обязательности SDL — вторичный источник, помечено).

**Scrum Definition of Ready.** Дословный пункт чек-листа: «Do these criteria provide a comprehensive outline? Do they cover both positive and negative scenarios related to the user story?». Пример пары критериев (Atlassian Community): happy-path Given/When/Then плюс негативный «Invalid credentials return an inline error without page reload». Требования к формулировке: testable, verifiable, binary. Оговорка: DoR не описан в Scrum Guide — это командная договорённость.

**Chaos engineering.** Определение и четыре принципа из статьи Basiri et al., IEEE Software 2016; ключевой переносимый паттерн — формат гипотезы: «we hypothesize that failing over from one region to another will have minimal impact on SPS». Обоснование метода: «92% of catastrophic system failures were the result of incorrect handling of non-fatal errors». Принуждение — не ревью, а среда: постоянный Chaos Monkey сделал обработку отказов нормой дизайна («today inside of Netflix all engineers design their services to handle instance failures as a matter of course»). Расхождение источников: сайт principlesofchaos.org добавляет пятый принцип «Minimize Blast Radius», в статье 2016 это техника внутри второго принципа.

**Шаблоны ADR / RFC / PRD.** Nygard ADR, раздел Consequences: «All consequences should be listed here, not just the "positive" ones». MADR: физически присутствующие пустые слоты «Good, because {positive consequence}» и «Bad, because {negative consequence}». RFC-шаблон: раздел «😱 Risks» с триггер-фразой «What could go wrong? Don't hide your concerns» и указание, что отсутствие раздела Alternatives — сигнал непродуманности. Google Design Docs: обязательные goals/non-goals, alternatives considered, сквозной раздел cross-cutting concerns. Механизм принуждения здесь — не блокирующий гейт, а невозможность не заметить пустое поле с явной подсказкой против замалчивания.
**Дельта второго прохода по рынку (детали, уточняющие выше).** BMAD PRD Quality Rubric даёт готовый детектор пустых формулировок: измерение «NFR theater — copied boilerplate ("system must be scalable / secure / reliable") without product-specific thresholds» и принцип «bounds, not adjectives» с указанием «"System handles X gracefully," "reasonable performance," "user-friendly" — flag every one… Be unforgiving here». Архитектурный reviewer-gate BMAD: «a whole dimension left silent is a finding» — молчание по измерению считается находкой, а не пропуском. AWS Kiro, функция Analyze Requirements, даёт готовую таксономию сканирования: «Missing edge cases — failure modes, boundary conditions, and concurrent access scenarios not covered by the happy path», «Conflicting constraints», «Ambiguities — language like "large files" or "fast response times" that would produce divergent implementations», «Unstated assumptions»; оговорка: это опциональная кнопка, а не форсированный шаг, и Error Handling — структурная секция `design.md`, генерируемая шаблоном. Tessl-labs tile (spec-driven-development) даёт прямое правило дозирования вопросов: «Ask ONE question at a time… Good questions are specific and bounded: "Should the API return a 404 or an empty list when no results match?" Bad questions are open-ended or bundled: "What about errors, pagination, auth, and rate limits?" (too many at once)». Spec Kit `/clarify` в этом проходе подтверждён с уточнением: 9 категорий, «Maximum of 5 total questions across the whole session… select the top 5 by (Impact \* Uncertainty) heuristic», и механическая запись ответа обратно в нужную секцию («Edge case / negative flow → Add a new bullet under Edge Cases / Error Handling»); шаблон чек-листа несёт правило «reads checklist checkbox state as a gate and must not modify markers» — агенту запрещено самому ставить галочки. Cursor rules и Devin публично документированной механики принуждения не дали (проверено, помечено как отсутствие данных).

Не подтверждено: цитата про «top three reasons this product will not succeed» из PR/FAQ — при повторной проверке источник не подтвердил формулировку, вероятная галлюцинация промежуточного прохода; не использовать как цитату.

### Русскоязычный формат записи требований

**ГОСТ-традиция регламентирует раздел документа, а не грамматику требования.** ГОСТ 34.602-89 требует в разделе надёжности «перечень аварийных ситуаций, по которым должны быть регламентированы требования к надёжности, и значения соответствующих показателей», а в разделе сохранности информации — «перечень событий: аварий, отказов технических средств (в том числе — потеря питания) и т. п., при которых должна быть обеспечена сохранность информации в системе». То есть нештатные ситуации в русской нормативной традиции есть, но как обязательный перечень в разделе, без шаблона фразы. Редакция 34.602-2020 добавила правило: разделы сохраняются даже при отсутствии требований («требования отсутствуют» вместо удаления раздела). Аналога EARS-синтаксиса не найдено ни в 34.602, ни в 19.201, ни в 57193/29148 — значит EARS не конфликтует с ГОСТ-культурой, это другой уровень регламентации.

**Русская калька шаблонов EARS уже устоялась** — минимум три независимых источника дают почти одинаковые формулировки: «‹система› должна ‹реакция›» (ubiquitous), «Когда ‹триггер› ‹система› должна ‹реакция›» (event-driven), «Пока ‹состояние› ‹система› должна ‹реакция›» (state-driven), «При ‹наличии свойства› ‹система› должна ‹реакция›» (optional feature), «Если ‹условие/триггер›, то ‹система› должна ‹реакция›» (unwanted behaviour). Зафиксированная носителями трудность — падежное согласование триггера с телом фразы.

**Модальность.** Официального ГОСТ-аналога RFC 2119 не найдено; есть перевод самого RFC 2119 («обязательно / запрещается / следует / не следует / возможно»). На практике в русских требованиях используется только «должен» — модальная градация массово не применяется. INCOSE-гайд рекомендует «[Субъект] должна/должны [действие]» как стандартную форму и критикует пассив («должна быть сформирована») в пользу актива («должна сформировать»). Вывод: шкалу обязательности придётся декларировать самим в контракте формата, либо выносить класс отдельным атрибутом, не полагаясь на естественный язык.

**Канцелярит — риск не шаблона, а слота действия.** Сама калька «Когда X, система должна Y» — активный залог и короткая структура. Риск возникает при заполнении слота действия номинализациями («должна осуществлять обработку» вместо «должна обработать») и при неуклюжих оборотах ради падежного согласования. Индустриальные примеры замен: «должна обладать максимальной отказоустойчивостью» → «среднее время между отказами не должно превышать 90 дней»; неизмеримые «гибкий механизм настроек», «интуитивно понятный интерфейс»; отказ от ответственности «при необходимости», «если возможно». Отдельное правило: при нескольких условиях логика их сочетания (И/ИЛИ) должна быть явной. Механический аналог из русской пишущей индустрии — «Главред» и «Тургенев», подсвечивающие отглагольные существительные и пассив.

**Публичные корпоративные стандарты РФ на синтаксис требования не найдены** (Яндекс, VK, Т-Банк, Сбер, Авито, Ozon). Косвенно видно: разделение PRD (продуктовый) и ТЗ (инженерный), функциональные/нефункциональные как раздельные секции по умолчанию, измеримость как критерий качества, ADR-практика для решений.

**Четыре варианта гибридного формата** (детально с примерами — в исходном отчёте):
А. Шаблонная строка + абзац пояснения. Просто, читаемо; линтер проверяет только наличие полей.
Б. YAML-карточка (id, класс, триггер, когда/если, система, действие, пояснение). Максимальная парсимость; перестаёт читаться как текст.
В. Markdown-гибрид: `### REQ-042 [должен · нештатная]`, затем фраза с жирными ключевыми словами «**Когда** … **сервис должен** …», затем пояснение цитатным блоком. Парсится регуляркой (ID, класс, триггерное слово, наличие пояснения), остаётся читаемым текстом.
Г. Плотная лента EARS-строк + вынесенный раздел обоснований. Компактно для больших ТЗ; пояснение отрывается от требования, риск рассинхронизации.

<!--/SECTION:OPTIONS-->

<!--SECTION:DECISION-->

## Decision

**Решения приняты оператором 2026-08-20:**

1. **Интервью**: карта покрытия получает категории отказов (негативные сценарии, отказ зависимости, лимиты и нагрузка, конкурентность, границы доверия) со статусами покрыто/частично/нет; бюджет — не более пяти вопросов, тратится только на дыры. Категории отказов **не могут быть закрыты догадкой агента** — только ответом человека либо явным «не применимо, потому что …», зафиксированным в спеке. Форма: одна пачка из 3–5 независимых подвопросов одним Ask; вторая пачка — только для вопросов, зависящих от предыдущего ответа; потолок — две пачки на спеку. В конце агент одной строкой отчитывается, что именно спросил про нештатное (критерий оператора: happy path известен всегда, понимание задачи проявляется в нештатном флоу).
2. **Формат записи** — вариант В (Markdown-гибрид): заголовок `### <ACR>-REQ-<N> [должен · нештатная]`, фраза с жирными ключевыми словами («**Если** … **то сервис должен** …»), пояснение цитатным блоком рядом. Плоский список требований вместо раздельных секций функциональных и нефункциональных.
3. **Шкала обязательности**: три класса — должен (обязательно) / следует (рекомендовано) / может (допустимо), объявляются в контракте формата, поскольку официального русского аналога RFC 2119 не существует.
4. **Идентификаторы**: акроним спеки впереди, как в Task-ID — `<ACR>-REQ-<N>` и `<ACR>-DL-<N>`; номер сквозной в пределах своей спеки, глобальную уникальность даёт акроним; конфликты ловятся механически, как у Task-ID. Это же исправляет старую болезнь `D-NNN`, уникальных лишь внутри файла.
5. **Механические проверки** в sdd-check: (а) если в спеке есть требования с триггером, должно быть хотя бы одно требования класса «нештатная» — иначе находка; (б) в BDD-секции тикета обязателен хотя бы один негативный сценарий или сценарий отказа.
6. **Принесённый оператором текст** — сырьё: топик получает статус «частично», а не «закрыто»; закрывается только подтверждённым ответом в диалоге либо явной пометкой «принято как есть» в спеке.

Опорные механики из ресёрча, на которых стоят эти решения (вывод агента из сводки выше, не утверждение источников):

1. **Guide words как форма вопроса, не как воркшоп.** Сжатый набор из пяти слов — NO, MORE/LESS, OTHER THAN, REVERSE, EARLY/LATE — применяемый к параметру фичи. Цена: 5 вопросов. Обоснование: единственная механика с порождением вопроса из формулы, без зависимости от домена и воображения.
2. **Pre-mortem как рамка запуска.** «Прошло N месяцев, проект провалился — назовите три причины», затем на каждую: «какой сигнал вы заметили бы за недели до». Цена: 1 открывающий + до 3 уточнений. Обоснование: единственная техника, изначально работающая на одном человеке; даёт измеренный эффект точности, которого не даёт нейтральное «что может пойти не так».
3. **FMEA per-item скрипт** как квалификатор найденного: функция → способ отказа → эффект → severity → причина → detection → что формализуем сейчас. Хорошо сочетается с guide words: те порождают кандидатов, этот отбирает.
4. **Категория EARS «unwanted behaviour» как чек-пойнт процесса, а не формат записи постфактум.** На каждый названный человеком триггер — вопросы «что если триггер невалиден / задвоился / зависимость недоступна». Ценность в наличии обязательной категории, а не в синтаксисе IF/THEN.
5. **Урезанный чек-лист категорий стимулов** (нагрузка, отказ, атака, изменение, ошибка пользователя) с записью ответа по форме source → stimulus → response measure. Из группы стандартов качества переносится только это; голосование стейкхолдеров ATAM и полная таксономия ISO 25010 — нет.

Открытый вопрос для обсуждения (поставлен оператором, источниками пока не закрыт): записывать требования плоским EARS-списком вместо раздельных секций функциональных и нефункциональных требований, либо гибридом «шаблонное требование + человеческое описание рядом». Требует данных второго объектива (в частности проверки, что AWS Kiro использует EARS-подобный синтаксис в requirements.md).

<!--/SECTION:DECISION-->

<!--SECTION:CONSEQUENCES-->

## Consequences

Принятое в будущем решение по этим механикам затронет: шаг интервью (нижняя планка вопросов про отказы), скелеты спецификаций всех типов (структурное место под нештатные ситуации, сейчас обязательное только в PRODUCT), scaffold и BDD-секцию тикета (негативные сценарии как обязательство), механические проверки sdd-check (сейчас ни одна проверка не ловит «BDD только happy path»), а также обращение с принесённым оператором текстом как с сырьём.

Цена в раундах при внедрении всех пяти механик подряд — порядка 20+ вопросов, что противоречит критерию «базовый минимум без ада бесконечных вопросов». Следовательно выбор должен быть подмножеством, а не суммой; вероятный кандидат — встроить механики в существующий обязательный триаж на 3–5 вопросов, а не добавлять отдельный раунд.

<!--/SECTION:CONSEQUENCES-->

<!--SECTION:EVIDENCE-->

## Evidence

Все обращения — 2026-08-20.

**HAZOP / guide words**

- Семь основных guide words и формула «узел + параметр + guide word»; темп примерно один узел в час; обязательные выходы (Node Register, Deviation Worksheets, Action Item Register, Assumptions Register) — https://ifluids.com/blog/hazop-study-process-engineers-oil-gas-iec-61882/
- Guide words и состав команды HAZOP (study leader, recorder, design engineer, operator, специалисты) — https://en.wikipedia.org/wiki/Hazard_and_operability_study
- Guide words, вторичное подтверждение — https://www.instrumentationblog.in/hazop-study-explained/
- SHARD (Omission, Commission, Early, Late, Value): подтверждено только вторично через сниппеты поиска; первичная статья McDermid & Pumfrey не прочитана (платный доступ) — помечено как менее надёжное

**EARS**

- Пять шаблонов и комбинированный; цитата про omission как одну из восьми проблем естественного языка; обоснование отдельного синтаксиса для unwanted behaviour; оговорка «claim that omissions have been eliminated needs to be treated with caution» — Mavin, Wilkinson, Harwood, Novak, RE'09, PDF-зеркало https://ccy05327.github.io/SDD/08-PDF/Easy%20Approach%20to%20Requirements%20Syntax%20(EARS).pdf
- Шаблоны, авторская страница — https://alistairmavin.com/ears/
- Эвристика ревью «ubiquitous подозрительна, ищи пропущенные else» и пример с boot disk — Terzakis, Intel, IARIA ICCGI 2013 tutorial, https://www.iaria.org/conferences2013/filesICCGI13/ICCGI_2013_Tutorial_Terzakis.pdf

**FMEA / FMECA**

- Порядок вопросов и колонки worksheet; S/O/D; критика фиксации на порогах RPN — https://quality-one.com/fmea/
- IEC 60812: тот же костяк (scope/team → failure modes и root causes → эффекты → S-O-D → RPN → меры → повторная проверка) — https://visuresolutions.com/blog/automotive/iec60812/
- Математическая некорректность RPN как произведения ординальных шкал — https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis
- Процессная рамка ASQ — по сниппету поиска, прямой доступ к asq.org вернул 403 (помечено)

**SEI Quality Attribute Scenarios / ATAM**

- Шестичастный формат сценария (source, stimulus, artifact, environment, response, response measure) — https://arxiv.org/pdf/2406.08575
- General scenarios как чек-лист; три типа сценариев (use-case, growth, exploratory); utility tree и брейнсторминг; цитата «untenable… they are not refutable»; состав ролей — Kazman, Klein, Clements, «ATAM: Method for Architecture Evaluation», CMU/SEI-2000-TR-004, https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf
- Расширение general-scenario чек-листа на usability/security/testability — подтверждено только вторично (сниппеты), прямым фетчем не проверено
- Детали шагов ADD 3.0 — вторично, прямой фетч PDF не удался

**Pre-mortem**

- Протокол из четырёх шагов и формулировка «проект уже провалился» — Gary Klein, «Performing a Project Premortem», HBR 2007, PDF-зеркало http://homepages.se.edu/cvonbergen/files/2013/01/Performing-a-Project-Premortem.pdf
- Prospective hindsight, повышение точности примерно на 30% — Mitchell, Russo & Pennington, «Back to the Future: Temporal Perspective in the Explanation of Events», 1989, https://www.researchgate.net/publication/227768493_Back_to_the_future_Temporal_perspective_in_the_explanation_of_events
- Снижение overconfidence сильнее прочих техник — https://www.psychologytoday.com/us/blog/seeing-what-others-dont/202101/the-pre-mortem-method
- Оговорка про «эпизодические» дополнительные причины — по сниппету https://corporate.jasoncollins.blog/premortem

**Specification by Example / Example Mapping / BDD**

- Key examples, четыре эвристики, фокус на граничных условиях, «сорок примеров против восьмидесяти тысяч», «пять примеров дают 90% ценности» — https://gojko.net/2014/05/05/focus-on-key-examples/
- Given/When/Then, пример с банкоматом и состояниями счёта — https://dannorth.net/blog/introducing-bdd/
- Example Mapping: четыре карточки, три роли, тайм-бокс 25 минут, сигналы по количеству красных и синих карточек — cucumber.io, blog.baudson.de, insideproduct.co (оригинальный пост Wynne на Medium вернул 403 и напрямую не прочитан)

**ISO/IEC 25010**

- Редакция 2011: 8 характеристик, 31 подхарактеристика — https://www.perforce.com/blog/qac/what-is-iso-25010
- Редакция 2023: 9 характеристик, Interaction Capability, Flexibility со scalability, отдельная Safety — https://www.sonarsource.com/resources/library/iso-iec-25010-explained/ и https://www.iso.org/standard/78176.html
- Связка характеристик с SEI-сценариями для перевода в измеримое — https://quality.arc42.org/articles/sei-quality-model
- Критика: отсутствие практических примеров, перекрытие категорий, абстрактные существительные, сложность усвоения — https://quality.arc42.org/articles/iso-25010-shortcomings

**Лидеры рынка и готовые инструменты**

- BMAD-Method, все цитаты — репозиторий github.com/bmad-code-org/BMAD-METHOD, main branch, файлы: `src/bmm-skills/ship/bmad-build/spec-template.md` (I/O & Edge-Case Matrix), `src/bmm-skills/ship/bmad-build/review-prompts/edge-case-hunter.md`, `src/bmm-skills/plan/bmad-prd/assets/prd-template.md`, `src/bmm-skills/plan/bmad-prd/assets/prd-validation-checklist.md`, `web-bundles/prfaq-coach/SKILL.md`, `src/bmm-skills/plan/bmad-prfaq/references/customer-faq.md`, `src/bmm-skills/v6-shims/bmad-dev-story/checklist.md`
- GitHub Spec Kit, все цитаты — репозиторий github.com/github/spec-kit, main branch, файлы: `templates/spec-template.md`, `templates/commands/clarify.md`, `templates/commands/checklist.md`, `templates/commands/analyze.md`
- AWS Kiro: https://kiro.dev/docs/specs/ и https://kiro.dev/docs/specs/feature-specs/requirements-first/ (EARS-формат, фазовые approval-гейты, режим Quick Spec)
- AWS Operational Readiness Review: https://docs.aws.amazon.com/wellarchitected/latest/operational-readiness-reviews/appendix-b-example-orr-questions.html, .../wa-operational-readiness-reviews.html, .../ops_ready_to_support_const_orr.html
- Google SRE: https://sre.google/sre-book/launch-checklist/ и https://sre.google/sre-book/evolving-sre-engagement-model/
- Amazon Working Backwards PR/FAQ: https://workingbackwards.com/concepts/working-backwards-pr-faq-process/, https://www.paulmduvall.com/pr-faq-template-example/, https://commoncog.com/putting-amazons-pr-faq-to-practice/
- STRIDE / Microsoft SDL: https://www.microsoft.com/en-us/securityengineering/sdl/practices, https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats, https://learn.microsoft.com/en-us/archive/msdn-magazine/2006/november/uncover-security-design-flaws-using-the-stride-approach, https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- Chaos engineering: Basiri et al., «Chaos Engineering», IEEE Software 2016, https://arxiv.org/pdf/1702.05843 (сайт principlesofchaos.org расходится в числе принципов — зафиксировано в OPTIONS)
- Scrum Definition of Ready: https://agilealliance.org/glossary/definition-of-ready/, https://argondigital.com/blog/product-management/defining-ready-checklist-grooming/, Atlassian Community «Acceptance criteria in Jira»
- Шаблоны решений: Nygard ADR (cognitect.com), MADR (adr.github.io), «My favorite RFC template» (softwarephilosopher.com), «Design Docs at Google» (industrialempathy.com), Confluence PRD template (Atlassian), Aha!, AltexSoft, SVPG «Four Big Risks» (svpg.com)
- Дельта второго прохода: https://kiro.dev/docs/specs/analyze-requirements/, https://kiro.dev/docs/specs/correctness/, https://kiro.dev/docs/specs/best-practices/, https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/plan/bmad-architecture/references/reviewer-gate.md, https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/ship/bmad-correct-course/checklist.md, https://github.com/github/spec-kit/blob/main/templates/checklist-template.md, https://github.com/github/spec-kit/blob/main/templates/plan-template.md, https://github.com/github/spec-kit/blob/main/spec-driven.md, https://github.com/tesslio/spec-driven-development-tile (skills/requirement-gathering/SKILL.md, skills/spec-writer/SKILL.md, docs/spec-styleguide.md, rules/spec-before-code.md), https://docs.tessl.io/llms-full.txt, https://docs.devin.ai/essential-guidelines/instructing-effectively
- Помечено как неподтверждённое: формулировка «top three reasons this product will not succeed» (PR/FAQ) — при повторной проверке источник не подтвердил; цитата Liz Keogh про негативные сценарии в Given/When/Then — страница вернула 403, взято из вторичного поиска

**Русскоязычный формат записи требований**

- ГОСТ 34.602-89, п. 2.6.1.4 и 2.6.1.10 (перечень аварийных ситуаций; перечень событий-отказов для сохранности информации) — https://meganorm.ru/Data2/1/4294850/4294850134.htm
- Обзоры изменений ГОСТ 34.602-2020 (полный текст стандарта недоступен, только вторичные обзоры) — https://babok-school.ru/blog/gost-34-602-2020-what-is-new/, https://www.comnews.ru/content/219209/2022-03-21/2022-w12/obzor-izmeneniy-gost-34602-2020
- ГОСТ 19.201-78 (состав разделов ТЗ на программу; полный текст вытащить не удалось) — https://docs.cntd.ru/document/1200007648
- ГОСТ Р 57193-2016 / ISO-IEC-IEEE 29148 в русских версиях (стандарты на процесс, синтаксиса требования не задают) — https://www.gostinfo.ru/catalog/Details/?id=6439527
- Русская калька всех пяти шаблонов EARS — https://gist.github.com/rdnvndr/fa1841179db6de5d092f40c51f6a5b12
- Доклад «EARS: The Easy Approach to Requirements Syntax», Analyst Days 5, 2016 — https://analystdays.ru/ru/talk/38926
- Обзор трёх подходов к требованиям (IREB / IEEE 29148 / EARS) — https://dou.ua/forums/topic/34156/
- Русская статья про EARS с замечанием о падежном согласовании — https://medium.com/@olga.cherkasova.posts (403 при фетче, цитата по сниппету выдачи, первоисточником не проверена)
- INCOSE-гайд в русском пересказе: форма «[Субъект] должна/должны [действие]», критика пассива и неизмеримых прилагательных, правило явной логики И/ИЛИ — https://habr.com/ru/articles/760270/
- Примеры измеримых нефункциональных требований на русском — https://habr.com/ru/articles/948506/
- Перевод RFC 2119 (обязательно / запрещается / следует / не следует / возможно) — https://rfc.com.ru/rfc2119.htm
- Канцелярит: определение и признаки (Нора Галь) — https://www.vavilon.ru/noragal/slovo5.html; примеры до/после — https://zhir.media/chto-takoe-kanczelyarit-i-kak-izbegat-ego-v-tekstah/
- Разделение PRD и ТЗ по аудитории — https://practicum.yandex.ru/blog/biznes-trebovaniya/
- ADR-практика в российской компании — https://habr.com/ru/companies/dododev/articles/578052/
- Явно не найдено: официальный ГОСТ-аналог RFC 2119; публичные корпоративные стандарты Сбера, Т-Банка, Авито, Ozon, VK на синтаксис формулировки требования

**Ограничения ресёрча (вывод агента)**

Компрессии методов до 3–7 вопросов для формата «ИИ-агент и один человек» отсутствуют в найденной литературе — такого прецедента в источниках нет; все компрессии в этом документе являются авторским синтезом и требуют проверки на живых прогонах.

<!--/SECTION:EVIDENCE-->

<!--SECTION:RELATED-->

## Related

- Скоуп: [ai-skills](../ai-skills.spec.md)
- Диагностика текущего состояния (сессия 2026-08-20): аксиома `AX_UNCOMFORTABLE_QUESTIONS` подключена только в `critic-protocol`, в интервью отсутствует; в v1 шаг захвата замысла требовал «2–5 вопросов, минимум один неудобный»; механических проверок на отсутствие failure-кейсов нет.
- Второй объектив ресёрча (лидеры рынка и готовые инструменты) — дописывается в OPTIONS и EVIDENCE этого документа.

<!--/SECTION:RELATED-->
