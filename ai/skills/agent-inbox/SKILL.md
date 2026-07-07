---
name: agent-inbox
description: Интерактивный ассистент по входящим GitLab MR, где я ревьювер/упомянут. Интенты list/tick/loop/reset. list — интерактивный разбор (Ask, диалог, постинг через vcs-reply после согласования). tick (=once/sync) — один проход без диалога, показывает дельту (что нового). loop — повторение tick планировщиком (частота задаётся снаружи). reset — чистый лист. Use when пользователь говорит «agent-inbox», «разбери входящие», «inbox list», «inbox tick», «что от меня ждут по ревью».
license: MIT
compatibility: opencode
---

<Skill name="agent-inbox">
  <Mission>
    Вести ревью входящих GitLab MR как со-ревьювер: ввести в контекст → честный факт-чек →
    инфографика «что произошло» → готовый ответ/замечания → постинг ПОСЛЕ согласования оператора.
    Роль — ревьювер/упомянут; свои MR — self-review сводка. Один скилл: сам распознаёт интент и
    подгружает нужные правила.
  </Mission>

  <Priming>
    Директивы под `ai/directives/agent-inbox/` — это ПРОМПТЫ, не данные: теги размечают секции
    (`Mission`, `AX_*`, `ExecutionPlan`, `HaltConditions`), тело — инструкция, которую ты ВОПЛОЩАЕШЬ,
    а не парсишь.
    `INCLUDE_ONCE("path")` = прочитай файл сам ОДИН раз за сессию.
    `RE_READ("path")` = прочитай заново СЕЙЧАС, даже если уже читал (для правил, что важно освежать
    перед каждым MR).
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      Прочитай целиком `ai/directives/agent-inbox/inbox-flow.directive.xml` — весь рабочий процесс:
      инварианты сессии, интенты, презентацию инбокса, жёсткие правила, VCS-инструменты, карту
      действий, конвейер разбора одного MR и финализацию. Ты ВОПЛОЩАЕШЬ эту директиву.
    </Step>
    <Step id="PREFLIGHT">
      `npx tsx ~/Developer/gennady/cli/gennady.ts inbox --json`. Ответ содержит `"configured": false`
      → не выходи: setup-флоу из inbox-flow (два `AskUserQuestion` — `reposBase`, затем `vcsHost` →
      `inbox config --set` → повтор). `"configured": true` → к EMBODY. Не из GitLab-репозитория →
      `--vcs-host=<host>` во все вызовы; нужен `GITLAB_PERSONAL_TOKEN`.
    </Step>
    <Step id="EMBODY">
      Определи интент из сообщения оператора и следуй inbox-flow: `list` (по умолчанию —
      интерактивный разбор) · `tick` (один немой проход, дельта) · `loop` (планировщик повторяет
      tick) · `reset` (`inbox --reset`). Разбор одного MR, постинг и self-review — их правила
      inbox-flow подгружает по ходу (`posting-rules`, `arch-interrogation`, `visual-vocabulary`,
      `update-review`). Держи инварианты сессии до конца, даже после компрессии контекста.
    </Step>
  </ExecutionPlan>
</Skill>
