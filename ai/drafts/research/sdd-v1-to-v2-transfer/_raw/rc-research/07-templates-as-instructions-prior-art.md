# Prior art: инструкции внутри генерируемого шаблона vs отдельные директивы

## 1. GitHub Spec Kit — главный прецедент «за», с важной оговоркой

**Шаблоны несут embedded guidance.** `spec-template.md`: HTML-комментарии и блоки «ACTION REQUIRED: The content in this section represents placeholders. Fill them out...», правила приоритизации user stories, требования к measurable success criteria (https://raw.githubusercontent.com/github/spec-kit/main/templates/spec-template.md). `plan-template.md` — gates («GATE: Must pass before Phase 0 research»), метки `[REMOVE IF UNUSED]`, условная таблица «Fill ONLY if Constitution Check has violations» (https://raw.githubusercontent.com/github/spec-kit/main/templates/plan-template.md).

**Методология артикулирует принцип.** `spec-driven.md` называет шаблоны «sophisticated prompts that constrain the LLM's output in productive ways»: шаблон вынуждает маркировать неопределённость `[NEEDS CLARIFICATION]`, чек-листы внутри — «unit tests for the specification», встроенные gates «prevent over-engineering» (https://github.com/github/spec-kit/blob/main/spec-driven.md).

**Оговорка (против сильной версии гипотезы):** актуальный prompt `/specify` НЕ сводится к «прочитай шаблон и заполни» — детальные правила процесса живут в command-prompt (https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/specify.md). Spec Kit пришёл к **гибриду**: шаблон = структура + section-level guidance, команда = execution flow. Исторически execution flow был в самом шаблоне — эволюция шла в сторону выноса процессной логики из шаблона (https://deepwiki.com/github/spec-kit/12-templates-reference).

## 2. BMAD-METHOD — самый чистый пример гипотезы

«Templates are unique in that they are embedded with the LLM instructions... BMAD templates are self-contained and interactive — they embed both the desired document output and the LLM instructions needed to work with users». Story-шаблон несёт инструкции сразу для трёх агентов (SM, Dev, QA) (https://github.com/cdwbrad/bmad-method/blob/main/docs/user-guide.md, https://docs.bmad-method.org/explanation/advanced-elicitation/).

## 3. Kiro, OpenSpec, Tessl — спектр решений

- **Kiro (AWS):** структура навязывается инструментом (requirements.md в EARS-нотации → design.md → tasks.md); инструкции в steering-файлах и IDE, не в шаблонах (https://kiro.dev/docs/specs/). Контрпример.
- **OpenSpec:** центральный AGENTS.md + slash-команды; инструкции регенерируются `openspec update` из одного места (https://github.com/Fission-AI/OpenSpec). Контрпример.
- **Tessl:** спеки в `.tessl/framework`, доступ через CLI/MCP (https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html).

## 4. Классика: паттерн «инструкция в бланке» давно устоялся

- **GitHub issue/PR templates:** инструкции в `<!-- HTML-комментариях -->`, исчезают при рендере — самоудаляющийся guidance (https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates). Failure mode: авторы забывают удалить текст (https://github.com/golang/go/issues/27914).
- **MADR (ADR):** инструкции в `{curly-braces placeholders}` + комментарии «This is an optional element. Feel free to remove.» (https://raw.githubusercontent.com/adr/madr/develop/template/adr-template.md).
- **Rust RFC template:** инструкции текстом под каждым заголовком, автор замещает их содержимым (https://raw.githubusercontent.com/rust-lang/rfcs/master/0000-template.md).

Для документов-для-людей «образец с инструкциями внутри, удаляемыми при заполнении» — доминирующий индустриальный паттерн.

## 5. Anthropic: progressive disclosure / just-in-time context — косвенное «за»

«Effective context engineering for AI agents»: retrieve-at-runtime как базовый принцип — лёгкие идентификаторы вместо предзагрузки (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). Agent Skills: metadata → SKILL.md → supporting files при исполнении. Инструкция в заполняемом файле = just-in-time контекст; отдельный format-файл, читаемый заранее, = preload. Ссылка «из секции шаблона на глубокий формат по требованию» — аналог третьего уровня skills.

## 6. Контраргументы и failure modes

1. **Copy/anchor-bias реален:** LLM «copy answers from provided examples instead of learning the underlying patterns» (https://arxiv.org/abs/2410.01288); underspecified-демонстрации навязывают поверхностные признаки (https://arxiv.org/abs/2305.13299). Заполненный образец агент может воспроизвести буквально.
2. **Смешение инструкции и контента:** Böckeler (Fowler-цикл): «the agent ignored the notes... it just took them as a new specification and generated them all over again, creating duplicates» (https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). Главный технический риск гипотезы.
3. **Раздувание и «иллюзия работы»:** критика spec-kit — «created a LOT of markdown files... very verbose», «SpecKit creates the illusion of work» (https://github.com/github/spec-kit/discussions/1784, https://news.ycombinator.com/item?id=45512617).
4. **Устаревание размноженных инструкций:** OpenSpec решает регенерацией из одного места; GitHub-шаблоны — самоуничтожением инструкций при заполнении. Устаревание бьёт только по варианту «инструкции остаются в заполненном файле».
5. **Машинная валидация:** Kiro использует EARS — канонический формат вне шаблона; валидатору нужна спецификация формата, независимая от prose-guidance (https://kiro.dev/docs/specs/best-practices/).

## Вердикт: подтверждается ЧАСТИЧНО — да для section-level guidance, нет для execution flow процесса

**За:** BMAD (self-contained шаблоны), Spec Kit (шаблоны как «sophisticated prompts»), классика (GitHub templates, MADR, Rust RFC), just-in-time context у Anthropic.

**Против сильной формы («CLI говорит только "прочитай и заполни"»):** Spec Kit держит execution flow и валидацию в command-prompt; Kiro и OpenSpec — централизованно; задокументирован failure mode «агент принял инструкции в артефакте за контент».

**Условия, при которых паттерн работает:**
1. Инструкции в placeholder-секциях **удаляются/замещаются при заполнении** — нет ни устаревания, ни путаницы «инструкция vs контент».
2. Инструкции синтаксически **отделены от контента** (комментарии, скобки).
3. **Процессный execution flow** (gates, retry, до/после файла) — в команде/skill, не в шаблоне: шаблон отвечает за «как заполнить секцию», команда — за «как течёт процесс».
4. **Валидатор и канонический формат — внешние**; шаблон ссылается на них точечно, из конкретной секции, по требованию.
5. Worked example либо избегается, либо явно помечен как удаляемый образец (copy-bias).
