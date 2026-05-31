---
name: alt-opinion
description: Multi-model alternative opinion via CLI (gennady alt-opinion). Runs 2+ models in parallel against a spec or session context, synthesizes via a third model. Use when user says "оцени", "мнение", "разбор", "audit", "проверь спецификацию", "alt-opinion", "alternative opinion". DEFAULT MODE (no args): auto-audits current conversation context.
license: MIT
compatibility: opencode
---

# alt-opinion — Multi-Model Alternative Opinion

Делегирует CLI `gennady alt-opinion`. Не изобретает пайплайн — использует готовый.

## Два режима

### Режим 1: С аргументами

Пользователь: «оцени спеку /path/spec.md с директивой /path/directive.md»

Извлеки SPEC (первый путь). Если есть второй путь — DIRECTIVE. Если директивы нет — используй `~/.config/opencode/alt-opinion/directive-template.md`.

### Режим 2: Без аргументов (default)

Пользователь: «alt-opinion», «оцени», «мнение», «разбор»

Сформируй артефакт: резюме сессии + ключевые артефакты из контекста. Сохрани в `~/.config/opencode/alt-opinion/session-artifact.md`.

## Процесс (строго по шагам)

### Шаг 1: Подготовь артефакт

- **Если передан путь к файлу:** используй его напрямую.
- **Если передан текст:** запиши в `~/.config/opencode/alt-opinion/`.
- **Если аргументов нет:** запиши резюме сессии в `~/.config/opencode/alt-opinion/session-artifact.md`.

### Шаг 2: Запусти CLI

ОДИН вызов bash. Модели по умолчанию: `kimi-k2.6` (эксперт 1), `glm-5.1` (эксперт 2), `deepseek-v4-pro` (синтез).

Синтаксис:

```bash
npx tsx ~/Developer/gennady/cli alt-opinion \
  --model="llmproxy/kimi-k2.6" \
  --model="llmproxy/glm-5.1" \
  --synthModel="llmproxy/deepseek-v4-pro" \
  --file="<path-to-artifact>"
```

Или через stdin:

```bash
cat <path-to-artifact> | npx tsx ~/Developer/gennady/cli alt-opinion \
  --model="llmproxy/kimi-k2.6" \
  --model="llmproxy/glm-5.1" \
  --synthModel="llmproxy/deepseek-v4-pro"
```

### Шаг 3: Покажи результат

CLI возвращает готовый синтез-блок с телеметрией. Покажи пользователю как есть.

## Кастомные промпты

- `--modelPrompt=<path>` — общий промпт для всех моделей
- `--synthPrompt=<path>` — промпт для синтеза
- `--model="llmproxy/model::./custom.prompt.md"` — per-model промпт

## Env vars (обязательно)

```
LLM_PROXY_API_KEY=<key>
LLM_PROXY_BASE_URL=https://llm-proxy.example.com/v1
```

## Важные правила

- **Из корневой сессии — только ОДИН bash** (CLI сам делает параллельный опрос, синтез, форматирование).
- Не создавай промежуточные оркестраторы/сабагенты — CLI уже содержит всю логику.
- Абсолютные пути для всех файлов.
- Не добавляй комментариев к выводу — CLI форматирует результат сам.
