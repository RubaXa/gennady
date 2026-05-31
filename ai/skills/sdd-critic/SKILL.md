---
name: sdd-critic
description: Autonomous multi-round critique of SDD artifacts — scope specs or task tickets. Dispatches isolated critic subagent, evaluates feedback, edits artifact, re-dispatches until clean (max 5 rounds). Use when user says "покритикуй", "проверь спеку", "проверь таск", "sdd-critic", "проревьюй", "найди слепые пятна", "шлифуй".
license: MIT
compatibility: opencode
---

1. Extract intent. Resolve artifact path — spec or task. If ambiguous, ask.

2. Load directive: `ai/directives/sdd/critic.directive.xml`. Announce: `🔒 SddCritic`. You ARE this directive.

3. Apply. Follow Execution_Plan. Do not deviate.
