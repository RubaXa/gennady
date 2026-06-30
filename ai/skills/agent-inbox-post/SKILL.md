# agent-inbox-post — постинг замечаний в GitLab

Запускается когда пользователь подтвердил постинг через меню действий.
Не пересказывает директиву — заставляет её читать.

---

## Шаг 0 — Обязательное чтение

Перед любым постингом — прочитай:

1. **`ai/directives/agent-inbox/posting-rules.directive.xml`**
   - `AX_POSTING_BOT_PREFIX` — каждое сообщение начинается с 🤖
   - `AX_POSTING_MERMAID_ONLY` — диаграммы только Mermaid, не ASCII/SVG
   - `AX_POSTING_GRANULARITY` — спека → строка 1, код → per-line, ответ → в тред
   - `AX_POSTING_SILENT_RESOLVE` — автор исправил → 👍 + resolve (без текста)
   - `<PreFlight>` — 5 вопросов stop-on-match
   - `<CommentFormat>` — JSON-форматы: general-comment, reply-to-thread, line-comment, suggestion

2. **`ai/directives/agent-inbox/arch-interrogation.directive.xml`**
   - `AX_VISUAL_TRANSPORT` — Branch GITLAB: загрузи posting-rules, Mermaid-only

---

## Шаг 1 — PreFlight по каждому кандидату

Для каждого кандидата из таблицы — вопросы по порядку, STOP на первом совпадении:

1. Diagram better than text? → Mermaid (`AX_POSTING_MERMAID_ONLY`)
2. Author fixed the issue? → 👍 + resolve (`AX_POSTING_SILENT_RESOLVE`)
3. Agree with peer AND goal achieved? → 💯 + resolve
4. Agree with peer, thread open? → 💯 only
5. Thread exhausted? → resolve only
else → post reply as-is

---

## Шаг 2 — Подготовка JSON

**Обзорный комментарий (ОБЯЗАТЕЛЕН):**
```json
{"body": "🤖 ## Обзор — <ref>\n\nC4-диаграмма (Mermaid)...\n\nСущности...\n\nИтог..."}
```
C4-диаграмма конвертируется из ASCII в Mermaid.

**Line-комментарии (ОБЯЗАТЕЛЬНЫ для кода):**
```json
{
  "body": "🤖 ...",
  "position": {
    "baseSha": "<base>",
    "startSha": "<start>",
    "headSha": "<head>",
    "newPath": "src/file.ts",
    "newLine": 42
  }
}
```
Sha — из `diff_refs` worktree. Строки — ТОЛЬКО изменённые в диффе.

**Ответы в треды:**
```json
{"discussionId": "<id>", "body": "🤖 ..."}
```
discussionId — из `review-issues --all` или GitLab API.

---

## СТОП-ЧЕК (перед vcs-reply)

| # | Проверка | ОК? |
|---|----------|-----|
| 1 | Все body начинаются с 🤖? | □ |
| 2 | Обзорный комментарий с Mermaid C4 есть? | □ |
| 3 | Line-комментарии привязаны к строкам диффа (position)? | □ |
| 4 | Ответы в треды с правильным discussionId? | □ |
| 5 | PreFlight выполнен для каждого кандидата? | □ |
| 6 | Нет дубликатов с существующими тредами? | □ |

Если любой □ пуст → BLOCKED. Не пости.
