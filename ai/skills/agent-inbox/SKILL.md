---
name: agent-inbox
description: Интерактивный ассистент по входящим GitLab/GitHub MR/PR, где я ревьювер/упомянут. Интенты list/tick/loop/reset. list — интерактивный разбор (Ask, диалог, постинг после согласования). tick (=once/sync) — один проход без диалога, показывает дельту (что нового). loop — повторение tick планировщиком. reset — чистый лист. Use when пользователь говорит «agent-inbox», «разбери входящие», «inbox list», «inbox tick», «что от меня ждут по ревью».
license: MIT
compatibility: opencode
---

<Skill name="agent-inbox">
  <Mission>
    Drive review of incoming merge/pull requests as a co-reviewer: bring the change into context →
    honest fact-check → infographic of WHAT changed → a ready answer / line-comments → post ONLY
    after the operator approves. Role — reviewer / mentioned; my own MR/PR — self-review summary.
    One skill: it detects the intent and loads the rules it needs. VCS-neutral — GitLab and GitHub
    (provider auto-detected from host); this skill never hardcodes one provider.
  </Mission>

  <Priming>
    Files under `ai/directives/agent-inbox/` are PROMPT directives, not data: the tags mark sections
    (`Mission`, `AX_*`, `ExecutionPlan`, `HaltConditions`); the body is instruction you EMBODY, not
    parse. Operator-facing output language is governed by `AX_OPERATOR_LANGUAGE` (Russian), never by
    the language of this file.
    `INCLUDE_ONCE("path")` = read the file yourself ONCE per session.
    `RE_READ("path")` = read it again NOW even if already read (for rules that must be refreshed
    before each MR/PR).
  </Priming>

  <ExecutionPlan>
    <Step id="GATHER">
      One parallel batch (do NOT serialize): read in full
      `ai/directives/agent-inbox/inbox-flow.directive.xml` — the whole working process: session
      invariants, intents, inbox presentation, hard rules, VCS tools, action map, the single-MR
      review pipeline, and finalization — AND run `npx gennady inbox --json`.
      You EMBODY the directive. Response has `"configured": false` → do NOT exit: run the setup flow
      from inbox-flow (two `AskUserQuestion` — `reposBase`, then `vcsHost` → `inbox config --set` →
      retry). `"configured": true` → EMBODY. Not inside a repo → pass `--vcs-host=<host>` on every
      call. Token: `GITLAB_PERSONAL_TOKEN` or `GITHUB_PERSONAL_TOKEN`/`GITHUB_TOKEN`, by provider
      (auto-detected from host).
    </Step>
    <Step id="EMBODY">
      Detect the intent from the operator message and follow inbox-flow: `list` (default —
      interactive review) · `tick` (one silent pass, delta) · `loop` (scheduler repeats tick) ·
      `reset` (`inbox --reset`). Single-MR analysis, posting, and self-review — inbox-flow loads
      their rules on the way (`posting-rules`, `arch-interrogation`, `visual-vocabulary`,
      `update-review`). Hold the session invariants to the end, even after context compression.
    </Step>
  </ExecutionPlan>
</Skill>
